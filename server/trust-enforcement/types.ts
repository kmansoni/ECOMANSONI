/**
 * Trust Service Types
 * 
 * Defines TypeScript interfaces for trust profiles, risk events, and enforcement
 */

export type ActorType = 'user' | 'device' | 'ip' | 'org' | 'service';
export type RiskTier = 'A' | 'B' | 'C' | 'D' | 'E';
export type EnforcementLevel = 'E0' | 'E1' | 'E2' | 'E3' | 'E4' | 'E5';
export type EventType = 
  | 'login_failure'
  | 'api_rate_exceeded'
  | 'bulk_action'
  | 'report_filed'
  | 'content_removed'
  | 'suspension_attempted'
  | 'anomalous_pattern'
  | 'device_fingerprint_change'
  | 'manual_override';

/**
 * Trust Profile DAO
 * Represents an actor's trust tier and enforcement policies
 */
export interface TrustProfile {
  actor_type: ActorType;
  actor_id: string;
  trust_score: number; // 0-100
  risk_tier: RiskTier;
  enforcement_level: EnforcementLevel;
  signals: Record<string, number | boolean | string>;
  version: number;
  updated_at?: string; // ISO timestamp
}

/**
 * Risk Event DAO
 * Append-only log entry for trust signal (idempotent via request_id)
 */
export interface RiskEvent {
  event_id?: number;
  actor_type: ActorType;
  actor_id: string;
  event_type: EventType;
  weight: number; // Impact on trust score
  meta?: Record<string, any>; // Event metadata
  request_id?: string; // Idempotency key (UUID)
  created_at?: string; // ISO timestamp
  source?: 'server' | 'client' | 'moderation' | 'system';
}

/**
 * Trust Profile Update Request
 * Passed to TrustService.updateProfile()
 */
export interface UpdateProfileRequest {
  actor_type: ActorType;
  actor_id: string;
  trust_score?: number;
  risk_tier?: RiskTier;
  enforcement_level?: EnforcementLevel;
  reason?: string;
  signals?: Record<string, any>;
}

/**
 * Trust Enforcement Decision
 * Result of determining what actions are allowed
 */
export interface EnforcementDecision {
  allowed: boolean;
  tier: RiskTier;
  enforced_at: string; // ISO timestamp
  reason?: string;
  actions_blocked?: string[]; // Which actions are rate-limited or blocked
}

/**
 * Rate Limit Decision
 * Result of checking if actor can perform action
 */
export interface RateLimitDecision {
  allowed: boolean;
  tokens_available: number;
  tokens_required: number;
  reset_at?: string; // ISO timestamp when tokens reset
  wait_ms?: number; // How many ms to wait before retrying
}

/**
 * Risk Event Response
 * Returned after logging a risk event
 */
export interface RiskEventResponse {
  event_id: number;
  actor_type: ActorType;
  actor_id: string;
  event_type: EventType;
  weight: number;
  request_id?: string;
  created_at: string;
  profile_updated: boolean; // Whether profile was re-computed
  new_tier?: RiskTier; // Only set if profile changed
  new_enforcement_level?: EnforcementLevel;
}

/**
 * Trust Service Config
 * Initialization parameters for trust enforcement
 */
export interface TrustServiceConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  redisUrl?: string; // Optional for high-scale token bucket
  enableAutoRecovery?: boolean; // Auto-increase score after N days
  recoveryIntervalDays?: number;
  defaultTier?: RiskTier; // Default for unprofiles actors
  enableMonitoring?: boolean; // Log all decisions
  monitoringTableName?: string;
}

/**
 * Trust Context
 * Additional context passed to enforcement checks
 */
export interface TrustContext {
  ip_address?: string;
  device_id?: string;
  user_agent?: string;
  endpoint?: string;
  timestamp?: string;
  request_id?: string;
}
