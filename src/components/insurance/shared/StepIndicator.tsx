/**
 * Индикатор шагов для формы оформления страховки
 * @component StepIndicator
 */

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Шаги оформления страховки
 */
export const INSURANCE_STEPS = [
  "Выбор продукта",
  "Анкета",
  "Предложения",
  "Подтверждение",
  "Оплата",
] as const;

/**
 * Props для StepIndicator
 */
export interface StepIndicatorProps {
  /** Текущий шаг (0-based) */
  currentStep: number;
  /** Классы для контейнера */
  className?: string;
}

/**
 * Компонент отображения прогресса заполнения формы
 * Показывает пройденные шаги, текущий шаг и оставшиеся
 * 
 * @example
 * ```tsx
 * <StepIndicator currentStep={2} />
 * ```
 */
export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  className,
}) => {
  return (
    <div className={cn("flex items-center justify-center gap-1 py-3 overflow-x-auto", className)}>
      {INSURANCE_STEPS.map((step, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <div
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-all",
              idx < currentStep
                ? "bg-primary text-primary-foreground"
                : idx === currentStep
                ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                : "bg-muted text-muted-foreground"
            )}
            aria-label={`Шаг ${idx + 1}: ${step}`}
          >
            {idx < currentStep ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              idx + 1
            )}
          </div>
          {idx < INSURANCE_STEPS.length - 1 && (
            <div
              className={cn(
                "w-6 h-0.5 shrink-0 transition-colors",
                idx < currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default StepIndicator;
