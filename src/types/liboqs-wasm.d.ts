// liboqs-wasm type stub — загружается динамически только при VITE_E2EE_PQ_ENABLED=true
// Если пакет не установлен, TypeScript выдаст ошибку TS2307, но runtime это не сломает
declare module 'liboqs-wasm' {
  export interface Keypair {
    public_key: Uint8Array;
    secret_key: Uint8Array;
  }

  export interface EncapsResult {
    ciphertext: Uint8Array;
    shared_secret: Uint8Array;
  }

  export function keypair_kyber_768(): Keypair;
  export function encaps_kyber_768(public_key: Uint8Array): EncapsResult;
  export function decaps_kyber_768(secret_key: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  export function free(): void;
}
