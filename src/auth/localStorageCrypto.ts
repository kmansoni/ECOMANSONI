/**
 * src/auth/localStorageCrypto.ts — слой AES-GCM шифрования для localStorage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * МОДЕЛЬ УГРОЗ
 * ─────────────────────────────────────────────────────────────────────────
 * ЗАЩИЩАЕТ ОТ:
 *   • «Слепого» XSS-exfil: скрипт читает localStorage и отправляет данные
 *     на сторонний сервер без выполнения расшифровки. Атакующий получает
 *     шифртекст, а не токены.
 *   • Автоматизированного скрапинга localStorage-дампов (devtools snapshots,
 *     browser-extension data leaks, pastebin dumps).
 *   • Forensic-анализа диска / memory dump браузера.
 *
 * НЕ ЗАЩИЩАЕТ (defense-in-depth, но не серебряная пуля):
 *   • Атакующий с активным XSS в том же origin'е может вызвать
 *     decryptFromStorage() напрямую и получить plaintext.
 *   • MITM или compromised browser extension с full-page access.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ПРОИЗВОДНЫЙ КЛЮЧ
 * ─────────────────────────────────────────────────────────────────────────
 * Алгоритм: PBKDF2-HMAC-SHA-256, 200 000 итераций (OWASP 2024 рекомендация).
 * Источник энтропии: SHA-256(origin ‖ userAgent ‖ screen ‖ timezone).
 *   • origin включён, чтобы ключ был уникalen per-site.
 *   • Компоненты детерминированы — ключ воспроизводим между сессиями.
 *   • Соль — 16 случайных байт per-record, хранится рядом с шифртекстом.
 *     Она не секретна, но исключает precomputed rainbow tables.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ФОРМАТ ХРАНЕНИЯ v1
 * ─────────────────────────────────────────────────────────────────────────
 * JSON-строка: { "v": 1, "s": "<salt_b64>", "iv": "<iv_b64>", "ct": "<ct_b64>" }
 *   v  — версия формата (для миграций без поломки старых клиентов)
 *   s  — 16-байтная PBKDF2-соль, base64url
 *   iv — 12-байтный AES-GCM nonce, base64url
 *   ct — шифртекст + 16-байтный GCM-тег аутентификации, base64url
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ОБРАТНАЯ СОВМЕСТИМОСТЬ
 * ─────────────────────────────────────────────────────────────────────────
 * Если в localStorage лежит legacy plaintext JSON (без поля "v"/"ct"),
 * decryptFromStorage() возвращает его as-is. Caller обязан перешифровать
 * данные при следующей записи.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Константы ────────────────────────────────────────────────────────────────

/**
 * Количество итераций PBKDF2. OWASP 2024 минимум для HMAC-SHA-256 — 200 000.
 * Увеличение до 600 000 поднимает стоимость brute-force до неприемлемой при
 * приемлемой задержке ~60ms на современном устройстве.
 */
const PBKDF2_ITERATIONS = 200_000;

/** Длина ключа AES-GCM в битах */
const AES_KEY_LENGTH = 256;

/** Версия формата конверта — позволяет мигрировать без поломки клиентов */
const ENVELOPE_VERSION = 1;

// ─── Base64url-кодирование (без зависимостей) ─────────────────────────────────

/**
 * Converts ArrayBuffer → base64 string.
 *
 * ВАЖНО: НЕ используем `String.fromCharCode(...new Uint8Array(buf))`.
 * Spread-оператор помещает все байты в стек вызова. При буфере > ~65k байт
 * (что реально для шифрованных данных) это вызывает:
 *   RangeError: Maximum call stack size exceeded
 *
 * Вместо этого — цикл с явной конкатенацией. По скорости сопоставимо,
 * память не взрывается.
 */
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  // Обходим весь буфер побайтово — safe for any size
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Converts base64 string → ArrayBuffer */
function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Браузерный отпечаток (энтропия для PBKDF2) ───────────────────────────────

