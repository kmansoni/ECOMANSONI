import { dbLoose } from "@/lib/supabase";
import { supabase } from "@/integrations/supabase/client";

export async function setNote(userId: string, targetId: string, note: string): Promise<void> {
  const { error } = await dbLoose
    .from("user_notes")
    .upsert({ user_id: userId, target_id: targetId, note, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function getNote(userId: string, targetId: string): Promise<string | null> {
  const { data } = await dbLoose
    .from("user_notes")
    .select("note")
    .eq("user_id", userId)
    .eq("target_id", targetId)
    .single();
  return data?.note ?? null;
}

export async function deleteNote(userId: string, targetId: string): Promise<void> {
  const { error } = await dbLoose
    .from("user_notes")
    .delete()
    .eq("user_id", userId)
    .eq("target_id", targetId);
  if (error) throw error;
}
