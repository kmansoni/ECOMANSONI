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
  /** Emoji reaction sent by the current viewer (if any) */
  myReaction?: string;
}

// ---------------------------------------------------------------------------
// Note reactions — stored in `note_reactions` table:
//   (reactor_id, note_owner_id, emoji, created_at)
//   PK: (reactor_id, note_owner_id) — one reaction per viewer per note
// ---------------------------------------------------------------------------

export async function sendNoteReaction(
  reactorId: string,
  noteOwnerId: string,
  emoji: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from("note_reactions")
    .upsert(
      { reactor_id: reactorId, note_owner_id: noteOwnerId, emoji },
      { onConflict: "reactor_id,note_owner_id" }
    );
  if (error) throw error;
}

export async function deleteNoteReaction(
  reactorId: string,
  noteOwnerId: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from("note_reactions")
    .delete()
    .eq("reactor_id", reactorId)
    .eq("note_owner_id", noteOwnerId);
  if (error) throw error;
}

/** Fetch reactions sent by `reactorId` for a list of note owners */
export async function getNoteReactions(
  reactorId: string,
  noteOwnerIds: string[]
): Promise<Record<string, string>> {
  if (!noteOwnerIds.length) return {};
  const { data } = await (supabase as any)
    .from("note_reactions")
    .select("note_owner_id, emoji")
    .eq("reactor_id", reactorId)
    .in("note_owner_id", noteOwnerIds);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ note_owner_id: string; emoji: string }>) {
    map[row.note_owner_id] = row.emoji;
  }
  return map;
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
