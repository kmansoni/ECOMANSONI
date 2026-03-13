import { supabase } from "@/lib/supabase";

export type SendMessageV1Result = {
  messageId: string;
  seq: number;
};

export type SendMessageV1Input = {
  conversationId: string;
  clientMsgId: string;
  body: string;
  isSilent?: boolean;
};

function isMissing4ArgOverload(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const code = String(e?.code ?? "").toUpperCase();
  const full = `${String(e?.message ?? "")} ${String(e?.details ?? "")} ${String(e?.hint ?? "")}`.toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    (full.includes("send_message_v1") && full.includes("is_silent"))
  );
}

function isOverloadResolutionError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const code = String(e?.code ?? "").toUpperCase();
  const full = `${String(e?.message ?? "")} ${String(e?.details ?? "")} ${String(e?.hint ?? "")}`.toLowerCase();
  return (
    code === "PGRST203" ||
    (full.includes("send_message_v1") && full.includes("overload")) ||
    (full.includes("send_message_v1") && full.includes("multiple choices"))
  );
}

export async function sendMessageV1(input: SendMessageV1Input): Promise<SendMessageV1Result> {
  const payload3 = {
    conversation_id: input.conversationId,
    client_msg_id: input.clientMsgId,
    body: input.body,
  };
  const payload4 = {
    conversation_id: input.conversationId,
    client_msg_id: input.clientMsgId,
    body: input.body,
    is_silent: !!input.isSilent,
  };

  // Preserve current DB semantics by defaulting to 3-arg path.
  // Use 4-arg explicitly for silent messages, or as a fallback if PostgREST cannot resolve overloads.
  let data: unknown;
  let error: unknown;

  if (input.isSilent) {
    const first = await supabase.rpc("send_message_v1", payload4);
    data = first.data;
    error = first.error;
    if (error && isMissing4ArgOverload(error)) {
      const fallback = await supabase.rpc("send_message_v1", payload3);
      data = fallback.data;
      error = fallback.error;
    }
  } else {
    const first = await supabase.rpc("send_message_v1", payload3);
    data = first.data;
    error = first.error;
    if (error && isOverloadResolutionError(error)) {
      const fallback = await supabase.rpc("send_message_v1", payload4);
      data = fallback.data;
      error = fallback.error;
    }
  }

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] ?? null : data ?? null;
  const messageId = row?.message_id ? String(row.message_id) : "";
  const seqRaw = row?.seq;
  const seq = typeof seqRaw === "number" ? seqRaw : Number(seqRaw);

  if (!messageId || !Number.isFinite(seq)) {
    throw new Error("SEND_MESSAGE_V1_INVALID_RESPONSE");
  }

  return { messageId, seq };
}

export function buildChatBodyEnvelope(payload: unknown): string {
  return JSON.stringify(payload);
}
