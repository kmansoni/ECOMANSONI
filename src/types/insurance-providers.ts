import type { InsuranceCategory } from './insurance';

export type ProviderCode = 'inssmart' | 'cherehapa' | 'mock';

export interface ProviderConfig {
  code: ProviderCode;
  base_url: string | null;
  timeout_ms: number;
  sandbox_mode: boolean;
  meta: Record<string, unknown>;
}

export interface QuoteRequest {
  category: InsuranceCategory;
  params: Record<string, unknown>;
  preferred_providers?: ProviderCode[];
}

export interface ProviderOffer {
  id: string;
  session_id: string;
  provider_code: ProviderCode;
  company_name: string;
  company_id?: string;
  external_offer_id?: string;
  premium_amount: number;
  premium_monthly?: number;
  coverage_amount: number;
  deductible_amount: number;
  valid_until: string;
  features: string[];
  exclusions: string[];
  documents_required: string[];
  purchase_available: boolean;
  is_mock: boolean;
  details: Record<string, unknown>;
  rank?: number;
}

export interface FailedProvider {
  code: ProviderCode;
  error: string;
  response_time_ms: number;
}

export interface AggregatedQuoteResponse {
  session_id: string;
  category: InsuranceCategory;
  offers: ProviderOffer[];
  providers_queried: number;
  providers_succeeded: number;
  providers_failed: FailedProvider[];
  calculation_time_ms: number;
  expires_at: string;
  has_real_quotes: boolean;
}

export interface PurchaseRequest {
  session_id: string;
  offer_id: string;
  personal_data: Record<string, unknown>;
  vehicle_data?: Record<string, unknown>;
  idempotency_key: string;
}

export interface PurchaseResult {
  status: 'success' | 'pending' | 'requires_payment' | 'error';
  policy_number?: string;
  policy_id?: string;
  pdf_url?: string;
  payment_url?: string;
  external_id?: string;
  error_message?: string;
}

export interface VehicleLookupResult {
  plate: string;
  vin?: string;
  make: string;
  model: string;
  year: number;
  engine_power?: number;
  body_type?: string;
  color?: string;
  vehicle_type: string;
  source: 'cache' | 'dadata';
  cached: boolean;
}

// КБМ — коэффициент бонус-малус
export interface KbmResult {
  kbm_class: number;
  kbm_coefficient: number;
  kbm_label: string;
  previous_claims_count: number;
  is_real: boolean;
  source: 'inssmart' | 'cache' | 'estimate';
}
