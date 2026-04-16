import { describe, expect, it } from 'vitest';
import { MeshRouter, validateEnvelope, computeMessageId } from './router';
import {
  asMeshMessageId,
  asPeerId,
  DEFAULT_CONFIG,
  type MeshMessageEnvelope,
  type PeerId,
} from '../types';

const SELF = asPeerId('self-peer-0000');
const OTHER = asPeerId('other-peer-00000');
const PEER_C = asPeerId('peer-c-000000000');

function makeEnvelope(overrides: Partial<MeshMessageEnvelope> = {}): MeshMessageEnvelope {
  return {
    id: asMeshMessageId('msg-1'),
    senderId: OTHER,
    recipientId: 'broadcast',
    kind: 'text',
    priority: 1,
    timestamp: Date.now(),
    hopCount: 0,
    maxHops: 10,
    ttlMs: 60_000,
    routePath: [OTHER],
    ciphertext: 'xx',
    signature: 'ss',
    nonce: 'nn',
    ...overrides,
  };
}

describe('MeshRouter.route', () => {
  it('self-message — drop', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const dec = r.route(makeEnvelope({ senderId: SELF }));
    expect(dec.action).toBe('drop');
    if (dec.action === 'drop') expect(dec.reason).toBe('self-message');
  });

  it('дубликат по messageId — drop', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const env = makeEnvelope();
    r.route(env);
    const second = r.route(env);
    expect(second.action).toBe('drop');
    if (second.action === 'drop') expect(second.reason).toBe('duplicate');
  });

  it('истёкший TTL — drop', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const env = makeEnvelope({ timestamp: Date.now() - 10 * 60_000, ttlMs: 60_000 });
    const dec = r.route(env);
    expect(dec.action).toBe('drop');
    if (dec.action === 'drop') expect(dec.reason).toBe('expired-ttl');
  });

  it('max-hops достигнут — drop', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const env = makeEnvelope({ hopCount: 10, maxHops: 10 });
    const dec = r.route(env);
    expect(dec.action).toBe('drop');
    if (dec.action === 'drop') expect(dec.reason).toBe('max-hops');
  });

  it('loop — если self в routePath, drop', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const env = makeEnvelope({ routePath: [OTHER, SELF] });
    const dec = r.route(env);
    expect(dec.action).toBe('drop');
    if (dec.action === 'drop') expect(dec.reason).toBe('loop-detected');
  });

  it('broadcast → relay с инкрементом hop', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const dec = r.route(makeEnvelope({ recipientId: 'broadcast', hopCount: 2 }));
    expect(dec.action).toBe('relay');
    if (dec.action === 'relay') {
      expect(dec.envelope.hopCount).toBe(3);
      expect(dec.envelope.routePath).toContain(SELF);
    }
  });

  it('recipient = self → deliver', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const dec = r.route(makeEnvelope({ recipientId: SELF }));
    expect(dec.action).toBe('deliver');
  });

  it('rate-limit: превышение лимита от одного отправителя', () => {
    const cfg = { ...DEFAULT_CONFIG, messageRateLimitPerMin: 2 };
    const r = new MeshRouter(SELF, cfg);
    let dropped = 0;
    for (let i = 0; i < 5; i++) {
      const dec = r.route(
        makeEnvelope({ id: asMeshMessageId(`m-${i}`) }),
      );
      if (dec.action === 'drop' && dec.reason === 'rate-limited') dropped++;
    }
    expect(dropped).toBeGreaterThan(0);
  });
});

describe('prepareOutgoing', () => {
  it('устанавливает hopCount=0 и routePath=[self]', () => {
    const r = new MeshRouter(SELF, DEFAULT_CONFIG);
    const out = r.prepareOutgoing({
      id: asMeshMessageId('out-1'),
      senderId: SELF,
      recipientId: OTHER,
      kind: 'text',
      priority: 1,
      timestamp: Date.now(),
      maxHops: 10,
      ttlMs: 60_000,
      ciphertext: 'cc',
      signature: 'ss',
      nonce: 'nn',
    });
    expect(out.hopCount).toBe(0);
    expect(out.routePath).toEqual([SELF]);
  });
});

describe('validateEnvelope', () => {
  it('принимает корректный envelope', () => {
    expect(validateEnvelope(makeEnvelope())).toBe(true);
  });

  it('отбрасывает malformed', () => {
    expect(validateEnvelope(null)).toBe(false);
    expect(validateEnvelope({})).toBe(false);
    expect(validateEnvelope({ id: 'x' })).toBe(false);
  });
});

describe('computeMessageId', () => {
  it('детерминирован для одинаковых входов', async () => {
    const a = await computeMessageId(SELF, 1000, 'nonce-xyz');
    const b = await computeMessageId(SELF, 1000, 'nonce-xyz');
    expect(a).toBe(b);
  });

  it('различается для разных nonce', async () => {
    const a = await computeMessageId(SELF, 1000, 'nonce-a');
    const b = await computeMessageId(SELF, 1000, 'nonce-b');
    expect(a).not.toBe(b);
  });

  it('различается для разных senderId', async () => {
    const a = await computeMessageId(SELF, 1000, 'nonce-x');
    const b = await computeMessageId(PEER_C as PeerId, 1000, 'nonce-x');
    expect(a).not.toBe(b);
  });
});
