/*
  Smoke-test: TURN credentials closed contour.

  Checks:
  - /functions/v1/turn-credentials:
    1) No auth -> 401
    2) Bearer anon key -> 401
    3) Bearer user JWT -> 200 (and TURN creds present when REQUIRE_TURN_SMOKE=1)
    4) Rate limit -> 429 after (TURN_RATE_MAX_PER_MINUTE + 1) calls

  Security checks (R1):
  - PostgREST must NOT expose turn_issuance_rl_hit_v1 to authenticated
  - PostgREST must NOT allow selecting from turn_issuance_rl to authenticated

  Env:
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_PUBLISHABLE_KEY (anon)
  - TURN_SMOKE_EMAIL / TURN_SMOKE_PASSWORD (optional)
  - SUPABASE_SERVICE_ROLE_KEY (optional; used to create an ephemeral smoke user if TURN_SMOKE_* are not provided)

  Control:
  - REQUIRE_TURN_SMOKE=1 => missing env or missing TURN in response fails
*/

function normalizeEnv(v) {
  return String(v || "").trim().replace(/^['"]+|['"]+$/g, "");
}

function readEnv(name) {
  return normalizeEnv(process.env[name]);
}

function isRequireMode() {
  const v = readEnv("REQUIRE_TURN_SMOKE");
  return v === "1" || v.toLowerCase() === "true";
}

function extractProjectRef(url) {
  const m = String(url || "").trim().match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\/?/i);
  return m?.[1] || null;
}

function mustHaveEnv(name, missing) {
  const v = readEnv(name);
  if (!v) missing.push(name);
  return v;
}

function randomHex(bytes = 16) {
  const alphabet = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < bytes * 2; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function createEphemeralUser({ base, serviceRoleKey }) {
  const email = `turn-smoke+${Date.now()}-${randomHex(6)}@example.com`;
  const password = `S3cure-${randomHex(16)}!`;

  const adminUrl = `${base}/auth/v1/admin/users`;
  const { res, json, text } = await fetchJson(adminUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });

  const userId = String(json?.id || "");
  if (!res.ok || !userId) {
    const safeBody = json || (text ? { text: String(text).slice(0, 200) } : null);
    throw new Error(`[turn smoke] failed to create ephemeral user (status=${res.status} body=${JSON.stringify(safeBody)})`);
  }

  return { userId, email, password };
}

async function deleteEphemeralUser({ base, serviceRoleKey, userId }) {
  if (!userId) return;
  const url = `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
  await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
}

function hasTurnServer(iceServers) {
  const list = Array.isArray(iceServers) ? iceServers : [];
  for (const s of list) {
    const urls = Array.isArray(s?.urls) ? s.urls : [s?.urls];
    for (const u of urls) {
      if (typeof u === "string" && /^turns?:/i.test(u)) return true;
    }
  }
  return false;
}

function hasTurnCredFields(iceServers) {
  const list = Array.isArray(iceServers) ? iceServers : [];
  for (const s of list) {
    const urls = Array.isArray(s?.urls) ? s.urls : [s?.urls];
    const isTurn = urls.some((u) => typeof u === "string" && /^turns?:/i.test(u));
    if (!isTurn) continue;
    if (typeof s?.username === "string" && s.username && typeof s?.credential === "string" && s.credential) {
      return true;
    }
  }
  return false;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

async function main() {
  const requireMode = isRequireMode();

  const missing = [];
  const supabaseUrl = mustHaveEnv("VITE_SUPABASE_URL", missing);
  const anonKey = mustHaveEnv("VITE_SUPABASE_PUBLISHABLE_KEY", missing);

  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  let email = readEnv("TURN_SMOKE_EMAIL");
  let password = readEnv("TURN_SMOKE_PASSWORD");

  if (missing.length) {
    const msg = `[turn smoke] missing env: ${missing.join(", ")}`;
    if (requireMode) {
      console.error(msg);
      process.exitCode = 1;
      return;
    }
    console.warn(msg + " (skipping; set REQUIRE_TURN_SMOKE=1 to enforce)");
    process.exitCode = 0;
    return;
  }

  const base = supabaseUrl.replace(/\/+$/g, "");
  const projectRef = extractProjectRef(base);
  const fnUrl = `${base}/functions/v1/turn-credentials`;

  const common = {
    "Content-Type": "application/json",
    apikey: anonKey,
  };

  // 1) No auth -> 401
  {
    const { res, json } = await fetchJson(fnUrl, { method: "POST", headers: common, body: "{}" });
    if (res.status !== 401) {
      console.error("[turn smoke] expected 401 (no auth)", { projectRef, status: res.status, body: json });
      process.exitCode = 1;
      return;
    }
  }

  // 2) Bearer anon key -> 401
  {
    const { res } = await fetchJson(fnUrl, {
      method: "POST",
      headers: { ...common, Authorization: `Bearer ${anonKey}` },
      body: "{}",
    });
    if (res.status !== 401) {
      console.error("[turn smoke] expected 401 (bearer anon key)", { projectRef, status: res.status });
      process.exitCode = 1;
      return;
    }
  }

  let ephemeralUserId = null;
  try {
    // 3) Ensure we can obtain a user JWT
    if (!email || !password) {
      if (!serviceRoleKey) {
        const msg = "[turn smoke] missing TURN_SMOKE_EMAIL/PASSWORD and SUPABASE_SERVICE_ROLE_KEY";
        if (requireMode) {
          console.error(msg);
          process.exitCode = 1;
          return;
        }
        console.warn(msg + " (skipping; set REQUIRE_TURN_SMOKE=1 to enforce)");
        process.exitCode = 0;
        return;
      }

      const created = await createEphemeralUser({ base, serviceRoleKey });
      ephemeralUserId = created.userId;
      email = created.email;
      password = created.password;
    }

    // 4) Sign in -> user JWT
    const auth = await fetchJson(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { ...common, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ email, password }),
    });

    const accessToken = auth?.json?.access_token ? String(auth.json.access_token) : "";
    if (auth.res.status !== 200 || !accessToken) {
      console.error("[turn smoke] auth failed", { projectRef, status: auth.res.status, hasToken: Boolean(accessToken) });
      process.exitCode = 1;
      return;
    }

    // 5) Authenticated -> 200
    const okRes = await fetchJson(fnUrl, {
      method: "POST",
      headers: { ...common, Authorization: `Bearer ${accessToken}` },
      body: "{}",
    });

    if (okRes.res.status !== 200) {
      console.error("[turn smoke] expected 200 (user JWT)", { projectRef, status: okRes.res.status, body: okRes.json });
      process.exitCode = 1;
      return;
    }

    const iceServers = okRes.json?.iceServers;
    const ttlSeconds = Number(okRes.json?.ttlSeconds || 0);
    const hasTurn = hasTurnServer(iceServers);
    const hasCreds = hasTurnCredFields(iceServers);

    console.log("[turn smoke] turn-credentials", {
      projectRef,
      ok: true,
      ttlSeconds: Number.isFinite(ttlSeconds) ? ttlSeconds : null,
      iceServersCount: Array.isArray(iceServers) ? iceServers.length : 0,
      hasTurn,
      hasCreds,
      serverError: okRes.json?.error || null,
    });

    if (requireMode) {
      if (!hasTurn || !hasCreds) {
        console.error("[turn smoke] missing TURN or creds in response (require mode)");
        process.exitCode = 1;
        return;
      }
    }

    // R1: ensure authenticated cannot call RL RPC via PostgREST
    {
      const rpcUrl = `${base}/rest/v1/rpc/turn_issuance_rl_hit_v1`;
      const bad = await fetchJson(rpcUrl, {
        method: "POST",
        headers: { ...common, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          p_user_id: "00000000-0000-0000-0000-000000000000",
          p_ip: "test",
          p_max: 1,
        }),
      });

      if (bad.res.ok) {
        console.error("[turn smoke] SECURITY FAILURE: RL RPC is callable by authenticated", { projectRef, status: bad.res.status });
        process.exitCode = 1;
        return;
      }
    }

    // R1: ensure authenticated cannot SELECT from RL table
    {
      const tblUrl = `${base}/rest/v1/turn_issuance_rl?select=cnt&limit=1`;
      const bad = await fetchJson(tblUrl, {
        method: "GET",
        headers: { ...common, Authorization: `Bearer ${accessToken}` },
      });

      if (bad.res.ok) {
        console.error("[turn smoke] SECURITY FAILURE: RL table is readable by authenticated", { projectRef, status: bad.res.status });
        process.exitCode = 1;
        return;
      }
    }

    // Abuse: expect a 429 at (max+1) calls within a minute.
    {
      const max = Math.max(1, Number(readEnv("TURN_RATE_MAX_PER_MINUTE") || "10"));
      let saw429 = false;

      for (let i = 0; i < max + 1; i++) {
        const r = await fetch(fnUrl, {
          method: "POST",
          headers: { ...common, Authorization: `Bearer ${accessToken}` },
          body: "{}",
        });
        if (r.status === 429) {
          saw429 = true;
          break;
        }
      }

      if (!saw429) {
        const msg = "[turn smoke] expected at least one 429 during abuse test";
        if (requireMode) {
          console.error(msg);
          process.exitCode = 1;
          return;
        }
        console.warn(msg + " (skipping failure; set REQUIRE_TURN_SMOKE=1 to enforce)");
      } else {
        console.log("[turn smoke] rate limit OK (429 observed)");
      }
    }
  } finally {
    if (ephemeralUserId && serviceRoleKey) {
      await deleteEphemeralUser({ base, serviceRoleKey, userId: ephemeralUserId });
    }
  }
}

main().catch((e) => {
  console.error("[turn smoke] failed:", e);
  process.exitCode = 1;
});
