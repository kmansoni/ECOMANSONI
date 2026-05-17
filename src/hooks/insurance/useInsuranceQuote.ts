import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { insuranceApi } from '@/lib/insurance/api';
import {
  calculateOsagoPremium,
  calculateKaskoPremium,
  calculateDmsPremium,
  calculateTravelPremium,
  calculatePropertyPremium,
  calculateMortgagePremium,
  calculateLifePremium,
} from '@/lib/insurance/calculations';
import type {
  InsuranceCategory,
  KaskoCalculationRequest,
  DmsCalculationRequest,
  TravelCalculationRequest,
  PropertyCalculationRequest,
  MortgageCalculationRequest,
  LifeCalculationRequest,
} from '@/types/insurance';
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
    // Если недостаточно данных для точного расчёта, возвращаем null вместо приблизительного значения
    // чтобы не вводить пользователя в заблуждение
    return null;
  }

  if (category === 'kasko') {
    // Проверяем наличие обязательных параметров для расчёта КАСКО
    const price = params.vehicle_price as number;
    if (price === undefined || price === null) return null;

    const request: KaskoCalculationRequest = {
      vehicle_make: (params.vehicle_make as string | undefined) ?? '',
      vehicle_model: (params.vehicle_model as string | undefined) ?? '',
      vehicle_year: params.vehicle_year as number ?? new Date().getFullYear() - 5,
      vehicle_price: price,
      engine_power: (params.engine_power as number | undefined) ?? 150,
      driver_age: params.driver_age as number ?? 35,
      driver_experience_years: params.driver_experience_years as number ?? 10,
      kbm_class: params.kbm_class as number ?? 3,
      region_code: params.region_code as string ?? '77',
      coverage_type: params.coverage_type as 'total_loss_only' | 'partial' | 'full' ?? 'full',
      has_anti_theft: params.has_anti_theft as boolean ?? false,
      garage_parking: params.garage_parking as boolean ?? false,
      franchise_amount: params.franchise_amount as number ?? 0,
      additional_options: params.additional_options as string[] ?? [],
    };
    return calculateKaskoPremium(request);
  }

  if (category === 'dms') {
    // Проверяем наличие обязательных параметров для расчёта ДМС
    const age = params.age as number;
    if (age === undefined || age === null) return null;

    const request: DmsCalculationRequest = {
      age,
      gender: params.gender as 'male' | 'female' ?? 'male',
      program_type: params.program_type as 'basic' | 'standard' | 'premium' | 'vip' ?? 'standard',
      region_code: params.region_code as string ?? '77',
      has_chronic_diseases: params.has_chronic_diseases as boolean ?? false,
      include_dental: params.include_dental as boolean ?? false,
      include_emergency: params.include_emergency as boolean ?? false,
      include_consultation: params.include_consultation as boolean ?? false,
      employees_count: params.employees_count as number ?? undefined,
    };
    return calculateDmsPremium(request);
  }

  if (category === 'travel') {
    // Проверяем наличие обязательных параметров для расчёта travel
    const travelersCount = params.travelers_count as number;
    const tripDurationDays = params.trip_duration_days as number;
    if (travelersCount === undefined || travelersCount === null ||
        tripDurationDays === undefined || tripDurationDays === null) return null;

    const request: TravelCalculationRequest = {
      travelers_count: travelersCount,
      trip_duration_days: tripDurationDays,
      traveler_ages: params.traveler_ages as number[] ?? Array(travelersCount).fill(30),
      destination_country: params.destination_country as string ?? 'TH',
      coverage_amount: params.coverage_amount as number ?? 50000,
      trip_purpose: (params.trip_purpose as 'tourism' | 'business' | 'study' | 'work' | undefined) ?? 'tourism',
      sport_activities: params.sport_activities as boolean ?? false,
      include_cancellation: params.include_cancellation as boolean ?? false,
      include_luggage: params.include_luggage as boolean ?? false,
      include_accident: params.include_accident as boolean ?? false,
      multi_trip: params.multi_trip as boolean ?? false,
    };
    return calculateTravelPremium(request);
  }

  if (category === 'property') {
    // Проверяем наличие обязательных параметров для расчёта property
    const propertyValue = params.property_value as number;
    if (propertyValue === undefined || propertyValue === null) return null;

    const request: PropertyCalculationRequest = {
      property_value: propertyValue,
      coverage_amount: (params.coverage_amount as number | undefined) ?? propertyValue,
      property_area: params.property_area as number ?? 50,
      construction_year: params.construction_year as number ?? new Date().getFullYear() - 10,
      construction_material: params.construction_material as 'brick' | 'monolith' | 'panel' | 'wood' | 'other' ?? 'brick',
      property_type: params.property_type as 'apartment' | 'house' | 'commercial' ?? 'apartment',
      floor: params.floor as number ?? 1,
      total_floors: params.total_floors as number ?? 5,
      region_code: params.region_code as string ?? '77',
      include_interior: params.include_interior as boolean ?? false,
      include_liability: params.include_liability as boolean ?? false,
      include_movables: params.include_movables as boolean ?? false,
    };
    return calculatePropertyPremium(request);
  }

  if (category === 'mortgage') {
    // Проверяем наличие обязательных параметров для расчёта mortgage
    const loanAmount = params.loan_amount as number;
    const propertyValue = params.property_value as number;
    if (loanAmount === undefined || loanAmount === null ||
        propertyValue === undefined || propertyValue === null) return null;

    const request: MortgageCalculationRequest = {
      loan_amount: loanAmount,
      loan_term_years: (params.loan_term_years as number | undefined) ?? 15,
      property_value: propertyValue,
      borrower_age: params.borrower_age as number ?? 35,
      borrower_gender: params.borrower_gender as 'male' | 'female' ?? 'male',
      bank_name: params.bank_name as string ?? 'sberbank',
      region_code: params.region_code as string ?? '77',
      include_property: params.include_property as boolean ?? true,
      include_life: params.include_life as boolean ?? true,
      include_title: params.include_title as boolean ?? true,
    };
    return calculateMortgagePremium(request);
  }

  if (category === 'life') {
    // Проверяем наличие обязательных параметров для расчёта life
    const coverageAmount = params.coverage_amount as number;
    const age = params.age as number;
    if (coverageAmount === undefined || coverageAmount === null ||
        age === undefined || age === null) return null;

    const request: LifeCalculationRequest = {
      coverage_amount: coverageAmount,
      age,
      gender: params.gender as 'male' | 'female' ?? 'male',
      program_type: params.program_type as 'risk' | 'endowment' | 'investment' | 'pension' ?? 'risk',
      term_years: params.term_years as number ?? 10,
      beneficiary_count: (params.beneficiary_count as number | undefined) ?? 1,
      smoker: params.smoker as boolean ?? false,
      dangerous_occupation: params.dangerous_occupation as boolean ?? false,
      dangerous_hobbies: params.dangerous_hobbies as boolean ?? false,
      include_accident: params.include_accident as boolean ?? false,
      include_critical_illness: params.include_critical_illness as boolean ?? false,
    };
    return calculateLifePremium(request);
  }

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
