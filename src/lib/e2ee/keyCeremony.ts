/**
 * Key Ceremony — подтверждение критических операций с ключами
 *
 * Требует явного пользовательского подтверждения перед выполнением
 * критических операций: ротация ключей, экспорт, удаление аккаунта.
 *
 * Протокол:
 *   1. Вызов requestConfirmation('rotate' | 'export' | 'delete')
 *   2. Система генерирует 6-значный код и отправляет через OOB-канал
 *   3. Пользователь вводит код → verifyConfirmation(code)
 *   4. При успехе — возвращает одноразовый токен для выполнения операции
 *
 * Защиты:
 *   - Блокировка после 3 неудачных попыток (на 15 минут)
 *   - Код истекает через 5 минут
 *   - Токен действителен только для конкретной операции
 *   - Каждый токен можно использовать ровно 1 раз
 */

// ─── Типы ────────────────────────────────────────────────────────────────────

export type KeyCeremonyOperation = 'rotate' | 'export' | 'delete' | 'device_transfer';

export interface KeyCeremonyChallenge {
  operationId: string;   // случайный UUID
  operation: KeyCeremonyOperation;
  expiresAt: number;     // Unix ms
  attemptCount: number;
}

export interface KeyCeremonyToken {
  token: string;         // random 128-bit hex
  operation: KeyCeremonyOperation;
  operationId: string;
  issuedAt: number;
  usedAt: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CODE_TTL_MS          = 5 * 60 * 1_000;  // 5 minutes
const MAX_ATTEMPTS         = 3;
const LOCKOUT_DURATION_MS  = 15 * 60 * 1_000; // 15 minutes
const TOKEN_TTL_MS         = 2 * 60 * 1_000;  // 2 minutes to start the operation

// ─── KeyCeremony ─────────────────────────────────────────────────────────────

/**
 * Управляет подтверждением критических операций.
 *
 * Использует in-memory хранилище (не IDB) — намеренно: данные не должны
 * переживать перезагрузку страницы.
 */
export class KeyCeremony {
  private challenges = new Map<string, KeyCeremonyChallenge & { codeHash: string }>();
  private tokens = new Map<string, KeyCeremonyToken>();
  private lockouts = new Map<string, number>(); // operationId → lockoutUntil
  private codeDeliveryFn: (operation: KeyCeremonyOperation, code: string) => Promise<void>;

  /**
   * @param deliverCode  Функция для OOB-доставки кода (email, SMS, push).
   *                     Вызывается с кодом открытым текстом — реализация
   *                     отвечает за безопасность канала доставки.
   */
  constructor(deliverCode: (operation: KeyCeremonyOperation, code: string) => Promise<void>) {
    this.codeDeliveryFn = deliverCode;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Инициирует ключевую церемонию для указанной операции.
   * Генерирует код, хранит хэш, вызывает deliverCode.
   * Возвращает operationId для последующего verifyConfirmation.
   */
  async requestConfirmation(operation: KeyCeremonyOperation): Promise<string> {
    // Expire stale challenges before creating a new one
    this._cleanupExpired();

    const operationId = this._generateId();
    const code = this._generateCode();
    const codeHash = await this._hashCode(code, operationId);

    this.challenges.set(operationId, {
      operationId,
      operation,
      expiresAt: Date.now() + CODE_TTL_MS,
      attemptCount: 0,
      codeHash,
    });

    // Deliver via OOB channel — at this point code leaves our boundary
    try {
      await this.codeDeliveryFn(operation, code);
    } catch (err: unknown) {
      this.challenges.delete(operationId);
      throw new Error(`Code delivery failed: ${(err as Error).message}`);
    }

    return operationId;
  }

  /**
   * Подтверждает код и возвращает одноразовый токен операции.
   * Бросает при неверном коде, истечении, или превышении попыток.
   */
  async verifyConfirmation(operationId: string, code: string): Promise<KeyCeremonyToken> {
    const lockoutUntil = this.lockouts.get(operationId) ?? 0;
    if (Date.now() < lockoutUntil) {
      const remainingMs = lockoutUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60_000);
      throw new Error(
        `Too many failed attempts. Try again in ${remainingMin} minute(s).`,
      );
    }

    const challenge = this.challenges.get(operationId);
    if (!challenge) {
      throw new Error('Unknown or expired operation ID.');
    }

    if (Date.now() > challenge.expiresAt) {
      this.challenges.delete(operationId);
      throw new Error('Confirmation code expired. Request a new one.');
    }

    // Constant-time safe: hash the user input and compare hashes
    const inputHash = await this._hashCode(code.trim(), operationId);
    const match = this._safeEqual(inputHash, challenge.codeHash);

    if (!match) {
      challenge.attemptCount++;
      if (challenge.attemptCount >= MAX_ATTEMPTS) {
        this.challenges.delete(operationId);
        this.lockouts.set(operationId, Date.now() + LOCKOUT_DURATION_MS);
        throw new Error(
          `Maximum attempts exceeded. Operation locked for ${LOCKOUT_DURATION_MS / 60_000} minutes.`,
        );
      }
      const remaining = MAX_ATTEMPTS - challenge.attemptCount;
      throw new Error(`Invalid confirmation code. ${remaining} attempt(s) remaining.`);
    }

    // Success — issue single-use token
    this.challenges.delete(operationId);
    this.lockouts.delete(operationId);

    const token: KeyCeremonyToken = {
      token: this._generateId(),
      operation: challenge.operation,
      operationId,
      issuedAt: Date.now(),
      usedAt: null,
    };
    this.tokens.set(token.token, token);

    // Auto-expire token
    setTimeout(() => this.tokens.delete(token.token), TOKEN_TTL_MS);

    return token;
  }

