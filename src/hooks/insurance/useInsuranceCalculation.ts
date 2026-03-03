import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { insuranceApi } from "@/lib/insurance/api";
import type { InsuranceCategory, CalculationResponse } from "@/types/insurance";
import type { InsuranceApiError } from "@/types/insurance";

/**
 * Хук для работы с калькулятором страхования
 */
export function useInsuranceCalculation(category: InsuranceCategory) {
  const [results, setResults] = useState<CalculationResponse | null>(null);

  const mutation = useMutation<CalculationResponse, InsuranceApiError, Record<string, unknown>>({
    mutationFn: (data) => insuranceApi.calculateQuote(category, data as any),
    onSuccess: (data) => {
      setResults(data);
    },
  });

  const reset = () => {
    setResults(null);
    mutation.reset();
  };

  return {
    calculate: mutation.mutate,
    calculateAsync: mutation.mutateAsync,
    results,
    isCalculating: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    reset,
  };
}
