/**
 * E2EE Module — barrel export
 * Фаза 1: улучшенная криптобиблиотека + безопасное хранилище ключей + SFrame codec
 * Фаза 2: протокол распространения ключей (ECDH + AES-KW)
 */

export * from './crypto';
export * from './keyStore';
export * from './sframe';
export * from './keyDistribution';
export * from './insertableStreams';
