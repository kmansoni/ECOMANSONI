// Phase 1 EPIC L: E2E test for canary rollout (feature flag-based rate limiting)
// Verifies:
// 1. When rollout_percentage=0 (default), no 429 even after 10 requests
// 2. When rollout_percentage=100, 429 kicks in after tier limit exceeded

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lfkbgnbjxskspsownvjm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc0NjczODIsImV4cCI6MjA1MzA0MzM4Mn0.EKZQp-GQdqPtpL5dNUoT-xLb9D1yJpL7u8c8ZH_2DyE";

const TEST_EMAIL = `canary-test-${Date.now()}@example.com`;
const TEST_PASSWORD = "SecurePass123!";

async function main() {
  console.log("Phase 1 EPIC L: Canary rollout E2E test\n");

  // 1. Create ephemeral test user
  console.log("1️⃣ Creating test user...");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signupData, error: signupError } = await supabase.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signupError) {
    console.error("❌ Signup failed:", signupError.message);
    process.exitCode = 1;
    return;
  }

  const userId = signupData.user?.id;
  if (!userId) {
    console.error("❌ No user ID returned");
    process.exitCode = 1;
    return;
  }
  console.log(`✅ User created: ${userId}`);

  const accessToken = signupData.session?.access_token;
  if (!accessToken) {
    console.error("❌ No access token");
    process.exitCode = 1;
    return;
  }

  // 2. Get delegation token for media_upload
  console.log("\n2️⃣ Getting delegation token...");
  const delegateResp = await fetch(`${SUPABASE_URL}/functions/v1/delegate-action`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "media_upload" }),
  });

  if (!delegateResp.ok) {
    console.error(`❌ Delegation failed: ${delegateResp.status}`);
    process.exitCode = 1;
    return;
  }

  const { delegation_token } = await delegateResp.json();
  console.log(`✅ Delegation token: ${delegation_token.substring(0, 20)}...`);

  // 3. Check feature flag initial state (should be disabled by default)
  console.log("\n3️⃣ Checking feature flag state...");
  const { data: flagData } = await supabase
    .from("feature_flags")
    .select("*")
    .eq("flag_name", "rate_limit_enforcement")
    .single();

  console.log(`   Flag: enabled=${flagData?.enabled}, rollout=${flagData?.rollout_percentage}%`);

  // 4. Spam media-upload-authorize with flag DISABLED (should always return 200)
  console.log("\n4️⃣ Spamming media_upload with flag DISABLED (expect all 200)...");
  let consecutiveOks = 0;
  for (let i = 1; i <= 10; i++) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/media-upload-authorize`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${delegation_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename: "test.jpg", contentType: "image/jpeg" }),
    });

    if (resp.status === 200) {
      consecutiveOks++;
      console.log(`   #${i} → 200 OK (no rate limit enforcement)`);
    } else {
      console.log(`   #${i} → ${resp.status} (unexpected!)`);
    }

    await new Promise((r) => setTimeout(r, 200)); // 200ms between requests
  }

  if (consecutiveOks < 10) {
    console.error(`❌ Expected 10 x 200 OK with flag disabled, got ${consecutiveOks}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ All 10 requests passed (flag disabled = no enforcement)`);

  // 5. Enable flag at 100% rollout
  console.log("\n5️⃣ Enabling flag at 100% rollout...");
  const { error: updateErr } = await supabase
    .from("feature_flags")
    .update({ enabled: true, rollout_percentage: 100 })
    .eq("flag_name", "rate_limit_enforcement");

  if (updateErr) {
    console.error("❌ Failed to enable flag:", updateErr.message);
    process.exitCode = 1;
    return;
  }

  console.log("✅ Flag enabled at 100%");

  // 6. Spam again with flag ENABLED (should hit 429 after 5-6 requests, tier B limit)
  console.log("\n6️⃣ Spamming media_upload with flag ENABLED (expect 429 after ~5 requests)...");
  let got429 = false;
  let first429Index = -1;

  for (let i = 1; i <= 10; i++) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/media-upload-authorize`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${delegation_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename: `test-${i}.jpg`, contentType: "image/jpeg" }),
    });

    console.log(`   #${i} → ${resp.status}${resp.status === 429 ? ` (Retry-After: ${resp.headers.get("retry-after")}s)` : ""}`);

    if (resp.status === 429 && !got429) {
      got429 = true;
      first429Index = i;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  if (!got429) {
    console.error("❌ Expected 429 after ~5 requests with flag enabled, but got none");
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Rate limiting enforced: first 429 at request #${first429Index} (tier B limit: 5/60s)`);

  // 7. Disable flag for cleanup (optional, but courteous)
  console.log("\n7️⃣ Disabling flag for cleanup...");
  await supabase
    .from("feature_flags")
    .update({ enabled: false, rollout_percentage: 0 })
    .eq("flag_name", "rate_limit_enforcement");

  console.log("\n✅ Canary rollout E2E test PASSED");
}

main();
