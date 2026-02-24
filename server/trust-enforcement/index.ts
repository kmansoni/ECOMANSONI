/**
 * Trust Enforcement Module
 * 
 * Exports: TrustService, RateLimiter, Types, and helper middleware
 */

export { TrustService, getTrustService } from './trust.service';
export { RateLimiter, getRateLimiter } from './rate-limiter.service';
export type {
  ActorType,
  RiskTier,
  EnforcementLevel,
  EventType,
  TrustProfile,
  RiskEvent,
  RiskEventResponse,
  EnforcementDecision,
  RateLimitDecision,
  UpdateProfileRequest,
  TrustServiceConfig,
  TrustContext,
} from './types';
export { createTrustMiddleware } from './middleware';

// Re-export rate limit config type
export type { RateLimitConfig } from './rate-limiter.service';
