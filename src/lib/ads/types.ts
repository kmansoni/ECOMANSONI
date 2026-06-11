/**
 * Hand-written types для Ad Creatives service.
 * Расширяют автоматически сгенерированные типы Supabase дополнительными
 * union-типами и business-logic константами.
 *
 * Эти типы используются в хуках и компонентах. Автогенерация из
 * supabase/types.ts может не отражать CHECK constraints, поэтому
 * мы определяем их явно.
 */

// ============================================================================
// Enums & Unions (соответствуют CHECK constraints в БД)
// ============================================================================

export type AdCreativeStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
export type AdCreativeType = 'image' | 'video' | 'carousel' | 'story';
export type AdAction = 'impression' | 'click' | 'conversion';
export type CallToAction = 'learn_more' | 'shop_now' | 'sign_up' | 'contact_us' | 'download' | 'get_quote' | 'apply_now';
export type ChangeType = 'create' | 'update' | 'delete' | 'restore' | 'status_change';
export type CampaignStatus = 'draft' | 'review' | 'active' | 'paused' | 'completed' | 'rejected';
export type CampaignObjective = 'awareness' | 'traffic' | 'conversions' | 'engagement';

export interface Targeting {
  countries?: string[];
  cities?: string[];
  minAge?: number;
  maxAge?: number;
  interests?: string[];
  placements?: string[];
}

export interface AdCampaign {
  id: string;
  advertiser_id: string;
  name: string;
  objective: CampaignObjective;
  budget_cents: number;
  daily_budget_cents: number | null;
  spent_cents: number;
  start_date: string;
  end_date: string | null;
  targeting: Targeting;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateCampaignInput {
  name: string;
  objective: CampaignObjective;
  budget_cents: number;
  daily_budget_cents?: number | null;
  start_date: string;
  end_date?: string | null;
  targeting?: Targeting;
}

// ============================================================================
// Расширенные интерфейсы (соответствуют расширенной схеме)
// ============================================================================

export interface AdCreative {
  id: string;
  campaign_id: string;
  type: AdCreativeType;
  media_url: string;
  thumbnail_url: string | null;
  headline: string;
  description: string | null;
  call_to_action: CallToAction;
  destination_url: string;

  // Жизненный цикл
  status: AdCreativeStatus;
  moderation_reason: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
  moderation_metadata: Record<string, unknown> | null;

  // Аудит
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;

  // Duplicate detection
  creative_hash: string;

  // Настройки
  frequency_cap: number;
  priority_order: number;

  // Медиаметаданные
  media_duration_sec: number | null;
  media_width: number | null;
  media_height: number | null;
  file_size_bytes: number | null;
  aspect_ratio: string | null;

  // Стандартные поля
  created_at: string;
}

export interface AdCreativeInsert {
  campaign_id: string;
  type: AdCreativeType;
  media_url: string;
  headline: string;
  description?: string | null;
  call_to_action: CallToAction;
  destination_url: string;

  // Опциональные: генерируются автоматически если не переданы
  status?: AdCreativeStatus; // default: 'draft'
  creative_hash?: string;    // auto-generated
  frequency_cap?: number;    // default: 3
  priority_order?: number;   // default: 0
}

export interface AdCreativeUpdate {
  type?: AdCreativeType;
  media_url?: string;
  headline?: string;
  description?: string | null;
  call_to_action?: CallToAction;
  destination_url?: string;

  // Запрещено менять: campaign_id ( enforced RLS )
  // Ограничено: status (state machine), type/cta после approval
  status?: AdCreativeStatus;
  thumbnail_url?: string | null;
  media_duration_sec?: number | null;
  media_width?: number | null;
  media_height?: number | null;
  file_size_bytes?: number | null;
  aspect_ratio?: string | null;

  // Настройки
  frequency_cap?: number;
  priority_order?: number;

  // Модерация (только для модераторов)
  moderation_reason?: string | null;
  moderated_at?: string | null;
  moderated_by?: string | null;
  moderation_metadata?: Record<string, unknown> | null;

  // Soft delete
  deleted_at?: string | null;
}

export interface AdImpression {
  id: string;
  creative_id: string;
  viewer_id: string | null;
  action: AdAction;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface AdImpressionInsert {
  creative_id: string;
  viewer_id?: string | null;
  action: AdAction;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

export interface AdCreativeHistory {
  id: string;
  creative_id: string;
  changed_by: string;
  change_type: ChangeType;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_at: string;
  change_reason: string | null;
}

// ============================================================================
// Статистика
// ============================================================================

export interface CreativeStats {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;      // процент
  cpc: number;      // копейки
}

export interface CampaignStats {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

// ============================================================================
// Валидация
// ============================================================================

export const URL_MAX_LENGTH = 2048;
export const HEADLINE_MIN_LENGTH = 1;
export const HEADLINE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 300;
export const FREQUENCY_CAP_MIN = 1;
export const FREQUENCY_CAP_MAX = 100;
export const DEFAULT_FREQUENCY_CAP = 3;

export const VALID_CTA_VALUES: CallToAction[] = [
  'learn_more', 'shop_now', 'sign_up', 'contact_us', 'download', 'get_quote', 'apply_now'
];

export const VALID_STATUS_VALUES: AdCreativeStatus[] = [
  'draft', 'pending_review', 'approved', 'rejected', 'archived'
];

export const VALID_TYPE_VALUES: AdCreativeType[] = [
  'image', 'video', 'carousel', 'story'
];

// ============================================================================
// Utility типы
// ============================================================================

export type CreativeFormData = Omit<AdCreativeInsert, 'campaign_id' | 'creative_hash'> & {
  // Дополнительные поля формы
  submitForReview?: boolean; // если true — сразу отправляем в pending_review
};

export const CreativeStatusLabels: Record<AdCreativeStatus, string> = {
  draft: 'Черновик',
  pending_review: 'На модерации',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  archived: 'Архив',
};

export const CreativeStatusColors: Record<AdCreativeStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  pending_review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  archived: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

export const CTALabels: Record<CallToAction, string> = {
  learn_more: 'Узнать больше',
  shop_now: 'Купить сейчас',
  sign_up: 'Зарегистрироваться',
  contact_us: 'Связаться',
  download: 'Скачать',
  get_quote: 'Получить расчёт',
  apply_now: 'Подать заявку',
};
