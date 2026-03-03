import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { CalculatorStep } from "@/types/insurance";

interface StepperFormProps {
  steps: CalculatorStep[];
  currentStep: number;
  onStepChange?: (step: number) => void;
  orientation?: "horizontal" | "vertical";
}

/**
 * Переиспользуемый компонент stepper для многошаговых форм
 */
export function StepperForm({
  steps,
  currentStep,
  onStepChange,
  orientation = "horizontal",
}: StepperFormProps) {
  if (orientation === "vertical") {
    return (
      <div className="flex flex-col gap-0">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all flex-shrink-0",
                    isCompleted
                      ? "bg-violet-600 text-white cursor-pointer hover:bg-violet-500"
                      : isCurrent
                      ? "bg-violet-600/20 border-2 border-violet-500 text-violet-400"
                      : "bg-white/5 border border-white/10 text-white/30",
                  )}
                  onClick={() => isCompleted && onStepChange?.(index)}
                  disabled={!isCompleted}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </button>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 h-8 mt-1",
                      isCompleted ? "bg-violet-600" : "bg-white/10",
                    )}
                  />
                )}
              </div>
              <div className="pb-8">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-white" : isCompleted ? "text-white/70" : "text-white/30",
                  )}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-xs text-white/40 mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Горизонтальный вариант
  return (
    <div className="flex items-center">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all flex-shrink-0",
                isCompleted
                  ? "bg-violet-600 text-white cursor-pointer hover:bg-violet-500"
                  : isCurrent
                  ? "bg-violet-600/20 border-2 border-violet-500 text-violet-400"
                  : "bg-white/5 border border-white/10 text-white/30",
              )}
              onClick={() => isCompleted && onStepChange?.(index)}
              disabled={!isCompleted}
              title={step.title}
            >
              {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
            </button>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-1",
                  isCompleted ? "bg-violet-600" : "bg-white/10",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
