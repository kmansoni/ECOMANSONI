/**
 * Trust Enforcement Middleware
 * 
 * Express middleware that:
 * 1. Extracts actor context (user ID, IP, device ID)
 * 2. Checks trust enforcement (not blocked/restricted)
 * 3. Checks rate limits per action
 * 4. Logs decisions for monitoring
 */

import type { Request, Response, NextFunction } from 'express';
import { TrustService, getTrustService } from './trust.service';
import { RateLimiter, getRateLimiter } from './rate-limiter.service';
import type {
  ActorType,
  TrustContext,
} from './types';
import type { RateLimitConfig } from './rate-limiter.service';

export interface TrustMiddlewareConfig {
  trustService?: TrustService;
  rateLimiter?: RateLimiter;
  getActorContext?: (req: Request) => { type: ActorType; id: string } | null;
  getRateLimitConfig?: (action: string) => RateLimitConfig | null;
  logDecisions?: boolean;
}

/**
 * Default actor context extractor: uses authenticated user ID
 */
function defaultGetActorContext(req: Request): { type: ActorType; id: string } | null {
  const userId = (req as any).user?.id || (req as any).auth?.uid;
  if (!userId) {
    return null;
  }
  return { type: 'user', id: userId };
}

/**
 * Create trust enforcement middleware
 */
export function createTrustMiddleware(config: TrustMiddlewareConfig = {}) {
  const trustService = config.trustService || getTrustService();
  const rateLimiter = config.rateLimiter || getRateLimiter();
  const getActorContext = config.getActorContext || defaultGetActorContext;
  const logDecisions = config.logDecisions !== false;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Extract actor context
      const actor = getActorContext(req);
      if (!actor) {
        // No authenticated actor, skip enforcement
        return next();
      }

      // 2. Build trust context
      const trustContext: TrustContext = {
        ip_address: req.ip,
        device_id: req.headers['x-device-id'] as string,
        user_agent: req.get('user-agent'),
        endpoint: `${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'] as string,
      };

      // 3. Check trust enforcement
      const enforcement = await trustService.makeEnforcementDecision(
        actor.type,
        actor.id,
        trustContext
      );

      if (!enforcement.allowed) {
        if (logDecisions) {
          console.warn(
            `[TrustMiddleware] Access denied: ${actor.type}:${actor.id} - ${enforcement.reason}`
          );
        }
        return res.status(403).json({
          error: 'access_denied',
          message: 'Your account has restrictions. Please contact support.',
          reason: enforcement.reason,
        });
      }

      // 4. Определяем ключ действия для rate-limiting.
      //
      // SECURITY: action НЕ берётся из req.query, req.body или любых
      // client-controlled источников. Атакующий мог бы передать
      // ?action=get:health чтобы использовать "лёгкий" bucket вместо
      // реального — и отправлять сколько угодно запросов к чувствительным
      // endpoints.
      //
      // Вместо этого action формируется только из метаданных маршрута:
      //   routeKey = "METHOD:basePath" (например "post:/api/messages")
      // Вызывающий может передать свою getRateLimitConfig(action) исходя из
      // этого формата.
      const action = `${req.method.toLowerCase()}:${req.baseUrl || req.path}`;

      if (config.getRateLimitConfig) {
        const rateLimitConfig = config.getRateLimitConfig(action);
        if (rateLimitConfig) {
          const decision = await rateLimiter.checkAndConsume(
            actor.type,
            actor.id,
            action,
            rateLimitConfig,
            1, // 1 token per request
            trustContext.request_id
          );

          if (!decision.allowed) {
            if (logDecisions) {
              console.warn(
                `[TrustMiddleware] Rate limit exceeded: ${actor.type}:${actor.id} - ${action}`
              );
            }
            // Заголовок должен быть установлен ДО отправки тела ответа
            const retryAfterSec = decision.wait_ms ? Math.ceil(decision.wait_ms / 1000) : 60;
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({
              error: 'rate_limit_exceeded',
              message: 'Too many requests. Please try again later.',
              retry_after: retryAfterSec,
            });
          }

          // Add decision info to request for logging
          (req as any).rateLimitDecision = decision;
        }
      }

      // 5. Attach actor and context to request
      (req as any).actor = actor;
      (req as any).trustContext = trustContext;
      (req as any).enforcement = enforcement;

      next();
    } catch (err) {
      /**
       * SECURITY FIX (C-5): Fail-CLOSED instead of fail-open.
       *
       * BEFORE: On internal error, middleware called next() — allowing the
       * request through without any trust/rate-limit checks. This is a
       * classic fail-open vulnerability: an attacker who can trigger errors
       * in the trust service (e.g., Redis down, DB timeout) bypasses ALL
       * enforcement.
       *
       * AFTER: Return 503 Service Unavailable. The request is NOT forwarded
       * to downstream handlers. This ensures zero-trust: if we can't verify
       * trust, we deny access.
       *
       * TRADE-OFF: Brief availability degradation during trust-service outages
       * vs. allowing potentially malicious traffic through unchecked.
       * For a security-critical system, denial is the correct default.
       */
      console.error(
        '[TrustMiddleware] FAIL-CLOSED: Trust enforcement error, denying request.',
        {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          path: req.path,
          method: req.method,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        },
      );
      return res.status(503).json({
        error: 'service_unavailable',
        message: 'Trust enforcement service is temporarily unavailable. Please retry later.',
      });
    }
  };
}

/**
 * Helper: Report a risk event (e.g., from route handlers)
 */
export async function reportRiskEvent(
  req: Request,
  eventType: string,
  weight: number,
  meta?: Record<string, any>
): Promise<void> {
  const actor = (req as any).actor;
  const requestId = (req as any).trustContext?.request_id;

  if (!actor) {
    return; // No actor to report for
  }

  try {
    const trustService = getTrustService();
    await trustService.logRiskEvent(
      actor.type,
      actor.id,
      eventType as any,
      weight,
      meta,
      requestId
    );
  } catch (err) {
    console.error('[reportRiskEvent] Error:', err);
    // Don't fail the request for monitoring errors
  }
}
