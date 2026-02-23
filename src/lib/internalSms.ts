import { supabase } from "@/integrations/supabase/client";

export type InternalSmsMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
};

export async function sendInternalSms(recipientId: string, body: string) {
  const { data, error } = await (supabase as any).rpc("send_internal_sms_v1", {
    p_recipient_id: recipientId,
    p_body: body,
  });
  return { data, error };
}

export async function listInternalSmsBetween(userA: string, userB: string, limit = 100) {
  const { data, error } = await (supabase as any)
    .from("internal_sms_messages")
    .select("id, sender_id, recipient_id, body, delivered_at, read_at, created_at")
    .or(
      `and(sender_id.eq.${userA},recipient_id.eq.${userB}),and(sender_id.eq.${userB},recipient_id.eq.${userA})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data: (data as InternalSmsMessage[] | null) ?? null, error };
}

export async function markInternalSmsRead(messageId: string) {
  const { data, error } = await (supabase as any)
    .from("internal_sms_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("id")
    .maybeSingle();

  return { data, error };
}

