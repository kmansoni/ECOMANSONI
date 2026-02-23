import { supabase } from "@/lib/supabase";

export type SendMessageV1Result = {
  messageId: string;
  seq: number;
};

export type SendMessageV1Input = {
  conversationId: string;
  clientMsgId: string;
  body: string;
};

function unwrapRow(data: any): any {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export async function sendMessageV1(input: SendMessageV1Input): Promise<SendMessageV1Result> {
  const res = await (supabase as any).rpc("send_message_v1", {
    conversation_id: input.conversationId,
    client_msg_id: input.clientMsgId,
    body: input.body,
  });

  const error = (res as any)?.error;
  const row = unwrapRow((res as any)?.data);

  if (error) {
    throw error;
  }

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
