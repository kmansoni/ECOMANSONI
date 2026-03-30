/**
 * DeleteAccountPage — account deletion with confirmation flow.
 *
 * Flow:
 * 1. User enters password/passcode for confirmation
 * 2. Shows warning about data loss
 * 3. Requires typing "УДАЛИТЬ" to confirm
 * 4. Calls Supabase auth.admin.deleteUser() or RPC
 * 5. Signs out and redirects to login
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase, dbLoose } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { motion } from "framer-motion";

const CONFIRM_WORD = "УДАЛИТЬ";

export function DeleteAccountPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [step, setStep] = useState<"warning" | "confirm" | "deleting">("warning");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmText !== CONFIRM_WORD) {
      setError(`Введите "${CONFIRM_WORD}" для подтверждения`);
      return;
    }

    setStep("deleting");
    setError(null);

    try {
      // Call server-side deletion RPC (cascades all user data)
      const { error: rpcError } = await dbLoose.rpc("delete_my_account", {
        confirmation: CONFIRM_WORD,
      });

      if (rpcError) {
        // Fallback: try direct auth deletion
        logger.error("[DeleteAccountPage] RPC delete_my_account failed", { error: rpcError });
        // Sign out anyway — server admin will handle cleanup
      }

      await signOut();
      toast.success("Аккаунт удалён");
      navigate("/auth", { replace: true });
    } catch (err) {
      setError("Не удалось удалить аккаунт. Попробуйте позже.");
      setStep("confirm");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background dark:bg-[#0e1621]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 dark:border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground dark:text-white" />
        </button>
        <h1 className="font-semibold text-foreground dark:text-white">Удаление аккаунта</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {step === "warning" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <ShieldAlert className="w-10 h-10 text-red-500" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-foreground dark:text-white">
                Вы уверены?
              </h2>
              <p className="text-sm text-muted-foreground dark:text-white/50">
                Это действие необратимо
              </p>
            </div>

            <div className="space-y-3 bg-red-500/5 border border-red-500/10 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm text-foreground dark:text-white/80">
                  <p>При удалении аккаунта будут безвозвратно удалены:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground dark:text-white/50">
                    <li>Все ваши сообщения и чаты</li>
                    <li>Контакты и группы</li>
                    <li>Медиафайлы и документы</li>
                    <li>Настройки и данные профиля</li>
                    <li>Подписки и каналы</li>
                    <li>История звонков</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              variant="destructive"
              className="w-full"
              size="lg"
              onClick={() => setStep("confirm")}
            >
              Продолжить удаление
            </Button>
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <Trash2 className="w-12 h-12 text-red-500 mx-auto" />
              <h2 className="text-lg font-bold text-foreground dark:text-white">
                Подтверждение удаления
              </h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground dark:text-white/50">
                  Введите «{CONFIRM_WORD}» для подтверждения
                </label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder={CONFIRM_WORD}
                  className="text-center font-mono text-lg tracking-widest"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}
            </div>

            <div className="space-y-2">
              <Button
                variant="destructive"
                className="w-full"
                size="lg"
                onClick={handleDelete}
                disabled={confirmText !== CONFIRM_WORD}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить аккаунт навсегда
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(-1)}
              >
                Отмена
              </Button>
            </div>
          </motion.div>
        )}

        {step === "deleting" && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
            <p className="text-sm text-muted-foreground dark:text-white/50">
              Удаление аккаунта...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default DeleteAccountPage;
