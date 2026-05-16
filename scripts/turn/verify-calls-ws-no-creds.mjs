/*
  Static guard: calls-ws must never embed TURN credentials.

  This checks the signaling server source for common footguns:
  - use of CALLS_TURN_USERNAME/CALLS_TURN_CREDENTIAL
  - 'username:' or 'credential:' inside getTurnIceServersPublic()
  - 'username'/'credential' literals inside ROOM_JOIN_OK payload construction

  This is intentionally conservative (false positives are acceptable).
*/

import { readFileSync } from "node:fs";

const path = process.argv[2] || "server/calls-ws/index.mjs";
const src = readFileSync(path, "utf8");

function fail(reason) {
  console.error(`[calls-ws guard] FAIL: ${reason}`);
  process.exitCode = 1;
}

// Guard against dynamic env var access patterns
if (src.includes("TURN_USERNAME") || src.includes("TURN_CREDENTIAL") || src.includes("process.env.TURN")) {
  fail("Found TURN_USERNAME/CREDENTIAL or process.env.TURN access in source");
}

// Extract getTurnIceServersPublic body (best-effort)
const fnStart = src.indexOf("function getTurnIceServersPublic()");
if (fnStart !== -1) {
  const nextFn = src.indexOf("\nfunction ", fnStart + 1);
  const slice = nextFn !== -1 ? src.slice(fnStart, nextFn) : src.slice(fnStart, fnStart + 3000);
  if (/\busername\s*:/i.test(slice) || /\bcredential\s*:/i.test(slice)) {
    fail("Found username/credential fields in getTurnIceServersPublic() region");
  }
}

// Guard ROOM_JOIN_OK payload region
const joinIdx = src.indexOf('type: "ROOM_JOIN_OK"');
if (joinIdx !== -1) {
  const slice = src.slice(joinIdx, joinIdx + 2400);
  // Only fail on actual fields, not comments.
  if (/\busername\s*:/i.test(slice) || /\bcredential\s*:/i.test(slice) || /"username"\s*:/i.test(slice) || /"credential"\s*:/i.test(slice)) {
    fail("Found username/credential fields in ROOM_JOIN_OK payload region");
  }
}

if (!process.exitCode) {
  console.log("[calls-ws guard] OK (no TURN creds patterns found)");
}
