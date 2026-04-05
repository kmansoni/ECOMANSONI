import type { InsuranceCategory, CalculationResponse, CalculationResult } from '@/types/insurance';
import type { AggregatedQuoteResponse } from '@/types/insurance-providers';

export function toCalcResponse(
  agg: AggregatedQuoteResponse,
  category: InsuranceCategory,
): CalculationResponse {
  const results: CalculationResult[] = agg.offers.map(o => ({
    id: o.id,
    category,
    provider_id: o.provider_code,
    provider_name: o.company_name,
    provider_logo: '',
    provider_rating: 0,
    premium_amount: o.premium_amount,
    premium_monthly: o.premium_monthly,
    coverage_amount: o.coverage_amount,
    deductible_amount: o.deductible_amount,
    currency: 'RUB',
    valid_until: o.valid_until,
    features: o.features,
    exclusions: o.exclusions,
    documents_required: o.documents_required,
    purchase_url: undefined,
    details: {
      ...o.details,
      session_id: agg.session_id,
      provider_code: o.provider_code,
      purchase_available: o.purchase_available,
      is_mock: o.is_mock,
    },
  }));

  return {
    request_id: agg.session_id,
    category,
    results,
    total_providers_queried: agg.providers_queried,
    successful_providers: agg.providers_succeeded,
    failed_providers: agg.providers_failed.map(f => f.code),
    calculation_time_ms: agg.calculation_time_ms,
    cached: false,
  };
}
