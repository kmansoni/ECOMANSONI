import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { BRAND_HALO_DARK, BRAND_HALO_LIGHT, type GlassTokens } from "./glassTokens";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  tokens: GlassTokens;
  /** Если true — рисуется halo-glow за карточкой (как в AuthPage). */
  halo?: boolean;
  /** По умолчанию false — использует градиент glassCardSoft и radiusLg.
   *  true — использует rounded-[1.5rem]/rounded-[2rem] как в AuthPage (для совместимости). */
  authStyle?: boolean;
  /** @deprecated Используйте authStyle=true вместо этого */
  rounded?: "md" | "lg" | "xl";
  className?: string;
}

/**
 * Стеклянная карточка:
 *  - по умолчанию: glassCardSoft + radiusLg + p-4
 *  - с authStyle: как в AuthPage (rounded-[1.5rem] sm:rounded-[2rem])
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { tokens, halo = false, authStyle = false, rounded, className, children, ...rest },
  ref,
) {
  const isAuthStyle = authStyle || rounded !== undefined;
  const getRadiusClass = () => {
    if (!rounded || rounded === "lg") return "rounded-[1.5rem] sm:rounded-[2rem]";
    if (rounded === "xl") return "rounded-[2.2rem]";
    if (rounded === "md") return "rounded-[1.25rem]";
    return "rounded-[1.5rem] sm:rounded-[2rem]";
  };
  return (
    <div className="relative w-full">
      {halo && (
        <div
          className={cn(
            "pointer-events-none absolute -inset-4 sm:-inset-6 rounded-[2.2rem] blur-2xl opacity-70",
            tokens.isDark ? BRAND_HALO_DARK : BRAND_HALO_LIGHT,
          )}
          aria-hidden
        />
      )}
      <div
        ref={ref}
        className={cn(
          "relative border backdrop-blur-2xl overflow-hidden p-4",
          isAuthStyle
            ? `${getRadiusClass()} ${tokens.glassCard} ${tokens.glassCardShadow}`
            : `${tokens.radiusLg} ${tokens.glassCardSoft}`,
          className,
        )}
        {...rest}
      >
        {isAuthStyle && (
          /* Внутренние "линии света" по краям как в AuthPage */
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                "linear-gradient(180deg,rgba(255,255,255,0.10) 0%,transparent 35%,transparent 65%,rgba(255,255,255,0.04) 100%)",
            }}
          />
        )}
        <div className="relative">{children}</div>
      </div>
    </div>
  );
});

