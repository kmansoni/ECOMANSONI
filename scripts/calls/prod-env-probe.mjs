/*
  Production calls env probe.

  Goal:
  - Fail fast in CI/deploy if calls-v2 frontend env is incomplete or unsafe.

  Required when REQUIRE_CALLS_ENV_PROBE=1:
  - VITE_CALLS_V2_ENABLED=true
  - VITE_CALLS_V2_WS_URL or VITE_CALLS_V2_WS_URLS
  - All remote endpoints must be wss://
  - VITE_TURN_CREDENTIALS_URL must be https://
*/

function normalize(value) {
  return String(value ?? "").trim().replace(/^['\"]+|['\"]+$/g, "");
}

function isRequireMode() {
  const v = normalize(process.env.REQUIRE_CALLS_ENV_PROBE).toLowerCase();
  return v === "1" || v === "true";
}

function parseWsList(singleValue, listValue) {
  const items = [];
  const one = normalize(singleValue);
  if (one) items.push(one);
  for (const item of normalize(listValue).split(",")) {
    const value = item.trim();
    if (value) items.push(value);
  }
  return [...new Set(items)];
}

function isLocalHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function validateWsEndpoints(endpoints) {
  const errors = [];
  for (const endpoint of endpoints) {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      errors.push(`invalid URL: ${endpoint}`);
      continue;
    }

    if (!url.pathname || url.pathname === "/") {
      errors.push(`missing /ws path: ${endpoint}`);
    }

    if (url.protocol !== "wss:" && !(url.protocol === "ws:" && isLocalHost(url.hostname))) {
      errors.push(`insecure WS protocol (must be wss:// for remote): ${endpoint}`);
    }

    // Production policy: SFU ingress is provisioned on mansoni.ru.
    // Reject accidental .com values early to avoid WS 401/upgrade failures in runtime.
    const host = url.hostname.toLowerCase();
    if (/^sfu-[a-z0-9-]+\.mansoni\.com$/.test(host)) {
      errors.push(`invalid SFU domain for production: ${endpoint} (expected *.mansoni.ru)`);
    }
  }
  return errors;
}

function validateTurnUrl(turnUrl) {
  const value = normalize(turnUrl);
  if (!value) return ["missing VITE_TURN_CREDENTIALS_URL"];

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return [`TURN credentials URL must be https:// in production: ${value}`];
    }
  } catch {
    return [`invalid TURN credentials URL: ${value}`];
  }

  return [];
}

function main() {
  const requireMode = isRequireMode();

  const enabled = normalize(process.env.VITE_CALLS_V2_ENABLED).toLowerCase();
  const wsUrl = normalize(process.env.VITE_CALLS_V2_WS_URL);
  const wsUrls = normalize(process.env.VITE_CALLS_V2_WS_URLS);
  const rekey = normalize(process.env.VITE_CALLS_V2_REKEY_INTERVAL_MS);
  const turnUrl = normalize(process.env.VITE_TURN_CREDENTIALS_URL);

  const errors = [];

  if (enabled !== "true") {
    errors.push(`VITE_CALLS_V2_ENABLED must be true, got: ${enabled || "<empty>"}`);
  }

  const endpoints = parseWsList(wsUrl, wsUrls);
  if (endpoints.length === 0) {
    errors.push("missing calls endpoint: set VITE_CALLS_V2_WS_URL or VITE_CALLS_V2_WS_URLS");
  } else {
    errors.push(...validateWsEndpoints(endpoints));
  }

  const rekeyMs = Number(rekey);
  if (!Number.isFinite(rekeyMs) || rekeyMs < 30000) {
    errors.push(`VITE_CALLS_V2_REKEY_INTERVAL_MS must be >= 30000, got: ${rekey || "<empty>"}`);
  }

  errors.push(...validateTurnUrl(turnUrl));

  const summary = {
    enabled,
    wsEndpointCount: endpoints.length,
    endpoints,
    rekeyMs: Number.isFinite(rekeyMs) ? rekeyMs : null,
    turnUrl: turnUrl || null,
  };

  if (errors.length > 0) {
    const header = "[calls env probe] FAILED";
    if (requireMode) {
      console.error(header, summary);
      for (const err of errors) console.error(`[calls env probe] ${err}`);
      process.exitCode = 1;
      return;
    }

    console.warn(header, summary);
    for (const err of errors) console.warn(`[calls env probe] ${err}`);
    console.warn("[calls env probe] non-require mode => warning only");
    process.exitCode = 0;
    return;
  }

  console.log("[calls env probe] OK", summary);
}

main();
