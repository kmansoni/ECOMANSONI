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
  RateLimitConfig,
} from './types';

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
  const userId = req.user?.id || (req as any).auth?.uid;
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

      // 4. Check rate limits (get action from route or query param)
      const action =
        (req.query.action as string) ||
        `${req.method.toLowerCase()}:${req.baseUrl}`; // default action

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
            // Return 429 Too Many Requests
            res.status(429).json({
              error: 'rate_limit_exceeded',
              message: 'Too many requests. Please try again later.',
              retry_after: decision.wait_ms ? Math.ceil(decision.wait_ms / 1000) : undefined,
            });
            res.setHeader('Retry-After', decision.wait_ms ? Math.ceil(decision.wait_ms / 1000) : '60');
            return;
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
      console.error('[TrustMiddleware] Error:', err);
      // Fail open: allow on service error
      next();
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
