/**
 * v2.8 Platform Core Registry Types (SSOT)
 * 
 * This is the authoritative source of truth for all enums, schemas, and policies.
 * Changes require CODEOWNERS + 2 approvals.
 * Compiled output: supabase/registry.json
 * 
 * Do NOT modify without running:
 *   npm run registry:compile && npm run registry:verify
 */

/**
 * INV-DM-01: DM uniqueness per (A,B) pair
 * INV-SEQ-01: Gap detection mandatory
 */
export enum ScopeType {
  DM = "dm",
  GROUP = "group",
  CHANNEL = "channel",
  SERVICE = "service",
}

/**
 * INV-POL-01: Join eligibility server-validated
 */
export enum JoinMode {
  OPEN = "open",                    // public join without invite
  APPROVAL = "approval",            // requires admin approval
  INVITE_ONLY = "invite_only",      // invite required
}

/**
 * INV-POL-01: Visibility/join rules
 * Allowed combinations:
 * - public: open | approval
 * - private: invite_only | approval
 * - unlisted: invite_only | approval
 */
export enum VisibilityLevel {
  PUBLIC = "public",       // discoverable + visible in lists
  PRIVATE = "private",     // not discoverable, hidden from lists
  UNLISTED = "unlisted",   // discoverable by link only, hidden from lists
}

/**
 * INV-DEL-01: delivery_strategy is explicit
 * INV-POL-01: Channels >= 50k must use fanout_on_read
 */
export enum DeliveryStrategy {
  FANOUT_ON_WRITE = "fanout_on_write",   // DM/Group: write immediately notifies all
  FANOUT_ON_READ = "fanout_on_read",     // Channel/Large: read triggers delivery
}

/**
 * INV-CLASS-01: Data classification derived from registry
 * Retention mapping:
 * - normal: 365 days
 * - sensitive: 180 days
 * - regulated: 730 days
 * 
 * Outcomes are always archived (never deleted by retention)
 */
export enum DataClassification {
  NORMAL = "normal",           // 365 days
  SENSITIVE = "sensitive",     // 180 days
  REGULATED = "regulated",     // 730 days
}

export const CLASSIFICATION_RETENTION_DAYS: Record<DataClassification, number> = {
  [DataClassification.NORMAL]: 365,
  [DataClassification.SENSITIVE]: 180,
  [DataClassification.REGULATED]: 730,
};

/**
 * INV-BATCH-01: Batch mutations forbidden
 * INV-IDEMP-01: Idempotency via command_type
 */
export enum CommandType {
  CREATE_SCOPE = "create_scope",
  SEND_MESSAGE = "send_message",
  SEND_MESSAGE_REPLY = "send_message_reply",
  EDIT_MESSAGE = "edit_message",
  DELETE_MESSAGE = "delete_message",
  UPDATE_SCOPE_POLICY = "update_scope_policy",
  ACCEPT_INVITE = "accept_invite",
  REJECT_INVITE = "reject_invite",
  INVITE_USER = "invite_user",
  REMOVE_MEMBER = "remove_member",
  UPDATE_MEMBERSHIP = "update_membership",
  RECORD_RECEIPT = "record_receipt",
  UPDATE_PROJECTION_WATERMARK = "update_projection_watermark",
}

/**
 * INV-GOV-01: Admin actions require reason_code
 * G-ADM-01: Admin reason allowlist + PII screen
 * 
 * PII cannot appear in reason_text (validated at RPC layer)
 */
export enum AdminReasonCode {
  ABUSE_SPAM = "abuse_spam",
  ABUSE_HARASSMENT = "abuse_harassment",
  LEGAL_REQUEST = "legal_request",
  USER_REQUEST = "user_request",
  SECURITY_INCIDENT = "security_incident",
  MODERATION_POLICY = "moderation_policy",
  OTHER = "other",  // requires reason_text
}

