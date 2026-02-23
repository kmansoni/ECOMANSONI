/**
 * API Validation Layer - v2.8 Platform Core
 * 
 * Zod schemas for all commands, payloads, and responses
 * Ensures type safety and payload validation
 * 
 * Covers:
 * - Command schemas (send_message, edit, delete, etc.)
 * - Timeline query schemas
 * - /cmd/status query schemas
 * - Policy update schemas
 * - Admin action schemas
 */

import { z } from "zod";
import { registry, getConstant } from "@/lib/registry/loader";

// ============================================================================
// Base/Common Schemas
// ============================================================================

/**
 * UUID validation (normalized)
 */
export const UUIDSchema = z.string().uuid().transform((val) => val.toLowerCase());

/**
 * Idempotency key (UUID or ULID, normalized)
 */
export const IdempotencyKeySchema = z
  .string()
  .min(20)
  .max(36)
  .transform((val) => {
    // Normalize: UUID to lowercase, ULID to uppercase
    if (val.length === 36 && val.includes("-")) {
      return val.toLowerCase(); // UUID
    }
    return val.toUpperCase(); // ULID
  });

/**
 * Trace ID (context for debugging)
 */
export const TraceIdSchema = z.string().min(1).max(255);

/**
 * Device ID (for rate limiting)
 */
export const DeviceIdSchema = z.string().min(1).max(255);

/**
 * Command payload (opaque JSON)
 */
export const CommandPayloadSchema = z.record(z.unknown());

// ============================================================================
// Command Schemas (INV-IDEMP-01)
// ============================================================================

/**
 * send_message command
 */
export const SendMessageSchema = z.object({
  scope_id: UUIDSchema,
  message_text: z.string().min(1).max(10000),
  reply_to_seq: z.number().int().positive().optional(),
  attachments: z
    .array(
      z.object({
        attachment_id: UUIDSchema,
        type: z.enum(["image", "video", "document", "file"]),
        url: z.string().url(),
      })
    )
    .optional(),
});

/**
 * edit_message command (only edit_count and edited_at can change)
 */
export const EditMessageSchema = z.object({
  scope_id: UUIDSchema,
  message_seq: z.number().int().positive(),
  new_text: z.string().min(1).max(10000),
});

/**
 * delete_message command (soft delete: tombstone)
 */