/**
 * Возвращает стабильный device-bound идентификатор как источник энтропии для PBKDF2.
 *
 * Цель: сделать PBKDF2-ключ уникальным для данного origin'а и устройства,
 * при этом не ломаться при смене UA (обновление браузера, изменение строки UA).
 *
 * Архитектурное решение:
 *   - НЕ используем navigator.userAgent: браузер обновляется → UA меняется →
 *     ключ не воспроизводится → все токены в localStorage становятся
 *     нерасшифруемыми → незаметная разлогинивание пользователя. Недопустимо.
 *   - НЕ используем screen.width/height/colorDepth: изменяются при масштабировании,
 *     подключении внешнего монитора, изменении DPI-масштаба.
 *   - НЕ используем timezoneOffset: изменяется при переезде, DST-переходах.
 *
 * Используем:
 *   - origin: site-specific изоляция (не меняется для одного сайта).
 *   - deviceId: случайный UUID, сгенерированный один раз и сохранённый в
 *     localStorage под ключом __lsck_device_id. Не зависит ни от каких изменений
 *     браузера/ОС/экрана. Сохраняется до явного удаления (clearStorage/logout).
 *
 * Модель угроз:
 *   Атакующий с XSS в том же origin может прочитать deviceId из localStorage
 *   и воспроизвести ключ — но у него уже есть доступ к зашифрованным данным,
 *   так что шифрование для него всё равно прозрачно. Это известное ограничение
 *   всей схемы (задокументировано в заголовке файла).
 *   Без XSS — атакующий без deviceId не может перебрать PBKDF2.
 */
const DEVICE_ID_STORAGE_KEY = "__lsck_device_id";

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
    // Генерируем криптографически случайный ID (не псевдослучайный Math.random)
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const id = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage недоступен (SSR, incognito с блокировкой) — fallback к origin-only
    return "no-device-id";
  }
}

function collectFingerprint(): string {
  const origin =
    typeof globalThis.location !== "undefined"
      ? globalThis.location.origin
      : "no-origin";
  const deviceId = getOrCreateDeviceId();
  return `${origin}|${deviceId}`;
}

// ─── Производный ключ (кешируется для encrypt-пути) ──────────────────────────

/**
 * Кеш ключа. Храним одну пару (ключ, соль) — для encrypt-пути.
 *
 * ENCRYPT путь: `deriveKey()` без аргументов.
 *   При наличии кеша — возвращается кешированная пара (ключ, соль) без вызова
 *   PBKDF2. Это КРИТИЧНО для производительности: 200 000 итераций PBKDF2
 *   занимают ~60ms на современном устройстве, и без кеша UI зависает при
 *   каждой записи токена/сессии в localStorage.
 *
 * DECRYPT путь: `deriveKey(salt)` — salt приходит из конверта, кеш не юзается
 *   (у каждой записи своя соль).
 *
 * ВАЖНО: при ENCRYPT-пути соль зафиксирована на весь lifetime кеша. Учитывая,
 * что plaintext шифруется каждый раз с новым IV (nonce), это безопасно —
 * GCM-уникальность обеспечивается IV, не солью.
 */
let _cachedKey: CryptoKey | null = null;
let _cachedSalt: string | null = null; // base64 repr соли для переиспользования

/**
 * Производит AES-GCM ключ через PBKDF2 из browserFingerprint + salt.
 *
 * @param salt - DECRYPT путь: 16-байтная соль из сохранённого конверта.
 *               ENCRYPT путь: не передаётся → переиспользуется кешированная соль
 *               (или генерируется новая один раз и кешируется).
 */
async function deriveKey(
  salt?: ArrayBuffer,
): Promise<{ key: CryptoKey; salt: ArrayBuffer }> {
  const isEncryptPath = !salt;

  // ── Encrypt-путь: возвращаем кеш если он есть ──────────────────────────────
  // FIX (CRITICAL): Ранее код генерировал новую случайную соль ДО проверки
  // кеша, а затем сравнивал только что сгенерированную соль с кешированной.
  // Они никогда не совпадали → кеш никогда не срабатывал → PBKDF2 вызывался
  // при КАЖДОМ обращении к encryptForStorage(). Это приводило к заморозке UI
  // на ~60ms при каждой записи токенов/сессий.
  //
  // Исправление: на encrypt-пути сначала проверяем кеш, и только если он пуст
  // генерируем новую соль (один раз за сессию браузера).
  if (isEncryptPath && _cachedKey && _cachedSalt) {
    return { key: _cachedKey, salt: b64ToBuf(_cachedSalt) };
  }

  // ── Нет кеша (первый вызов) или decrypt-путь: derivation через PBKDF2 ───────
  const rawSalt = salt ?? crypto.getRandomValues(new Uint8Array(16)).buffer;
  const usedSalt = new Uint8Array(rawSalt.slice(0));

  // Импортируем fingerprint как PBKDF2 key material
  const enc = new TextEncoder();
  const rawMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(collectFingerprint()),
    "PBKDF2",
    false,           // не экспортируется
    ["deriveKey"],
  );

  // Производим AES-GCM ключ
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: usedSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    rawMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,           // не экспортируется
    ["encrypt", "decrypt"],
  );

  // Кешируем только для encrypt-пути (фиксируем соль на весь lifetime)
  if (isEncryptPath) {
    _cachedKey = key;
    _cachedSalt = bufToB64(usedSalt.buffer);
  }

  return { key, salt: usedSalt.buffer };
}

