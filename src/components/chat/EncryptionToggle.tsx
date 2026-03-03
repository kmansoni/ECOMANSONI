import { useState } from "react";
import { Lock, LockOpen, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface EncryptionToggleProps {
  enabled: boolean;
  isReady: boolean;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
  onRotate?: () => Promise<void>;
}

/**
 * Переключатель E2E шифрования в заголовке чата.
 * Показывает иконку замка и позволяет включить/выключить шифрование.
 */
export function EncryptionToggle({
  enabled,
  isReady,
  onEnable,
  onDisable,
  onRotate,
}: EncryptionToggleProps) {
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    if (!isReady || busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await onDisable();
        toast.success("Шифрование отключено");
      } else {
        await onEnable();
        toast.success("E2E шифрование включено 🔒");
      }
    } catch (e) {
      toast.error("Ошибка при изменении шифрования");
      console.error("[EncryptionToggle]", e);
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async () => {
    if (!isReady || busy || !onRotate) return;
    setBusy(true);
    try {
      await onRotate();
      toast.success("Ключ шифрования обновлён");
    } catch (e) {
      toast.error("Ошибка ротации ключа");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Кнопка ротации ключа (только когда шифрование включено) */}
      {enabled && onRotate && (
        <button
          onClick={handleRotate}
          disabled={busy || !isReady}
          title="Обновить ключ шифрования"
          className="p-1.5 rounded-full text-emerald-400 hover:bg-white/10 transition-colors disabled:opacity-40"
          aria-label="Обновить ключ шифрования"
        >
          <RotateCcw size={14} />
        </button>
      )}

      {/* Основной переключатель */}
      <button
        onClick={handleToggle}
        disabled={busy || !isReady}
        title={enabled ? "E2E шифрование включено — нажмите для отключения" : "Включить E2E шифрование"}
        aria-label={enabled ? "Отключить E2E шифрование" : "Включить E2E шифрование"}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all
          disabled:opacity-40
          ${enabled
            ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
            : "text-white/40 hover:text-white/70 hover:bg-white/10"
          }
        `}
      >
        {enabled ? (
          <Lock size={13} strokeWidth={2.5} />
        ) : (
          <LockOpen size={13} strokeWidth={2} />
        )}
        <span className="hidden sm:inline">
          {enabled ? "E2E" : "Шифрование"}
        </span>
      </button>
    </div>
  );
}
