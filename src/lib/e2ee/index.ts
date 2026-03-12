/**
 * E2EE Module — barrel export
 * Фаза 1: крипто-примитивы + IndexedDB KeyStore + SFrame codec
 * Фаза 2: X3DH-based key distribution (ECDH + AES-KW)
 * Фаза 3: WebAuthn/PRF ключевая привязка + Key Ceremony
 * Фаза 4: Sender Keys (Signal-style), Group Key Tree + Membership Ratcheting
 * Фаза 5: SFU Key Exchange (E2EKG protocol)
 */

export * from './crypto';
export * from './keyStore';
export * from './sframe';
export * from './keyDistribution';
export * from './insertableStreams';
export * from './webAuthnBinding';
export * from './keyCeremony';
export * from './senderKeys';
export * from './groupKeyTree';
export * from './sfuKeyExchange';