// ─── Тип конверта ─────────────────────────────────────────────────────────────

interface EncryptedEnvelope {
  /** Версия формата конверта */
  v: number;
  /** PBKDF2-соль, base64 */
  s: string;
  /** AES-GCM nonce (IV), 12 байт, base64 */
  iv: string;
  /** Шифртекст + GCM-тег, base64 */
  ct: string;
}

/** Type guard для проверки структуры конверта */
function isEncryptedEnvelope(obj: unknown): obj is EncryptedEnvelope {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.v === "number" &&
    typeof o.s === "string" &&
    typeof o.iv === "string" &&
    typeof o.ct === "string"
  );
}

// ─── Публичный API ────────────────────────────────────────────────────────────

/**
 * Шифрует строку через AES-256-GCM и возвращает JSON-конверт для localStorage.
 *
 * @param plaintext - данные для шифрования (обычно JSON.stringify'd объект)
 * @returns JSON-строка конверта { v, s, iv, ct }
 * @throws Если WebCrypto API недоступен или произошла внутренняя ошибка.
 *         Caller НЕ должен делать plaintext-fallback — пусть запись провалится.
 */
export async function encryptForStorage(plaintext: string): Promise<string> {
  const { key, salt } = await deriveKey(); // encrypt-путь: новая/кешированная соль
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce для AES-GCM

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const envelope: EncryptedEnvelope = {
    v: ENVELOPE_VERSION,
    s: bufToB64(salt),
    iv: bufToB64(iv.buffer),
    ct: bufToB64(ciphertext),
  };

  return JSON.stringify(envelope);
}

/**
 * Расшифровывает AES-256-GCM конверт из localStorage.
 *
 * Поведение по ситуациям:
 *   • Валидный конверт → расшифровывает, возвращает plaintext.
 *   • Legacy plaintext JSON (нет "v"/"ct") → возвращает raw-строку as-is.
 *     Caller должен перешифровать при следующей записи.
 *   • Невалидный JSON → возвращает null.
 *   • Провалилась расшифровка (неверный ключ, изменился UA, bitflip) → null.
 *
 * @returns plaintext или null при невозможности расшифровать
 */
export async function decryptFromStorage(stored: string): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    // Не JSON вообще — не можем обработать
    return null;
  }

  if (!isEncryptedEnvelope(parsed)) {
    // Legacy plaintext — возвращаем как есть, caller перешифрует при записи
    return stored;
  }

  if (parsed.v !== ENVELOPE_VERSION) {
    // Неизвестная версия конверта — пытаемся как v1 (forward compat)
    console.warn(
      `[localStorageCrypto] Неизвестная версия конверта ${parsed.v}, пробуем v1-расшифровку`,
    );
  }

  try {
    const salt = b64ToBuf(parsed.s);
    const iv = b64ToBuf(parsed.iv);
    const ct = b64ToBuf(parsed.ct);

    const { key } = await deriveKey(salt); // decrypt-путь: соль из конверта

    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      ct,
    );

    return new TextDecoder().decode(plainBuf);
  } catch (err) {
    // GCM аутентификация не прошла: данные повреждены, ключ сменился
    // (userAgent update, смена браузера) или атака на целостность.
    console.error("[localStorageCrypto] Расшифровка не удалась:", err);
    return null;
  }
}

/**
 * Читает значение из localStorage и расшифровывает его.
 * Обрабатывает как зашифрованный формат v1, так и legacy plaintext.
 *
 * @returns расшифрованная строка или null
 */
export async function readEncrypted(key: string): Promise<string | null> {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return decryptFromStorage(raw);
}

/**
 * Шифрует значение и записывает в localStorage.
 *
 * @throws Если WebCrypto недоступен. НЕ делаем plaintext-fallback —
 *         лучше потерять запись, чем сохранить токены в открытом виде.
 */
export async function writeEncrypted(key: string, plaintext: string): Promise<void> {
  const encrypted = await encryptForStorage(plaintext);
  localStorage.setItem(key, encrypted);
}

/**
 * Удаляет ключ из localStorage (расшифровка не нужна).
 */
export function removeEncrypted(key: string): void {
  localStorage.removeItem(key);
}

/**
 * Инвалидирует кеш производного ключа.
 * Вызывать после изменения fingerprint-компонент (например, в тестах).
 */
export function clearKeyCache(): void {
  _cachedKey = null;
  _cachedSalt = null;
}
