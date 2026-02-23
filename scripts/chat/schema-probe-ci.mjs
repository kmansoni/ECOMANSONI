/*
  Guard: verify chat schema is correctly deployed.
  Uses Supabase REST RPC: POST /rest/v1/rpc/chat_schema_probe_v2

  CI/build probe should run with service role key, not user credentials.

  Required env:
  - SUPABASE_URL (or VITE_SUPABASE_URL)
  - SUPABASE_SERVICE_ROLE_KEY

  Control:
  - REQUIRE_CHAT_SCHEMA_PROBE=1 => missing env fails the process
  - otherwise missing env logs a warning and exits 0 (so local builds aren't bricked)
  - CHAT_SCHEMA_EXPECTED_VERSION (default: 2)
  - VITE_EXPECTED_SUPABASE_PROJECT_REF (or SUPABASE_EXPECTED_PROJECT_REF)
*/

function normalizeEnv(v) {
  return String(v || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
}

function isRequireMode() {
  const v = normalizeEnv(process.env.REQUIRE_CHAT_SCHEMA_PROBE);
  return v === "1" || v.toLowerCase() === "true";
}

function readEnv(name) {
  const v = normalizeEnv(process.env[name]);
  return v || "";
}

function requireEnv(name) {
  const v = readEnv(name);
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

function extractProjectRef(url) {
  try {
    const host = new URL(String(url || "").trim()).hostname;
    const parts = host.split(".");
    if (parts.length < 3) return null;
    if (parts[1] !== "supabase" || parts[2] !== "co") return null;
    return parts[0] || null;
  } catch {
    return null;
  }
}

function parseJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const payloadRaw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (payloadRaw.length % 4)) % 4;
  const payloadB64 = payloadRaw + "=".repeat(padLen);
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const requireMode = isRequireMode();
  const missing = [];
  const supabaseUrl = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  for (const [k, present] of [
    ["SUPABASE_URL|VITE_SUPABASE_URL", Boolean(supabaseUrl)],
    ["SUPABASE_SERVICE_ROLE_KEY", Boolean(serviceRoleKey)],
  ]) {
    if (!present) missing.push(k);
  }
  if (missing.length) {
    const msg = `[chat schema probe] missing env: ${missing.join(", ")}`;
    if (requireMode) {
      console.error(msg);
      process.exitCode = 1;
      return;
    }
    console.warn(`${msg} (skipping; set REQUIRE_CHAT_SCHEMA_PROBE=1 to enforce)`);
    process.exitCode = 0;
    return;
  }

  const expectedProjectRef =
    readEnv("VITE_EXPECTED_SUPABASE_PROJECT_REF") || readEnv("SUPABASE_EXPECTED_PROJECT_REF");
  const projectRef = extractProjectRef(supabaseUrl);
  if (!projectRef) {
    console.error("[chat schema probe] invalid SUPABASE_URL", { supabaseUrl });
    process.exitCode = 1;
    return;
  }
  if (expectedProjectRef && projectRef !== expectedProjectRef) {
    console.error("[chat schema probe] project ref mismatch", {
      expectedProjectRef,
      actualProjectRef: projectRef,
    });
    process.exitCode = 1;
    return;
  }

  const jwtPayload = parseJwtPayload(serviceRoleKey);
  const jwtRole = String(jwtPayload?.role || "");
  const jwtRef = String(jwtPayload?.ref || "");
  if (!jwtPayload || jwtRole !== "service_role") {
    console.error("[chat schema probe] SUPABASE_SERVICE_ROLE_KEY is not a service_role token", {
      hasPayload: Boolean(jwtPayload),
      role: jwtRole || null,
    });
    process.exitCode = 1;
    return;
  }
  if (jwtRef && jwtRef !== projectRef) {
    console.error("[chat schema probe] SUPABASE_SERVICE_ROLE_KEY project mismatch", {
      tokenRef: jwtRef,
      urlRef: projectRef,
    });
    process.exitCode = 1;
    return;
  }

  const expectedSchemaVersion = Number(readEnv("CHAT_SCHEMA_EXPECTED_VERSION") || "2");
  if (!Number.isFinite(expectedSchemaVersion) || expectedSchemaVersion <= 0) {
    console.error("[chat schema probe] invalid CHAT_SCHEMA_EXPECTED_VERSION");
    process.exitCode = 1;
    return;
  }

  const base = supabaseUrl.replace(/\/+$/, "");

  // Call RPC with service role.
  const endpoint = `${base}/rest/v1/rpc/chat_schema_probe_v2`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  let payload = null;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  const ok = Boolean(payload?.ok);
  const schemaVersion = Number(payload?.schema_version || 0);
  const requiredObjectsPresent = Boolean(payload?.required_objects_present);

  // Minimal, non-secret output.
  console.log("[chat schema probe]", {
    http: res.status,
    projectRef,
    ok,
    schemaVersion,
    expectedSchemaVersion,
    requiredObjectsPresent,
  });

  if (!res.ok || ok !== true || schemaVersion !== expectedSchemaVersion || requiredObjectsPresent !== true) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("chat schema probe failed:", e);
  process.exitCode = 1;
});
