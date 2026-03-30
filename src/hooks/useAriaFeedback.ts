import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dbLoose } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export interface AriaFeedbackPayload {
  assistant_msg_id: string;
  rating: 1 | -1;
  intent?: string;
  model_used?: string;
  conversation_id?: string;
}

/**
 * useAriaFeedback
 *
 * Saves thumbs-up / thumbs-down ratings on ARIA assistant responses
 * to the ai_feedback table. Used by the learning loop to improve
 * memory relevance and for future RLHF batches.
 */
export function useAriaFeedback() {
  const saveFeedback = useCallback(
    async (payload: AriaFeedbackPayload): Promise<boolean> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return false;

        const { error } = await dbLoose.from("ai_feedback").insert({
          user_id: user.id,
          assistant_msg_id: payload.assistant_msg_id,
          rating: payload.rating,
          intent: payload.intent ?? null,
          model_used: payload.model_used ?? null,
          conversation_id: payload.conversation_id ?? null,
          created_at: new Date().toISOString(),
        });

        if (error) {
          logger.warn("[useAriaFeedback] insert error", { error });
          return false;
        }

        return true;
      } catch (err) {
        logger.error("[useAriaFeedback] unexpected error", { error: err });
        return false;
      }
    },
    []
  );

  return { saveFeedback };
}
