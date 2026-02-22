import { supabase } from "@/lib/supabase";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";

function getErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as any;
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error_description === "string") return anyErr.error_description;
    if (typeof anyErr.details === "string") return anyErr.details;
    try {
      return JSON.stringify(anyErr);
    } catch {
      return String(anyErr);
    }
  }
  return String(err);
}

function isIdempotencySchemaMissing(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return (
    msg.includes("client_msg_id") ||
    msg.includes("on conflict") ||
    msg.includes("no unique") ||
    msg.includes("no unique or exclusion constraint") ||
    msg.includes("could not find the")
  );
}

export type SendDmMessageInput = {
  conversationId: string;
  senderId: string;
  content: string;
  clientMsgId: string;

  media_url?: string | null;
  media_type?: string | null;
  duration_seconds?: number | null;
  shared_post_id?: string | null;
  shared_reel_id?: string | null;
};

type DmMessageWrite = {
  conversation_id: string;
  sender_id: string;
  content: string;
  client_msg_id: string;
  media_url?: string | null;
  media_type?: string | null;
  duration_seconds?: number | null;
  shared_post_id?: string | null;
  shared_reel_id?: string | null;
};

export async function sendDmMessage(input: SendDmMessageInput): Promise<void> {
  const conversationId = input.conversationId;
  const senderId = input.senderId;
  const clientMsgId = input.clientMsgId;
  const content = String(input.content || "").trim();

  if (!conversationId || !senderId || !clientMsgId || !content) return;

  const hashtagVerdict = await checkHashtagsAllowedForText(content);
  if (!hashtagVerdict.ok) {
    throw new Error(`HASHTAG_BLOCKED:${hashtagVerdict.blockedTags.join(", ")}`);
  }

  const payload: DmMessageWrite = {
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    client_msg_id: clientMsgId,
    media_url: input.media_url ?? null,
    media_type: input.media_type ?? null,
    duration_seconds: input.duration_seconds ?? null,
    shared_post_id: input.shared_post_id ?? null,
    shared_reel_id: input.shared_reel_id ?? null,
  };

  const { error } = await supabase
    .from("messages")
    .upsert(payload, {
      onConflict: "conversation_id,sender_id,client_msg_id",
      ignoreDuplicates: true,
    });

  if (!error) return;

  if (!isIdempotencySchemaMissing(error)) {
    throw error;
  }

  // If idempotency schema isn't applied yet, fall back to insert.
  // Before inserting, do best-effort dedupe against the most recent rows.
  try {
    const { data: recentRows, error: recentErr } = await supabase
      .from("messages")
      .select("id,created_at,content,sender_id,shared_post_id,shared_reel_id,media_url,media_type,duration_seconds")
      .eq("conversation_id", conversationId)
      .eq("sender_id", senderId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (!recentErr && Array.isArray(recentRows) && recentRows.length > 0) {
      const nowMs = Date.now();
      const hasDuplicate = recentRows.some((r: any) => {
        if (String(r?.content || "").trim() !== content) return false;

        // Match payload shape too to avoid suppressing legitimate identical text.
        if (String(r?.shared_post_id || "") !== String(input.shared_post_id || "")) return false;
        if (String(r?.shared_reel_id || "") !== String(input.shared_reel_id || "")) return false;
        if (String(r?.media_url || "") !== String(input.media_url || "")) return false;
        if (String(r?.media_type || "") !== String(input.media_type || "")) return false;

        const t = Date.parse(String(r?.created_at || ""));
        if (Number.isNaN(t)) return false;
        return nowMs - t < 10_000;
      });

      if (hasDuplicate) return;
    }
  } catch {
    // ignore; proceed to insert
  }

  const { error: fallbackError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    media_url: input.media_url ?? null,
    media_type: input.media_type ?? null,
    duration_seconds: input.duration_seconds ?? null,
    shared_post_id: input.shared_post_id ?? null,
    shared_reel_id: input.shared_reel_id ?? null,
  });

  if (fallbackError) throw fallbackError;
}
