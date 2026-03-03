/**
 * E2E шифрование сообщений на базе Web Crypto API (AES-256-GCM + PBKDF2)
 * Никаких внешних зависимостей — только window.crypto.subtle
 */

// ─── Вспомогательные функции ─────────────────────────────────────────────────

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─── Генерация ключей ─────────────────────────────────────────────────────────

/** Генерирует новый AES-256-GCM ключ */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/** Экспортирует CryptoKey в base64-строку */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufToBase64(raw);
}

/** Импортирует AES-256-GCM ключ из base64-строки */
export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBuf(raw),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// ─── Шифрование / дешифрование ───────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string;         // base64 (12 байт)
  authTag: string;    // не используется отдельно в Web Crypto (встроен в ciphertext), оставлен для совместимости API
}

/**
 * Шифрует plaintext с помощью AES-256-GCM.
 * authTag встроен в ciphertext (последние 16 байт), поле authTag = "".
 */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return {
    ciphertext: bufToBase64(ciphertextBuf),
    iv: bufToBase64(iv.buffer),
    authTag: "", // встроен в ciphertext
  };
}

/**
 * Расшифровывает ciphertext (base64) с заданным IV (base64).
 * Возвращает исходную строку или бросает исключение при неверном ключе.
 */
export async function decryptMessage(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(iv) },
    key,
    base64ToBuf(ciphertext),
  );
  return new TextDecoder().decode(plaintextBuf);
}

// ─── Деривация ключа из пароля ───────────────────────────────────────────────

/**
 * Деривирует AES-256-GCM ключ из пароля и соли через PBKDF2 (SHA-256, 310 000 итераций).
 * @param passphrase  Пароль пользователя
 * @param salt        base64-строка (или генерируется новая, если не передана)
 * @returns { key, salt }
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt?: string,
): Promise<{ key: CryptoKey; salt: string }> {
  const saltBuf = salt
    ? base64ToBuf(salt)
    : crypto.getRandomValues(new Uint8Array(16)).buffer;

  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: 310_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  return { key, salt: bufToBase64(saltBuf) };
}

// ─── Шифрование группового ключа ────────────────────────────────────────────

/**
 * Шифрует групповой ключ (groupKey) мастер-ключом пользователя.
 * Возвращает base64-строку вида "iv:ciphertext".
 */
export async function encryptKeyForUser(
  groupKey: CryptoKey,
  userMasterKey: CryptoKey,
): Promise<string> {
  const rawGroupKey = await exportKey(groupKey);
  const { ciphertext, iv } = await encryptMessage(rawGroupKey, userMasterKey);
  return `${iv}:${ciphertext}`;
}

/**
 * Расшифровывает групповой ключ мастер-ключом пользователя.
 * Принимает строку вида "iv:ciphertext".
 */
export async function decryptKeyForUser(
  encryptedGroupKey: string,
  userMasterKey: CryptoKey,
): Promise<CryptoKey> {
  const colonIdx = encryptedGroupKey.indexOf(":");
  if (colonIdx === -1) throw new Error("Invalid encryptedGroupKey format");
  const iv = encryptedGroupKey.slice(0, colonIdx);
  const ciphertext = encryptedGroupKey.slice(colonIdx + 1);
  const rawKeyB64 = await decryptMessage(ciphertext, iv, userMasterKey);
  return importKey(rawKeyB64);
}
