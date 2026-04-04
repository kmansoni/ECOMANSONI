/**
 * ReportSheet — Telegram-style report dialog for messages/users/groups.
 *
 * Categories match Telegram's report reasons.
 * Sends report to Supabase `reports` table.
 */

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Flag, AlertTriangle, Ban, ShieldX, Skull, MessageSquareWarning, Bug } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export type ReportTarget = "message" | "user" | "group" | "channel";

interface ReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTarget;
  targetId: string;
  /** Optional: specific message content for context */
  messagePreview?: string;
}

const REPORT_REASONS = [
  { id: "spam", label: "Спам", icon: Ban },
  { id: "violence", label: "Насилие", icon: Skull },
  { id: "harassment", label: "Оскорбления", icon: MessageSquareWarning },
  { id: "illegal", label: "Незаконный контент", icon: ShieldX },
  { id: "nsfw", label: "Порнография", icon: AlertTriangle },
  { id: "scam", label: "Мошенничество", icon: Flag },
  { id: "other", label: "Другое", icon: Bug },
] as const;

type ReportReason = typeof REPORT_REASONS[number]["id"];

export function ReportSheet({ open, onOpenChange, targetType, targetId, messagePreview }: ReportSheetProps) {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason || !user) return;

    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("reports").insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason: selectedReason,
        details: details.trim() || null,
        message_preview: messagePreview?.slice(0, 200) || null,
        status: "pending",
      });

      if (error) {
        // Table may not exist — fallback to console
        logger.error("report-sheet: supabase insert failed", {
          targetType,
          targetId,
          reason: selectedReason,
          error,
        });
        toast.error("Не удалось отправить жалобу. Попробуйте позже.");
        return;
      }

      toast.success("Жалоба отправлена. Спасибо!");
      onOpenChange(false);
      setSelectedReason(null);
      setDetails("");
    } catch (error) {
      logger.error("report-sheet: submit failed", {
        targetType,
        targetId,
        reason: selectedReason,
        error,
      });
      toast.error("Не удалось отправить жалобу");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground dark:text-white flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-400" />
            Пожаловаться
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Message preview */}
          {messagePreview && (
            <div className="px-3 py-2 rounded-xl bg-muted/30 dark:bg-white/5 border-l-2 border-red-400/50">
              <p className="text-xs text-muted-foreground dark:text-white/40 mb-1">Сообщение:</p>
              <p className="text-sm text-foreground dark:text-white/70 line-clamp-2">{messagePreview}</p>
            </div>
          )}

          {/* Reason selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground dark:text-white">Причина жалобы</p>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_REASONS.map((reason) => {
                const Icon = reason.icon;
                const isSelected = selectedReason === reason.id;
                return (
                  <motion.button
                    key={reason.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedReason(reason.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      isSelected
                        ? "border-red-500/50 bg-red-500/10 text-red-400"
                        : "border-border/40 dark:border-white/10 text-muted-foreground dark:text-white/50 hover:bg-muted/30 dark:hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{reason.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Details */}
          {selectedReason && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="space-y-2"
            >
              <p className="text-sm text-muted-foreground dark:text-white/50">
                Дополнительные детали (необязательно)
              </p>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Опишите проблему подробнее..."
                rows={3}
                maxLength={500}
                className="resize-none"
              />
            </motion.div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!selectedReason || submitting}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            {submitting ? "Отправка..." : "Отправить жалобу"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
