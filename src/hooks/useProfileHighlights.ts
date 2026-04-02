import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getHighlights, deleteHighlight } from "@/repositories";
import type { Highlight } from "@/repositories";

export function useProfileHighlights(userId: string | undefined) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightToDelete, setHighlightToDelete] = useState<string | null>(null);

  const loadHighlights = useCallback(async () => {
    if (!userId) return;
    setHighlightsLoading(true);
    try {
      const data = await getHighlights(userId);
      setHighlights(data);
    } catch (error) {
      logger.error("profile.load_highlights_failed", { error, userId });
    } finally {
      setHighlightsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadHighlights();
  }, [loadHighlights]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    try {
      await deleteHighlight(id);
      setHighlights(prev => prev.filter(h => h.id !== id));
      toast.success("Подборка удалена");
    } catch (error) {
      logger.error("profile.delete_highlight_failed", { error, highlightId: id });
      toast.error("Не удалось удалить подборку");
    }
  }, []);

  return {
    highlights,
    highlightsLoading,
    highlightToDelete,
    setHighlightToDelete,
    loadHighlights,
    handleDeleteHighlight,
  };
}