/**
 * INV-MAINT-01: Maintenance modes enforce write freeze
 * Allowed transitions per spec section 11:
 * - normal -> maintenance_write_freeze
 * - maintenance_write_freeze -> read_only_safe
 * - read_only_safe -> maintenance_write_freeze
 * - maintenance_write_freeze -> maintenance_full (dual approval)
 * - maintenance_full -> maintenance_write_freeze
 * 
 * Forbidden:
 * - normal -> read_only_safe
 * - normal -> maintenance_full
 * - read_only_safe -> maintenance_full (without write_freeze)
 */
export enum MaintenanceMode {
  NORMAL = "normal",
  MAINTENANCE_WRITE_FREEZE = "maintenance_write_freeze",
  READ_ONLY_SAFE = "read_only_safe",
  MAINTENANCE_FULL = "maintenance_full",
}

export const MAINTENANCE_ALLOWED_TRANSITIONS: Record<MaintenanceMode, MaintenanceMode[]> = {
  [MaintenanceMode.NORMAL]: [MaintenanceMode.MAINTENANCE_WRITE_FREEZE],
  [MaintenanceMode.MAINTENANCE_WRITE_FREEZE]: [
    MaintenanceMode.READ_ONLY_SAFE,
    MaintenanceMode.MAINTENANCE_FULL, // requires dual approval
  ],
  [MaintenanceMode.READ_ONLY_SAFE]: [MaintenanceMode.MAINTENANCE_WRITE_FREEZE],
  [MaintenanceMode.MAINTENANCE_FULL]: [MaintenanceMode.MAINTENANCE_WRITE_FREEZE],
};

export const MAINTENANCE_FORBIDDEN_TRANSITIONS: [MaintenanceMode, MaintenanceMode][] = [
  [MaintenanceMode.NORMAL, MaintenanceMode.READ_ONLY_SAFE],
  [MaintenanceMode.NORMAL, MaintenanceMode.MAINTENANCE_FULL],
  [MaintenanceMode.READ_ONLY_SAFE, MaintenanceMode.MAINTENANCE_FULL],
];

/**
 * INV-PROJ-01: Projection mode during rebuild
 * Section 18: projection_mode stored in DB
 */
export enum ProjectionMode {
  NORMAL = "normal",
  REBUILDING = "rebuilding",  // watermark unstable
  READ_ONLY = "read_only",    // stable read view
}

/**
 * G-CLK-01: Clock skew handling
 * MAX_CLOCK_SKEW = 5 minutes
 */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;  // 5 min

/**
 * INV-QRY-01: Timeline limits strictly capped
 * Section 9: /q/timeline
 */
export const TIMELINE_HARD_CAP_LIMIT = 200;
export const TIMELINE_LOOKBACK_DAYS = 30;

/**
 * INV-IDEMP-01: Idempotency outcome SLO
 * Section 14: Archive lookup SLO
 */
export const OUTCOME_SLO_HOT_P95_MS = 50;
export const OUTCOME_SLO_ARCHIVE_P95_MS = 500;

/**
 * INV-IDEMP-01: Perpetual idempotency retention
 * Section 3.3: Two-tier model
 */
export const IDEMPOTENCY_HOT_RETENTION_DAYS = 2 * 365;  // 2 years
export const IDEMPOTENCY_ARCHIVE_RETENTION = "indefinite";

/**
 * G-SVC-01: Service key rotation
 * Section 19: Monthly rotation with 35-day enforcement
 */
export const SERVICE_KEY_ROTATION_AFTER_DAYS = 30;
export const SERVICE_KEY_ENFORCEMENT_MAX_AGE_DAYS = 35;

/**
 * INV-DEL-01: Large channel threshold
 * Section 6: delivery_strategy defaulting
 */
export const LARGE_CHANNEL_MIN_MEMBER_COUNT = 50_000;

/**
 * INV-INV-01: Invite TTL requirement
 * Default for private scopes (hours)
 */
export const INVITE_TTL_DEFAULT_HOURS = 168;  // 1 week
export const INVITE_TTL_MAX_HOURS = 8760;      // 1 year

/**
 * Policy-affecting fields that bump policy_version
 * Section 5.1: Only these fields trigger version update
 */
