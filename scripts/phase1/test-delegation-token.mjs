/**
 * Phase 1 Trust-lite: Test Delegation Token Issuance
 * 
 * This script tests the end-to-end delegation token flow:
 * 1. Authenticate user
 * 2. Call issue-delegation-token Edge Function
 * 3. Verify JWT signature and payload
 * 4. Check delegation and delegation_tokens tables
 * 
 * Prerequisites:
 * - SUPABASE_URL and SUPABASE_ANON_KEY in .env
 * - Test user credentials
 * - issue-delegation-token Edge Function deployed
 * - SERVICE_KEY_ENCRYPTION_SECRET configured
 * 
 * Usage:
 *   node scripts/phase1/test-delegation-token.mjs
 */

import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// Environment Setup
// ============================================================================

function loadDotEnvIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadDotEnvIfPresent();

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// ============================================================================
// Test Configuration
// ============================================================================

const SUPABASE_URL = mustEnv("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = mustEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

// Test user credentials (create test user first)
const TEST_EMAIL = process.env.TEST_USER_EMAIL || "test-delegations@example.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || "test-password-123";

// Test service configuration
const TEST_SERVICE_ID = "test-integration-service";
const TEST_SCOPES = ["dm:create", "dm:read", "media:upload"];
const TEST_EXPIRES_MINUTES = 60;

// ============================================================================
// Helper Functions
// ============================================================================

function log(emoji, ...args) {
  console.log(`${emoji}`, ...args);
}

function success(msg) {
  log("✅", msg);
}

function error(msg) {
  log("❌", msg);
}

function info(msg) {
  log("ℹ️", msg);
}

function extractProjectRef(url) {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createFetchWithRetry(options) {
  const {
    timeoutMs = 20000,
    retries = 3,
    retryDelayMs = 500,
    retryOnStatuses = [502, 503, 504],
  } = options || {};

  const baseFetch = globalThis.fetch;

  return async function fetchWithRetry(url, init) {
    let attempt = 0;
    let lastError = null;

    while (attempt <= retries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await baseFetch(url, { ...(init || {}), signal: controller.signal });
        clearTimeout(timer);

        if (retryOnStatuses.includes(res.status) && attempt < retries) {
          attempt += 1;
          await sleep(retryDelayMs * attempt);
          continue;
        }

        return res;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;

        // Retry only on network/timeout type failures.
        const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
        const isAbort = msg.includes("aborted") || msg.includes("AbortError");
        const isFetchFailed = msg.includes("fetch failed") || msg.includes("UND_ERR") || msg.includes("ECONN") || msg.includes("ETIMEDOUT");

        if ((isAbort || isFetchFailed) && attempt < retries) {
          attempt += 1;
          await sleep(retryDelayMs * attempt);
          continue;
        }

        throw err;
      }
    }

    throw lastError || new Error("fetch failed");
  };
}

function base64UrlDecodeToString(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const [headerB64, payloadB64] = parts;
  const headerJson = base64UrlDecodeToString(headerB64);
  const payloadJson = base64UrlDecodeToString(payloadB64);

  const header = JSON.parse(headerJson);
  const payload = JSON.parse(payloadJson);

  return { header, payload };
}

function verifyJwtHs256(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [headerB64, payloadB64, signatureB64] = parts;

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  const a = Buffer.from(signatureB64);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ============================================================================
// Test Steps
// ============================================================================

async function main() {
  console.log("\n=== Phase 1: Delegation Token Issuance Test ===\n");

  const projectRef = extractProjectRef(SUPABASE_URL);
  info(`Supabase Project: ${projectRef}`);
  info(`Function URL: ${SUPABASE_URL}/functions/v1/issue-delegation-token`);
  info(`Test User: ${TEST_EMAIL}`);
  info(`Test Service: ${TEST_SERVICE_ID}`);
  info(`Test Scopes: ${TEST_SCOPES.join(", ")}\n`);

  // Step 1: Create Supabase client
  const fetchWithRetry = createFetchWithRetry({ timeoutMs: 25000, retries: 4, retryDelayMs: 600 });
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: fetchWithRetry },
  });

  // Step 2: Authenticate test user
  log("🔐", "Authenticating test user...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  let session = authData?.session;
  let user = authData?.user;

  if (authError) {
    error(`Authentication failed: ${authError.message}`);

    const serviceKeyForUserCreate = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKeyForUserCreate) {
      info("No service role key found locally; cannot auto-create test user.");
      console.log("\nℹ️  Provide one of these env vars to auto-create user:");
      console.log("   - VITE_SUPABASE_SERVICE_ROLE_KEY");
      console.log("   - SUPABASE_SERVICE_ROLE_KEY\n");
      throw new Error("Authentication failed and auto-create is not available");
    }

    log("👤", "Attempting to create test user via Admin API...");
    const adminClient = createClient(SUPABASE_URL, serviceKeyForUserCreate, {
      auth: { persistSession: false },
    });

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Test User" },
    });

    if (createErr) {
      // If user already exists, we can still retry sign-in.
      info(`Admin createUser returned: ${createErr.message}`);
    } else {
      success(`Test user created: ${created?.user?.id || "<unknown>"}`);
    }

    log("🔁", "Retrying authentication...");
    const { data: authData2, error: authError2 } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (authError2) {
      throw new Error(`Authentication still failing after user create: ${authError2.message}`);
    }

    session = authData2.session;
    user = authData2.user;
  }
  if (!session || !user) {
    error("Authentication succeeded but no session/user returned");
    process.exit(1);
  }

  success(`Authenticated as: ${user.email} (${user.id})`);

  // Step 3: Call issue-delegation-token Edge Function
  log("\n🎟️", "Issuing delegation token...");
  
  const functionUrl = `${SUPABASE_URL}/functions/v1/issue-delegation-token`;
  const response = await fetchWithRetry(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": SUPABASE_ANON_KEY,
      "x-debug-db-verify": "1",
    },
    body: JSON.stringify({
      service_id: TEST_SERVICE_ID,
      scopes: TEST_SCOPES,
      expires_minutes: TEST_EXPIRES_MINUTES,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    error(`Function call failed (${response.status}): ${errorBody}`);
    process.exit(1);
  }

  const result = await response.json();
  
  if (!result.ok || !result.token || !result.delegation_id) {
    error("Invalid response from function");
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (result.signature_ok !== true) {
    error("Function did not confirm signature_ok=true");
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (result.db_verified !== true) {
    error("Function did not confirm db_verified=true");
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const serverDbVerified = true;

  success(`Delegation created: ${result.delegation_id}`);
  success(`Token issued (expires: ${result.expires_at})`);

  // Step 3.5: Canonical introspection
  log("\n🧾", "Introspecting delegation token...");
  const introspectUrl = `${SUPABASE_URL}/functions/v1/delegation-introspect`;
  const introspectRes = await fetchWithRetry(introspectUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${result.token}`,
    },
    body: "{}",
  });

  if (!introspectRes.ok) {
    const t = await introspectRes.text();
    error(`Introspection failed (${introspectRes.status}): ${t}`);
    process.exit(1);
  }
  const introspectJson = await introspectRes.json();
  if (introspectJson?.ok !== true || !introspectJson?.delegation_id || !introspectJson?.jti) {
    error("Introspection returned invalid response");
    console.log(JSON.stringify(introspectJson, null, 2));
    process.exit(1);
  }
  success("Introspection OK");

  // Step 4: Verify JWT signature and payload
  log("\n🔍", "Verifying JWT...");

  const jwt = result.token;
  console.log(`\nJWT (first 50 chars): ${jwt.slice(0, 50)}...`);

  try {
    // Decode without verification first
    const decoded = decodeJwt(jwt).payload;
    console.log("\nDecoded JWT payload:");
    console.log(JSON.stringify(decoded, null, 2));

    // Optional signature verification (HS256)
    const jwtSecret = process.env.JWT_SIGNING_SECRET || process.env.SERVICE_KEY_ENCRYPTION_SECRET;
    if (!jwtSecret) {
      info("Skipping JWT signature verification (JWT_SIGNING_SECRET/SERVICE_KEY_ENCRYPTION_SECRET not set locally)");
    } else {
      const ok = verifyJwtHs256(jwt, jwtSecret);
      if (!ok) {
        error("JWT signature verification FAILED (HS256)");
        process.exit(1);
      }
      success("JWT signature verified (HS256)");
    }

    // Check required fields
    const requiredFields = ["sub", "tenant_id", "service_id", "scopes", "exp", "iat", "jti"];
    for (const field of requiredFields) {
      if (!(field in decoded)) {
        error(`Missing required field: ${field}`);
        process.exit(1);
      }
    }

    success("JWT payload valid");

    // Verify claims
    if (decoded.sub !== user.id) {
      error(`JWT sub mismatch: expected ${user.id}, got ${decoded.sub}`);
      process.exit(1);
    }

    if (decoded.service_id !== TEST_SERVICE_ID) {
      error(`JWT service_id mismatch: expected ${TEST_SERVICE_ID}, got ${decoded.service_id}`);
      process.exit(1);
    }

    if (JSON.stringify(decoded.scopes) !== JSON.stringify(TEST_SCOPES)) {
      error(`JWT scopes mismatch: expected ${JSON.stringify(TEST_SCOPES)}, got ${JSON.stringify(decoded.scopes)}`);
      process.exit(1);
    }

    success("JWT claims verified");

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = decoded.exp - now;
    info(`Token valid for ${Math.floor(expiresIn / 60)} minutes`);

  } catch (err) {
    error(`JWT verification failed: ${err.message}`);
    process.exit(1);
  }

  // Step 5: Revoke delegation and validate new issuance
  log("\n🛑", "Revoking delegation and re-issuing token...");

  const firstDecoded = decodeJwt(jwt).payload;
  const firstJti = firstDecoded.jti;
  const firstDelegationId = result.delegation_id;

  const { data: revoked, error: revokeError } = await supabase.rpc("revoke_delegation_v1", {
    p_auth_context: { user_id: user.id },
    p_delegation_id: firstDelegationId,
  });

  if (revokeError) {
    error(`Revocation RPC failed: ${revokeError.message}`);
    process.exit(1);
  }
  if (revoked !== true) {
    error(`Revocation RPC returned unexpected value: ${JSON.stringify(revoked)}`);
    process.exit(1);
  }
  success("Delegation revoked");

  // Issue again; ask server to verify previous token+delegation are revoked in DB
  const response2 = await fetchWithRetry(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": SUPABASE_ANON_KEY,
      "x-debug-db-verify": "1",
      "x-debug-prev-jti": firstJti,
      "x-debug-prev-delegation-id": firstDelegationId,
    },
    body: JSON.stringify({
      service_id: TEST_SERVICE_ID,
      scopes: TEST_SCOPES,
      expires_minutes: TEST_EXPIRES_MINUTES,
    }),
  });

  if (!response2.ok) {
    const errorBody = await response2.text();
    error(`Second issuance failed (${response2.status}): ${errorBody}`);
    process.exit(1);
  }

  const result2 = await response2.json();
  if (!result2.ok || !result2.token || !result2.delegation_id) {
    error("Invalid response from function (second issuance)");
    console.log(JSON.stringify(result2, null, 2));
    process.exit(1);
  }
  if (result2.signature_ok !== true || result2.db_verified !== true) {
    error("Second issuance missing signature_ok/db_verified");
    console.log(JSON.stringify(result2, null, 2));
    process.exit(1);
  }

  const secondDecoded = decodeJwt(result2.token).payload;
  if (secondDecoded.sub !== user.id) {
    error("Second token sub mismatch");
    process.exit(1);
  }
  success(`Re-issued token OK (new jti=${secondDecoded.jti})`);

  // Step 6: Consume delegation token for dm:create
  log("\n💬", "Sending a delegated DM (dm:create)...");

  // Create a target user via signup (anon) to ensure a valid UUID exists.
  const targetEmail = `delegation-target+${Date.now()}@example.com`;
  const targetPassword = "Target-password-123";
  const { data: targetSignup, error: targetSignupError } = await supabase.auth.signUp({
    email: targetEmail,
    password: targetPassword,
    options: { data: { full_name: "Delegation Target" } },
  });

  if (targetSignupError || !targetSignup?.user?.id) {
    error(`Failed to create target user: ${targetSignupError?.message || "unknown"}`);
    process.exit(1);
  }

  const targetUserId = targetSignup.user.id;
  success(`Target user created: ${targetEmail} (${targetUserId})`);

  const dmFunctionUrl = `${SUPABASE_URL}/functions/v1/dm-send-delegated`;
  const dmRes = await fetchWithRetry(dmFunctionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${result2.token}`,
      "x-debug-db-verify": "1",
    },
    body: JSON.stringify({
      target_user_id: targetUserId,
      body: "Hello from delegated token",
    }),
  });

  if (!dmRes.ok) {
    const errText = await dmRes.text();
    error(`Delegated DM send failed (${dmRes.status}): ${errText}`);
    process.exit(1);
  }

  const dmJson = await dmRes.json();
  if (dmJson?.ok !== true || !dmJson?.message_id || dmJson?.db_verified !== true) {
    error("Delegated DM send returned invalid response");
    console.log(JSON.stringify(dmJson, null, 2));
    process.exit(1);
  }

  success(`Delegated DM sent: message_id=${dmJson.message_id}, seq=${dmJson.seq}`);

  // Step 6.5: Consume delegation token for dm:read
  log("\n📥", "Reading DM messages via delegation token (dm:read)...");
  const fetchUrl = `${SUPABASE_URL}/functions/v1/dm-fetch-delegated`;
  const fetchRes = await fetchWithRetry(fetchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${result2.token}`,
    },
    body: JSON.stringify({
      conversation_id: dmJson.conversation_id,
      limit: 50,
    }),
  });

  if (!fetchRes.ok) {
    const t = await fetchRes.text();
    error(`Delegated DM fetch failed (${fetchRes.status}): ${t}`);
    process.exit(1);
  }

  const fetchJson = await fetchRes.json();
  if (fetchJson?.ok !== true || !Array.isArray(fetchJson?.messages)) {
    error("Delegated DM fetch returned invalid response");
    console.log(JSON.stringify(fetchJson, null, 2));
    process.exit(1);
  }

  const found = fetchJson.messages.some((m) => m && m.id === dmJson.message_id);
  if (!found) {
    error("Delegated DM fetch did not include the sent message");
    console.log(JSON.stringify(fetchJson.messages.slice(0, 5), null, 2));
    process.exit(1);
  }
  success("Delegated DM read OK");

  // Step 6.75: Consume delegation token for media:upload
  log("\n📤", "Requesting a signed upload URL via delegation token (media:upload)...");
  const uploadAuthUrl = `${SUPABASE_URL}/functions/v1/media-upload-authorize`;
  const uploadAuthRes = await fetchWithRetry(uploadAuthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${result2.token}`,
    },
    body: JSON.stringify({ content_type: "text/plain", extension: "txt" }),
  });

  if (!uploadAuthRes.ok) {
    const t = await uploadAuthRes.text();
    error(`media:upload authorize failed (${uploadAuthRes.status}): ${t}`);
    process.exit(1);
  }

  const uploadAuthJson = await uploadAuthRes.json();
  if (
    uploadAuthJson?.ok !== true ||
    uploadAuthJson?.bucket !== "chat-media" ||
    typeof uploadAuthJson?.path !== "string" ||
    typeof uploadAuthJson?.signed_url !== "string" ||
    typeof uploadAuthJson?.public_url !== "string"
  ) {
    error("media:upload authorize returned invalid response");
    console.log(JSON.stringify(uploadAuthJson, null, 2));
    process.exit(1);
  }

  // Upload a tiny payload using the signed URL.
  const payload = `hello delegated upload ${Date.now()}`;
  const putRes = await fetchWithRetry(uploadAuthJson.signed_url, {
    method: "PUT",
    headers: {
      "Content-Type": "text/plain",
    },
    body: payload,
  });

  if (!putRes.ok) {
    const t = await putRes.text().catch(() => "");
    error(`Signed upload PUT failed (${putRes.status}): ${t}`);
    process.exit(1);
  }

  // Best-effort: check that the public URL is reachable (bucket is expected public).
  const getRes = await fetchWithRetry(uploadAuthJson.public_url, {
    method: "GET",
  });
  if (!getRes.ok) {
    const t = await getRes.text().catch(() => "");
    error(`Uploaded object public GET failed (${getRes.status}): ${t}`);
    process.exit(1);
  }

  success("Delegated media upload OK");

  // Step 7: Verify database records
  log("\n📊", "Checking database records...");

  let dbVerificationStatus = "PASSED";

  if (serverDbVerified) {
    success("Database records verified server-side (db_verified=true)");
  } else {
    // Get service-role key for direct DB access
    const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      info("Skipping database verification (no service role key)");
      dbVerificationStatus = "SKIPPED";
    } else {
    const adminClient = createClient(SUPABASE_URL, serviceKey);

    // Check delegations table
    const { data: delegation, error: delegationError } = await adminClient
      .from("delegations")
      .select("*")
      .eq("delegation_id", result.delegation_id)
      .single();

    if (delegationError) {
      error(`Failed to query delegations: ${delegationError.message}`);
      dbVerificationStatus = "FAILED";
    } else {
      success("Delegation record found");
      console.log(`  User: ${delegation.user_id}`);
      console.log(`  Service: ${delegation.service_id}`);
      console.log(`  Scopes: ${delegation.scopes.join(", ")}`);
      console.log(`  Expires: ${delegation.expires_at}`);
    }

    // Check delegation_tokens table
    const decoded = decodeJwt(jwt).payload;
    const { data: token, error: tokenError } = await adminClient
      .from("delegation_tokens")
      .select("*")
      .eq("jti", decoded.jti)
      .single();

    if (tokenError) {
      error(`Failed to query delegation_tokens: ${tokenError.message}`);
      dbVerificationStatus = "FAILED";
    } else {
      success("Delegation token record found");
      console.log(`  JTI: ${token.jti}`);
      console.log(`  Token Hash: ${token.token_hash.slice(0, 16)}...`);
      console.log(`  Expires: ${token.expires_at}`);
    }
    }
  }

  // Step 6: Summary
  console.log("\n=== Test Summary ===\n");
  success("Authentication: PASSED");
  success("Token Issuance: PASSED");
  success("JWT Verification: PASSED");
  if (dbVerificationStatus === "PASSED") success("Database Records: PASSED");
  else if (dbVerificationStatus === "SKIPPED") info("Database Records: SKIPPED");
  else error("Database Records: FAILED");
  
  console.log("\n✅ All tests passed!\n");
  
  console.log("Next steps:");
  console.log("  1. Wire media:upload into the client/service flow");
  console.log("  2. Add a policy map (endpoint -> required scopes) if needed\n");
}

// ============================================================================
// Run
// ============================================================================

main().catch((err) => {
  console.error("\n❌ Test failed:");
  console.error(err);
  process.exit(1);
});
