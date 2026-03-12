/**
 * CRM Real Estate — TypeScript library
 * Уровень: Bitrix24 RE + TopN Lab + ReBPM + Follow Up Boss + kvCORE
 *
 * Архитектура:
 * - Все запросы через Supabase RLS (user_id = auth.uid())
 * - Idempotency: upsert по id
 * - Оптимистичные обновления на клиенте
 * - Ипотечный калькулятор через RPC (IMMUTABLE, без сети)
 * - Подбор объектов через RPC match_properties_for_client
 */

import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type REClientType = 'buyer' | 'seller' | 'tenant' | 'landlord' | 'investor';
export type REDealType   = 'sale' | 'rent' | 'mortgage' | 'exchange';
export type REClientStage = 'new' | 'contacted' | 'qualified' | 'viewing' | 'negotiation' | 'contract' | 'won' | 'lost' | 'cold';
export type REPropertyType = 'apartment' | 'room' | 'house' | 'townhouse' | 'commercial' | 'land' | 'garage' | 'parking' | 'new_building';
export type REPropertyStatus = 'available' | 'reserved' | 'sold' | 'rented' | 'off_market' | 'draft';
export type REDealStage = 'new' | 'contacted' | 'qualified' | 'viewing' | 'negotiation' | 'contract' | 'registration' | 'won' | 'lost';
export type REShowingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
export type REClientFeedback = 'very_interested' | 'interested' | 'neutral' | 'not_interested' | 'rejected';
export type RETaskType = 'call' | 'email' | 'whatsapp' | 'meeting' | 'showing' | 'document' | 'other';
export type REDocType = 'contract_sale' | 'contract_rent' | 'act_acceptance' | 'power_of_attorney' | 'mortgage_agreement' | 'deposit_agreement' | 'preliminary_contract' | 'title_deed' | 'passport_copy' | 'other';
export type RELeadSource = 'manual' | 'cian' | 'avito' | 'yandex' | 'domclick' | 'instagram' | 'vk' | 'referral' | 'call' | 'website' | 'other';

export interface REClient {
  id: string;
  user_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  telegram?: string | null;
  whatsapp?: string | null;
  client_type: REClientType;
  budget_min?: number | null;
  budget_max?: number | null;
  deal_type: REDealType;
  property_types: REPropertyType[];
  rooms_min?: number | null;
  rooms_max?: number | null;
  area_min?: number | null;
  area_max?: number | null;
  districts: string[];
  metro_stations: string[];
  mortgage_ready: boolean;
  mortgage_bank?: string | null;
  mortgage_amount?: number | null;
  source: RELeadSource;
  source_detail?: string | null;
  lead_score: number;
  stage: REClientStage;
  tags: string[];
  notes?: string | null;
  assigned_to?: string | null;
  last_contact_at?: string | null;
  next_contact_at?: string | null;
  drip_campaign?: string | null;
  created_at: string;
  updated_at: string;
}

export interface REProperty {
  id: string;
  user_id: string;
  title: string;
  property_type: REPropertyType;
  deal_type: 'sale' | 'rent';
  status: REPropertyStatus;
  address?: string | null;
  city: string;
  district?: string | null;
  metro_station?: string | null;
  metro_distance?: number | null;
  lat?: number | null;
  lng?: number | null;
  rooms?: number | null;
  floor?: number | null;
  floors_total?: number | null;
  area_total?: number | null;
  area_living?: number | null;
  area_kitchen?: number | null;
  ceiling_height?: number | null;
  year_built?: number | null;
  renovation?: string | null;
  balcony: boolean;
  parking?: string | null;
  price: number;
  price_per_sqm?: number | null;
  price_negotiable: boolean;
  mortgage_possible: boolean;
  mortgage_rate?: number | null;
  commission_pct: number;
  commission_fixed?: number | null;
  commission_who: 'buyer' | 'seller' | 'split';
  photos: string[];
  video_url?: string | null;
  virtual_tour_url?: string | null;
  floor_plan_url?: string | null;
  published_cian: boolean;
  published_avito: boolean;
  published_yandex: boolean;
  published_domclick: boolean;
  cian_id?: string | null;
  avito_id?: string | null;
  seller_client_id?: string | null;
  seller_name?: string | null;
  seller_phone?: string | null;
  avm_price?: number | null;
  avm_updated_at?: string | null;
  description?: string | null;
  features: string[];
  notes?: string | null;
  views_count: number;
  favorites_count: number;
  created_at: string;
  updated_at: string;
}

