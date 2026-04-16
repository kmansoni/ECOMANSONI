/**
 * Crisis Mesh — основной router.
 *
 * Ответственности:
 *   1. Дедупликация по messageId (LRU 10k + TTL 24h)
 *   2. Loop prevention по routePath
 *   3. TTL/hop checks
 *   4. Rate limiting per-peer
 *   5. Принятие решения: deliver to user / relay / drop
 *
 * Выходной интерфейс — RouterDecision, transport layer
 * сам отправляет пакет соответствующим пирам.
 */

import {
  CrisisMeshError,
  DEFAULT_CONFIG,
  type CrisisMeshConfig,
  type MeshMessageEnvelope,
  type MeshMessageId,
  type PeerId,
} from '../types';
import { LruCache } from './lru-cache';
import { RateLimiter } from './rate-limiter';

export type RouterDecision =
  | { action: 'deliver'; envelope: MeshMessageEnvelope } // для нас
  | { action: 'relay'; envelope: MeshMessageEnvelope; excludePeers: PeerId[] }
  | { action: 'drop'; reason: RouterDropReason };

export type RouterDropReason =
  | 'duplicate'
  | 'expired-ttl'
  | 'max-hops'
  | 'loop-detected'
  | 'rate-limited'
  | 'self-message';

interface DedupEntry {
  firstSeenAt: number;
  hopCountWhenSeen: number;
}

export class MeshRouter {
  private readonly dedupCache: LruCache<MeshMessageId, DedupEntry>;
  private readonly perPeerRate: RateLimiter;
  private readonly sosRate: RateLimiter;

  constructor(
    private readonly selfPeerId: PeerId,
    private readonly config: CrisisMeshConfig = DEFAULT_CONFIG,
  ) {
    this.dedupCache = new LruCache(config.dedupCacheSize);
    this.perPeerRate = new RateLimiter({
      limit: config.messageRateLimitPerMin,
      windowMs: 60_000,
    });
    this.sosRate = new RateLimiter({
      limit: config.sosRateLimitPerFiveMin,
      windowMs: 5 * 60_000,
    });
  }

  /**
   * Принять решение о пакете.
   * Вызывается при получении envelope от transport.
   */
  route(envelope: MeshMessageEnvelope, now: number = Date.now()): RouterDecision {
    // 1. Self-sent (эхо)
    if (envelope.senderId === this.selfPeerId) {
      return { action: 'drop', reason: 'self-message' };
    }

    // 2. Дедупликация
    if (this.dedupCache.has(envelope.id)) {
      return { action: 'drop', reason: 'duplicate' };
    }

    // 3. TTL
    const age = now - envelope.timestamp;
    if (age > envelope.ttlMs || age < -5 * 60_000) {
      // Отрицательный age >5 мин в будущее → clock skew / подделка
      return { action: 'drop', reason: 'expired-ttl' };
    }

    // 4. Max hops
    if (envelope.hopCount >= envelope.maxHops) {
      return { action: 'drop', reason: 'max-hops' };
    }

    // 5. Loop prevention
    if (envelope.routePath.includes(this.selfPeerId)) {
      return { action: 'drop', reason: 'loop-detected' };
    }

    // 6. Rate limit (защита от флуда одним отправителем)
    const rateLimiter = envelope.kind === 'sos' ? this.sosRate : this.perPeerRate;
    if (!rateLimiter.tryAcquire(envelope.senderId, now)) {
      // Не маркируем как дубль — даём шанс повторить позже
      return { action: 'drop', reason: 'rate-limited' };
    }

    // 7. Маркируем в dedup
    this.dedupCache.set(envelope.id, {
      firstSeenAt: now,
      hopCountWhenSeen: envelope.hopCount,
    });

    // 8. Для нас?
    if (envelope.recipientId === this.selfPeerId) {
      return { action: 'deliver', envelope };
    }

    // 9. Broadcast или чужой recipient — relay
    if (envelope.recipientId === 'broadcast' || envelope.recipientId !== this.selfPeerId) {
      // Для broadcast — deliver + relay (это делает caller)
      const shouldAlsoDeliver = envelope.recipientId === 'broadcast';

      // Excluded peers — все кто уже в routePath + sender (не шлём обратно)
      const excludePeers = [...envelope.routePath, envelope.senderId];

      if (shouldAlsoDeliver) {
        // Caller должен вызвать onDeliver сам + потом relay
        return {
          action: 'relay',
          envelope: this.incrementHop(envelope),
          excludePeers,
        };
      }

      return {
        action: 'relay',
        envelope: this.incrementHop(envelope),
        excludePeers,
      };
    }

    return { action: 'drop', reason: 'self-message' };
  }

