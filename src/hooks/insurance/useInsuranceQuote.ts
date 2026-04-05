import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { insuranceApi } from '@/lib/insurance/api';
import { calculateOsagoPremium } from '@/lib/insurance/calculations';
import type { InsuranceCategory } from '@/types/insurance';
import type {
  ProviderCode,
  ProviderOffer,
  AggregatedQuoteResponse,
  FailedProvider,
} from '@/types/insurance-providers';

function estimateLocal(category: InsuranceCategory, params: Record<string, unknown>): number | null {
  if (category === 'osago') {
    // Базовый расчёт через формулу ЦБ, если есть нужные поля
    const p = params;
    if (p.engine_power && p.driver_age && p.driver_experience_years) {
      const vt = (p.vehicle_type as string) || 'car';
      return calculateOsagoPremium({
        vehicle_type: vt as 'car' | 'truck' | 'motorcycle' | 'bus',
        engine_power: p.engine_power as number,
        region_code: (p.region_code as string) || '77',
        kbm_class: (p.kbm_class as number) ?? 3,
        driver_age: p.driver_age as number,
        driver_experience_years: p.driver_experience_years as number,
        multi_driver: (p.multi_driver as boolean) ?? false,
        usage_period_months: (p.usage_period_months as number) ?? 12,
        has_trailer: (p.has_trailer as boolean) ?? false,
        owner_type: (p.owner_type as 'individual' | 'legal_entity') ?? 'individual',
      });
    }
    return 5800; // грубый средний ОСАГО
  }

  if (category === 'kasko') {
    const price = (params.vehicle_price as number) ?? 1_500_000;
    return Math.round(price * 0.055);
  }
  if (category === 'dms') return 35_000;
  if (category === 'travel') return 2_500;
  if (category === 'property') return 8_000;

  return null;
}

export function useInsuranceQuote(category: InsuranceCategory) {
  const [localEstimate, setLocalEstimate] = useState<number | null>(null);
  const sessionRef = useRef<string | null>(null);

  const mutation = useMutation<
    AggregatedQuoteResponse,
    Error,
    { params: Record<string, unknown>; preferred?: ProviderCode[] }
  >({
    mutationFn: ({ params, preferred }) =>
      insuranceApi.requestQuotes(category, params, preferred),
    onSuccess(data) {
      sessionRef.current = data.session_id;
    },
  });

  const requestQuotes = useCallback((
    params: Record<string, unknown>,
    preferred?: ProviderCode[],
  ) => {
    const est = estimateLocal(category, params);
    setLocalEstimate(est);

    mutation.mutate({ params, preferred });
  }, [category, mutation]);

  const reset = useCallback(() => {
    setLocalEstimate(null);
    sessionRef.current = null;
    mutation.reset();
  }, [mutation]);

  return {
    requestQuotes,
    localEstimate,
    offers: (mutation.data?.offers ?? []) as ProviderOffer[],
    data: mutation.data ?? null,
    sessionId: sessionRef.current,
    isLoading: mutation.isPending,
    hasRealQuotes: mutation.data?.has_real_quotes ?? false,
    failedProviders: (mutation.data?.providers_failed ?? []) as FailedProvider[],
    calculationTime: mutation.data?.calculation_time_ms,
    error: mutation.error,
    reset,
  };
}