export interface REDeal {
  id: string;
  user_id: string;
  title: string;
  deal_type: REDealType;
  stage: REDealStage;
  client_id?: string | null;
  property_id?: string | null;
  deal_price?: number | null;
  commission_pct?: number | null;
  commission_amount?: number | null;
  deposit_amount?: number | null;
  deposit_paid_at?: string | null;
  mortgage_bank?: string | null;
  mortgage_amount?: number | null;
  mortgage_rate?: number | null;
  mortgage_term?: number | null;
  mortgage_approved?: boolean | null;
  mortgage_approved_at?: string | null;
  contract_signed_at?: string | null;
  registration_date?: string | null;
  keys_handover_date?: string | null;
  won: boolean;
  lost: boolean;
  lost_reason?: string | null;
  source?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
}

export interface REShowing {
  id: string;
  user_id: string;
  client_id?: string | null;
  property_id?: string | null;
  deal_id?: string | null;
  scheduled_at: string;
  duration_min: number;
  status: REShowingStatus;
  client_feedback?: REClientFeedback | null;
  client_notes?: string | null;
  agent_notes?: string | null;
  report_photos: string[];
  route_order: number;
  route_group_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RETask {
  id: string;
  user_id: string;
  title: string;
  task_type: RETaskType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  due_date?: string | null;
  completed_at?: string | null;
  client_id?: string | null;
  property_id?: string | null;
  deal_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface REDocument {
  id: string;
  user_id: string;
  deal_id?: string | null;
  client_id?: string | null;
  property_id?: string | null;
  doc_type: REDocType;
  title: string;
  file_url?: string | null;
  signed: boolean;
  signed_at?: string | null;
  expires_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface REDistrictAnalytics {
  id: string;
  city: string;
  district: string;
  avg_price_sqm: number;
  avg_price_sqm_1r: number;
  avg_price_sqm_2r: number;
  avg_price_sqm_3r: number;
  listings_count: number;
  days_on_market: number;
  price_trend_pct: number;
  infrastructure: {
    schools: number;
    kindergartens: number;
    hospitals: number;
    malls: number;
    parks: number;
  };
  updated_at: string;
}

export interface REDashboardStats {
  total_clients: number;
  new_clients_month: number;
  active_deals: number;
  pipeline_value: number;
  won_deals_month: number;
  commission_month: number;
  total_properties: number;
  available_properties: number;
  showings_today: number;
  showings_week: number;
  overdue_tasks: number;
  conversion_rate: number;
}

export interface REMatchedProperty {
  property_id: string;
  title: string;
  price: number;
  area_total: number;
  rooms: number;
  district: string;
  match_score: number;
}

export interface REMortgageCalc {
  loan_amount: number;
  monthly_payment: number;
  total_payment: number;
  overpayment: number;
  down_payment: number;
  effective_rate: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const RE_CLIENT_STAGES: Array<{ value: REClientStage; label: string; color: string }> = [
  { value: 'new',          label: 'Новый',        color: 'bg-slate-600' },
  { value: 'contacted',    label: 'Контакт',      color: 'bg-blue-600' },
  { value: 'qualified',    label: 'Квалификация', color: 'bg-indigo-600' },
  { value: 'viewing',      label: 'Просмотры',    color: 'bg-purple-600' },
  { value: 'negotiation',  label: 'Переговоры',   color: 'bg-amber-600' },
  { value: 'contract',     label: 'Договор',      color: 'bg-orange-600' },
  { value: 'won',          label: 'Закрыто ✓',    color: 'bg-green-600' },
  { value: 'lost',         label: 'Отказ ✗',      color: 'bg-red-600' },
  { value: 'cold',         label: 'Холодный',     color: 'bg-slate-700' },
];

export const RE_DEAL_STAGES: Array<{ value: REDealStage; label: string; color: string }> = [
  { value: 'new',          label: 'Новая',        color: 'bg-slate-600' },
  { value: 'contacted',    label: 'Контакт',      color: 'bg-blue-600' },
  { value: 'qualified',    label: 'Квалификация', color: 'bg-indigo-600' },
  { value: 'viewing',      label: 'Просмотры',    color: 'bg-purple-600' },
  { value: 'negotiation',  label: 'Переговоры',   color: 'bg-amber-600' },
  { value: 'contract',     label: 'Договор',      color: 'bg-orange-600' },
  { value: 'registration', label: 'Регистрация',  color: 'bg-yellow-600' },
  { value: 'won',          label: 'Закрыто ✓',    color: 'bg-green-600' },
  { value: 'lost',         label: 'Отказ ✗',      color: 'bg-red-600' },
];

export const RE_LEAD_SOURCES: Array<{ value: RELeadSource; label: string; icon: string }> = [
  { value: 'cian',      label: 'ЦИАН',        icon: '🏢' },
  { value: 'avito',     label: 'Авито',       icon: '🟢' },
  { value: 'yandex',    label: 'Яндекс.Недв', icon: '🔴' },
  { value: 'domclick',  label: 'Домклик',     icon: '🏠' },
  { value: 'instagram', label: 'Instagram',   icon: '📸' },
  { value: 'vk',        label: 'ВКонтакте',   icon: '💙' },
  { value: 'referral',  label: 'Рекомендация',icon: '👥' },
  { value: 'call',      label: 'Звонок',      icon: '📞' },
  { value: 'website',   label: 'Сайт',        icon: '🌐' },
  { value: 'manual',    label: 'Вручную',     icon: '✏️' },
  { value: 'other',     label: 'Другое',      icon: '📌' },
];

export const RE_PROPERTY_TYPES: Array<{ value: REPropertyType; label: string; icon: string }> = [
  { value: 'apartment',    label: 'Квартира',     icon: '🏢' },
  { value: 'room',         label: 'Комната',      icon: '🚪' },
  { value: 'house',        label: 'Дом',          icon: '🏠' },
  { value: 'townhouse',    label: 'Таунхаус',     icon: '🏡' },
  { value: 'commercial',   label: 'Коммерция',    icon: '🏬' },
  { value: 'land',         label: 'Участок',      icon: '🌳' },
  { value: 'garage',       label: 'Гараж',        icon: '🅿️' },
  { value: 'parking',      label: 'Паркинг',      icon: '🅿️' },
  { value: 'new_building', label: 'Новостройка',  icon: '🏗️' },
];

export const RE_MORTGAGE_BANKS = [
  { name: 'Сбербанк',    rate: 10.9, min_down: 15 },
  { name: 'ВТБ',         rate: 11.2, min_down: 15 },
  { name: 'Альфа-Банк',  rate: 11.5, min_down: 20 },
  { name: 'Газпромбанк', rate: 10.8, min_down: 15 },
  { name: 'Россельхоз',  rate: 11.0, min_down: 15 },
  { name: 'Домклик',     rate: 10.7, min_down: 10 },
  { name: 'Открытие',    rate: 11.3, min_down: 20 },
  { name: 'Семейная ипотека', rate: 6.0, min_down: 20 },
  { name: 'IT-ипотека',  rate: 5.0, min_down: 20 },
  { name: 'Льготная',    rate: 8.0, min_down: 20 },
];

export const RE_DOC_TYPES: Array<{ value: REDocType; label: string }> = [
  { value: 'contract_sale',        label: 'Договор купли-продажи' },
  { value: 'contract_rent',        label: 'Договор аренды' },
  { value: 'act_acceptance',       label: 'Акт приёма-передачи' },
  { value: 'power_of_attorney',    label: 'Доверенность' },
  { value: 'mortgage_agreement',   label: 'Ипотечный договор' },
  { value: 'deposit_agreement',    label: 'Договор задатка' },
  { value: 'preliminary_contract', label: 'Предварительный договор' },
  { value: 'title_deed',           label: 'Свидетельство о праве' },
  { value: 'passport_copy',        label: 'Копия паспорта' },
  { value: 'other',                label: 'Другой документ' },
];

// ─── API ──────────────────────────────────────────────────────────────────────

class CRMRealEstateAPI {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sb = supabase as any;

  private async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, params ?? {});
    if (error) throw error;
    return data as T;
  }

  private async rpcList<T>(fn: string, params?: Record<string, unknown>): Promise<T[]> {
    const data = await this.rpc<unknown>(fn, params);
    return Array.isArray(data) ? (data as T[]) : [];
  }

  private async rpcSingle<T>(fn: string, params?: Record<string, unknown>): Promise<T | null> {
    const data = await this.rpc<unknown>(fn, params);
    if (Array.isArray(data)) return (data[0] ?? null) as T | null;
    return (data ?? null) as T | null;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboardStats(): Promise<REDashboardStats> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const data = await this.rpc<REDashboardStats>('crm_re.get_dashboard_stats', { p_user_id: user.id });
    return data;
  }

  // ── Clients ────────────────────────────────────────────────────────────────

  async getClients(filters?: {
    stage?: REClientStage;
    client_type?: REClientType;
    source?: RELeadSource;
    search?: string;
  }): Promise<REClient[]> {
    return this.rpcList<REClient>('crm_re.get_clients', {
      p_stage:       filters?.stage ?? null,
      p_client_type: filters?.client_type ?? null,
      p_source:      filters?.source ?? null,
      p_search:      filters?.search ?? null,
    });
  }

  async createClient(input: Omit<REClient, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<REClient> {
    const data = await this.rpcSingle<REClient>('crm_re.create_client', { p_data: input });
    if (!data) throw new Error('Failed to create client');
    return data;
  }

  async updateClient(id: string, updates: Partial<REClient>): Promise<REClient> {
    const data = await this.rpcSingle<REClient>('crm_re.update_client', { p_id: id, p_data: updates });
    if (!data) throw new Error('Failed to update client');
    return data;
  }

  async deleteClient(id: string): Promise<void> {
    await this.rpc('crm_re.delete_client', { p_id: id });
  }

  async matchPropertiesForClient(clientId: string): Promise<REMatchedProperty[]> {
    return this.rpcList<REMatchedProperty>('crm_re.match_properties_for_client', { p_client_id: clientId });
  }

  // ── Properties ─────────────────────────────────────────────────────────────

  async getProperties(filters?: {
    status?: REPropertyStatus;
    property_type?: REPropertyType;
    deal_type?: 'sale' | 'rent';
    price_min?: number;
    price_max?: number;
    rooms?: number;
    district?: string;
  }): Promise<REProperty[]> {
    return this.rpcList<REProperty>('crm_re.get_properties', {
      p_status:        filters?.status ?? null,
      p_property_type: filters?.property_type ?? null,
      p_deal_type:     filters?.deal_type ?? null,
      p_price_min:     filters?.price_min ?? null,
      p_price_max:     filters?.price_max ?? null,
      p_rooms:         filters?.rooms ?? null,
      p_district:      filters?.district ?? null,
    });
  }

  async createProperty(input: Omit<REProperty, 'id' | 'user_id' | 'price_per_sqm' | 'views_count' | 'favorites_count' | 'created_at' | 'updated_at'>): Promise<REProperty> {
    const data = await this.rpcSingle<REProperty>('crm_re.create_property', { p_data: input });
    if (!data) throw new Error('Failed to create property');
    return data;
  }

  async updateProperty(id: string, updates: Partial<REProperty>): Promise<REProperty> {
    const data = await this.rpcSingle<REProperty>('crm_re.update_property', { p_id: id, p_data: updates });
    if (!data) throw new Error('Failed to update property');
    return data;
  }

  async deleteProperty(id: string): Promise<void> {
    await this.rpc('crm_re.delete_property', { p_id: id });
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async getDeals(filters?: { stage?: REDealStage; deal_type?: REDealType }): Promise<REDeal[]> {
    return this.rpcList<REDeal>('crm_re.get_deals', {
      p_stage:     filters?.stage ?? null,
      p_deal_type: filters?.deal_type ?? null,
    });
  }

  async createDeal(input: Omit<REDeal, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<REDeal> {
    const data = await this.rpcSingle<REDeal>('crm_re.create_deal', { p_data: input });
    if (!data) throw new Error('Failed to create deal');
    return data;
  }

  async updateDeal(id: string, updates: Partial<REDeal>): Promise<REDeal> {
    const data = await this.rpcSingle<REDeal>('crm_re.update_deal', { p_id: id, p_data: updates });
    if (!data) throw new Error('Failed to update deal');
    return data;
  }

  async deleteDeal(id: string): Promise<void> {
    await this.rpc('crm_re.delete_deal', { p_id: id });
  }

  // ── Showings ───────────────────────────────────────────────────────────────

  async getShowings(filters?: { date_from?: string; date_to?: string; status?: REShowingStatus }): Promise<REShowing[]> {
    return this.rpcList<REShowing>('crm_re.get_showings', {
      p_date_from: filters?.date_from ?? null,
      p_date_to:   filters?.date_to ?? null,
      p_status:    filters?.status ?? null,
    });
  }

  async createShowing(input: Omit<REShowing, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<REShowing> {
    const data = await this.rpcSingle<REShowing>('crm_re.create_showing', { p_data: input });
    if (!data) throw new Error('Failed to create showing');
    return data;
  }

  async updateShowing(id: string, updates: Partial<REShowing>): Promise<REShowing> {
    const data = await this.rpcSingle<REShowing>('crm_re.update_showing', { p_id: id, p_data: updates });
    if (!data) throw new Error('Failed to update showing');
    return data;
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async getTasks(filters?: { status?: string; priority?: string }): Promise<RETask[]> {
    return this.rpcList<RETask>('crm_re.get_tasks', {
      p_status:   filters?.status ?? null,
      p_priority: filters?.priority ?? null,
    });
  }

  async createTask(input: Omit<RETask, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<RETask> {
    const data = await this.rpcSingle<RETask>('crm_re.create_task', { p_data: input });
    if (!data) throw new Error('Failed to create task');
    return data;
  }

  async completeTask(id: string): Promise<RETask> {
    const data = await this.rpcSingle<RETask>('crm_re.complete_task', { p_id: id });
    if (!data) throw new Error('Failed to complete task');
    return data;
  }

  async deleteTask(id: string): Promise<void> {
    await this.rpc('crm_re.delete_task', { p_id: id });
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  async getDocuments(filters?: { deal_id?: string; client_id?: string }): Promise<REDocument[]> {
    return this.rpcList<REDocument>('crm_re.get_documents', {
      p_deal_id:   filters?.deal_id ?? null,
      p_client_id: filters?.client_id ?? null,
    });
  }

  async createDocument(input: Omit<REDocument, 'id' | 'user_id' | 'created_at'>): Promise<REDocument> {
    const data = await this.rpcSingle<REDocument>('crm_re.create_document', { p_data: input });
    if (!data) throw new Error('Failed to create document');
    return data;
  }

  // ── District Analytics ─────────────────────────────────────────────────────

  async getDistrictAnalytics(city = 'Москва'): Promise<REDistrictAnalytics[]> {
    return this.rpcList<REDistrictAnalytics>('crm_re.get_district_analytics', { p_city: city });
  }

  // ── Mortgage Calculator ────────────────────────────────────────────────────

  async calcMortgage(
    price: number,
    downPaymentPct: number,
    rate: number,
    termYears: number,
  ): Promise<REMortgageCalc> {
    const data = await this.rpc<REMortgageCalc>('crm_re.calc_mortgage', {
      p_price: price,
      p_down_payment_pct: downPaymentPct,
      p_rate: rate,
      p_term_years: termYears,
    });
    return data;
  }

  // ── Commission Calculator (client-side, no DB) ─────────────────────────────

  calcCommission(price: number, commissionPct: number): {
    commission: number;
    agentShare: number;
    companyShare: number;
    nds: number;
    net: number;
  } {
    const commission = Math.round(price * commissionPct / 100);
    const agentShare = Math.round(commission * 0.6);   // 60% агенту
    const companyShare = Math.round(commission * 0.4); // 40% компании
    const nds = Math.round(commission * 0.2);          // НДС 20%
    const net = commission - nds;
    return { commission, agentShare, companyShare, nds, net };
  }

  // ── AVM (Automated Valuation Model) — client-side estimate ────────────────

  estimateAVM(
    district: string,
    areaSqm: number,
    rooms: number,
    analytics: REDistrictAnalytics[],
  ): { estimate: number; range_low: number; range_high: number; confidence: 'high' | 'medium' | 'low' } {
    const da = analytics.find(a => a.district === district);
    if (!da) return { estimate: 0, range_low: 0, range_high: 0, confidence: 'low' };

    const basePriceSqm = rooms === 1 ? da.avg_price_sqm_1r
                       : rooms === 2 ? da.avg_price_sqm_2r
                       : rooms >= 3  ? da.avg_price_sqm_3r
                       : da.avg_price_sqm;

    const estimate = Math.round(basePriceSqm * areaSqm);
    const variance = 0.08; // ±8%
    return {
      estimate,
      range_low:  Math.round(estimate * (1 - variance)),
      range_high: Math.round(estimate * (1 + variance)),
      confidence: da.listings_count > 500 ? 'high' : da.listings_count > 100 ? 'medium' : 'low',
    };
  }
}

export const crmRE = new CRMRealEstateAPI();
