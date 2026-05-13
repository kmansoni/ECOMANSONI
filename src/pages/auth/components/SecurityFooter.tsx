import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import type { ThemeTokens } from "../types";

export function SecurityFooter({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div className="mt-4 flex-shrink-0">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] ${tokens.textFaint} mb-2`}>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-cyan-400 shrink-0" />
          E2E
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-teal-400 shrink-0" />
          RLS
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
          TLS 1.3
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-green-400 shrink-0" />
          AES-256
        </span>
      </div>
      <p className={`text-[10px] leading-relaxed ${tokens.textFaint}`}>
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
