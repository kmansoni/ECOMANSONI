import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Calculator, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CalculatorStep, CalculationResponse } from "@/types/insurance";

interface BaseCalculatorProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  steps: CalculatorStep[];
  onCalculate: (values: Record<string, unknown>) => void;
  results?: CalculationResponse | null;
  isLoading?: boolean;
  renderResults?: (results: CalculationResponse) => React.ReactNode;
  renderFields?: (step: CalculatorStep, values: Record<string, unknown>, onChange: (name: string, value: unknown) => void) => React.ReactNode;
}

/**
 * Базовый компонент-шаблон для всех калькуляторов страхования
 */
export function BaseCalculator({
  title,
  description,
  icon,
  steps,
  onCalculate,
  results,
  isLoading = false,
  renderResults,
  renderFields,
}: BaseCalculatorProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalSteps = steps.length;
  const progress = ((currentStep + 1) / totalSteps) * 100;
  const isLastStep = currentStep === totalSteps - 1;
  const currentStepData = steps[currentStep];

  const handleFieldChange = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validateStep = (): boolean => {
    const step = steps[currentStep];
    if (step.validation) {
      const stepErrors = step.validation(values);
      if (stepErrors) {
        setErrors(stepErrors);
        return false;
      }
    }

    // Простая валидация обязательных полей
    const newErrors: Record<string, string> = {};
    for (const field of step.fields) {
      if (field.required && !values[field.name]) {
        newErrors[field.name] = `Поле "${field.label}" обязательно`;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (isLastStep) {
      onCalculate(values);
    } else {
      setCurrentStep((prev) => prev + 1);
      setErrors({});
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setErrors({});
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 flex-shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {description && (
            <p className="text-sm text-white/60 mt-0.5">{description}</p>
          )}
        </div>
      </div>

      {/* Прогресс и навигация по шагам */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-white/60">
          <span>Шаг {currentStep + 1} из {totalSteps}</span>
          <span>{currentStepData.title}</span>
        </div>
        <Progress value={progress} className="h-1.5 bg-white/10" />

        {/* Точки шагов */}
        <div className="flex gap-2 pt-1">
          {steps.map((step, idx) => (
            <button
              key={step.id}
              type="button"
              onClick={() => idx < currentStep && setCurrentStep(idx)}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all",
                idx < currentStep
                  ? "bg-violet-500 cursor-pointer"
                  : idx === currentStep
                  ? "bg-violet-400"
                  : "bg-white/10 cursor-default",
              )}
              aria-label={`Шаг ${idx + 1}: ${step.title}`}
            />
          ))}
        </div>
      </div>

      {/* Контент шага */}
      <Card className="bg-white/[0.02] border-white/[0.06]">
        <CardContent className="pt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <h3 className="text-base font-medium text-white">
                  {currentStepData.title}
                </h3>
                {currentStepData.description && (
                  <p className="text-sm text-white/60 mt-1">
                    {currentStepData.description}
                  </p>
                )}
              </div>

              {/* Поля формы */}
              {renderFields ? (
                renderFields(currentStepData, values, handleFieldChange)
              ) : (
                <div className="space-y-3">
                  {currentStepData.fields.map((field) => (
                    <div key={field.name}>
                      <label className="block text-sm text-white/70 mb-1">
                        {field.label}
                        {field.required && (
                          <span className="text-red-400 ml-1">*</span>
                        )}
                      </label>
                      {field.helpText && (
                        <p className="text-xs text-white/40 mb-1">{field.helpText}</p>
                      )}
                      {errors[field.name] && (
                        <p className="text-xs text-red-400 mb-1">
                          {errors[field.name]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Кнопки навигации */}
      <div className="flex gap-3">
        {currentStep > 0 && (
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isLoading}
            className="flex-1 border-white/10 text-white/70 hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Назад
          </Button>
        )}
        <Button
          onClick={handleNext}
          disabled={isLoading}
          className={cn(
            "flex-1 bg-violet-600 hover:bg-violet-500 text-white",
            currentStep === 0 && "w-full",
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Расчёт...
            </>
          ) : isLastStep ? (
            <>
              <Calculator className="w-4 h-4 mr-2" />
              Рассчитать
            </>
          ) : (
            <>
              Далее
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>

      {/* Результаты */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl bg-white/5" />
            ))}
          </motion.div>
        )}

        {!isLoading && results && renderResults && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {renderResults(results)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
