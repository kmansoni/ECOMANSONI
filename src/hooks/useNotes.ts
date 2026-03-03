import { supabase } from "@/integrations/supabase/client";

export interface StatusNote {
  user_id: string;
  text: string;
  emoji?: string;
  expires_at: string;
  created_at: string;
  profile?: {
    id: string;
    username: string;
    avatar_url?: string;
  };
}

export async function createNote(userId: string, text: string, emoji?: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await (supabase as any)
    .from("user_status_notes")
    .upsert({
      user_id: userId,
      text,
      emoji: emoji ?? null,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function deleteNote(userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("user_status_notes")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

export async function getNotes(userIds: string[]): Promise<StatusNote[]> {
  if (!userIds.length) return [];
  const { data } = await (supabase as any)
    .from("user_status_notes")
    .select("*, profiles(id, username, avatar_url)")
    .in("user_id", userIds)
    .gt("expires_at", new Date().toISOString());
  return (data ?? []).map((n: any) => ({ ...n, profile: n.profiles }));
}
