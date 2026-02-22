// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { handleCors, getCorsHeaders, errorResponse } from "../_shared/utils.ts";

const DEFAULT_REPO = "kmansoni/ECOMANSONI";
const DEFAULT_WORKFLOW_FILE = "ai-pr.yml";
const DEFAULT_REF = "main";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return errorResponse("Server not configured", 500, origin);
    }

    const ghToken = Deno.env.get("GITHUB_WORKFLOW_TOKEN");
    if (!ghToken) return errorResponse("GITHUB_WORKFLOW_TOKEN is not configured", 500, origin);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return errorResponse("Missing Authorization header", 401, origin);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const task = String(body?.task ?? "").trim();
    if (!task) return errorResponse("task is required", 400, origin);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return errorResponse(userErr?.message || "Invalid token", 401, origin);

    // Basic anti-abuse: require authenticated user (no allowlist). You can re-add allowlist if needed.

    const repo = Deno.env.get("GITHUB_REPO") || DEFAULT_REPO;
    const workflow = Deno.env.get("GITHUB_WORKFLOW_FILE") || DEFAULT_WORKFLOW_FILE;
    const ref = Deno.env.get("GITHUB_REF") || DEFAULT_REF;

    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: { task },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return errorResponse(`GitHub dispatch failed: ${resp.status} ${t}`, 502, origin);
    }

    const actionsUrl = `https://github.com/${repo}/actions/workflows/${workflow}`;

    return new Response(JSON.stringify({ ok: true, actions_url: actionsUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-dispatch-pr error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