  /**
   * Инкремент hop + добавление selfPeerId в routePath перед relay.
   */
  private incrementHop(envelope: MeshMessageEnvelope): MeshMessageEnvelope {
    return {
      ...envelope,
      hopCount: envelope.hopCount + 1,
      routePath: [...envelope.routePath, this.selfPeerId],
    };
  }

  /**
   * Для исходящего сообщения (отправляем сами): готовим начальный envelope.
   */
  prepareOutgoing(
    envelope: Omit<MeshMessageEnvelope, 'hopCount' | 'routePath'>,
    now: number = Date.now(),
  ): MeshMessageEnvelope {
    // Исходящее тоже маркируем в dedup чтобы не зациклиться если вернётся через mesh
    this.dedupCache.set(envelope.id, {
      firstSeenAt: now,
      hopCountWhenSeen: 0,
    });
    return {
      ...envelope,
      hopCount: 0,
      routePath: [this.selfPeerId],
    };
  }

  /**
   * GC устаревших dedup записей (старше TTL).
   */
  pruneCaches(now: number = Date.now()): { dedupRemoved: number; rateRemoved: number } {
    const cutoff = now - this.config.ttlMs;
    const dedupRemoved = this.dedupCache.prune((v) => v.firstSeenAt < cutoff);
    const rateRemoved = this.perPeerRate.prune(now) + this.sosRate.prune(now);
    return { dedupRemoved, rateRemoved };
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  stats(): { dedupSize: number; selfPeerId: PeerId } {
    return {
      dedupSize: this.dedupCache.size,
      selfPeerId: this.selfPeerId,
    };
  }

  /**
   * Проверка: видели ли этот messageId раньше?
   * Доступно для подписчиков, чтобы не дублировать UI-отображение.
   */
  hasSeen(id: MeshMessageId): boolean {
    return this.dedupCache.has(id);
  }

  /**
   * Force-insert в dedup (например когда сами отправили сообщение).
   */
  markAsSeen(id: MeshMessageId, now: number = Date.now()): void {
    this.dedupCache.set(id, { firstSeenAt: now, hopCountWhenSeen: 0 });
  }

  // Для тестов
  _getConfig(): CrisisMeshConfig {
    return this.config;
  }
}

/**
 * Утилита: создание messageId детерминированно из содержимого.
 * senderId + timestamp + nonce → SHA-256 → base58.
 * Дедуп на receiver side работает потому что дубликаты приходят с тем же id.
 */
export async function computeMessageId(
  senderId: PeerId,
  timestamp: number,
  nonce: string,
): Promise<MeshMessageId> {
  const input = `${senderId}:${timestamp}:${nonce}`;
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input) as unknown as ArrayBuffer,
  );
  const bytes = new Uint8Array(hash).subarray(0, 12);
  // Hex для простоты (base58 есть в identity.ts но тут важна только уникальность)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') as MeshMessageId;
}

/**
 * Валидация структуры envelope — защита от malformed данных на transport layer.
 */
export function validateEnvelope(e: unknown): e is MeshMessageEnvelope {
  if (!e || typeof e !== 'object') return false;
  const env = e as Record<string, unknown>;
  return (
    typeof env.id === 'string' &&
    typeof env.senderId === 'string' &&
    typeof env.recipientId === 'string' &&
    typeof env.ciphertext === 'string' &&
    typeof env.signature === 'string' &&
    typeof env.nonce === 'string' &&
    typeof env.timestamp === 'number' &&
    typeof env.hopCount === 'number' &&
    typeof env.maxHops === 'number' &&
    typeof env.ttlMs === 'number' &&
    Array.isArray(env.routePath) &&
    typeof env.kind === 'string' &&
    typeof env.priority === 'number'
  );
}

/**
 * Для использования RouterDecision снаружи.
 */
export function explainDrop(reason: RouterDropReason): string {
  switch (reason) {
    case 'duplicate': return 'Дубликат — уже видели этот messageId';
    case 'expired-ttl': return 'Сообщение устарело (TTL истёк)';
    case 'max-hops': return 'Достигнут лимит hops';
    case 'loop-detected': return 'Обнаружен цикл (routePath содержит нас)';
    case 'rate-limited': return 'Превышен rate limit отправителя';
    case 'self-message': return 'Эхо собственного сообщения';
    default: {
      const _exhaustive: never = reason;
      return `Unknown reason: ${String(_exhaustive)}`;
    }
  }
}

// Экспорт ошибки для удобства
export { CrisisMeshError };
