import { dbLoose } from "@/lib/supabase";
import { supabase } from "@/integrations/supabase/client";

export interface FollowRequest {
  id: string;
  requester_id: string;
  target_id: string;
  status: string;
  created_at: string;
  requester?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
  };
}

export async function getRequests(targetId: string): Promise<FollowRequest[]> {
  const { data } = await dbLoose
    .from("follow_requests")
    .select("*, profiles!follow_requests_requester_id_fkey(id, username, full_name, avatar_url)")
    .eq("target_id", targetId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({
    ...r,
    requester: r.profiles,
  }));
}

export async function acceptRequest(requestId: string): Promise<void> {
  const { error } = await dbLoose
    .from("follow_requests")
    .update({ status: "accepted" })
    .eq("id", requestId);
  if (error) throw error;
}

export async function rejectRequest(requestId: string): Promise<void> {
  const { error } = await dbLoose
    .from("follow_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);
  if (error) throw error;
}

export async function sendRequest(requesterId: string, targetId: string): Promise<void> {
  const { error } = await dbLoose
    .from("follow_requests")
    .upsert({ requester_id: requesterId, target_id: targetId, status: "pending" });
  if (error) throw error;
}

export async function cancelRequest(requesterId: string, targetId: string): Promise<void> {
  const { error } = await dbLoose
    .from("follow_requests")
    .delete()
    .eq("requester_id", requesterId)
    .eq("target_id", targetId);
  if (error) throw error;
}
