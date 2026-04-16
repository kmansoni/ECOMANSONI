import { dbLoose } from "@/lib/supabase";

export interface Guide {
  id: string;
  author_id: string;
  title: string;
  description?: string;
  cover_url?: string;
  type: string;
  created_at: string;
}

export interface GuideItem {
  id: string;
  guide_id: string;
  content_type: string;
  content_id: string;
  note?: string;
  position: number;
}

export async function getGuides(authorId: string): Promise<Guide[]> {
  const { data } = await dbLoose
    .from("guides")
    .select("*")
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getGuideItems(guideId: string): Promise<GuideItem[]> {
  const { data } = await dbLoose
    .from("guide_items")
    .select("*")
    .eq("guide_id", guideId)
    .order("position");
  return data ?? [];
}

export async function createGuide(params: {
  author_id: string;
  title: string;
  description?: string;
  cover_url?: string;
  type?: string;
}): Promise<Guide> {
  const { data, error } = await dbLoose
    .from("guides")
    .insert(params)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGuide(guideId: string): Promise<void> {
  const { error } = await dbLoose
    .from("guides")
    .delete()
    .eq("id", guideId);
  if (error) throw error;
}

export async function addToGuide(params: {
  guide_id: string;
  content_type: string;
  content_id: string;
  note?: string;
  position?: number;
}): Promise<GuideItem> {
  const { data, error } = await dbLoose
    .from("guide_items")
    .insert(params)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFromGuide(itemId: string): Promise<void> {
  const { error } = await dbLoose
    .from("guide_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}
