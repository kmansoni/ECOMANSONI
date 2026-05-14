import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { LegalModal } from "./LegalModal";
import type { ThemeTokens } from "../types";

type LegalType = "terms" | "privacy";

interface SecurityFooterProps {
  tokens: ThemeTokens;
  onOpenLegal?: (type: LegalType) => void;
}

export function SecurityFooter({ tokens, onOpenLegal }: SecurityFooterProps) {
  const [legalModal, setLegalModal] = useState<LegalType | null>(null);

  const handleOpen = (type: LegalType) => {
    if (onOpenLegal) {
      onOpenLegal(type);
    } else {
      setLegalModal(type);
    }
  };

  return (
    <>
      <div className="mt-4 flex-shrink-0 pb-safe">
        {/* Security badges - touch-friendly */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <span className="flex items-center gap-1.5 text-xs text-cyan-400">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            E2E
          </span>
          <span className="flex items-center gap-1.5 text-xs text-teal-400">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            RLS
          </span>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            TLS 1.3
          </span>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            AES-256
          </span>
        </div>
        {/* Legal text */}
        <p className="text-xs leading-relaxed text-white/40">
          Продолжая, вы соглашаетесь с{" "}
          <button
            type="button"
            onClick={() => handleOpen("terms")}
            className="text-white/70 underline underline-offset-2 hover:text-cyan-400 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center"
            aria-label="Открыть Условия использования"
          >
            Условиями использования
          </button>
          {" "}и{" "}
          <button
            type="button"
            onClick={() => handleOpen("privacy")}
            className="text-white/70 underline underline-offset-2 hover:text-cyan-400 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center"
            aria-label="Открыть Политику конфиденциальности"
          >
            Политикой конфиденциальности
          </button>
          .
        </p>
      </div>

      {legalModal && (
        <LegalModal isOpen={true} onClose={() => setLegalModal(null)} type={legalModal} />
      )}
    </>
  );
}