export const DeleteMessageSchema = z.object({
  scope_id: UUIDSchema,
  message_seq: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

/**
 * update_scope_policy command
 */
export const UpdatePolicySchema = z.object({
  scope_id: UUIDSchema,
  policy: z.object({
    visibility: z.enum(["public", "private", "unlisted"]),
    join_mode: z.enum(["open", "approval", "invite_only"]),
    delivery_strategy: z.enum(["fanout_on_write", "fanout_on_read"]),
    approval_roles: z.array(z.enum(["owner", "admin"])).optional(),
    approval_quorum: z.number().int().min(1).optional(),
    self_join_enabled: z.boolean().optional(),
    invite_ttl: z.number().int().min(1).max(8760).optional(),
    data_classification_defaults: z.enum(["normal", "sensitive", "regulated"]).optional(),
  }),
  policy_hash: z.string().length(64), // sha256 hex
  reason_code: z.enum([
    "abuse_spam",
    "abuse_harassment",
    "legal_request",
    "user_request",
    "security_incident",
    "moderation_policy",
    "other",
  ]),
  reason_text: z.string().max(500).optional(),
});

/**
 * accept_invite command
 */
export const AcceptInviteSchema = z.object({
  invite_id: UUIDSchema,
});

/**
 * invite_user command
 */
export const InviteUserSchema = z.object({
  scope_id: UUIDSchema,
  invited_user_id: UUIDSchema,
});

/**
 * remove_member command
 */
export const RemoveMemberSchema = z.object({
  scope_id: UUIDSchema,
  user_id: UUIDSchema,
  reason_code: z.enum([
    "abuse_spam",
    "abuse_harassment",
    "legal_request",
    "user_request",
    "security_incident",
    "moderation_policy",
    "other",
  ]),
  reason_text: z.string().max(500).optional(),
});

// ============================================================================
// Request/Response Schemas
// ============================================================================

/**
 * send_command RPC request
 */
export const SendCommandRequestSchema = z.object({
  scope_id: UUIDSchema,
  command_type: z.string(),
  payload: CommandPayloadSchema,
  idempotency_key_norm: IdempotencyKeySchema,
  trace_id: TraceIdSchema,
  device_id: DeviceIdSchema,
});

/**
 * send_command RPC response
 */
export const SendCommandResponseSchema = z.object({
  outcome_state: z.enum(["found_hot", "found_archive", "pending", "not_found", "error"]),
  outcome_code: z.string(),
  outcome: z.record(z.unknown()).optional(),
});

/**
 * /q/timeline query request
 * Section 9: Timeline caps and rate limiting
 */
export const TimelineQuerySchema = z.object({
  scope_id: UUIDSchema,
  limit: z.number().int().min(1).max(getConstant("TIMELINE_HARD_CAP_LIMIT")),
  lookback_days: z.number().int().min(1).max(getConstant("TIMELINE_LOOKBACK_DAYS")).optional(),
  before_seq: z.number().int().positive().optional(),
  after_seq: z.number().int().positive().optional(),
});

/**
 * /q/timeline response
 */
export const TimelineResponseSchema = z.object({
  events: z.array(
    z.object({
      event_id: UUIDSchema,
      seq: z.number().int().positive(),
      actor_id: UUIDSchema,
      command_type: z.string(),
      payload: CommandPayloadSchema,
      created_at: z.string().datetime(),
      server_time: z.string().datetime(),
    })
  ),
  missing_ranges: z
    .array(
      z.object({
        from_seq: z.number().int().positive(),
        to_seq: z.number().int().positive(),
      })
    )
    .optional(),
  scope_max_seq: z.number().int().nonnegative(),
  projection_mode: z.enum(["normal", "rebuilding", "read_only"]),
});

/**
 * /cmd/status query request
 * Section 10: Privacy requirement (requester actor_id must match)
 */
export const CmdStatusQuerySchema = z.object({
  actor_id: UUIDSchema,
  scope_id: UUIDSchema,
  command_type: z.string(),
  idempotency_key_norm: IdempotencyKeySchema,
});

/**
 * /cmd/status response
 */
export const CmdStatusResponseSchema = z.object({
  outcome_state: z.enum(["found_hot", "found_archive", "pending", "not_found", "error"]),
  source: z.enum(["hot", "archive", "none"]),
  outcome: z.record(z.unknown()).optional(),
  outcome_code: z.string().optional(),
  retry_after_ms: z.number().int().min(0).optional(),
});

// ============================================================================
// Payload Schemas (for specific command types)
// ============================================================================

/**
 * Union of all command payloads
 */
export type CommandPayload =
  | z.infer<typeof SendMessageSchema>
  | z.infer<typeof EditMessageSchema>
  | z.infer<typeof DeleteMessageSchema>
  | z.infer<typeof UpdatePolicySchema>
  | z.infer<typeof AcceptInviteSchema>
  | z.infer<typeof InviteUserSchema>
  | z.infer<typeof RemoveMemberSchema>;

/**
 * Parse command by type
 */
export function parseCommandPayload(
  commandType: string,
  payload: unknown
): CommandPayload {
  switch (commandType) {
    case "send_message":
      return SendMessageSchema.parse(payload);
    case "edit_message":
      return EditMessageSchema.parse(payload);
    case "delete_message":
      return DeleteMessageSchema.parse(payload);
    case "update_scope_policy":
      return UpdatePolicySchema.parse(payload);
    case "accept_invite":
      return AcceptInviteSchema.parse(payload);
    case "invite_user":
      return InviteUserSchema.parse(payload);
    case "remove_member":
      return RemoveMemberSchema.parse(payload);
    default:
      throw new Error(`Unknown command type: ${commandType}`);
  }
}

// ============================================================================
// Receipt/Pointer Schemas
// ============================================================================

/**
 * Record receipt (record_receipt RPC)
 */
export const RecordReceiptSchema = z.object({
  scope_id: UUIDSchema,
  last_read_seq: z.number().int().nonnegative(),
  last_delivered_seq: z.number().int().nonnegative(),
  device_id: DeviceIdSchema,
  trace_id: TraceIdSchema,
});

// ============================================================================
// Admin Action Schemas
// ============================================================================

/**
 * Admin action (delete message, remove member, etc.)
 */
export const AdminActionSchema = z.object({
  action_type: z.enum(["delete_message", "remove_member", "edit_policy", "maintenance"]),
  target_scope_id: UUIDSchema.optional(),
  target_user_id: UUIDSchema.optional(),
  reason_code: z.enum([
    "abuse_spam",
    "abuse_harassment",
    "legal_request",
    "user_request",
    "security_incident",
    "moderation_policy",
    "other",
  ]),
  reason_text: z.string().max(500).optional(),
  action_details: z.record(z.unknown()).optional(),
});

// ============================================================================
// Clock Skew
// ============================================================================

/**
 * Validate client timestamp within skew window
 */
export function validateClockSkew(clientTs: Date, serverTs: Date): boolean {
  const skewMs = Math.abs(clientTs.getTime() - serverTs.getTime());
  const maxSkewMs = getConstant("MAX_CLOCK_SKEW_MS");
  return skewMs <= maxSkewMs;
}

/**
 * Response for skew rejection
 */
export const ClockSkewRejectionSchema = z.object({
  status: z.literal("error"),
  code: z.literal("clock_skew_detected"),
  server_time: z.string().datetime(),
  skew_hint: z.string(),
  max_allowed_skew_ms: z.number().int(),
});

// ============================================================================
// Exports
// ============================================================================

export {
  SendMessageSchema,
  EditMessageSchema,
  DeleteMessageSchema,
  UpdatePolicySchema,
  AcceptInviteSchema,
  InviteUserSchema,
  RemoveMemberSchema,
  TimelineQuerySchema,
  CmdStatusQuerySchema,
  RecordReceiptSchema,
  AdminActionSchema,
};