  /**
   * Консюмирует токен (помечает как использованный).
   * Бросает если токен не существует, устарел или уже использован.
   */
  consumeToken(tokenValue: string, expectedOperation: KeyCeremonyOperation): void {
    const token = this.tokens.get(tokenValue);
    if (!token) throw new Error('Invalid or expired ceremony token.');
    if (token.usedAt !== null) throw new Error('Ceremony token already used.');
    if (token.operation !== expectedOperation) {
      throw new Error(`Token issued for '${token.operation}', not '${expectedOperation}'.`);
    }
    if (Date.now() > token.issuedAt + TOKEN_TTL_MS) {
      this.tokens.delete(tokenValue);
      throw new Error('Ceremony token expired.');
    }
    token.usedAt = Date.now();
    // Remove after marking — prevents reuse
    this.tokens.delete(tokenValue);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Generates a cryptographically random 6-digit decimal code (000000–999999) */
  private _generateCode(): string {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    // Use modulo on 32-bit unsigned integer → biased, but safe for 6 digits (bias < 0.0001%)
    const n = (new DataView(bytes.buffer).getUint32(0, false) % 1_000_000);
    return n.toString().padStart(6, '0');
  }

  /** Random 128-bit hex ID */
  private _generateId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * SHA-256 of `${operationId}:${code}` → hex string.
   * Salting with operationId prevents pre-computation across sessions.
   */
  private async _hashCode(code: string, operationId: string): Promise<string> {
    const data = new TextEncoder().encode(`${operationId}:${code}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Constant-time string comparison to prevent timing side-channels.
   */
  private _safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  private _cleanupExpired(): void {
    const now = Date.now();
    for (const [id, ch] of this.challenges) {
      if (now > ch.expiresAt) this.challenges.delete(id);
    }
    for (const [id, until] of this.lockouts) {
      if (now > until) this.lockouts.delete(id);
    }
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _defaultInstance: KeyCeremony | null = null;

/**
 * Возвращает глобальный экземпляр KeyCeremony, инициализированный при старте приложения.
 * Для тестов предпочтительно создавать новый экземпляр напрямую.
 */
export function getDefaultKeyCeremony(): KeyCeremony {
  if (!_defaultInstance) {
    throw new Error(
      'KeyCeremony not initialized. Call initKeyCeremony(deliverCode) at app startup.',
    );
  }
  return _defaultInstance;
}

/**
 * Инициализирует глобальный экземпляр KeyCeremony.
 * @param deliverCode  OOB delivery function (email / SMS / push)
 */
export function initKeyCeremony(
  deliverCode: (operation: KeyCeremonyOperation, code: string) => Promise<void>,
): KeyCeremony {
  _defaultInstance = new KeyCeremony(deliverCode);
  return _defaultInstance;
}
