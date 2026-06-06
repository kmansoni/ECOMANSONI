/* @vitest-environment node */

import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryStore } from '../../server/calls-ws/store/inMemoryStore.mjs';
import { createRedisStore } from '../../server/calls-ws/store/redisStore.mjs';

type CallsStore = Awaited<ReturnType<typeof createRedisStore>> | ReturnType<typeof createInMemoryStore>;

type StoreFactory = {
  name: string;
  create: () => Promise<CallsStore> | CallsStore;
  cleanup?: (store: CallsStore) => Promise<void> | void;
};

const redisUrl = process.env.CALLS_TEST_REDIS_URL;
const factories: StoreFactory[] = [
  {
    name: 'inMemoryStore',
    create: () => createInMemoryStore({ degraded: true }),
  },
];

if (redisUrl) {
  factories.push({
    name: 'redisStore',
    create: () => createRedisStore({ redisUrl, dedupTtlSec: 60 }),
    cleanup: async (store) => {
      await store.close?.();
    },
  });
}

describe.each(factories)('calls-ws store parity: $name', ({ create, cleanup }) => {
  let store: CallsStore | null = null;

  afterEach(async () => {
    if (store) await cleanup?.(store);
    store = null;
  });

  it('mailbox deliver/sync/ack is cursor-based and deduplicated', async () => {
    store = await create();
    const first = await store.deliver('device-a', {
      ver: 1,
      id: '00000000-0000-4000-8000-000000000101',
      type: 'KEY_PACKAGE',
      ts: Date.now(),
      callId: 'call-store-parity',
      fromDevice: 'device-b',
      epoch: 1,
      payload: '{"ok":true}',
      refId: 'sender-key-1',
      sig: 'sig',
    });
    expect(first.ok).toBe(true);
    expect(first.streamId).toBeTruthy();

    const duplicate = await store.deliver('device-a', {
      ver: 1,
      id: '00000000-0000-4000-8000-000000000101',
      type: 'KEY_PACKAGE',
      ts: Date.now(),
      callId: 'call-store-parity',
      fromDevice: 'device-b',
      epoch: 1,
      payload: '{"ok":true}',
      refId: 'sender-key-1',
      sig: 'sig',
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.dup).toBe(true);

    const batch = await store.sync('device-a', '0-0', 10);
    expect(batch.items).toHaveLength(1);
    expect(batch.items[0].msg.type).toBe('KEY_PACKAGE');
    expect(batch.cursorTo).toBe(batch.items[0].streamId);

    await store.ack('device-a', batch.cursorTo);
    await expect(store.getSavedCursor?.('device-a')).resolves.toBe(batch.cursorTo);

    const emptyAfterCursor = await store.sync('device-a', batch.cursorTo, 10);
    expect(emptyAfterCursor.items).toHaveLength(0);
  });

  it('route and rekey begin id round-trip', async () => {
    store = await create();
    await store.saveRoute('00000000-0000-4000-8000-000000000201', 'device-leader');
    await expect(store.getRoute('00000000-0000-4000-8000-000000000201')).resolves.toBe('device-leader');

    await store.setRekeyBeginId('call-route', 3, '00000000-0000-4000-8000-000000000202');
    await expect(store.getRekeyBeginId('call-route', 3)).resolves.toBe('00000000-0000-4000-8000-000000000202');
  });

  it('rekey quorum commits only after all needed devices ACK', async () => {
    store = await create();
    await store.setNeed('call-quorum', 5, ['leader-dev', 'peer-dev']);

    await store.markAck('call-quorum', 5, 'leader-dev');
    const incomplete = await store.tryCommit('call-quorum', 5);
    expect(incomplete.ok).toBe(false);
    expect(incomplete.reason).toBe('ACK_INCOMPLETE');

    await store.markAck('call-quorum', 5, 'peer-dev');
    const committed = await store.tryCommit('call-quorum', 5);
    expect(committed.ok).toBe(true);

    const idempotent = await store.tryCommit('call-quorum', 5);
    expect(idempotent.ok).toBe(true);
  });

  it('membership and room version are consistent', async () => {
    store = await create();
    await expect(store.assertMember('call-members', 'device-a')).resolves.toBe(false);
    await store.addMember('call-members', 'device-a');
    await expect(store.assertMember('call-members', 'device-a')).resolves.toBe(true);
    await store.removeMember('call-members', 'device-a');
    await expect(store.assertMember('call-members', 'device-a')).resolves.toBe(false);

    await expect(store.getRoomVersion('call-members')).resolves.toBe(0);
    await expect(store.bumpRoomVersion('call-members')).resolves.toBe(1);
    await expect(store.getRoomVersion('call-members')).resolves.toBe(1);
  });
});
