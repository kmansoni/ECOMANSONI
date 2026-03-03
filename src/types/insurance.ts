// === Категории страхования ===
export type InsuranceCategory =
  | 'osago'
  | 'kasko'
  | 'mini_kasko'
  | 'dms'
  | 'travel'
  | 'property'
  | 'mortgage'
  | 'life'
  | 'health'
  | 'auto'
  | 'osgop';

export type PolicyStatus = 'draft' | 'pending' | 'active' | 'expired' | 'cancelled' | 'claimed';
export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';
export type ApplicationStatus =
  | 'draft'
  | 'calculating'
  | 'quoted'
  | 'applying'
  | 'documents_required'
  | 'under_review'
  | 'approved'
  | 'payment_pending'
  | 'paid'
  | 'issued'
  | 'rejected'
  | 'cancelled';

// === Запросы для калькуляторов ===

export interface OsagoCalculationRequest {
  region_code: string;
  vehicle_type: 'car' | 'truck' | 'motorcycle' | 'bus';
  engine_power: number;
  driver_age: number;
  driver_experience_years: number;
  kbm_class: number;
  usage_period_months: number;
  multi_driver: boolean;
  has_trailer: boolean;
  owner_type: 'individual' | 'legal_entity';
  registration_type?: 'russian' | 'transit' | 'foreign';
}

export interface KaskoCalculationRequest {
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_price: number;
  engine_power: number;
  region_code: string;
  driver_age: number;
  driver_experience_years: number;
  kbm_class: number;
  has_anti_theft: boolean;
  garage_parking: boolean;
  franchise_amount: number;
  coverage_type: 'full' | 'partial' | 'total_loss_only';
  additional_options: string[];
}

export interface DmsCalculationRequest {
  age: number;
  gender: 'male' | 'female';
  region_code: string;
  program_type: 'basic' | 'standard' | 'premium' | 'vip';
  has_chronic_diseases: boolean;
  include_dental: boolean;
  include_emergency: boolean;
  include_consultation: boolean;
  employees_count?: number;
  company_inn?: string;
}

export interface TravelCalculationRequest {
  destination_country: string;
  trip_duration_days: number;
  travelers_count: number;
  traveler_ages: number[];
  coverage_amount: number;
  sport_activities: boolean;
  include_cancellation: boolean;
  include_luggage: boolean;
  include_accident: boolean;
  trip_purpose: 'tourism' | 'business' | 'study' | 'work';
  multi_trip: boolean;
}

export interface PropertyCalculationRequest {
  property_type: 'apartment' | 'house' | 'townhouse' | 'commercial';
  property_area: number;
  property_value: number;
  region_code: string;
  construction_year: number;
  construction_material: 'brick' | 'panel' | 'wood' | 'monolith' | 'other';
  floor: number;
  total_floors: number;
  include_interior: boolean;
  include_liability: boolean;
  include_movables: boolean;
  coverage_amount: number;
}

export interface MortgageCalculationRequest {
  property_value: number;
  loan_amount: number;
  loan_term_years: number;
  borrower_age: number;
  borrower_gender: 'male' | 'female';
  bank_name: string;
  include_life: boolean;
  include_title: boolean;
  include_property: boolean;
  region_code: string;
}

export interface LifeCalculationRequest {
  age: number;
  gender: 'male' | 'female';
  coverage_amount: number;
  term_years: number;
  program_type: 'risk' | 'endowment' | 'investment' | 'pension';
  smoker: boolean;
  dangerous_occupation: boolean;
  dangerous_hobbies: boolean;
  include_accident: boolean;
  include_critical_illness: boolean;
  beneficiary_count: number;
}

// === Результаты расчёта ===

export interface CalculationResult {
  id: string;
  category: InsuranceCategory;
  provider_id: string;
  provider_name: string;
  provider_logo: string;
  provider_rating: number;
  premium_amount: number;
  premium_monthly?: number;
  coverage_amount: number;
  deductible_amount?: number;
  currency: 'RUB';
  valid_until: string;
  features: string[];
  exclusions: string[];
  documents_required: string[];
  purchase_url?: string;
  details: Record<string, unknown>;
}

export interface CalculationResponse {
  request_id: string;
  category: InsuranceCategory;
  results: CalculationResult[];
  total_providers_queried: number;
  successful_providers: number;
  failed_providers: string[];
  calculation_time_ms: number;
  cached: boolean;
}

// === Страховая компания ===

export interface InsuranceCompanyFull {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  description: string;
  rating: number;
  reviews_count: number;
  license_number: string;
  license_date: string;
  founded_year: number;
  website: string;
  phone: string;
  email: string;
  categories: InsuranceCategory[];
  features: string[];
  regions: string[];
  avg_claim_days: number;
  claim_approval_rate: number;
  is_partner: boolean;
  api_available: boolean;
  created_at: string;
}

// === Продукт ===

