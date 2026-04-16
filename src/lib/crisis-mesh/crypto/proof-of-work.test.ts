import { describe, expect, it } from 'vitest';
import {
  buildFirstContactChallenge,
  buildSosChallenge,
  findProofOfWork,
  verifyProofOfWork,
} from './proof-of-work';
import { fromBase64 } from '@/lib/e2ee/utils';

describe('proof-of-work', () => {
  it('findProofOfWork находит nonce удовлетворяющий verifyProofOfWork (8 бит)', async () => {
    const challenge = buildFirstContactChallenge('alice', 'bob', 1_700_000_000);
    const res = await findProofOfWork(challenge, 8, { maxIterations: 100_000 });
    expect(res.bits).toBeGreaterThanOrEqual(8);
    const nonceBytes = new Uint8Array(fromBase64(res.nonce));
    const ok = await verifyProofOfWork(challenge, nonceBytes, 8);
    expect(ok).toBe(true);
  }, 10_000);

  it('verifyProofOfWork отклоняет nonce с недостаточными битами', async () => {
    const challenge = buildSosChallenge('alice', 1_700_000_000, 'medical');
    const zeroNonce = new Uint8Array(16);
    const ok = await verifyProofOfWork(challenge, zeroNonce, 16);
    // случайный нулевой nonce почти наверняка < 16 бит, но проверим на определённом случае
    expect(ok).toBe(false);
  });

  it('verifyProofOfWork с пустым nonce возвращает false', async () => {
    const challenge = new TextEncoder().encode('test');
    const ok = await verifyProofOfWork(challenge, new Uint8Array(0), 4);
    expect(ok).toBe(false);
  });

  it('challenge builders детерминированы', () => {
    const a = buildFirstContactChallenge('p1', 'p2', 100);
    const b = buildFirstContactChallenge('p1', 'p2', 100);
    expect(Array.from(a)).toEqual(Array.from(b));

    const s1 = buildSosChallenge('p1', 100, 'fire');
    const s2 = buildSosChallenge('p1', 100, 'fire');
    expect(Array.from(s1)).toEqual(Array.from(s2));
    const s3 = buildSosChallenge('p1', 100, 'medical');
    expect(Array.from(s1)).not.toEqual(Array.from(s3));
  });
});
