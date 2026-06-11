import { supabase } from "@/integrations/supabase/client";

export async function scheduleAttachmentTTL(
  attachmentId: string,
  options: { ttlDays: number },
): Promise<void> {
  const { error } = await supabase.rpc("schedule_attachment_ttl", {
    attachment_id: attachmentId,
    delete_after_days: options.ttlDays,
  });

  if (error) {
    throw error;
  }
}

export async function purgeExpiredAttachments(
  options: { preservePinned?: boolean } = {},
): Promise<void> {
  let query = supabase
    .from("chat_attachments")
    .delete()
    .lt("expires_at", new Date().toISOString());

  if (options.preservePinned) {
    query = query.eq("pinned", false);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
}
