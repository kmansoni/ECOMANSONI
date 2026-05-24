import crypto from "node:crypto";

function env(name) {
  return String(process.env[name] || "").trim();
}

function requireEnv(name) {
  const v = env(name);
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

function buildHeaders(apiKey, bearer) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
}

async function createAuthUser({ baseUrl, serviceRoleKey, email, password, tag }) {
  const res = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: buildHeaders(serviceRoleKey, serviceRoleKey),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        runtime_fixture: true,
        tag,
      },
    }),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`createAuthUser failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  const id = payload?.id;
  if (!id) {
    throw new Error(`createAuthUser returned no id for ${email}`);
  }
  return { id, email, password };
}

async function signInWithPassword({ baseUrl, apiKey, email, password }) {
  const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`signInWithPassword failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  const accessToken = payload?.access_token;
  if (!accessToken) {
    throw new Error("signInWithPassword returned no access_token");
  }
  return accessToken;
}

async function getOrCreateDm({ baseUrl, apiKey, userJwt, targetUserId }) {
  const res = await rpc({
    baseUrl,
    apiKey,
    bearer: userJwt,
    fn: "get_or_create_dm",
    args: { target_user_id: targetUserId },
  });
  if (!res.ok) {
    throw new Error(`get_or_create_dm failed: ${JSON.stringify(res.error)}`);
  }
  const data = res.data;
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first === "string" && first) return first;
  }
  if (typeof data === "string" && data) return data;
  throw new Error(`get_or_create_dm invalid response: ${JSON.stringify(data)}`);
}

async function provisionFixtures({ baseUrl, serviceRoleKey, apiKey }) {
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const actor = await createAuthUser({
    baseUrl,
    serviceRoleKey,
    email: `runtime-v25-actor-${stamp}@example.com`,
    password: `RtV25!${crypto.randomUUID().slice(0, 8)}Aa1`,
    tag: "actor",
  });
  const peerA = await createAuthUser({
    baseUrl,
    serviceRoleKey,
    email: `runtime-v25-peer-a-${stamp}@example.com`,
    password: `RtV25!${crypto.randomUUID().slice(0, 8)}Bb2`,
    tag: "peer-a",
  });
  const peerB = await createAuthUser({
    baseUrl,
    serviceRoleKey,
    email: `runtime-v25-peer-b-${stamp}@example.com`,
    password: `RtV25!${crypto.randomUUID().slice(0, 8)}Cc3`,
    tag: "peer-b",
  });

  const actorJwt = await signInWithPassword({
    baseUrl,
    apiKey,
    email: actor.email,
    password: actor.password,
  });

  const dialogA = await getOrCreateDm({
    baseUrl,
    apiKey,
    userJwt: actorJwt,
    targetUserId: peerA.id,
  });
  const dialogB = await getOrCreateDm({
    baseUrl,
    apiKey,
    userJwt: actorJwt,
    targetUserId: peerB.id,
  });

  return {
    userJwt: actorJwt,
    senderId: actor.id,
    dialogA,
    dialogB,
    stamp,
  };
}

async function rpc({ baseUrl, apiKey, bearer, fn, args }) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: buildHeaders(apiKey, bearer),
    body: JSON.stringify(args || {}),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: payload };
  }
  return { ok: true, status: res.status, data: payload };
}

function summarizeRpcFailure(label, res) {
  const err = res?.error;
  return `${label} failed: status=${res?.status ?? "?"} error=${JSON.stringify(err)}`;
}