export interface InsuranceProductFull {
  id: string;
  company_id: string;
  company: InsuranceCompanyFull;
  name: string;
  slug: string;
  category: InsuranceCategory;
  description: string;
  short_description: string;
  premium_from: number;
  premium_to: number;
  coverage_amount: number;
  features: string[];
  exclusions: string[];
  documents: string[];
  conditions: string;
  term_months: number;
  is_popular: boolean;
  is_recommended: boolean;
  rating: number;
  reviews_count: number;
  purchase_url: string;
  created_at: string;
}

// === Заявка ===

export interface InsuranceApplication {
  id: string;
  user_id: string;
  product_id: string;
  calculation_id: string;
  status: ApplicationStatus;
  personal_data: PersonalData;
  vehicle_data?: VehicleData;
  property_data?: PropertyData;
  documents: ApplicationDocument[];
  premium_amount: number;
  coverage_amount: number;
  payment_id?: string;
  policy_id?: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalData {
  first_name: string;
  last_name: string;
  middle_name?: string;
  birth_date: string;
  gender: 'male' | 'female';
  passport_series: string;
  passport_number: string;
  passport_issued_by: string;
  passport_issued_date: string;
  inn?: string;
  snils?: string;
  phone: string;
  email: string;
  registration_address: string;
  actual_address?: string;
}

export interface VehicleData {
  make: string;
  model: string;
  year: number;
  vin: string;
  license_plate: string;
  body_number?: string;
  engine_power: number;
  vehicle_type: string;
  pts_series: string;
  pts_number: string;
  sts_series?: string;
  sts_number?: string;
  diagnostic_card_number?: string;
  diagnostic_card_valid_until?: string;
}

export interface PropertyData {
  type: 'apartment' | 'house' | 'townhouse' | 'commercial';
  address: string;
  cadastral_number?: string;
  area: number;
  construction_year: number;
  floor?: number;
  total_floors?: number;
  rooms?: number;
  value: number;
}

export interface ApplicationDocument {
  id: string;
  type:
    | 'passport'
    | 'pts'
    | 'sts'
    | 'driver_license'
    | 'diagnostic_card'
    | 'property_title'
    | 'photo'
    | 'other';
  name: string;
  url: string;
  uploaded_at: string;
  verified: boolean;
}

// === Полис ===

export interface InsurancePolicyFull {
  id: string;
  user_id: string;
  company_id: string;
  company: InsuranceCompanyFull;
  product_id: string;
  product: InsuranceProductFull;
  policy_number: string;
  category: InsuranceCategory;
  status: PolicyStatus;
  start_date: string;
  end_date: string;
  premium_amount: number;
  coverage_amount: number;
  insured_object: string;
  conditions: Record<string, unknown>;
  documents_url: string;
  qr_code_url?: string;
  created_at: string;
}

// === Страховой случай ===

export interface InsuranceClaim {
  id: string;
  policy_id: string;
  policy: InsurancePolicyFull;
  status: ClaimStatus;
  claim_date: string;
  incident_date: string;
  incident_description: string;
  incident_location: string;
  damage_amount: number;
  approved_amount?: number;
  documents: ApplicationDocument[];
  reviewer_notes?: string;
  created_at: string;
  updated_at: string;
}

// === Сравнение ===

export interface ComparisonItem {
  product: InsuranceProductFull;
  calculation: CalculationResult;
}

export interface ComparisonData {
  id: string;
  category: InsuranceCategory;
  items: ComparisonItem[];
  criteria: ComparisonCriterion[];
  created_at: string;
}

export interface ComparisonCriterion {
  key: string;
  label: string;
  type: 'price' | 'rating' | 'text' | 'boolean' | 'list';
  values: Record<string, unknown>;
}

// === Отзыв ===

export interface InsuranceReview {
  id: string;
  user_id: string;
  company_id: string;
  rating: number;
  title: string;
  text: string;
  pros: string[];
  cons: string[];
  claim_experience: boolean;
  verified: boolean;
  helpful_count: number;
  created_at: string;
}

// === Регион ===

export interface InsuranceRegion {
  code: string;
  name: string;
  coefficient: number;
  federal_district: string;
}

// === FAQ ===

export interface InsuranceFaqItem {
  id: string;
  category: InsuranceCategory | 'general';
  question: string;
  answer: string;
  order: number;
  helpful_count: number;
}

// === Ошибка API ===

export interface InsuranceApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// === Фильтры ===

export interface InsuranceFilters {
  category?: InsuranceCategory;
  company_id?: string;
  price_min?: number;
  price_max?: number;
  rating_min?: number;
  sort_by?: 'price_asc' | 'price_desc' | 'rating' | 'popularity' | 'claim_speed';
  page?: number;
  per_page?: number;
}

// === Агент ===

export interface AgentProfile {
  id: string;
  user_id: string;
  license_number: string;
  specializations: InsuranceCategory[];
  rating: number;
  total_policies: number;
  total_commission: number;
  status: 'active' | 'suspended' | 'pending';
  created_at: string;
}

// === Шаги калькулятора ===

export interface CalculatorStep {
  id: string;
  title: string;
  description?: string;
  fields: CalculatorField[];
  validation?: (values: Record<string, unknown>) => Record<string, string> | null;
}

export interface CalculatorField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'phone' | 'autocomplete';
  placeholder?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  helpText?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}
