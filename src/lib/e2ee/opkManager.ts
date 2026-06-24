/**
 * OPK Lifecycle Manager
 *
 * STORAGE-2 FIX: This entire module is DEAD CODE.
 *
 * Active OPK management lives in useSecretChat hooks and secretChatManager:
 *   - OPK generation:  X3DH.generateFullIdentityBundle() -> secret blob
 *   - OPK consumption: e2eeDb.rpc.consumeOPKBySpki() (atomic DELETE+RETURNING)
 *   - OPK replenish:   useSecretChat (automatic on app start)
 *
 * This module was written against E2EEKeyStore (opk:${userId}:${id} format) but
 * no code ever reads from that path. The real OPK private keys are stored in the
 * encrypted secret blob (secret-chat-e2ee-v1) and matched by SPKI.
 *
 * Functions removed (STORAGE-2):
 *   generateOPKBatch, publishOPKBatch, consumeOPK, getOPKStatus,
 *   replenishOPKsIfNeeded, revokeAllAndReplenish, revokeOPKs
 *
 * All had zero callers. Left as skeleton for reference until removed from index.ts.
 */

// Only keep the constants that might be referenced via index.ts barrel
export const MIN_OPK_COUNT = 10;
export const MAX_OPK_COUNT = 50;