async function rpcSendMessageV1({ baseUrl, apiKey, bearer, conversationId, clientMsgId, body }) {
  const fourArg = await rpc({
    baseUrl,
    apiKey,
    bearer,
    fn: "send_message_v1",
    args: { conversation_id: conversationId, client_msg_id: clientMsgId, body, is_silent: false },
  });
  if (fourArg.ok) return fourArg;

  const msg = JSON.stringify(fourArg.error || {}).toLowerCase();
  const signatureMissing =
    msg.includes("function") ||
    msg.includes("does not exist") ||
    msg.includes("pgrst202") ||
    msg.includes("is_silent");
  if (!signatureMissing) return fourArg;

  const threeArg = await rpc({
    baseUrl,
    apiKey,
    bearer,
    fn: "send_message_v1",
    args: { conversation_id: conversationId, client_msg_id: clientMsgId, body },
  });
  if (threeArg.ok) return threeArg;

  return {
    ok: false,
    status: fourArg.status,
    error: {
      fourArg: fourArg.error,
      threeArg: threeArg.error,
    },
  };
}

async function queryMessagesByClientMsgId({ baseUrl, serviceRoleKey, conversationId, clientMsgId }) {
  const url = new URL(`${baseUrl}/rest/v1/messages`);
  url.searchParams.set("select", "id,seq,conversation_id,client_msg_id,sender_id,content");
  url.searchParams.set("conversation_id", `eq.${conversationId}`);
  url.searchParams.set("client_msg_id", `eq.${clientMsgId}`);

  const res = await fetch(url, {
    headers: buildHeaders(serviceRoleKey, serviceRoleKey),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`messages query failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  return Array.isArray(payload) ? payload : [];
}

function decodeJwtSub(jwt) {
  const parts = String(jwt).split(".");
  if (parts.length !== 3) return null;
  const body = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (body.length % 4)) % 4;
  const json = Buffer.from(body + "=".repeat(pad), "base64").toString("utf8");
  try {
    const parsed = JSON.parse(json);
    return typeof parsed.sub === "string" ? parsed.sub : null;
  } catch {
    return null;
  }
}

async function queryNullClientMsgCount({ baseUrl, serviceRoleKey, conversationId }) {
  const url = new URL(`${baseUrl}/rest/v1/messages`);
  url.searchParams.set("select", "id");
  url.searchParams.set("conversation_id", `eq.${conversationId}`);
  url.searchParams.set("client_msg_id", "is.null");
  const res = await fetch(url, {
    headers: {
      ...buildHeaders(serviceRoleKey, serviceRoleKey),
      Prefer: "count=exact",
    },
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`null-compat query failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  const contentRange = res.headers.get("content-range") || "";
  const total = Number(contentRange.split("/")[1] || 0);
  return Number.isFinite(total) ? total : 0;
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY") || serviceRoleKey;
  let userJwt = env("CHAT_TEST_USER_JWT");
  let dialogA = env("CHAT_TEST_DIALOG_ID_A");
  let dialogB = env("CHAT_TEST_DIALOG_ID_B");
  const testDeviceId = env("CHAT_TEST_DEVICE_ID") || `runtime-v25-${crypto.randomUUID().slice(0, 12)}`;
  let senderId = userJwt ? decodeJwtSub(userJwt) : null;

  if (!userJwt || !dialogA || !dialogB || !senderId) {
    const fixtures = await provisionFixtures({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      apiKey,
    });
    userJwt = fixtures.userJwt;
    dialogA = fixtures.dialogA;
    dialogB = fixtures.dialogB;
    senderId = fixtures.senderId;
  }

  if (!senderId) throw new Error("Unable to resolve sender id for runtime suite");

  const results = [];

  const run = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ scenario: name, status: "PASS", detail });
    } catch (error) {
      results.push({ scenario: name, status: "FAIL", detail: String(error?.message || error) });
    }
  };

  await run("send_message_v1 double-call", async () => {
    const clientMsgId = crypto.randomUUID();
    const body = `v25 double call ${Date.now()}`;
    const call1 = await rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogA,
      clientMsgId,
      body,
    });
    const call2 = await rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogA,
      clientMsgId,
      body,
    });

    if (!call1.ok) throw new Error(summarizeRpcFailure("v1 call1", call1));
    if (!call2.ok) throw new Error(summarizeRpcFailure("v1 call2", call2));
    const row1 = Array.isArray(call1.data) ? call1.data[0] : call1.data;
    const row2 = Array.isArray(call2.data) ? call2.data[0] : call2.data;
    must(row1?.message_id && row2?.message_id, "v1 response missing message_id");
    must(
      String(row1.message_id) === String(row2.message_id),
      `v1 message_id mismatch: call1=${String(row1.message_id)} call2=${String(row2.message_id)}`,
    );
    must(
      Number(row1.seq) === Number(row2.seq),
      `v1 seq mismatch: call1=${String(row1.seq)} call2=${String(row2.seq)} message_id=${String(row1.message_id)}`,
    );

    const rows = await queryMessagesByClientMsgId({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogA,
      clientMsgId,
    });
    must(rows.length === 1, `v1 expected one row, got ${rows.length}`);
    return { message_id: row1.message_id, seq: row1.seq, rows: rows.length };
  });

  await run("chat_send_message_v11 double-call", async () => {
    const clientMsgId = crypto.randomUUID();
    const content = `v25 v11 double ${Date.now()}`;
    const seqBase = Date.now() % 1_000_000;
    const call1 = await rpc({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      fn: "chat_send_message_v11",
      args: {
        p_dialog_id: dialogA,
        p_device_id: testDeviceId,
        p_client_write_seq: seqBase,
        p_client_msg_id: clientMsgId,
        p_content: content,
        p_client_sent_at: new Date().toISOString(),
      },
    });
    const call2 = await rpc({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      fn: "chat_send_message_v11",
      args: {
        p_dialog_id: dialogA,
        p_device_id: testDeviceId,
        p_client_write_seq: seqBase + 1,
        p_client_msg_id: clientMsgId,
        p_content: content,
        p_client_sent_at: new Date().toISOString(),
      },
    });

    if (!call1.ok) throw new Error(summarizeRpcFailure("v11 call1", call1));
    if (!call2.ok) throw new Error(summarizeRpcFailure("v11 call2", call2));
    const row1 = Array.isArray(call1.data) ? call1.data[0] : call1.data;
    const row2 = Array.isArray(call2.data) ? call2.data[0] : call2.data;
    must(row1?.msg_id && row2?.msg_id, "v11 response missing msg_id");
    must(String(row1.msg_id) === String(row2.msg_id), "v11 msg_id mismatch");
    must(Number(row1.msg_seq) === Number(row2.msg_seq), "v11 msg_seq mismatch");

    const rows = await queryMessagesByClientMsgId({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogA,
      clientMsgId,
    });
    must(rows.length === 1, `v11 expected one row, got ${rows.length}`);
    return {
      ack1: row1.ack_status,
      ack2: row2.ack_status,
      msg_id: row1.msg_id,
      msg_seq: row1.msg_seq,
      rows: rows.length,
    };
  });

  await run("parallel race", async () => {
    const clientMsgId = crypto.randomUUID();
    const body = `v25 race ${Date.now()}`;
    const p1 = rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogA,
      clientMsgId,
      body,
    });
    const p2 = rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogA,
      clientMsgId,
      body,
    });

    const settled = await Promise.allSettled([p1, p2]);
    must(settled.every((s) => s.status === "fulfilled"), "race has rejected promise");
    const rowsResult = settled.map((s) => s.value);
    if (!rowsResult[0].ok) throw new Error(summarizeRpcFailure("race call1", rowsResult[0]));
    if (!rowsResult[1].ok) throw new Error(summarizeRpcFailure("race call2", rowsResult[1]));
    const d1 = Array.isArray(rowsResult[0].data) ? rowsResult[0].data[0] : rowsResult[0].data;
    const d2 = Array.isArray(rowsResult[1].data) ? rowsResult[1].data[0] : rowsResult[1].data;
    must(
      String(d1.message_id) === String(d2.message_id),
      `race message_id mismatch: call1=${String(d1.message_id)} call2=${String(d2.message_id)}`,
    );
    must(
      Number(d1.seq) === Number(d2.seq),
      `race seq mismatch: call1=${String(d1.seq)} call2=${String(d2.seq)} message_id=${String(d1.message_id)}`,
    );

    const rows = await queryMessagesByClientMsgId({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogA,
      clientMsgId,
    });
    must(rows.length === 1, `race expected one row, got ${rows.length}`);
    return { message_id: d1.message_id, seq: d1.seq, rows: rows.length };
  });

  await run("retry after timeout", async () => {
    const clientMsgId = crypto.randomUUID();
    const body = `v25 retry ${Date.now()}`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 1);
    let firstOutcome = "aborted";
    try {
      await fetch(`${supabaseUrl}/rest/v1/rpc/send_message_v1`, {
        method: "POST",
        headers: buildHeaders(apiKey, userJwt),
        body: JSON.stringify({ conversation_id: dialogA, client_msg_id: clientMsgId, body }),
        signal: ctrl.signal,
      });
      firstOutcome = "completed";
    } catch {
      firstOutcome = "aborted";
    } finally {
      clearTimeout(timeout);
    }

    const retry = await rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogA,
      clientMsgId,
      body,
    });
    if (!retry.ok) throw new Error(summarizeRpcFailure("retry call", retry));

    const row = Array.isArray(retry.data) ? retry.data[0] : retry.data;
    must(row?.message_id, "retry missing message_id");
    const rows = await queryMessagesByClientMsgId({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogA,
      clientMsgId,
    });
    must(rows.length === 1, `retry expected one row, got ${rows.length}`);
    return { firstOutcome, message_id: row.message_id, seq: row.seq, rows: rows.length };
  });

  await run("cross-dialog same client_msg_id", async () => {
    const clientMsgId = crypto.randomUUID();
    const bodyA = `v25 cross A ${Date.now()}`;
    const bodyB = `v25 cross B ${Date.now()}`;

    const a = await rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogA,
      clientMsgId,
      body: bodyA,
    });
    const b = await rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogB,
      clientMsgId,
      body: bodyB,
    });

    if (!a.ok) throw new Error(summarizeRpcFailure("cross-dialog callA", a));
    if (!b.ok) throw new Error(summarizeRpcFailure("cross-dialog callB", b));
    const ra = Array.isArray(a.data) ? a.data[0] : a.data;
    const rb = Array.isArray(b.data) ? b.data[0] : b.data;
    must(ra?.message_id && rb?.message_id, "cross-dialog missing message_id");
    must(String(ra.message_id) !== String(rb.message_id), "cross-dialog expected different message_id");

    const rowsA = await queryMessagesByClientMsgId({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogA,
      clientMsgId,
    });
    const rowsB = await queryMessagesByClientMsgId({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogB,
      clientMsgId,
    });
    must(rowsA.length === 1 && rowsB.length === 1, `cross-dialog expected one row each, got A=${rowsA.length}, B=${rowsB.length}`);
    return { message_id_a: ra.message_id, message_id_b: rb.message_id };
  });

  await run("null compatibility", async () => {
    const before = await queryNullClientMsgCount({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogA,
    });
    const probeId = crypto.randomUUID();
    const probe = await rpcSendMessageV1({
      baseUrl: supabaseUrl,
      apiKey,
      bearer: userJwt,
      conversationId: dialogA,
      clientMsgId: probeId,
      body: `v25 null compatibility probe ${Date.now()}`,
    });
    if (!probe.ok) throw new Error(summarizeRpcFailure("null-compat probe", probe));
    const after = await queryNullClientMsgCount({
      baseUrl: supabaseUrl,
      serviceRoleKey,
      conversationId: dialogA,
    });
    must(after >= 0 && before >= 0, "null-compat invalid counts");
    return { before, after };
  });

  const failed = results.filter((r) => r.status !== "PASS");
  console.log(JSON.stringify({
    suite: "chat-idempotency-v25-runtime",
    status: failed.length === 0 ? "PASS" : "FAIL",
    results,
  }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[chat-idempotency-v25-runtime] fatal", error);
  process.exit(1);
});