export const POLICY_AFFECTING_FIELDS = [
  "visibility",
  "join_mode",
  "delivery_strategy",
  "approval_roles",
  "approval_quorum",
  "self_join_enabled",
  "invite_ttl",
  "data_classification_defaults",
] as const;

/**
 * Write-surface inventory: allowed RPC functions
 * Section 5: SECURITY DEFINER RPC only, no direct writes
 * G-BATCH-01: batch endpoint forbidden
 */
export const ALLOWED_RPC_FUNCTIONS = {
  create_scope: {
    signature: "create_scope(scope_type, visibility, join_mode, policy_version, policy_hash)",
    allowed_actors: ["authenticated", "service"],
    mutable: true,
    command_type: CommandType.CREATE_SCOPE,
  },
  send_command: {
    signature: "send_command(scope_id, command_type, payload, idempotency_key_norm, trace_id, device_id)",
    allowed_actors: ["authenticated", "service"],
    mutable: true,
    command_type: CommandType.SEND_MESSAGE, // polymorphic via payload
  },
  accept_invite: {
    signature: "accept_invite(invite_id, device_id, trace_id)",
    allowed_actors: ["authenticated"],
    mutable: true,
    command_type: CommandType.ACCEPT_INVITE,
  },
  update_membership: {
    signature: "update_membership(scope_id, user_id, role, device_id, trace_id)",
    allowed_actors: ["authenticated", "service"],
    mutable: true,
    command_type: CommandType.UPDATE_MEMBERSHIP,
  },
  record_receipt: {
    signature: "record_receipt(scope_id, last_read_seq, last_delivered_seq, device_id, trace_id)",
    allowed_actors: ["authenticated"],
    mutable: true,
    command_type: CommandType.RECORD_RECEIPT,
  },
  update_policy: {
    signature: "update_policy(scope_id, policy_json, policy_hash, reason_code, reason_text, device_id, trace_id)",
    allowed_actors: ["service"],
    mutable: true,
    command_type: CommandType.UPDATE_SCOPE_POLICY,
  },
  maintenance_control: {
    signature: "maintenance_control(new_mode, reason_code, reason_text, require_dual_approval)",
    allowed_actors: ["service"],
    mutable: true,
    command_type: undefined, // system action, not command-driven
  },
} as const;

/**
 * Query endpoints (read-only, no RPC mutation tracking required)
 */
export const ALLOWED_QUERY_ENDPOINTS = {
  timeline: {
    signature: "GET /q/timeline?scope_id=&limit=&lookback_days=",
    rate_limit_keys: ["actor_id", "scope_id", "device_id", "service_id"],
  },
  cmd_status: {
    signature: "GET /cmd/status?actor_id=&scope_id=&command_type=&idempotency_key=",
    rate_limit_keys: ["actor_id", "device_id", "service_id"],
    privacy_requirement: "requester actor_id must match outcome actor_id",
  },
} as const;

/**
 * Rate limit configuration
 * Section 9: Rate limits per (actor_id, scope_id), per actor global, per delegated_user_id
 * G-QRY-01: Timeline caps enforced
 */
export const RATE_LIMIT_CONFIG = {
  timeline_per_scope: 100,          // per 60s per actor per scope
  timeline_per_actor_global: 500,   // per 60s per actor across all scopes
  timeline_per_device: 150,         // per 60s per device
  timeline_per_service: 1000,       // per 60s per service
  
  cmd_per_actor: 200,               // per 60s per actor
  cmd_per_device: 100,              // per 60s per device
  cmd_per_service: 2000,            // per 60s per service
  
  maintenance_per_hour: 3,          // max 3 transitions per hour
} as const;

/**
 * Acceptance test categories (T-*)
 * Section 20: Minimal required list
 * No PR touching core may merge without these tests green
 */
