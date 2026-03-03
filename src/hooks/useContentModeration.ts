import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { checkText } from "@/lib/moderation/textFilter";

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "nudity"
  | "violence"
  | "misinformation"
  | "copyright"
  | "other";

export type ContentType = "post" | "reel" | "story" | "comment" | "message" | "profile";

export interface ContentReport {
  id: string;
  reporter_id: string;
  content_type: ContentType;
  content_id: string;
  reason: ReportReason;
  description?: string;
  status: "pending" | "reviewed" | "action_taken" | "dismissed";
  created_at: string;
}

export function useContentModeration() {
  const { user } = useAuth();

  const reportContent = useCallback(
    async (
      contentType: ContentType,
      contentId: string,
      reason: ReportReason,
      description?: string
    ): Promise<ContentReport | null> => {
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from("content_reports")
        .insert({
          reporter_id: user.id,
          content_type: contentType,
          content_id: contentId,
          reason,
          description: description || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Ошибка отправки жалобы:", error);
        return null;
      }
      return data as ContentReport;
    },
    [user]
  );

  const checkContent = useCallback(
    (text: string): { safe: boolean; flags: string[] } => {
      const result = checkText(text);
      return { safe: result.safe, flags: result.reasons };
    },
    []
  );

  const getMyReports = useCallback(async (): Promise<ContentReport[]> => {
    if (!user) return [];
    const { data, error } = await (supabase as any)
      .from("content_reports")
      .select("*")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Ошибка загрузки жалоб:", error);
      return [];
    }
    return data as ContentReport[];
  }, [user]);

  return {
    reportContent,
    checkContent,
    getMyReports,
  };
}
