// @ts-nocheck
// Deno Edge Function: URL imports + Deno globals are validated by Supabase runtime, not by TS in the web app.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkRateLimit,
  errorResponse,
  getClientId,
  getCorsHeaders,
  handleCors,
  rateLimitResponse,
} from "../_shared/utils.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type AdminMe = {
  admin_user_id: string;
  email: string;
  display_name: string;
  status: string;
  roles: { id: string; name: string; display_name: string; category: string }[];
  scopes: string[];
};

type ActionRequest = {
  action:
    | "me"
    | "admin_users.list"
    | "admin_users.create"
    | "admin_users.deactivate"
    | "admin_roles.list"
    | "admin_user_roles.assign"
    | "admin_user_roles.revoke"
    | "killswitch.list"
    | "killswitch.set"
    | "audit.search"
    | "approvals.list"
    | "approvals.request"
    | "approvals.decide"
    | "jit.request"
    | "jit.active"
    | "jit.approve"
    | "jit.revoke";
  params?: Record<string, Json>;
};

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function requireParams<T extends string>(
  params: Record<string, Json> | undefined,
  keys: T[],
): { ok: true; value: Record<T, Json> } | { ok: false; missing: T } {
  const p = (params ?? {}) as Record<string, Json>;
  for (const k of keys) {
    if (p[k] === undefined || p[k] === null) return { ok: false, missing: k };
  }
  return { ok: true, value: p as Record<T, Json> };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  const cors = handleCors(req);
  if (cors) return cors;

  // Rate limit
  const clientId = getClientId(req);
  const rl = checkRateLimit(clientId);
  if (!rl.allowed) return rateLimitResponse(rl.resetIn, origin);

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const token = getBearerToken(req);
  if (!token) {
    return errorResponse("Missing bearer token", 401, origin);
  }

  let actionReq: ActionRequest;
  try {
    actionReq = (await req.json()) as ActionRequest;
  } catch {
    return errorResponse("Invalid JSON", 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return errorResponse("Server not configured", 500, origin);
  }

  const supabaseService = createClient(supabaseUrl, serviceKey);
  const supabaseAuthed = createClient(supabaseUrl, serviceKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  // Validate auth token and get email
  const { data: authData, error: authError } = await supabaseAuthed.auth.getUser();
  if (authError || !authData?.user) {
    return errorResponse("Invalid token", 401, origin);
  }
  const email = authData.user.email;
  if (!email) {
    return errorResponse("Email required", 403, origin);
  }

  // Map auth user to admin user
  const { data: adminRow, error: adminErr } = await (supabaseService as any)
    .from("admin_users")
    .select("id,email,display_name,status")
    .eq("email", email)
    .maybeSingle();

  if (adminErr) {
    return errorResponse("Admin lookup failed", 500, origin);
  }

  if (!adminRow || adminRow.status !== "active") {
    // Best-effort audit (actor_id is null)
    try {
      await (supabaseService as any).rpc("admin_audit_append", {
        p_actor_type: "admin",
        p_actor_id: null,
        p_actor_role: null,
        p_actor_session_id: null,
        p_action: "admin_api.denied",
        p_resource_type: "admin",
        p_resource_id: email,
        p_severity: "SEV1",
        p_reason_code: "NOT_ADMIN",
        p_reason_description: "User is not an active admin",
        p_ticket_id: null,
        p_approval_id: null,
        p_request_id: crypto.randomUUID(),
        p_ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        p_user_agent: req.headers.get("user-agent"),
        p_status: "denied",
        p_error_code: "NOT_ADMIN",
        p_error_message: null,
        p_before_state: null,
        p_after_state: null,
        p_metadata: { email },
      });
    } catch {
      // Do not leak errors
    }

    return errorResponse("Forbidden", 403, origin);
  }

  const adminUserId = adminRow.id as string;

  const nowIso = new Date().toISOString();

  const { data: roleRows } = await (supabaseService as any)
    .from("admin_user_roles")
    .select("role_id, expires_at, role:admin_roles(id,name,display_name,category)")
    .eq("admin_user_id", adminUserId)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  const roles = ((roleRows ?? []) as any[])
    .map((r) => r.role)
    .filter(Boolean);

  const roleIds = roles.map((r: any) => r.id);

  let scopes: string[] = [];
  if (roleIds.length > 0) {
    const { data: rpRows } = await (supabaseService as any)
      .from("admin_role_permissions")
      .select("role_id, permission:admin_permissions(scope)")
      .in("role_id", roleIds);

    const set = new Set<string>();
    for (const row of (rpRows ?? []) as any[]) {
      const scope = row?.permission?.scope;
      if (typeof scope === "string") set.add(scope);
    }
    scopes = [...set].sort();
  }

  function hasScope(required: string): boolean {
    return scopes.includes(required);
  }

  const roleNames = roles.map((r: any) => r.name);
  const isActorOwner = roleNames.includes("owner");

  async function getKillSwitches(): Promise<Record<string, boolean>> {
    const { data, error } = await (supabaseService as any)
      .from("admin_kill_switches")
      .select("key,enabled");
    if (error) throw error;
    const out: Record<string, boolean> = {};
    for (const row of (data ?? []) as any[]) out[String(row.key)] = Boolean(row.enabled);
    return out;
  }

  async function assertNotKilled(scope: "admin_writes" | "iam_writes" | "approvals") {
    const ks = await getKillSwitches();
    if (ks[scope]) {
      await audit({
        action: "security.killswitch.enforced",
        resource_type: "kill_switch",
        resource_id: scope,
        severity: "SEV0",
        status: "denied",
        reason_code: "KILL_SWITCH_ON",
        reason_description: `Kill switch '${scope}' is enabled`,
      });
      throw new Error(`Kill switch enabled: ${scope}`);
    }
  }

  async function assertApprovedApproval(approvalId: string): Promise<void> {
    const { data: approval, error } = await (supabaseService as any)
      .from("approvals")
      .select("id,status")
      .eq("id", approvalId)
      .maybeSingle();
    if (error) throw error;
    if (!approval || approval.status !== "approved") {
      throw new Error("Approval is not approved");
    }
  }

  async function audit(params: {
    action: string;
    resource_type: string;
    resource_id?: string | null;
    severity: "SEV0" | "SEV1" | "SEV2" | "SEV3" | "SEV4";
    status: "success" | "failure" | "denied";
    reason_code?: string | null;
    reason_description?: string | null;
    ticket_id?: string | null;
    approval_id?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    before_state?: Json | null;
    after_state?: Json | null;
    metadata?: Json | null;
  }) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent");
    const requestId = crypto.randomUUID();

    await (supabaseService as any).rpc("admin_audit_append", {
      p_actor_type: roles.some((r: any) => r.name === "owner") ? "owner" : "admin",
      p_actor_id: adminUserId,
      p_actor_role: roles.map((r: any) => r.name).join(","),
      p_actor_session_id: null,
      p_action: params.action,
      p_resource_type: params.resource_type,
      p_resource_id: params.resource_id ?? null,
      p_severity: params.severity,
      p_reason_code: params.reason_code ?? null,
      p_reason_description: params.reason_description ?? null,
      p_ticket_id: params.ticket_id ?? null,
      p_approval_id: params.approval_id ?? null,
      p_request_id: requestId,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_status: params.status,
      p_error_code: params.error_code ?? null,
      p_error_message: params.error_message ?? null,
      p_before_state: params.before_state ?? null,
      p_after_state: params.after_state ?? null,
      p_metadata: params.metadata ?? null,
    });
  }

  try {
    switch (actionReq.action) {
      case "me": {
        const me: AdminMe = {
          admin_user_id: adminUserId,
          email: adminRow.email,
          display_name: adminRow.display_name,
          status: adminRow.status,
          roles,
          scopes,
        };

        return jsonResponse({ ok: true, data: me }, 200, origin);
      }

      case "admin_users.list": {
        if (!hasScope("iam.admin.read")) {
          await audit({
            action: "iam.admin.read",
            resource_type: "admin_user",
            severity: "SEV2",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const limit = Number(actionReq.params?.limit ?? 50);
        const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

        const { data, error } = await (supabaseService as any)
          .from("admin_users")
          .select(
            "id,email,display_name,status,created_at,last_login_at,admin_user_roles(role:admin_roles(name,display_name,category))"
          )
          .order("created_at", { ascending: false })
          .limit(safeLimit);

        if (error) throw error;

        await audit({
          action: "iam.admin.read",
          resource_type: "admin_user",
          severity: "SEV3",
          status: "success",
          metadata: { limit: safeLimit },
        });

        return jsonResponse({ ok: true, data: data ?? [] }, 200, origin);
      }

      case "admin_roles.list": {
        if (!hasScope("iam.role.read") && !hasScope("iam.admin.read")) {
          await audit({
            action: "iam.role.read",
            resource_type: "admin_role",
            severity: "SEV2",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const { data, error } = await (supabaseService as any)
          .from("admin_roles")
          .select("id,name,display_name,category,requires_approval,auto_expire_hours")
          .order("category", { ascending: true })
          .order("name", { ascending: true });

        if (error) throw error;

        await audit({
          action: "iam.role.read",
          resource_type: "admin_role",
          severity: "SEV3",
          status: "success",
        });

        return jsonResponse({ ok: true, data: data ?? [] }, 200, origin);
      }

      case "admin_user_roles.assign": {
        await assertNotKilled("iam_writes");
        if (!hasScope("iam.role.assign")) {
          await audit({
            action: "iam.role.assign",
            resource_type: "admin_user_role",
            severity: "SEV1",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const required = requireParams(actionReq.params, ["admin_user_id", "role_name", "reason"]);
        if (!required.ok) return errorResponse(`Missing param: ${required.missing}`, 400, origin);

        const targetAdminUserId = String(required.value.admin_user_id);
        const roleName = String(required.value.role_name);
        const reason = String(required.value.reason);
        const ticketId = typeof actionReq.params?.ticket_id === "string" ? String(actionReq.params.ticket_id) : null;
        const approvalId = typeof actionReq.params?.approval_id === "string" ? String(actionReq.params.approval_id) : null;

        const { data: role, error: roleErr } = await (supabaseService as any)
          .from("admin_roles")
          .select("id,name,category,requires_approval")
          .eq("name", roleName)
          .single();
        if (roleErr) throw roleErr;

        // Owner role assignment is restricted to Owner only (and should be handled via approvals in real deployments)
        if (role.name === "owner" && !isActorOwner) {
          await audit({
            action: "iam.role.assign",
            resource_type: "admin_user_role",
            resource_id: `${targetAdminUserId}:${roleName}`,
            severity: "SEV0",
            status: "denied",
            reason_code: "OWNER_ONLY",
            reason_description: "Only owner can assign owner role",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        // Require approval for high-risk categories or explicit requires_approval
        const needsApproval = Boolean(role.requires_approval) || role.category === "owner" || role.category === "security";
        if (needsApproval) {
          if (!approvalId) return errorResponse("approval_id required", 400, origin);
          await assertApprovedApproval(approvalId);
        }

        const { data, error } = await (supabaseService as any)
          .from("admin_user_roles")
          .insert({
            admin_user_id: targetAdminUserId,
            role_id: role.id,
            assigned_by: adminUserId,
            assignment_reason: reason,
            ticket_id: ticketId,
            approval_id: approvalId,
          })
          .select("id,admin_user_id,role_id,assigned_at,expires_at")
          .single();
        if (error) throw error;

        await audit({
          action: "iam.role.assign",
          resource_type: "admin_user_role",
          resource_id: `${targetAdminUserId}:${roleName}`,
          severity: needsApproval ? "SEV0" : "SEV1",
          status: "success",
          ticket_id: ticketId,
          approval_id: approvalId,
          reason_code: "ROLE_ASSIGN",
          reason_description: reason,
          after_state: { admin_user_id: targetAdminUserId, role_name: roleName },
        });

        return jsonResponse({ ok: true, data }, 200, origin);
      }

      case "admin_user_roles.revoke": {
        await assertNotKilled("iam_writes");
        if (!hasScope("iam.role.revoke")) {
          await audit({
            action: "iam.role.revoke",
            resource_type: "admin_user_role",
            severity: "SEV1",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const required = requireParams(actionReq.params, ["admin_user_id", "role_name", "reason"]);
        if (!required.ok) return errorResponse(`Missing param: ${required.missing}`, 400, origin);

        const targetAdminUserId = String(required.value.admin_user_id);
        const roleName = String(required.value.role_name);
        const reason = String(required.value.reason);
        const ticketId = typeof actionReq.params?.ticket_id === "string" ? String(actionReq.params.ticket_id) : null;
        const approvalId = typeof actionReq.params?.approval_id === "string" ? String(actionReq.params.approval_id) : null;

        const { data: role, error: roleErr } = await (supabaseService as any)
          .from("admin_roles")
          .select("id,name,category,requires_approval")
          .eq("name", roleName)
          .single();
        if (roleErr) throw roleErr;

        if (role.name === "owner" && !isActorOwner) {
          await audit({
            action: "iam.role.revoke",
            resource_type: "admin_user_role",
            resource_id: `${targetAdminUserId}:${roleName}`,
            severity: "SEV0",
            status: "denied",
            reason_code: "OWNER_ONLY",
            reason_description: "Only owner can revoke owner role",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const needsApproval = Boolean(role.requires_approval) || role.category === "owner" || role.category === "security";
        if (needsApproval) {
          if (!approvalId) return errorResponse("approval_id required", 400, origin);
          await assertApprovedApproval(approvalId);
        }

        const { data: before } = await (supabaseService as any)
          .from("admin_user_roles")
          .select("id,admin_user_id,role_id")
          .eq("admin_user_id", targetAdminUserId)
          .eq("role_id", role.id)
          .maybeSingle();

        const { error } = await (supabaseService as any)
          .from("admin_user_roles")
          .delete()
          .eq("admin_user_id", targetAdminUserId)
          .eq("role_id", role.id);
        if (error) throw error;

        await audit({
          action: "iam.role.revoke",
          resource_type: "admin_user_role",
          resource_id: `${targetAdminUserId}:${roleName}`,
          severity: needsApproval ? "SEV0" : "SEV1",
          status: "success",
          ticket_id: ticketId,
          approval_id: approvalId,
          reason_code: "ROLE_REVOKE",
          reason_description: reason,
          before_state: before ?? null,
          after_state: { admin_user_id: targetAdminUserId, role_name: roleName },
        });

        return jsonResponse({ ok: true, data: { revoked: true } }, 200, origin);
      }

      case "admin_users.create": {
        await assertNotKilled("iam_writes");
        if (!hasScope("iam.admin.create")) {
          await audit({
            action: "iam.admin.create",
            resource_type: "admin_user",
            severity: "SEV1",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const required = requireParams(actionReq.params, ["email", "display_name"]);
        if (!required.ok) return errorResponse(`Missing param: ${required.missing}`, 400, origin);

        const newEmail = String(required.value.email).trim().toLowerCase();
        const displayName = String(required.value.display_name).trim();
        if (!newEmail.includes("@") || displayName.length < 2) {
          return errorResponse("Invalid input", 400, origin);
        }

        const { data, error } = await (supabaseService as any)
          .from("admin_users")
          .insert({ email: newEmail, display_name: displayName, status: "active", created_by: adminUserId })
          .select("id,email,display_name,status,created_at")
          .single();

        if (error) throw error;

        await audit({
          action: "iam.admin.create",
          resource_type: "admin_user",
          resource_id: data.id,
          severity: "SEV1",
          status: "success",
          after_state: { id: data.id, email: data.email, display_name: data.display_name, status: data.status },
        });

        return jsonResponse({ ok: true, data }, 200, origin);
      }

      case "admin_users.deactivate": {
        await assertNotKilled("iam_writes");
        if (!hasScope("iam.admin.deactivate")) {
          await audit({
            action: "iam.admin.deactivate",
            resource_type: "admin_user",
            severity: "SEV1",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const required = requireParams(actionReq.params, ["admin_user_id", "reason"]);
        if (!required.ok) return errorResponse(`Missing param: ${required.missing}`, 400, origin);

        const targetId = String(required.value.admin_user_id);
        const reason = String(required.value.reason);
        const ticketId = typeof actionReq.params?.ticket_id === "string" ? String(actionReq.params.ticket_id) : null;

        const { data: before } = await (supabaseService as any)
          .from("admin_users")
          .select("id,email,display_name,status")
          .eq("id", targetId)
          .maybeSingle();

        const { data, error } = await (supabaseService as any)
          .from("admin_users")
          .update({ status: "inactive", deactivated_at: new Date().toISOString(), deactivated_by: adminUserId, deactivation_reason: reason })
          .eq("id", targetId)
          .select("id,email,display_name,status")
          .single();

        if (error) throw error;

        await audit({
          action: "iam.admin.deactivate",
          resource_type: "admin_user",
          resource_id: targetId,
          severity: "SEV1",
          status: "success",
          ticket_id: ticketId,
          reason_code: "DEACTIVATE",
          reason_description: reason,
          before_state: before ?? null,
          after_state: data,
        });

        return jsonResponse({ ok: true, data }, 200, origin);
      }

      case "audit.search": {
        if (!hasScope("audit.read.all")) {
          await audit({
            action: "audit.read.all",
            resource_type: "audit",
            severity: "SEV2",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const limit = Number(actionReq.params?.limit ?? 50);
        const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

        let q = (supabaseService as any)
          .from("admin_audit_events")
          .select(
            "id,sequence_number,created_at,actor_type,actor_id,actor_role,action,resource_type,resource_id,severity,status,reason_code,ticket_id,approval_id,request_id"
          )
          .order("sequence_number", { ascending: false })
          .limit(safeLimit);

        const resourceType = typeof actionReq.params?.resource_type === "string" ? String(actionReq.params.resource_type) : null;
        const resourceId = typeof actionReq.params?.resource_id === "string" ? String(actionReq.params.resource_id) : null;
        const actorId = typeof actionReq.params?.actor_id === "string" ? String(actionReq.params.actor_id) : null;

        if (resourceType) q = q.eq("resource_type", resourceType);
        if (resourceId) q = q.eq("resource_id", resourceId);
        if (actorId) q = q.eq("actor_id", actorId);

        const { data, error } = await q;
        if (error) throw error;

        await audit({
          action: "audit.read.all",
          resource_type: "audit",
          severity: "SEV3",
          status: "success",
          metadata: { limit: safeLimit, resourceType, resourceId, actorId },
        });

        return jsonResponse({ ok: true, data: data ?? [] }, 200, origin);
      }

      case "approvals.list": {
        if (!hasScope("approvals.decide") && !hasScope("approvals.request")) {
          await audit({
            action: "approvals.list",
            resource_type: "approvals",
            severity: "SEV3",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const status = typeof actionReq.params?.status === "string" ? String(actionReq.params.status) : null;
        const limit = Number(actionReq.params?.limit ?? 50);
        const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

        let q = (supabaseService as any)
          .from("approvals")
          .select(
            "id,operation_type,operation_description,requested_by,requested_at,required_approvers,approver_roles,status,expires_at,executed_at"
          )
          .order("requested_at", { ascending: false })
          .limit(safeLimit);

        if (status) q = q.eq("status", status);

        const { data, error } = await q;
        if (error) throw error;

        await audit({
          action: "approvals.list",
          resource_type: "approvals",
          severity: "SEV3",
          status: "success",
          metadata: { status, limit: safeLimit },
        });

        return jsonResponse({ ok: true, data: data ?? [] }, 200, origin);
      }

      case "approvals.request": {
        await assertNotKilled("approvals");
        if (!hasScope("approvals.request")) {
          await audit({
            action: "approvals.request",
            resource_type: "approval",
            severity: "SEV2",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const required = requireParams(actionReq.params, [
          "operation_type",
          "operation_description",
          "operation_payload",
          "request_reason",
        ]);
        if (!required.ok) return errorResponse(`Missing param: ${required.missing}`, 400, origin);

        const operationType = String(required.value.operation_type);
        const operationDescription = String(required.value.operation_description);
        const requestReason = String(required.value.request_reason);
        const ticketId = typeof actionReq.params?.ticket_id === "string" ? String(actionReq.params.ticket_id) : null;

        const requiredApprovers = Number(actionReq.params?.required_approvers ?? 1);
        const safeRequiredApprovers = Number.isFinite(requiredApprovers)
          ? Math.min(Math.max(requiredApprovers, 1), 5)
          : 1;

        const approverRoles = Array.isArray(actionReq.params?.approver_roles)
          ? (actionReq.params?.approver_roles as Json[]).map((x) => String(x))
          : null;

        const payload = actionReq.params?.operation_payload as any;

        const { data, error } = await (supabaseService as any)
          .from("approvals")
          .insert({
            operation_type: operationType,
            operation_description: operationDescription,
            operation_payload: payload,
            requested_by: adminUserId,
            request_reason: requestReason,
            ticket_id: ticketId,
            required_approvers: safeRequiredApprovers,
            approver_roles: approverRoles,
            status: "pending",
          })
          .select("id,status,requested_at")
          .single();

        if (error) throw error;

        await audit({
          action: "approvals.request",
          resource_type: "approval",
          resource_id: data.id,
          severity: "SEV2",
          status: "success",
          ticket_id: ticketId,
          metadata: { operationType, safeRequiredApprovers, approverRoles },
        });

        return jsonResponse({ ok: true, data }, 200, origin);
      }

      case "approvals.decide": {
        await assertNotKilled("approvals");
        if (!hasScope("approvals.decide")) {
          await audit({
            action: "approvals.decide",
            resource_type: "approval",
            severity: "SEV1",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const required = requireParams(actionReq.params, ["approval_id", "decision"]);
        if (!required.ok) return errorResponse(`Missing param: ${required.missing}`, 400, origin);

        const approvalId = String(required.value.approval_id);
        const decision = String(required.value.decision);
        if (decision !== "approved" && decision !== "denied") {
          return errorResponse("Invalid decision", 400, origin);
        }
        const decisionReason = typeof actionReq.params?.reason === "string" ? String(actionReq.params.reason) : null;

        // Load approval
        const { data: approval, error: approvalErr } = await (supabaseService as any)
          .from("approvals")
          .select("id,requested_by,required_approvers,status")
          .eq("id", approvalId)
          .single();

        if (approvalErr) throw approvalErr;

        if (approval.requested_by === adminUserId) {
          return errorResponse("Requester cannot approve", 409, origin);
        }
        if (approval.status !== "pending") {
          return errorResponse("Approval not pending", 409, origin);
        }

        // Insert step
        const { error: stepErr } = await (supabaseService as any)
          .from("approval_steps")
          .insert({
            approval_id: approvalId,
            approver_id: adminUserId,
            approver_role: roles.map((r: any) => r.name).join(","),
            decision,
            decision_reason: decisionReason,
            ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          });

        if (stepErr) throw stepErr;

        // Count approvals
        const { count: approvedCount } = await (supabaseService as any)
          .from("approval_steps")
          .select("id", { count: "exact", head: true })
          .eq("approval_id", approvalId)
          .eq("decision", "approved");

        const { count: deniedCount } = await (supabaseService as any)
          .from("approval_steps")
          .select("id", { count: "exact", head: true })
          .eq("approval_id", approvalId)
          .eq("decision", "denied");

        if ((deniedCount ?? 0) > 0) {
          await (supabaseService as any)
            .from("approvals")
            .update({ status: "denied", updated_at: new Date().toISOString() })
            .eq("id", approvalId);
        } else if ((approvedCount ?? 0) >= approval.required_approvers) {
          await (supabaseService as any)
            .from("approvals")
            .update({ status: "approved", updated_at: new Date().toISOString() })
            .eq("id", approvalId);
        }

        await audit({
          action: "approvals.decide",
          resource_type: "approval",
          resource_id: approvalId,
          severity: "SEV1",
          status: "success",
          metadata: { decision, approvedCount, deniedCount },
        });

        return jsonResponse({ ok: true }, 200, origin);
      }

      case "killswitch.list": {
        if (!hasScope("security.killswitch.read")) {
          await audit({
            action: "security.killswitch.read",
            resource_type: "kill_switch",
            severity: "SEV1",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const { data, error } = await (supabaseService as any)
          .from("admin_kill_switches")
          .select("key,enabled,reason,updated_by,updated_at")
          .order("key", { ascending: true });
        if (error) throw error;

        await audit({
          action: "security.killswitch.read",
          resource_type: "kill_switch",
          severity: "SEV2",
          status: "success",
        });

        return jsonResponse({ ok: true, data: data ?? [] }, 200, origin);
      }

      case "killswitch.set": {
        if (!hasScope("security.killswitch.set") || !isActorOwner) {
          await audit({
            action: "security.killswitch.set",
            resource_type: "kill_switch",
            severity: "SEV0",
            status: "denied",
            reason_code: "OWNER_ONLY",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const required = requireParams(actionReq.params, ["key", "enabled", "reason"]);
        if (!required.ok) return errorResponse(`Missing param: ${required.missing}`, 400, origin);

        const key = String(required.value.key);
        const enabled = String(required.value.enabled) === "true" || required.value.enabled === true;
        const reason = String(required.value.reason);

        const { data, error } = await (supabaseService as any)
          .from("admin_kill_switches")
          .upsert({ key, enabled, reason, updated_by: adminUserId, updated_at: new Date().toISOString() })
          .select("key,enabled,reason,updated_by,updated_at")
          .single();
        if (error) throw error;

        await audit({
          action: "security.killswitch.set",
          resource_type: "kill_switch",
          resource_id: key,
          severity: "SEV0",
          status: "success",
          reason_code: enabled ? "KILL_SWITCH_ON" : "KILL_SWITCH_OFF",
          reason_description: reason,
          after_state: { key, enabled },
        });

        return jsonResponse({ ok: true, data }, 200, origin);
      }

      case "jit.request": {
        // Security Admin only
        if (!hasScope("security.jit.request")) {
          await audit({
            action: "security.jit.request",
            resource_type: "jit_escalation",
            severity: "SEV1",
            status: "denied",
            reason_code: "MISSING_SCOPE",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const params = actionReq.params ?? {};
        const roleId = params.role_id as string | undefined;
        const reason = params.reason as string | undefined;
        const ticketId = params.ticket_id as string | undefined;
        const durationMinutes = typeof params.duration_minutes === "number" ? params.duration_minutes : 30;

        if (!roleId || !reason || !ticketId) {
          return errorResponse("Missing: role_id, reason, ticket_id", 400, origin);
        }

        // Verify role exists
        const { data: roleData, error: roleErr } = await (supabaseService as any)
          .from("admin_roles")
          .select("id,name")
          .eq("id", roleId)
          .maybeSingle();
        if (roleErr || !roleData) {
          return errorResponse("Role not found", 404, origin);
        }

        // Create JIT request
        const { data: jitData, error: jitErr } = await (supabaseService as any)
          .from("owner_escalation_requests")
          .insert({
            requested_by: adminUserId,
            role_id: roleId,
            reason,
            ticket_id: ticketId,
            requested_at: nowIso,
            duration_minutes: durationMinutes,
          })
          .select("id")
          .single();

        if (jitErr) throw jitErr;

        await audit({
          action: "security.jit.request",
          resource_type: "jit_escalation",
          resource_id: jitData.id,
          severity: "SEV0",
          status: "success",
          reason_description: reason,
          ticket_id: ticketId,
          metadata: { role_id: roleId, duration_minutes: durationMinutes },
        });

        return jsonResponse({ ok: true, jit_request_id: jitData.id }, 200, origin);
      }

      case "jit.active": {
        // Anyone can read
        if (!hasScope("security.jit.read")) {
          return errorResponse("Forbidden", 403, origin);
        }

        const { data: rows, error: err } = await (supabaseService as any)
          .from("owner_escalation_requests")
          .select("id, requested_by, approver_id, role_id, requested_at, approved_at, expires_at, revoked_at, reason, ticket_id, duration_minutes, requester:requested_by(email,display_name), role:role_id(name,display_name)")
          .not("approved_at", "is", null)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order("requested_at", { ascending: false });

        if (err) throw err;

        const data = (rows ?? []).map((r: any) => ({
          id: r.id,
          requested_by: r.requested_by,
          requester: r.requester,
          approver_id: r.approver_id,
          role_id: r.role_id,
          role: r.role,
          reason: r.reason,
          ticket_id: r.ticket_id,
          requested_at: r.requested_at,
          approved_at: r.approved_at,
          expires_at: r.expires_at,
          revoked_at: r.revoked_at,
          duration_minutes: r.duration_minutes,
          status: r.revoked_at ? "revoked" : r.expires_at && new Date(r.expires_at) < new Date() ? "expired" : "active",
        }));

        await audit({
          action: "security.jit.read",
          resource_type: "jit_escalation",
          severity: "SEV2",
          status: "success",
        });

        return jsonResponse({ ok: true, data }, 200, origin);
      }

      case "jit.approve": {
        // Owner only
        if (!isActorOwner) {
          await audit({
            action: "security.jit.approve",
            resource_type: "jit_escalation",
            severity: "SEV1",
            status: "denied",
            reason_code: "NOT_OWNER",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        const jitRequestId = (actionReq.params?.jit_request_id ?? "") as string;
        if (!jitRequestId) {
          return errorResponse("Missing: jit_request_id", 400, origin);
        }

        // Get JIT request
        const { data: jitRow, error: jitErr } = await (supabaseService as any)
          .from("owner_escalation_requests")
          .select("id, requested_by, role_id, duration_minutes, reason, ticket_id, approved_at")
          .eq("id", jitRequestId)
          .maybeSingle();

        if (jitErr || !jitRow) {
          return errorResponse("JIT request not found", 404, origin);
        }

        if (jitRow.approved_at) {
          return errorResponse("JIT request already approved", 409, origin);
        }

        // Calculate expires_at
        const expiresAt = new Date(nowIso);
        expiresAt.setMinutes(expiresAt.getMinutes() + (jitRow.duration_minutes || 30));

        // Update JIT request
        await (supabaseService as any)
          .from("owner_escalation_requests")
          .update({
            approved_at: nowIso,
            approver_id: adminUserId,
            expires_at: expiresAt.toISOString(),
          })
          .eq("id", jitRequestId);

        // Assign role with expires_at
        const { data: assignedRole, error: assignErr } = await (supabaseService as any)
          .from("admin_user_roles")
          .insert({
            admin_user_id: jitRow.requested_by,
            role_id: jitRow.role_id,
            assigned_at: nowIso,
            expires_at: expiresAt.toISOString(),
            reason: `JIT break-glass approval (ticket: ${jitRow.ticket_id})`,
            approved_by_id: adminUserId,
          })
          .select("id")
          .single();

        if (assignErr) throw assignErr;

        await audit({
          action: "security.jit.approve",
          resource_type: "jit_escalation",
          resource_id: jitRequestId,
          severity: "SEV0",
          status: "success",
          reason_description: `Approved JIT escalation for ${jitRow.duration_minutes || 30} minutes`,
          ticket_id: jitRow.ticket_id,
          metadata: {
            jit_request_id: jitRequestId,
            admin_user_role_id: assignedRole.id,
            expires_at: expiresAt.toISOString(),
          },
        });

        return jsonResponse({ ok: true, jit_request_id: jitRequestId, expires_at: expiresAt.toISOString() }, 200, origin);
      }

      case "jit.revoke": {
        // Owner can revoke any, Security Admin can revoke own
        const jitRequestId = (actionReq.params?.jit_request_id ?? "") as string;
        if (!jitRequestId) {
          return errorResponse("Missing: jit_request_id", 400, origin);
        }

        const { data: jitRow, error: jitErr } = await (supabaseService as any)
          .from("owner_escalation_requests")
          .select("id, requested_by, approved_at, revoked_at, expires_at")
          .eq("id", jitRequestId)
          .maybeSingle();

        if (jitErr || !jitRow) {
          return errorResponse("JIT request not found", 404, origin);
        }

        // Can revoke if owner or if own request
        const canRevoke = isActorOwner || jitRow.requested_by === adminUserId;
        if (!canRevoke) {
          await audit({
            action: "security.jit.revoke",
            resource_type: "jit_escalation",
            resource_id: jitRequestId,
            severity: "SEV1",
            status: "denied",
            reason_code: "PERMISSION_DENIED",
          });
          return errorResponse("Forbidden", 403, origin);
        }

        if (jitRow.revoked_at) {
          return errorResponse("JIT request already revoked", 409, origin);
        }

        // Mark JIT request as revoked
        await (supabaseService as any)
          .from("owner_escalation_requests")
          .update({ revoked_at: nowIso })
          .eq("id", jitRequestId);

        // Find and revoke the temporary role
        const { data: assignedRole, error: findErr } = await (supabaseService as any)
          .from("admin_user_roles")
          .select("id")
          .eq("admin_user_id", jitRow.requested_by)
          .order("assigned_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!findErr && assignedRole) {
          await (supabaseService as any)
            .from("admin_user_roles")
            .delete()
            .eq("id", assignedRole.id);
        }

        await audit({
          action: "security.jit.revoke",
          resource_type: "jit_escalation",
          resource_id: jitRequestId,
          severity: "SEV0",
          status: "success",
          reason_description: "JIT escalation revoked",
        });

        return jsonResponse({ ok: true, jit_request_id: jitRequestId }, 200, origin);
      }

      default:
        return errorResponse("Unknown action", 400, origin);
    }
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Unknown error";
    try {
      await audit({
        action: `admin_api.${actionReq.action}`,
        resource_type: "admin_api",
        severity: "SEV2",
        status: "failure",
        error_code: "UNHANDLED",
        error_message: msg,
      });
    } catch {
      // ignore
    }

    return errorResponse("Server error", 500, origin);
  }
});