export const ACCEPTANCE_TEST_CATEGORIES = {
  DM: ["T-DM-01", "T-DM-02", "T-DM-SELF-01", "T-DM-SELF-02"],
  IDEMPOTENCY: ["T-IDEMP-02", "T-IDEMP-03", "T-IDEMP-04", "T-IDEMP-PAYLOAD"],
  POLICY: ["T-POL-01", "T-POL-HASH-01", "T-POL-HASH-02"],
  QUERY: ["T-QRY-01", "T-QRY-THR-01", "T-QRY-THR-02"],
  SEQUENCE: ["T-SEQ-01", "T-SEQ-02", "T-SEQ-03", "T-SEQ-04"],
  AUDIT: ["T-AUD-01", "T-AUD-RET-01", "T-AUD-RET-02"],
  INVITES: ["T-INV-01", "T-INV-02", "T-INV-03", "T-INV-04", "T-INV-REJOIN-01"],
  DELIVERY: ["T-DEL-01"],
  MIGRATION: ["T-MIG-READ-01", "T-MIG-READ-02", "T-MIG-READ-03", "T-MIG-RESUME-01", "T-MIG-RESUME-02"],
  PROJECTION: ["T-PROJ-01", "T-PROJ-02"],
  GOVERNANCE: ["T-GOV-01"],
  BATCH: ["T-BATCH-01"],  // /cmd/batch returns not_supported
  CHAOS: ["T-CHAOS-01"],  // critical scenarios
} as const;

/**
 * Runtime guards registry (G-*)
 * Section 17: All runtime guards enumerated
 * Referenced in threat coverage
 */
export const RUNTIME_GUARDS = {
  G_IDEMP_01: {
    name: "idempotency identity enforcement",
    invariant: "INV-IDEMP-01",
    check: "identity = (actor_id, scope_id, command_type, idempotency_key_norm)",
  },
  G_IDEMP_02: {
    name: "payload hash mismatch guard",
    invariant: "INV-IDEMP-01",
    check: "payload_hash matches stored outcome",
  },
  G_POL_01: {
    name: "policy visibility/join enforcement",
    invariant: "INV-POL-01",
    check: "visibility + join_mode allowed combination",
  },
  G_SEQ_01: {
    name: "gap realism validation",
    invariant: "INV-SEQ-01",
    check: "missing_ranges within TIMELINE_LOOKBACK_DAYS",
  },
  G_QRY_01: {
    name: "timeline caps",
    invariant: "INV-QRY-01",
    check: "limit <= TIMELINE_HARD_CAP_LIMIT, lookback <= TIMELINE_LOOKBACK_DAYS",
  },
  G_MAINT_01: {
    name: "maintenance freeze gate",
    invariant: "INV-MAINT-01",
    check: "writes rejected if system_mode != normal",
  },
  G_INV_01: {
    name: "invite policy/version check",
    invariant: "INV-INV-01",
    check: "policy_version/hash at issue matches current",
  },
  G_DEL_01: {
    name: "delivery_strategy enforcement",
    invariant: "INV-DEL-01",
    check: "large channels use fanout_on_read",
  },
  G_CLK_01: {
    name: "clock skew guard",
    invariant: "INV-CLK-01",
    check: "client_ts within MAX_CLOCK_SKEW_MS of server",
  },
  G_ADM_01: {
    name: "admin reason allowlist + PII screen",
    invariant: "INV-GOV-01",
    check: "reason_code in allowed enum, no PII in reason_text",
  },
  G_BATCH_01: {
    name: "batch forbidden guard",
    invariant: "INV-BATCH-01",
    check: "/cmd/batch returns not_supported",
  },
  G_PROJ_01: {
    name: "watermark monotonic enforcement",
    invariant: "INV-PROJ-01",
    check: "dialogs_watermark_seq, unread_watermark_seq only increase",
  },
  G_ARC_01: {
    name: "archive circuit breaker",
    invariant: "INV-SLO-01",
    check: "on archive_unavailable, circuit breaks for 30s",
  },
} as const;

/**
 * Compile-time verification markers
 * These must be checked by CI gates
 */
export const REGISTRY_VERSION = "2.8-final-rev2";
export const REGISTRY_LAST_UPDATED = "2026-02-24T00:00:00Z";
export const REGISTRY_REQUIRES_APPROVAL = true;
export const REGISTRY_CODEOWNERS = ["core-architecture", "security"];
