export interface AdapterConfig {
  code: string;
  base_url: string | null;
  timeout_ms: number;
  sandbox_mode: boolean;
  meta: Record<string, unknown>;
}

export interface AdapterQuoteParams {
  category: string;
  request_id: string;
  params: Record<string, unknown>;
}

export interface AdapterOffer {
  external_offer_id: string;
  company_name: string;
  premium_amount: number;
  premium_monthly?: number;
  coverage_amount: number;
  deductible_amount?: number;
  valid_until: string;
  features: string[];
  exclusions: string[];
  documents_required: string[];
  purchase_available: boolean;
  is_mock: boolean;
  details: Record<string, unknown>;
}

export interface AdapterQuoteResult {
  status: "ok" | "error" | "timeout" | "unsupported";
  offers: AdapterOffer[];
  error_message?: string;
  response_time_ms: number;
}

export interface ProviderAdapter {
  readonly code: string;
  supports(category: string): boolean;
  getQuotes(
    params: AdapterQuoteParams,
    config: AdapterConfig,
  ): Promise<AdapterQuoteResult>;
}
