import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useContentModeration, type ReportReason, type ContentType } from "@/hooks/useContentModeration";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  contentType: ContentType;
  contentId: string;
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Спам" },
  { value: "harassment", label: "Оскорбление или травля" },
  { value: "hate_speech", label: "Разжигание ненависти" },
  { value: "nudity", label: "Неприемлемый контент (18+)" },
  { value: "violence", label: "Насилие" },
  { value: "misinformation", label: "Ложная информация" },
  { value: "copyright", label: "Нарушение авторских прав" },
  { value: "other", label: "Другое" },
];

export function ReportSheet({ open, onClose, contentType, contentId }: ReportSheetProps) {
  const { reportContent } = useContentModeration();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    const result = await reportContent(contentType, contentId, selectedReason, description || undefined);
    setSubmitting(false);
    if (result) {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setSelectedReason(null);
        setDescription("");
        onClose();
      }, 2500);
    } else {
      toast.error("Не удалось отправить жалобу. Попробуйте позже.");
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setSelectedReason(null);
    setDescription("");
    setSubmitted(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl max-h-[90vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">Пожаловаться</h2>
              <Button variant="ghost" size="icon" className="w-9 h-9 text-white/60" onClick={handleClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 py-12 px-6 text-center"
                >
                  <CheckCircle2 className="w-16 h-16 text-green-400" />
                  <p className="text-white font-semibold text-lg">Спасибо!</p>
                  <p className="text-white/60 text-sm">
                    Мы рассмотрим вашу жалобу в ближайшее время
                  </p>
                </motion.div>
              ) : (
                <motion.div key="form" className="px-5 py-4 space-y-4 pb-safe">
                  <p className="text-sm text-white/60">Выберите причину жалобы:</p>

                  {/* Reasons */}
                  <div className="space-y-2">
                    {REASONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setSelectedReason(r.value)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors",
                          selectedReason === r.value
                            ? "bg-white/15 border border-white/30"
                            : "bg-white/5 border border-transparent hover:bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          selectedReason === r.value ? "border-white" : "border-white/30"
                        )}>
                          {selectedReason === r.value && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white" />
                          )}
                        </div>
                        <span className="text-sm text-white">{r.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Description */}
                  <Textarea
                    placeholder="Дополнительное описание (необязательно)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/30 resize-none"
                  />

                  {/* Submit */}
                  <Button
                    className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-semibold"
                    disabled={!selectedReason || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Отправить жалобу
                  </Button>

                  <div className="h-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
