import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import type { ThemeTokens } from "../types";

export function SecurityFooter({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div className="mt-4 flex-shrink-0">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] ${tokens.textFaint} mb-3`}>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          E2E-шифрование (Mansoni Protocol)
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-400 shrink-0" />
          Supabase RLS + JWT
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          TLS 1.3 в транзите
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-green-400 shrink-0" />
          AES-256 на устройстве
        </span>
      </div>
      <p className={`text-[11px] leading-relaxed ${tokens.textFaint}`}>
        Продолжая, вы соглашаетесь с{" "}
        <Link to="/legal/terms" className={`${tokens.textPrimary} underline underline-offset-2`}>
          Условиями использования
        </Link>
        {" "}и{" "}
        <Link to="/legal/privacy" className={`${tokens.textPrimary} underline underline-offset-2`}>
          Политикой конфиденциальности
        </Link>
        .
      </p>
    </div>
  );
}
