import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  dequeueReady,
  destroyDatabase,
  enqueueOutbox,
  getIdentity,
  getSos,
  listActiveSos,
  listOutbox,
  listRecentMessages,
  removeFromOutbox,
  saveMessage,
  saveSos,
  upsertIdentity,
  updateOutboxAttempt,
  wipeAllData,
  type StoredOutboxItem,
} from './mesh-db';
import {
  asMeshMessageId,
  asPeerId,
  type DecryptedMeshMessage,
  type EmergencySignal,
  type MeshMessageEnvelope,
  type Peer,
} from '../types';

function makePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    id: asPeerId('peer-abc12345'),
    displayName: 'Alice',
    deviceType: 'web',
    publicKey: new Uint8Array(32).fill(7),
    status: 'online',
    firstSeenAt: 1_000,
    lastSeenAt: 2_000,
    signalStrength: -50,
    hopDistance: 0,
    trustLevel: 'unknown',
    ...overrides,
  };
}

function makeMessage(id: string, timestamp: number, sender: string): DecryptedMeshMessage {
  return {
    header: {
      id: asMeshMessageId(id),
      senderId: asPeerId(sender),
      recipientId: 'broadcast',
      kind: 'text',
      priority: 1,
      timestamp,
      hopCount: 0,
      maxHops: 10,
      ttlMs: 60_000,
      routePath: [asPeerId(sender)],
    },
    plaintext: `hello-${id}`,
    localStatus: 'received',
  };
}

function makeOutbox(id: string, nextAttemptAt: number): StoredOutboxItem {
  const envelope: MeshMessageEnvelope = {
    id: asMeshMessageId(id),
    senderId: asPeerId('peer-abc12345'),
    recipientId: 'broadcast',
    kind: 'text',
    priority: 1,
    timestamp: Date.now(),
    hopCount: 0,
    maxHops: 10,
    ttlMs: 60_000,
    routePath: [asPeerId('peer-abc12345')],
    ciphertext: 'Y2lwaGVy',
    nonce: 'bm9uY2U=',
    signature: 'c2ln',
  };
  return {
    messageId: asMeshMessageId(id),
    envelope,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    nextAttemptAt,
  };
}

function makeSos(id: string, status: EmergencySignal['status'] = 'active'): EmergencySignal {
  return {
    id: asMeshMessageId(id),
    senderId: asPeerId('peer-abc12345'),
    senderDisplayName: 'Alice',
    type: 'medical',
    level: 'urgent',
    timestamp: Date.now(),
    message: 'help',
    coordinates: null,
    hopCount: 0,
    routePath: [asPeerId('peer-abc12345')],
    status,
  };
}

describe('mesh-db', () => {
  beforeEach(async () => {
    await destroyDatabase();
  });

  describe('identities', () => {
    it('upsert + get возвращают эквивалентный peer', async () => {
      const peer = makePeer();
      await upsertIdentity(peer);
      const got = await getIdentity(peer.id);
      expect(got).not.toBeNull();
      expect(got?.id).toBe(peer.id);
      expect(got?.displayName).toBe('Alice');
      expect(Array.from(got!.publicKey)).toEqual(Array.from(peer.publicKey));
    });

    it('getIdentity для неизвестного peerId возвращает null', async () => {
      const res = await getIdentity(asPeerId('peer-unknown1'));
      expect(res).toBeNull();
    });
  });

  describe('messages', () => {
    it('saveMessage + listRecentMessages сортирует по timestamp desc', async () => {
      await saveMessage(makeMessage('m-1', 1000, 'peer-abc12345'));
      await saveMessage(makeMessage('m-2', 3000, 'peer-abc12345'));
      await saveMessage(makeMessage('m-3', 2000, 'peer-abc12345'));
      const recent = await listRecentMessages(10);
      expect(recent.map((m) => m.header.id)).toEqual(['m-2', 'm-3', 'm-1']);
    });

    it('listRecentMessages ограничивает limit', async () => {
      for (let i = 0; i < 5; i++) {
        await saveMessage(makeMessage(`m-${i}`, i * 100, 'peer-abc12345'));
      }
      const res = await listRecentMessages(2);
      expect(res).toHaveLength(2);
    });
  });

  describe('outbox', () => {
    it('enqueue + dequeueReady фильтрует по nextAttemptAt', async () => {
      await enqueueOutbox(makeOutbox('m-past', 1_000));
      await enqueueOutbox(makeOutbox('m-future', 99_999_999_999_999));
      const ready = await dequeueReady(2_000);
      expect(ready.map((o) => o.messageId)).toContain('m-past');
      expect(ready.map((o) => o.messageId)).not.toContain('m-future');
    });

    it('updateOutboxAttempt увеличивает attempts', async () => {
      await enqueueOutbox(makeOutbox('m-retry', 1_000));
      await updateOutboxAttempt(asMeshMessageId('m-retry'), 5_000);
      const all = await listOutbox();
      expect(all[0].attempts).toBe(1);
      expect(all[0].nextAttemptAt).toBe(5_000);
    });

    it('removeFromOutbox удаляет элемент', async () => {
      await enqueueOutbox(makeOutbox('m-del', 1_000));
      await removeFromOutbox(asMeshMessageId('m-del'));
      const all = await listOutbox();
      expect(all).toHaveLength(0);
    });
  });

  describe('sos', () => {
    it('saveSos + listActiveSos возвращает только active', async () => {
      await saveSos(makeSos('sos-1', 'active'));
      await saveSos(makeSos('sos-2', 'resolved'));
      await saveSos(makeSos('sos-3', 'active'));
      const active = await listActiveSos();
      expect(active.map((s) => s.id).sort()).toEqual(['sos-1', 'sos-3']);
    });

    it('getSos возвращает сохранённый сигнал', async () => {
      const sig = makeSos('sos-x');
      await saveSos(sig);
      const got = await getSos(sig.id);
      expect(got?.id).toBe('sos-x');
    });
  });

  describe('wipeAllData', () => {
    it('очищает все сторы', async () => {
      await upsertIdentity(makePeer());
      await saveMessage(makeMessage('m-1', 1000, 'peer-abc12345'));
      await saveSos(makeSos('sos-1'));
      await enqueueOutbox(makeOutbox('m-1', 1_000));

      await wipeAllData();

      expect(await getIdentity(asPeerId('peer-abc12345'))).toBeNull();
      expect(await listRecentMessages()).toHaveLength(0);
      expect(await listActiveSos()).toHaveLength(0);
      expect(await listOutbox()).toHaveLength(0);
    });
  });
});
