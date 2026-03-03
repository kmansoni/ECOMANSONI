import { Lock } from "lucide-react";

interface EncryptionBadgeProps {
  /** Дополнительные CSS-классы */
  className?: string;
}

/**
 * Маленький бейдж 🔒 для зашифрованных сообщений.
 * При наведении показывает подсказку "Сообщение зашифровано end-to-end".
 */
export function EncryptionBadge({ className = "" }: EncryptionBadgeProps) {
  return (
    <span
      title="Сообщение зашифровано end-to-end"
      className={`inline-flex items-center text-emerald-400 opacity-80 ${className}`}
      aria-label="Сообщение зашифровано end-to-end"
    >
      <Lock size={11} strokeWidth={2.5} />
    </span>
  );
}
