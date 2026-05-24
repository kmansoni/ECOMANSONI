import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

function readSqlFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      abs: path.join(MIGRATIONS_DIR, file),
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    }));
}

function fail(message) {
  console.error(`[chat-idempotency-v25] FAIL: ${message}`);
  process.exit(1);
}

function findLastMigrationWith(files, pattern) {
  for (let i = files.length - 1; i >= 0; i -= 1) {
    if (pattern.test(files[i].sql)) return files[i];
  }
  return null;
}

function ensureContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    fail(`${label} missing required fragment: ${needle}`);
  }
}

function ensureNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) {
    fail(`${label} contains forbidden fragment: ${needle}`);
  }
}

const files = readSqlFiles();
const joined = files.map((f) => f.sql).join("\n");

// Schema + drift gate for index.
ensureContains(
  joined,
  "CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_msg_id_uidx",
  "schema-gate"
);
ensureContains(
  joined,
  "ON public.messages (conversation_id, client_msg_id)",
  "schema-gate"
);
const lastIndexFile = findLastMigrationWith(
  files,
  /messages_conversation_client_msg_id_uidx/i
);
if (!lastIndexFile) {
  fail("drift-gate: messages_conversation_client_msg_id_uidx history not found");
}
const lastIndexSql = lastIndexFile.sql;
ensureContains(
  lastIndexSql,
  "CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_msg_id_uidx",
  "drift-gate index-last-state"
);
ensureContains(
  lastIndexSql,
  "ON public.messages (conversation_id, client_msg_id)",
  "drift-gate index-last-state"
);

// Behavior + race gate for send_message_v1.
const sendV1File = findLastMigrationWith(
  files,
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.send_message_v1\s*\(/i
);
if (!sendV1File) {
  fail("behavior-gate: send_message_v1 definition not found");
}

const sendV1Sql = sendV1File.sql;
ensureContains(sendV1Sql, "WHERE m.conversation_id = send_message_v1.conversation_id", "behavior-gate send_message_v1");
ensureContains(sendV1Sql, "AND m.client_msg_id = send_message_v1.client_msg_id", "behavior-gate send_message_v1");
ensureContains(sendV1Sql, "ON CONFLICT (conversation_id, client_msg_id)", "behavior-gate send_message_v1");
ensureContains(sendV1Sql, "DO NOTHING", "behavior-gate send_message_v1");

// Must not rely on sender-scoped conflict target in latest definition.
ensureNotContains(sendV1Sql, "ON CONFLICT (conversation_id, sender_id, client_msg_id)", "behavior-gate send_message_v1");

// Race gate heuristic: if function updates conversation counters, duplicate branch
// must return before that update block.
const duplicateReturnPos = sendV1Sql.indexOf("RETURN NEXT;");
const updateConversationPos = sendV1Sql.indexOf("UPDATE public.conversations");
if (duplicateReturnPos === -1) {
  fail("race-gate send_message_v1: RETURN NEXT duplicate branch is missing");
}
if (updateConversationPos !== -1 && duplicateReturnPos > updateConversationPos) {
  fail("race-gate send_message_v1: duplicate return is not guaranteed before conversation seq update");
}

// Behavior + race gate for chat_send_message_v11.
const sendV11File = findLastMigrationWith(
  files,
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.chat_send_message_v11\s*\(/i
);
if (!sendV11File) {
  fail("behavior-gate: chat_send_message_v11 definition not found");
}

const sendV11Sql = sendV11File.sql;
ensureContains(sendV11Sql, "ON CONFLICT (conversation_id, client_msg_id)", "behavior-gate chat_send_message_v11");
ensureContains(sendV11Sql, "DO NOTHING", "behavior-gate chat_send_message_v11");
ensureNotContains(sendV11Sql, "ON CONFLICT (conversation_id, sender_id, client_msg_id)", "behavior-gate chat_send_message_v11");

const duplicateAckPos = sendV11Sql.indexOf("RETURN QUERY SELECT v_ack_id, 'duplicate'");
const eventInsertPos = sendV11Sql.indexOf("INSERT INTO public.chat_events(");
if (eventInsertPos !== -1 && (duplicateAckPos === -1 || duplicateAckPos > eventInsertPos)) {
  fail("race-gate chat_send_message_v11: duplicate ack branch is not guaranteed before event emit");
}

console.log("[chat-idempotency-v25] OK: schema + behavior + race + drift static gates passed");
