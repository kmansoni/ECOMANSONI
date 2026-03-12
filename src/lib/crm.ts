import { supabase } from "./supabase";

export type Profession = 
  | 'default' 
  | 'auto' 
  | 'realestate' 
  | 'hr' 
  | 'smm' 
  | 'finance' 
  | 'medicine' 
  | 'education' 
  | 'beauty' 
  | 'restaurant' 
  | 'tourism'
  | 'retail'
  | 'logistics'
  | 'hotel'
  | 'entertainment'
  | 'fitness'
  | 'construction'
  | 'insurance'
  | 'health'
  | 'design'
  | 'agriculture';

export interface CRMUserProfile {
  id: string;
  user_id: string;
  profession: string;
  company_name: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CRMClientRecord {
  id: string;
  user_id: string;
  profession: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram_id: string | null;
  company: string | null;
  position: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  messenger_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMDeal {
  id: string;
  user_id: string;
  client_id: string | null;
  profession: string;
  title: string;
  description: string | null;
  value: number;
  currency: string;
  stage: string;
  probability: number;
  expected_close_date: string | null;
  actual_close_date: string | null;
  won: boolean;
  lost: boolean;
  lost_reason: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CRMTask {
  id: string;
  user_id: string;
  client_id: string | null;
  deal_id: string | null;
  profession: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  completed_at: string | null;
  reminder_at: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CRMInteraction {
  id: string;
  user_id: string;
  client_id: string | null;
  deal_id: string | null;
  profession: string;
  type: 'call' | 'message' | 'meeting' | 'email' | 'note';
  direction: 'incoming' | 'outgoing' | null;
  subject: string | null;
  content: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  next_action: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
}

export interface ProfessionConfig {
  id: string;
  profession: string;
  display_name: string;
  icon: string | null;
  color: string | null;
  pipeline_stages: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_clients: number;
  active_deals: number;
  won_deals: number;
  lost_deals: number;
  total_deals_value: number;
  active_deals_value: number;
  pipeline_value: number;
  commission_earned: number;
  pending_tasks: number;
  overdue_tasks: number;
  completed_tasks_this_week: number;
  available_properties: number;
  showings_today: number;
  showings_this_week: number;
  conversion_rate: number;
  new_clients_this_month: number;
  sources: Array<{ source: string; count: number; value: number }>;
}

// Real Estate: Property catalog
export type PropertyType = 'apartment' | 'room' | 'house' | 'townhouse' | 'commercial' | 'land' | 'garage' | 'parking';
export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'rented' | 'off_market';
export type DealType = 'sale' | 'rent' | 'sale_rent';

export interface CRMProperty {
  id: string;
  user_id: string;
  profession: string;
  title: string;
  deal_type: DealType;
  property_type: PropertyType;
  status: PropertyStatus;
  address: string | null;
  district: string | null;
  city: string;
  geo_lat: number | null;
  geo_lon: number | null;
  metro_station: string | null;
  metro_minutes: number | null;
  area_total: number | null;
  area_living: number | null;
  area_kitchen: number | null;
  land_area: number | null;
  rooms: number | null;
  floor: number | null;
  floors_total: number | null;
  building_year: number | null;
  building_type: string | null;
  condition: string | null;
  price: number | null;
  price_per_sqm: number | null;
  price_negotiable: boolean;
  commission_percent: number | null;
  commission_fixed: number | null;
  commission_shared: boolean;
  owner_name: string | null;
  owner_phone: string | null;
  exclusive: boolean;
  exclusive_until: string | null;
  description: string | null;
  photos: string[];
  floor_plan_url: string | null;
  video_url: string | null;
  features: string[];
  deal_id: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Client requirements (realestate buyer/renter profile)
export interface CRMClientRequirements {
  id: string;
  user_id: string;
  client_id: string;
  deal_type: 'buy' | 'rent' | null;
  property_types: string[];
  rooms_min: number | null;
  rooms_max: number | null;
  area_min: number | null;
  area_max: number | null;
  price_min: number | null;
  price_max: number | null;
  floor_min: number | null;
  floor_not_first: boolean;
  floor_not_last: boolean;
  districts: string[];
  metro_stations: string[];
  metro_max_min: number | null;
  features: string[];
  mortgage: boolean;
  mortgage_approved: boolean;
  budget_comment: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Showings (просмотры)
export interface CRMShowing {
  id: string;
  user_id: string;
  client_id: string | null;
  property_id: string | null;
  deal_id: string | null;
  scheduled_at: string;
  duration_min: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  outcome: string | null;
  feedback: string | null;
  next_step: string | null;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
}

// Deal documents
export interface CRMDealDocument {
  id: string;
  user_id: string;
  deal_id: string | null;
  client_id: string | null;
  property_id: string | null;
  doc_type: string;
  title: string;
  status: 'pending' | 'received' | 'signed' | 'submitted' | 'registered' | 'rejected';
  file_url: string | null;
  notes: string | null;
  due_date: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Source tracking constants
export const DEAL_SOURCES = [
  { value: 'direct', label: 'Прямой' },
  { value: 'avito', label: 'Авито' },
  { value: 'cian', label: 'ЦИАН' },
  { value: 'domclick', label: 'ДомКлик' },
  { value: 'yandex_realty', label: 'Яндекс.Недвижимость' },
  { value: 'referral', label: 'Рекомендация' },
  { value: 'social', label: 'Соцсети' },
  { value: 'website', label: 'Сайт' },
  { value: 'cold_call', label: 'Холодный звонок' },
  { value: 'other', label: 'Другое' },
] as const;

export const PROPERTY_FEATURES = [
  'Балкон', 'Лоджия', 'Парковка', 'Гараж', 'Лифт', 'Грузовой лифт',
  'Кладовая', 'Консьерж', 'Охрана', 'Видеонаблюдение', 'Домофон',
  'Мусоропровод', 'Газ', 'Крытая парковка', 'Детская площадка',
  'Закрытый двор', 'Евроремонт', 'Дизайнерский ремонт', 'Без ремонта',
  'Свободная планировка', 'Панорамный вид',
] as const;

// Standard real estate deal document checklist
export const RE_SALE_DOCS = [
  { doc_type: 'passport', title: 'Паспорт продавца' },
  { doc_type: 'title_deed', title: 'Правоустанавливающий документ' },
  { doc_type: 'egrul', title: 'Выписка из ЕГРН' },
  { doc_type: 'cadastral', title: 'Кадастровый паспорт' },
  { doc_type: 'tech_passport', title: 'Технический паспорт' },
  { doc_type: 'preliminary_contract', title: 'Предварительный договор купли-продажи' },
  { doc_type: 'advance_receipt', title: 'Расписка об авансе' },
  { doc_type: 'main_contract', title: 'Договор купли-продажи' },
  { doc_type: 'act_of_transfer', title: 'Акт приёма-передачи' },
  { doc_type: 'registration', title: 'Документы на регистрацию в Росреестре' },
] as const;

export interface PipelineStage {
  stage: string;
  count: number;
  total_value: number;
}

// CRM Client class
class CRMLib {
  private profession: Profession;

  constructor(profession: Profession = 'default') {
    this.profession = profession;
  }

  setProfession(profession: Profession) {
    this.profession = profession;
  }

  getProfession(): Profession {
    return this.profession;
  }

  private async rpcCall<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const { data, error } = await (supabase as any).rpc(fn, params ?? {});
    if (error) throw error;
    return data as T;
  }

  private async rpcList<T>(fn: string, params?: Record<string, unknown>): Promise<T[]> {
    const data = await this.rpcCall<unknown>(fn, params);
    return Array.isArray(data) ? (data as T[]) : [];
  }

  private async rpcSingle<T>(fn: string, params?: Record<string, unknown>): Promise<T | null> {
    const data = await this.rpcCall<unknown>(fn, params);
    if (Array.isArray(data)) {
      return (data[0] ?? null) as T | null;
    }
    if (data === null || data === undefined) {
      return null;
    }
    return data as T;
  }

  // User Profile
  async getProfile(): Promise<CRMUserProfile | null> {
    return this.rpcSingle<CRMUserProfile>('crm.get_user_profile', { p_profession: this.profession });
  }

  async upsertProfile(companyName?: string, settings?: Record<string, unknown>): Promise<CRMUserProfile> {
    const data = await this.rpcSingle<CRMUserProfile>('crm.upsert_user_profile', {
      p_profession: this.profession,
      p_company_name: companyName,
      p_settings: settings,
    });

    if (!data) {
      throw new Error('Failed to upsert CRM profile');
    }

    return data;
  }

  // Clients
  async getClients(): Promise<CRMClientRecord[]> {
    return this.rpcList<CRMClientRecord>('crm.get_clients', { p_profession: this.profession });
  }

  async getClient(id: string): Promise<CRMClientRecord | null> {
    return this.rpcSingle<CRMClientRecord>('crm.get_client', { p_id: id });
  }

  async createClient(client: Partial<CRMClientRecord>): Promise<CRMClientRecord> {
    const data = await this.rpcSingle<CRMClientRecord>('crm.create_client', {
      p_profession: this.profession,
      p_name: client.name,
      p_phone: client.phone,
      p_email: client.email,
      p_telegram_id: client.telegram_id,
      p_company: client.company,
      p_position: client.position,
      p_address: client.address,
      p_notes: client.notes,
      p_tags: client.tags,
      p_custom_fields: client.custom_fields,
    });

    if (!data) {
      throw new Error('Failed to create CRM client');
    }

    return data;
  }

  async updateClient(id: string, updates: Partial<CRMClientRecord>): Promise<CRMClientRecord> {
    const data = await this.rpcSingle<CRMClientRecord>('crm.update_client', {
      p_id: id,
      p_name: updates.name,
      p_phone: updates.phone,
      p_email: updates.email,
      p_telegram_id: updates.telegram_id,
      p_company: updates.company,
      p_position: updates.position,
      p_address: updates.address,
      p_notes: updates.notes,
      p_tags: updates.tags,
      p_custom_fields: updates.custom_fields,
    });

    if (!data) {
      throw new Error('Failed to update CRM client');
    }

    return data;
  }

  async deleteClient(id: string): Promise<boolean> {
    const data = await this.rpcCall<unknown>('crm.delete_client', { p_id: id });
    return Boolean(data);
  }

  // Deals
  async getDeals(): Promise<CRMDeal[]> {
    return this.rpcList<CRMDeal>('crm.get_deals', { p_profession: this.profession });
  }

  async getDeal(id: string): Promise<CRMDeal | null> {
    return this.rpcSingle<CRMDeal>('crm.get_deal', { p_id: id });
  }

  async createDeal(deal: Partial<CRMDeal>): Promise<CRMDeal> {
    const data = await this.rpcSingle<CRMDeal>('crm.create_deal', {
      p_profession: this.profession,
      p_client_id: deal.client_id,
      p_title: deal.title,
      p_description: deal.description,
      p_value: deal.value,
      p_currency: deal.currency || 'RUB',
      p_stage: deal.stage || 'new',
      p_probability: deal.probability,
      p_expected_close_date: deal.expected_close_date,
      p_custom_fields: deal.custom_fields,
    });

    if (!data) {
      throw new Error('Failed to create CRM deal');
    }

    return data;
  }

  async updateDeal(id: string, updates: Partial<CRMDeal>): Promise<CRMDeal> {
    const data = await this.rpcSingle<CRMDeal>('crm.update_deal', {
      p_id: id,
      p_client_id: updates.client_id,
      p_title: updates.title,
      p_description: updates.description,
      p_value: updates.value,
      p_currency: updates.currency,
      p_stage: updates.stage,
      p_probability: updates.probability,
      p_expected_close_date: updates.expected_close_date,
      p_won: updates.won,
      p_lost: updates.lost,
      p_lost_reason: updates.lost_reason,
      p_custom_fields: updates.custom_fields,
    });

    if (!data) {
      throw new Error('Failed to update CRM deal');
    }

    return data;
  }

  async deleteDeal(id: string): Promise<boolean> {
    const data = await this.rpcCall<unknown>('crm.delete_deal', { p_id: id });
    return Boolean(data);
  }

  async getPipeline(): Promise<PipelineStage[]> {
    return this.rpcList<PipelineStage>('crm.get_deals_pipeline', { p_profession: this.profession });
  }

  // Tasks
  async getTasks(status?: string): Promise<CRMTask[]> {
    return this.rpcList<CRMTask>('crm.get_tasks', {
      p_profession: this.profession,
      p_status: status,
    });
  }

  async getTask(id: string): Promise<CRMTask | null> {
    return this.rpcSingle<CRMTask>('crm.get_task', { p_id: id });
  }

  async createTask(task: Partial<CRMTask>): Promise<CRMTask> {
    const data = await this.rpcSingle<CRMTask>('crm.create_task', {
      p_profession: this.profession,
      p_client_id: task.client_id,
      p_deal_id: task.deal_id,
      p_title: task.title,
      p_description: task.description,
      p_status: task.status || 'pending',
      p_priority: task.priority || 'medium',
      p_due_date: task.due_date,
      p_reminder_at: task.reminder_at,
      p_custom_fields: task.custom_fields,
    });

    if (!data) {
      throw new Error('Failed to create CRM task');
    }

    return data;
  }

  async updateTask(id: string, updates: Partial<CRMTask>): Promise<CRMTask> {
    const data = await this.rpcSingle<CRMTask>('crm.update_task', {
      p_id: id,
      p_client_id: updates.client_id,
      p_deal_id: updates.deal_id,
      p_title: updates.title,
      p_description: updates.description,
      p_status: updates.status,
      p_priority: updates.priority,
      p_due_date: updates.due_date,
      p_reminder_at: updates.reminder_at,
      p_custom_fields: updates.custom_fields,
    });

    if (!data) {
      throw new Error('Failed to update CRM task');
    }

    return data;
  }

  async completeTask(id: string): Promise<CRMTask> {
    const data = await this.rpcSingle<CRMTask>('crm.complete_task', { p_id: id });
    if (!data) {
      throw new Error('Failed to complete CRM task');
    }
    return data;
  }

  async deleteTask(id: string): Promise<boolean> {
    const data = await this.rpcCall<unknown>('crm.delete_task', { p_id: id });
    return Boolean(data);
  }

  // Interactions
  async getInteractions(clientId?: string, type?: string): Promise<CRMInteraction[]> {
    return this.rpcList<CRMInteraction>('crm.get_interactions', {
      p_client_id: clientId,
      p_type: type,
    });
  }

  async createInteraction(interaction: Partial<CRMInteraction>): Promise<CRMInteraction> {
    const data = await this.rpcSingle<CRMInteraction>('crm.create_interaction', {
      p_profession: this.profession,
      p_client_id: interaction.client_id,
      p_deal_id: interaction.deal_id,
      p_type: interaction.type,
      p_direction: interaction.direction,
      p_subject: interaction.subject,
      p_content: interaction.content,
      p_duration_seconds: interaction.duration_seconds,
      p_outcome: interaction.outcome,
      p_next_action: interaction.next_action,
      p_custom_fields: interaction.custom_fields,
    });

    if (!data) {
      throw new Error('Failed to create CRM interaction');
    }

    return data;
  }

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    const data = await this.rpcSingle<DashboardStats>('crm.get_dashboard_stats', { p_profession: this.profession });
    return data || {
      total_clients: 0,
      active_deals: 0,
      won_deals: 0,
      lost_deals: 0,
      total_deals_value: 0,
      active_deals_value: 0,
      pipeline_value: 0,
      commission_earned: 0,
      pending_tasks: 0,
      overdue_tasks: 0,
      completed_tasks_this_week: 0,
      available_properties: 0,
      showings_today: 0,
      showings_this_week: 0,
      conversion_rate: 0,
      new_clients_this_month: 0,
      sources: [],
    };
  }

  // Chat integration
  async linkClientToConversation(clientId: string, conversationId: string): Promise<CRMClientRecord> {
    const data = await this.rpcSingle<CRMClientRecord>('crm.link_client_to_conversation', {
      p_client_id: clientId,
      p_conversation_id: conversationId,
    });

    if (!data) {
      throw new Error('Failed to link client to conversation');
    }

    return data;
  }

  async getClientByConversation(conversationId: string): Promise<CRMClientRecord | null> {
    return this.rpcSingle<CRMClientRecord>('crm.get_client_by_conversation', {
      p_conversation_id: conversationId,
    });
  }

  // ─── Properties ───────────────────────────────────────────────────────────

  async getProperties(filters?: {
    status?: string;
    dealType?: string;
    priceMin?: number;
    priceMax?: number;
    rooms?: number;
  }): Promise<CRMProperty[]> {
    return this.rpcList<CRMProperty>('crm.get_properties', {
      p_status:    filters?.status    ?? null,
      p_deal_type: filters?.dealType  ?? null,
      p_price_min: filters?.priceMin  ?? null,
      p_price_max: filters?.priceMax  ?? null,
      p_rooms:     filters?.rooms     ?? null,
    });
  }

  async createProperty(p: Partial<CRMProperty>): Promise<CRMProperty> {
    const data = await this.rpcSingle<CRMProperty>('crm.create_property', {
      p_title:              p.title ?? '',
      p_deal_type:          p.deal_type ?? 'sale',
      p_property_type:      p.property_type ?? 'apartment',
      p_address:            p.address ?? null,
      p_district:           p.district ?? null,
      p_city:               p.city ?? 'Москва',
      p_area_total:         p.area_total ?? null,
      p_rooms:              p.rooms ?? null,
      p_floor:              p.floor ?? null,
      p_floors_total:       p.floors_total ?? null,
      p_price:              p.price ?? null,
      p_commission_percent: p.commission_percent ?? null,
      p_owner_name:         p.owner_name ?? null,
      p_owner_phone:        p.owner_phone ?? null,
      p_exclusive:          p.exclusive ?? false,
      p_features:           p.features ?? [],
      p_description:        p.description ?? null,
      p_condition:          p.condition ?? null,
      p_building_type:      p.building_type ?? null,
      p_custom_fields:      p.custom_fields ?? {},
    });
    if (!data) throw new Error('Failed to create property');
    return data;
  }

  async updateProperty(id: string, updates: Partial<CRMProperty>): Promise<CRMProperty> {
    const data = await this.rpcSingle<CRMProperty>('crm.update_property', {
      p_id:                 id,
      p_title:              updates.title              ?? null,
      p_status:             updates.status             ?? null,
      p_deal_type:          updates.deal_type          ?? null,
      p_address:            updates.address            ?? null,
      p_district:           updates.district           ?? null,
      p_area_total:         updates.area_total         ?? null,
      p_rooms:              updates.rooms              ?? null,
      p_floor:              updates.floor              ?? null,
      p_price:              updates.price              ?? null,
      p_commission_percent: updates.commission_percent ?? null,
      p_owner_name:         updates.owner_name         ?? null,
      p_owner_phone:        updates.owner_phone        ?? null,
      p_exclusive:          updates.exclusive          ?? null,
      p_features:           updates.features           ?? null,
      p_description:        updates.description        ?? null,
      p_deal_id:            updates.deal_id            ?? null,
    });
    if (!data) throw new Error('Failed to update property');
    return data;
  }

  async deleteProperty(id: string): Promise<boolean> {
    const data = await this.rpcCall<unknown>('crm.delete_property', { p_id: id });
    return Boolean(data);
  }

  async matchPropertiesForClient(clientId: string): Promise<CRMProperty[]> {
    return this.rpcList<CRMProperty>('crm.match_properties_for_client', { p_client_id: clientId });
  }

  // ─── Showings ─────────────────────────────────────────────────────────────

  async getShowings(filters?: {
    clientId?: string;
    propertyId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CRMShowing[]> {
    return this.rpcList<CRMShowing>('crm.get_showings', {
      p_client_id:   filters?.clientId   ?? null,
      p_property_id: filters?.propertyId ?? null,
      p_date_from:   filters?.dateFrom   ?? null,
      p_date_to:     filters?.dateTo     ?? null,
    });
  }

  async createShowing(s: {
    clientId: string;
    propertyId: string;
    scheduledAt: string;
    durationMin?: number;
    dealId?: string;
    notes?: string;
  }): Promise<CRMShowing> {
    const data = await this.rpcSingle<CRMShowing>('crm.create_showing', {
      p_client_id:    s.clientId,
      p_property_id:  s.propertyId,
      p_scheduled_at: s.scheduledAt,
      p_duration_min: s.durationMin ?? 60,
      p_deal_id:      s.dealId ?? null,
      p_notes:        s.notes ?? null,
    });
    if (!data) throw new Error('Failed to create showing');
    return data;
  }

  async updateShowing(id: string, updates: {
    status?: string;
    outcome?: string;
    feedback?: string;
    nextStep?: string;
    scheduledAt?: string;
  }): Promise<CRMShowing> {
    const data = await this.rpcSingle<CRMShowing>('crm.update_showing', {
      p_id:           id,
      p_status:       updates.status      ?? null,
      p_outcome:      updates.outcome     ?? null,
      p_feedback:     updates.feedback    ?? null,
      p_next_step:    updates.nextStep    ?? null,
      p_scheduled_at: updates.scheduledAt ?? null,
    });
    if (!data) throw new Error('Failed to update showing');
    return data;
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  async getDealDocuments(dealId: string): Promise<CRMDealDocument[]> {
    return this.rpcList<CRMDealDocument>('crm.get_deal_documents', { p_deal_id: dealId });
  }

  async upsertDealDocument(doc: Partial<CRMDealDocument> & { deal_id: string; doc_type: string; title: string }): Promise<CRMDealDocument> {
    const data = await this.rpcSingle<CRMDealDocument>('crm.upsert_deal_document', {
      p_deal_id:  doc.deal_id,
      p_doc_type: doc.doc_type,
      p_title:    doc.title,
      p_status:   doc.status   ?? 'pending',
      p_notes:    doc.notes    ?? null,
      p_due_date: doc.due_date ?? null,
      p_id:       doc.id       ?? null,
    });
    if (!data) throw new Error('Failed to upsert document');
    return data;
  }

  // ─── Client Requirements ──────────────────────────────────────────────────

  async upsertClientRequirements(req: Partial<CRMClientRequirements> & { client_id: string }): Promise<CRMClientRequirements> {
    const data = await this.rpcSingle<CRMClientRequirements>('crm.upsert_client_requirements', {
      p_client_id:     req.client_id,
      p_deal_type:     req.deal_type      ?? 'buy',
      p_property_types: req.property_types ?? [],
      p_rooms_min:     req.rooms_min      ?? null,
      p_rooms_max:     req.rooms_max      ?? null,
      p_price_min:     req.price_min      ?? null,
      p_price_max:     req.price_max      ?? null,
      p_districts:     req.districts      ?? [],
      p_mortgage:      req.mortgage       ?? false,
      p_notes:         req.notes          ?? null,
    });
    if (!data) throw new Error('Failed to upsert requirements');
    return data;
  }

  // ─── Enhanced Dashboard ───────────────────────────────────────────────────

  async getDashboardStatsV2(): Promise<DashboardStats> {
    const data = await this.rpcSingle<DashboardStats>('crm.get_dashboard_stats_v2', { p_profession: this.profession });
    return data || {
      total_clients: 0, active_deals: 0, won_deals: 0, lost_deals: 0,
      total_deals_value: 0, active_deals_value: 0, pipeline_value: 0,
      commission_earned: 0, pending_tasks: 0, overdue_tasks: 0,
      completed_tasks_this_week: 0, available_properties: 0,
      showings_today: 0, showings_this_week: 0, conversion_rate: 0,
      new_clients_this_month: 0, sources: [],
    };
  }

  // ─── HR: Jobs ─────────────────────────────────────────────────────────────

  async getHRJobs(status?: string): Promise<HRJob[]> {
    return this.rpcList<HRJob>('crm.get_hr_jobs', { p_status: status ?? null });
  }

  async createHRJob(job: Partial<HRJob>): Promise<HRJob> {
    const data = await this.rpcSingle<HRJob>('crm.create_hr_job', {
      p_title:            job.title ?? '',
      p_department:       job.department ?? null,
      p_team:             job.team ?? null,
      p_location:         job.location ?? null,
      p_employment_type:  job.employment_type ?? 'full_time',
      p_grade:            job.grade ?? null,
      p_salary_min:       job.salary_min ?? null,
      p_salary_max:       job.salary_max ?? null,
      p_salary_hidden:    job.salary_hidden ?? false,
      p_required_skills:  job.required_skills ?? [],
      p_preferred_skills: job.preferred_skills ?? [],
      p_experience_min:   job.experience_min ?? null,
      p_english_level:    job.english_level ?? null,
      p_description:      job.description ?? null,
      p_responsibilities: job.responsibilities ?? null,
      p_conditions:       job.conditions ?? null,
      p_status:           job.status ?? 'open',
      p_priority:         job.priority ?? 'normal',
      p_openings:         job.openings ?? 1,
      p_hiring_manager:   job.hiring_manager ?? null,
      p_deadline:         job.deadline ?? null,
    });
    if (!data) throw new Error('Failed to create HR job');
    return data;
  }

  async updateHRJob(id: string, updates: Partial<HRJob>): Promise<HRJob> {
    const data = await this.rpcSingle<HRJob>('crm.update_hr_job', {
      p_id:               id,
      p_title:            updates.title            ?? null,
      p_department:       updates.department       ?? null,
      p_grade:            updates.grade            ?? null,
      p_salary_min:       updates.salary_min       ?? null,
      p_salary_max:       updates.salary_max       ?? null,
      p_required_skills:  updates.required_skills  ?? null,
      p_preferred_skills: updates.preferred_skills ?? null,
      p_status:           updates.status           ?? null,
      p_priority:         updates.priority         ?? null,
      p_openings:         updates.openings         ?? null,
      p_description:      updates.description      ?? null,
      p_conditions:       updates.conditions       ?? null,
      p_deadline:         updates.deadline         ?? null,
    });
    if (!data) throw new Error('Failed to update HR job');
    return data;
  }

  async deleteHRJob(id: string): Promise<boolean> {
    const data = await this.rpcCall<unknown>('crm.delete_hr_job', { p_id: id });
    return Boolean(data);
  }

  // ─── HR: Candidates ───────────────────────────────────────────────────────

  async getHRCandidates(jobId?: string, blacklisted = false): Promise<HRCandidate[]> {
    return this.rpcList<HRCandidate>('crm.get_hr_candidates', {
      p_job_id:     jobId      ?? null,
      p_blacklisted: blacklisted,
    });
  }

  async createHRCandidate(c: Partial<HRCandidate>): Promise<HRCandidate> {
    const data = await this.rpcSingle<HRCandidate>('crm.create_hr_candidate', {
      p_name:              c.name ?? '',
      p_phone:             c.phone ?? null,
      p_email:             c.email ?? null,
      p_telegram_handle:   c.telegram_handle ?? null,
      p_linkedin_url:      c.linkedin_url ?? null,
      p_resume_url:        c.resume_url ?? null,
      p_current_company:   c.current_company ?? null,
      p_current_position:  c.current_position ?? null,
      p_current_salary:    c.current_salary ?? null,
      p_expected_salary:   c.expected_salary ?? null,
      p_experience_years:  c.experience_years ?? null,
      p_grade:             c.grade ?? null,
      p_skills:            c.skills ?? [],
      p_english_level:     c.english_level ?? null,
      p_city:              c.city ?? null,
      p_willing_to_relocate: c.willing_to_relocate ?? false,
      p_work_format:       c.work_format ?? 'any',
      p_source:            c.source ?? 'direct',
      p_tags:              c.tags ?? [],
      p_notes:             c.notes ?? null,
    });
    if (!data) throw new Error('Failed to create HR candidate');
    return data;
  }

  async updateHRCandidate(id: string, updates: Partial<HRCandidate>): Promise<HRCandidate> {
    const data = await this.rpcSingle<HRCandidate>('crm.update_hr_candidate', {
      p_id:              id,
      p_name:            updates.name             ?? null,
      p_phone:           updates.phone            ?? null,
      p_email:           updates.email            ?? null,
      p_expected_salary: updates.expected_salary  ?? null,
      p_grade:           updates.grade            ?? null,
      p_skills:          updates.skills           ?? null,
      p_source:          updates.source           ?? null,
      p_tags:            updates.tags             ?? null,
      p_notes:           updates.notes            ?? null,
      p_blacklisted:     updates.blacklisted      ?? null,
      p_blacklist_reason: updates.blacklist_reason ?? null,
      p_vip:             updates.vip              ?? null,
    });
    if (!data) throw new Error('Failed to update HR candidate');
    return data;
  }

  // ─── HR: Applications ─────────────────────────────────────────────────────

  async getHRApplications(jobId?: string, candidateId?: string, stage?: string): Promise<HRApplication[]> {
    return this.rpcList<HRApplication>('crm.get_hr_applications', {
      p_job_id:       jobId       ?? null,
      p_candidate_id: candidateId ?? null,
      p_stage:        stage       ?? null,
    });
  }

  async createHRApplication(jobId: string, candidateId: string, stage = 'new', notes?: string): Promise<HRApplication> {
    const data = await this.rpcSingle<HRApplication>('crm.create_hr_application', {
      p_job_id:          jobId,
      p_candidate_id:    candidateId,
      p_stage:           stage,
      p_recruiter_notes: notes ?? null,
    });
    if (!data) throw new Error('Failed to create HR application');
    return data;
  }

  async moveHRApplicationStage(id: string, stage: string, notes?: string, rejectReason?: string, score?: number): Promise<HRApplication> {
    const data = await this.rpcSingle<HRApplication>('crm.move_hr_application_stage', {
      p_id:            id,
      p_stage:         stage,
      p_notes:         notes         ?? null,
      p_reject_reason: rejectReason  ?? null,
      p_score:         score         ?? null,
    });
    if (!data) throw new Error('Failed to move HR application stage');
    return data;
  }

  // ─── HR: Interviews ───────────────────────────────────────────────────────

  async getHRInterviews(applicationId?: string): Promise<HRInterview[]> {
    return this.rpcList<HRInterview>('crm.get_hr_interviews', {
      p_application_id: applicationId ?? null,
      p_date_from: null,
    });
  }

  async createHRInterview(data: {
    applicationId: string;
    candidateId: string;
    jobId: string;
    type: string;
    scheduledAt: string;
    durationMin?: number;
    location?: string;
    meetingLink?: string;
    interviewers?: string[];
  }): Promise<HRInterview> {
    const result = await this.rpcSingle<HRInterview>('crm.create_hr_interview', {
      p_application_id: data.applicationId,
      p_candidate_id:   data.candidateId,
      p_job_id:         data.jobId,
      p_interview_type: data.type,
      p_scheduled_at:   data.scheduledAt,
      p_duration_min:   data.durationMin ?? 60,
      p_location:       data.location ?? null,
      p_meeting_link:   data.meetingLink ?? null,
      p_interviewers:   data.interviewers ?? [],
    });
    if (!result) throw new Error('Failed to create HR interview');
    return result;
  }

  async completeHRInterview(id: string, data: {
    scorecard?: HRScorecardItem[];
    overallScore?: number;
    recommendation?: string;
    feedback?: string;
  }): Promise<HRInterview> {
    const result = await this.rpcSingle<HRInterview>('crm.complete_hr_interview', {
      p_id:              id,
      p_scorecard:       data.scorecard       ?? [],
      p_overall_score:   data.overallScore    ?? null,
      p_recommendation:  data.recommendation  ?? null,
      p_feedback:        data.feedback        ?? null,
    });
    if (!result) throw new Error('Failed to complete HR interview');
    return result;
  }

  // ─── HR: Offers ───────────────────────────────────────────────────────────

  async createHROffer(data: {
    applicationId: string;
    candidateId: string;
    jobId: string;
    offeredSalary: number;
    startDate?: string;
    probationMonths?: number;
    bonuses?: string;
    offerText?: string;
    deadline?: string;
  }): Promise<HROffer> {
    const result = await this.rpcSingle<HROffer>('crm.create_hr_offer', {
      p_application_id:  data.applicationId,
      p_candidate_id:    data.candidateId,
      p_job_id:          data.jobId,
      p_offered_salary:  data.offeredSalary,
      p_start_date:      data.startDate      ?? null,
      p_probation_months: data.probationMonths ?? 3,
      p_bonuses:         data.bonuses        ?? null,
      p_offer_text:      data.offerText      ?? null,
      p_deadline:        data.deadline       ?? null,
    });
    if (!result) throw new Error('Failed to create HR offer');
    return result;
  }

  async updateHROfferStatus(id: string, status: string, declineReason?: string): Promise<HROffer> {
    const data = await this.rpcSingle<HROffer>('crm.update_hr_offer_status', {
      p_id:             id,
      p_status:         status,
      p_decline_reason: declineReason ?? null,
    });
    if (!data) throw new Error('Failed to update HR offer status');
    return data;
  }

  // ─── HR: Dashboard ────────────────────────────────────────────────────────

  async getHRDashboardStats(): Promise<HRDashboardStats> {
    const data = await this.rpcSingle<HRDashboardStats>('crm.get_hr_dashboard_stats', {});
    return data || {
      open_jobs: 0, total_jobs: 0, urgent_jobs: 0,
      total_candidates: 0, active_applications: 0,
      hired_this_month: 0, hired_total: 0, rejected_total: 0,
      funnel: [], interviews_today: 0, interviews_this_week: 0,
      offers_sent: 0, offers_accepted: 0, offer_accept_rate: 0,
      candidate_sources: [], avg_time_to_hire_days: null,
      new_candidates_week: 0,
    };
  }

  // ─── HR Advanced: Templates ────────────────────────────────────────────────

  async getHRTemplates(category?: string): Promise<HRTemplate[]> {
    return this.rpcList<HRTemplate>('crm.get_hr_templates', {
      p_category: category ?? null,
    });
  }

  async upsertHRTemplate(t: Partial<HRTemplate> & { name: string; category: string; body: string }): Promise<HRTemplate> {
    const data = await this.rpcSingle<HRTemplate>('crm.upsert_hr_template', {
      p_id:           t.id       ?? null,
      p_name:         t.name,
      p_category:     t.category,
      p_subject:      t.subject  ?? null,
      p_body:         t.body,
      p_is_default:   t.is_default   ?? false,
      p_send_channel: t.send_channel ?? 'email',
    });
    if (!data) throw new Error('Failed to upsert HR template');
    return data;
  }

  async seedHRTemplates(): Promise<void> {
    await this.rpcCall('crm.seed_hr_templates', {});
  }

  // Render template — replaces {{placeholders}} with actual values
  renderTemplate(template: HRTemplate, vars: Record<string, string>): { subject: string; body: string } {
    const replace = (text: string) =>
      Object.entries(vars).reduce((t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v), text);
    return {
      subject: replace(template.subject ?? ''),
      body:    replace(template.body),
    };
  }

  // ─── HR Advanced: Onboarding ───────────────────────────────────────────────

  async getHROnboarding(candidateId?: string): Promise<HROnboarding[]> {
    const raw = await this.rpcList<Record<string, unknown>>('crm.get_hr_onboarding', {
      p_candidate_id: candidateId ?? null,
    });
    return raw.map(r => ({
      ...r,
      tasks: Array.isArray(r.tasks) ? r.tasks as HROnboardingTask[] : JSON.parse(r.tasks as string ?? '[]') as HROnboardingTask[],
    })) as HROnboarding[];
  }

  async createHROnboarding(data: {
    candidateId: string;
    applicationId: string;
    jobId: string;
    startDate: string;
    probationEnd?: string;
    buddy?: string;
    manager?: string;
  }): Promise<HROnboarding> {
    const result = await this.rpcSingle<Record<string, unknown>>('crm.create_hr_onboarding', {
      p_candidate_id:    data.candidateId,
      p_application_id:  data.applicationId,
      p_job_id:          data.jobId,
      p_start_date:      data.startDate,
      p_probation_end:   data.probationEnd   ?? null,
      p_buddy:           data.buddy          ?? null,
      p_manager:         data.manager        ?? null,
    });
    if (!result) throw new Error('Failed to create onboarding');
    return {
      ...result,
      tasks: Array.isArray(result.tasks) ? result.tasks as HROnboardingTask[] : [],
    } as HROnboarding;
  }

  async updateHROnboardingTask(onboardingId: string, taskId: string, completed: boolean, notes?: string): Promise<HROnboarding> {
    const result = await this.rpcSingle<Record<string, unknown>>('crm.update_hr_onboarding_task', {
      p_onboarding_id: onboardingId,
      p_task_id:       taskId,
      p_completed:     completed,
      p_notes:         notes ?? null,
    });
    if (!result) throw new Error('Failed to update onboarding task');
    return {
      ...result,
      tasks: Array.isArray(result.tasks) ? result.tasks as HROnboardingTask[] : [],
    } as HROnboarding;
  }

  // ─── HR Advanced: КЭДО Documents ──────────────────────────────────────────

  async getHREmploymentDocs(candidateId: string): Promise<HREmploymentDoc[]> {
    return this.rpcList<HREmploymentDoc>('crm.get_hr_employment_docs', { p_candidate_id: candidateId });
  }

  /** Загрузить все КЭДО-документы по всем кандидатам (для дашборда) */
  async getAllHREmploymentDocs(): Promise<HREmploymentDoc[]> {
    return this.rpcList<HREmploymentDoc>('crm.get_hr_employment_docs', { p_candidate_id: null });
  }

  async upsertHREmploymentDoc(doc: Partial<HREmploymentDoc> & { candidate_id: string; doc_type: string; title: string }): Promise<HREmploymentDoc> {
    const data = await this.rpcSingle<HREmploymentDoc>('crm.upsert_hr_employment_doc', {
      p_id:           doc.id           ?? null,
      p_candidate_id: doc.candidate_id,
      p_doc_type:     doc.doc_type,
      p_title:        doc.title,
      p_status:       doc.status       ?? 'pending',
      p_send_method:  doc.send_method  ?? 'email',
      p_notes:        doc.notes        ?? null,
    });
    if (!data) throw new Error('Failed to upsert employment doc');
    return data;
  }

  // ─── HR Advanced: AI Scoring ───────────────────────────────────────────────

  async computeHRAIScore(applicationId: string): Promise<HRApplication> {
    const data = await this.rpcSingle<HRApplication>('crm.compute_hr_ai_score', {
      p_application_id: applicationId,
    });
    if (!data) throw new Error('Failed to compute AI score');
    return data;
  }

  // ─── HR Advanced: Employer Brand ──────────────────────────────────────────

  async getEmployerBrand(): Promise<HREmployerBrand | null> {
    return this.rpcSingle<HREmployerBrand>('crm.upsert_employer_brand', {
      p_company_name: '',
    }).catch(() => null);
  }

  async upsertEmployerBrand(brand: Partial<HREmployerBrand> & { company_name: string }): Promise<HREmployerBrand> {
    const data = await this.rpcSingle<HREmployerBrand>('crm.upsert_employer_brand', {
      p_company_name:      brand.company_name,
      p_enps_score:        brand.enps_score       ?? null,
      p_dreamjob_rating:   brand.dreamjob_rating   ?? null,
      p_evp_items:         brand.evp_items         ?? [],
      p_awards:            brand.awards            ?? [],
    });
    if (!data) throw new Error('Failed to upsert employer brand');
    return data;
  }

  // ══════════════════════════════════════════════════════════════
  // AUTO / AUTOMOTIVE CRM METHODS
  // ══════════════════════════════════════════════════════════════

  async getAutoDashboardStats(): Promise<AutoDashboardStats> {
    const data = await this.rpcSingle<AutoDashboardStats>('crm.get_auto_dashboard_stats', {});
    if (!data) return {} as AutoDashboardStats;
    return data;
  }

  async getAutoVehicles(params?: { status?: string; category?: string; make?: string }): Promise<AutoVehicle[]> {
    return this.rpcList<AutoVehicle>('crm.get_auto_vehicles', {
      p_status:   params?.status   ?? null,
      p_category: params?.category ?? null,
      p_make:     params?.make     ?? null,
    });
  }

  async upsertAutoVehicle(v: Partial<AutoVehicle> & { make: string; model: string; year: number; price: number; mileage: number }): Promise<AutoVehicle> {
    const data = await this.rpcSingle<AutoVehicle>('crm.upsert_auto_vehicle', {
      p_id:                 v.id ?? null,
      p_make:               v.make,
      p_model:              v.model,
      p_year:               v.year,
      p_mileage:            v.mileage,
      p_price:              v.price,
      p_condition:          v.condition          ?? 'used',
      p_engine_volume:      v.engine_volume      ?? null,
      p_engine_type:        v.engine_type        ?? null,
      p_transmission:       v.transmission       ?? null,
      p_drive:              v.drive              ?? null,
      p_body_type:          v.body_type          ?? null,
      p_color:              v.color              ?? null,
      p_vin:                v.vin                ?? null,
      p_city:               v.city               ?? null,
      p_status:             v.status             ?? 'draft',
      p_vehicle_category:   v.vehicle_category   ?? 'car',
      p_description:        v.description        ?? null,
      p_is_dealer:          v.is_dealer          ?? false,
      p_reserve_online:     v.reserve_online     ?? false,
      p_reserve_deposit:    v.reserve_deposit    ?? null,
      p_credit_available:   v.credit_available   ?? false,
      p_leasing_available:  v.leasing_available  ?? false,
      p_trade_in_accepted:  v.trade_in_accepted  ?? true,
      p_is_electric:        v.is_electric        ?? false,
      p_range_km:           v.range_km           ?? null,
      p_negotiable:         v.negotiable         ?? true,
    });
    if (!data) throw new Error('Failed to upsert vehicle');
    return data;
  }

  async changeVehicleStatus(vehicleId: string, status: AutoVehicle['status'], newPrice?: number): Promise<AutoVehicle> {
    const data = await this.rpcSingle<AutoVehicle>('crm.change_vehicle_status', {
      p_vehicle_id: vehicleId,
      p_status:     status,
      p_new_price:  newPrice ?? null,
    });
    if (!data) throw new Error('Failed to update vehicle status');
    return data;
  }

  async getAutoLeads(params?: { stage?: string; priority?: string; vehicleId?: string }): Promise<AutoLead[]> {
    return this.rpcList<AutoLead>('crm.get_auto_leads', {
      p_stage:      params?.stage      ?? null,
      p_priority:   params?.priority   ?? null,
      p_vehicle_id: params?.vehicleId  ?? null,
    });
  }

  async upsertAutoLead(l: Partial<AutoLead> & { name: string; phone: string; source: string }): Promise<AutoLead> {
    const data = await this.rpcSingle<AutoLead>('crm.upsert_auto_lead', {
      p_id:         l.id         ?? null,
      p_vehicle_id: l.vehicle_id ?? null,
      p_name:       l.name,
      p_phone:      l.phone,
      p_email:      l.email      ?? null,
      p_source:     l.source,
      p_stage:      l.stage      ?? 'new',
      p_priority:   l.priority   ?? 'normal',
      p_message:    l.message    ?? null,
      p_budget_min: l.budget_min ?? null,
      p_budget_max: l.budget_max ?? null,
      p_notes:      l.notes      ?? null,
    });
    if (!data) throw new Error('Failed to upsert lead');
    return data;
  }

  async moveAutoLeadStage(leadId: string, stage: AutoLead['stage'], notes?: string, lostReason?: string): Promise<AutoLead> {
    const data = await this.rpcSingle<AutoLead>('crm.move_auto_lead_stage', {
      p_lead_id:     leadId,
      p_stage:       stage,
      p_notes:       notes      ?? null,
      p_lost_reason: lostReason ?? null,
    });
    if (!data) throw new Error('Failed to move lead stage');
    return data;
  }

  async computeAutoValuation(params: {
    vehicleId?: string; make?: string; model?: string; year?: number;
    mileage?: number; condition?: string; city?: string;
  }): Promise<AutoValuation> {
    const data = await this.rpcSingle<AutoValuation>('crm.compute_auto_valuation', {
      p_vehicle_id: params.vehicleId ?? null,
      p_make:       params.make      ?? null,
      p_model:      params.model     ?? null,
      p_year:       params.year      ?? null,
      p_mileage:    params.mileage   ?? null,
      p_condition:  params.condition ?? 'good',
      p_city:       params.city      ?? null,
    });
    if (!data) throw new Error('Failed to compute valuation');
    return data;
  }

  async getAutoTestDrives(): Promise<AutoTestDrive[]> {
    return this.rpcList<AutoTestDrive>('crm.get_auto_test_drives', {});
  }

  async upsertAutoTestDrive(td: Partial<AutoTestDrive> & { clientName: string; clientPhone: string; scheduledAt: string; vehicleId: string }): Promise<AutoTestDrive> {
    const data = await this.rpcSingle<AutoTestDrive>('crm.upsert_auto_test_drive', {
      p_id:           td.id           ?? null,
      p_vehicle_id:   td.vehicleId,
      p_lead_id:      td.lead_id      ?? null,
      p_client_name:  td.clientName,
      p_client_phone: td.clientPhone,
      p_scheduled_at: td.scheduledAt,
      p_duration_min: td.duration_min ?? 30,
      p_manager:      td.manager      ?? null,
      p_status:       td.status       ?? null,
    });
    if (!data) throw new Error('Failed to upsert test drive');
    return data;
  }
}

// ══════════════════════════════════════════════════════════════
// HR / RECRUITING TYPES
// ══════════════════════════════════════════════════════════════

export type HREmploymentType = 'full_time'|'part_time'|'remote'|'hybrid'|'contract'|'internship'|'freelance';
export type HRGrade = 'intern'|'junior'|'middle'|'senior'|'lead'|'principal'|'director'|'head'|'vp'|'cxo';
export type HREnglishLevel = 'none'|'basic'|'pre_intermediate'|'intermediate'|'upper_intermediate'|'advanced'|'fluent';
export type HRJobStatus = 'draft'|'open'|'paused'|'closed'|'archived';
export type HRAppStage =
  | 'new' | 'screening' | 'hr_call' | 'tech_screen'
  | 'interview' | 'final_interview' | 'test_task'
  | 'offer' | 'hired' | 'rejected' | 'archived';
export type HRInterviewType = 'hr_call'|'tech_screen'|'hiring_manager'|'final'|'test_task'|'bar_raiser';
export type HRRecommendation = 'strong_yes'|'yes'|'no'|'strong_no'|'hold';

export interface HRJob {
  id: string;
  user_id: string;
  title: string;
  department: string | null;
  team: string | null;
  location: string | null;
  employment_type: HREmploymentType;
  grade: HRGrade | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_gross: boolean;
  salary_hidden: boolean;
  required_skills: string[];
  preferred_skills: string[];
  experience_min: number | null;
  experience_max: number | null;
  english_level: HREnglishLevel | null;
  education_level: string | null;
  description: string | null;
  responsibilities: string | null;
  conditions: string | null;
  status: HRJobStatus;
  priority: 'low'|'normal'|'high'|'urgent';
  openings: number;
  hiring_manager: string | null;
  published_sources: string[];
  deadline: string | null;
  closed_at: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HRCandidate {
  id: string;
  user_id: string;
  client_id: string | null;
  name: string;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  telegram_handle: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  current_company: string | null;
  current_position: string | null;
  current_salary: number | null;
  expected_salary: number | null;
  salary_currency: string;
  salary_negotiable: boolean;
  experience_years: number | null;
  grade: string | null;
  skills: string[];
  english_level: string | null;
  education_level: string | null;
  university: string | null;
  graduation_year: number | null;
  city: string | null;
  willing_to_relocate: boolean;
  work_format: 'office'|'remote'|'hybrid'|'any';
  source: string;
  blacklisted: boolean;
  blacklist_reason: string | null;
  vip: boolean;
  tags: string[];
  notes: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HRApplication {
  id: string;
  user_id: string;
  job_id: string;
  candidate_id: string;
  stage: HRAppStage;
  stage_entered_at: string;
  days_in_stage: number;
  reject_stage: string | null;
  reject_reason: string | null;
  score: number | null;
  score_notes: string | null;
  cover_letter: string | null;
  recruiter_notes: string | null;
  applied_at: string;
  hired_at: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // AI scoring (Talantix-style)
  ai_score: number | null;
  ai_verdict: 'strong_match'|'good_match'|'partial_match'|'weak_match'|'no_match' | null;
  ai_reasons: string[] | null;
  ai_scored_at: string | null;
}

export interface HRScorecardItem {
  competency: string;
  score: number; // 1-5
  comment: string;
}

export interface HRInterview {
  id: string;
  user_id: string;
  application_id: string;
  candidate_id: string;
  job_id: string;
  interview_type: HRInterviewType;
  scheduled_at: string;
  duration_min: number;
  location: string | null;
  meeting_link: string | null;
  interviewers: string[];
  status: 'scheduled'|'completed'|'cancelled'|'no_show'|'rescheduled';
  scorecard: HRScorecardItem[];
  overall_score: number | null;
  recommendation: HRRecommendation | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface HROffer {
  id: string;
  user_id: string;
  application_id: string;
  candidate_id: string | null;
  job_id: string | null;
  offered_salary: number;
  salary_currency: string;
  salary_gross: boolean;
  start_date: string | null;
  probation_months: number;
  bonuses: string | null;
  offer_text: string | null;
  status: 'draft'|'sent'|'accepted'|'declined'|'withdrawn'|'expired';
  sent_at: string | null;
  deadline: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRDashboardStats {
  open_jobs: number;
  total_jobs: number;
  urgent_jobs: number;
  total_candidates: number;
  active_applications: number;
  hired_this_month: number;
  hired_total: number;
  rejected_total: number;
  funnel: Array<{ stage: string; count: number }>;
  interviews_today: number;
  interviews_this_week: number;
  offers_sent: number;
  offers_accepted: number;
  offer_accept_rate: number;
  candidate_sources: Array<{ source: string; count: number }>;
  avg_time_to_hire_days: number | null;
  new_candidates_week: number;
}

// HR constants
export const HR_SOURCES = [
  { value: 'direct',       label: 'Прямой контакт' },
  { value: 'hh_ru',        label: 'hh.ru' },
  { value: 'superjob',     label: 'SuperJob' },
  { value: 'rabota_ru',    label: 'Rabota.ru' },
  { value: 'linkedin',     label: 'LinkedIn' },
  { value: 'telegram',     label: 'Telegram' },
  { value: 'referral',     label: 'Рекомендация' },
  { value: 'headhunting',  label: 'Headhunting' },
  { value: 'website',      label: 'Сайт компании' },
  { value: 'github',       label: 'GitHub' },
  { value: 'avito_work',   label: 'Авито Работа' },
  { value: 'zarplata_ru',  label: 'Зарплата.ру' },
  { value: 'other',        label: 'Другое' },
] as const;

export const HR_REJECT_REASONS = [
  'Не подходит опыт',
  'Несоответствие требованиям',
  'Завышенная ЗП ожидания',
  'Нет ответа от кандидата',
  'Оффер не принят',
  'Принят другой кандидат',
  'Вакансия закрыта',
  'Кандидат самоотозвался',
  'Нет релевантных навыков',
  'Не прошёл собеседование',
  'Другое',
] as const;

// ══════════════════════════════════════════════════════════════
// AUTO / AUTOMOTIVE CRM TYPES
// ══════════════════════════════════════════════════════════════

export interface AutoVehicle {
  id: string;
  user_id: string;
  vin: string | null;
  make: string;
  model: string;
  generation: string | null;
  year: number;
  body_type: string | null;
  color: string | null;
  interior_color: string | null;
  engine_volume: number | null;
  engine_power: number | null;
  engine_type: 'gasoline'|'diesel'|'hybrid'|'electric'|'lpg'|'hydrogen' | null;
  transmission: 'manual'|'automatic'|'robot'|'variator' | null;
  drive: 'fwd'|'rwd'|'4wd'|'awd' | null;
  mileage: number;
  condition: 'new'|'used'|'damaged'|'parts';
  price: number;
  price_currency: string;
  negotiable: boolean;
  market_value: number | null;
  recommended_price: number | null;
  price_history: Array<{ price: number; new_price: number; changed_at: string }>;
  status: 'draft'|'active'|'paused'|'sold'|'archived'|'reserved';
  listing_type: 'sale'|'lease'|'parts'|'trade_in';
  is_dealer: boolean;
  seller_type: 'private'|'dealer'|'commission';
  seller_rating: number | null;
  photos: Array<{ url: string; order: number; is_main: boolean }>;
  video_url: string | null;
  photo_count: number;
  description: string | null;
  equipment: string[];
  defects: Array<{ location: string; severity: string; description: string }>;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  views_total: number;
  contacts_total: number;
  favorites_total: number;
  calls_total: number;
  days_on_market: number;
  last_bumped_at: string | null;
  published_to: Array<{ source: string; listing_id: string; url: string; published_at: string; promo_package: string }>;
  promo_package: string | null;
  promo_until: string | null;
  promo_spent: number;
  credit_available: boolean;
  leasing_available: boolean;
  monthly_payment_min: number | null;
  trade_in_accepted: boolean;
  vehicle_category: 'car'|'moto'|'commercial'|'special_equipment'|'parts'|'accessory';
  is_electric: boolean;
  range_km: number | null;
  vin_checked: boolean;
  vin_check_result: { accidents: number; owners: number; restrictions: boolean; wanted: boolean } | null;
  vin_checked_at: string | null;
  reserve_online: boolean;
  reserve_deposit: number | null;
  reserved_by: string | null;
  reserved_at: string | null;
  reserve_expires: string | null;
  is_trade_in_proposal: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutoLead {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  source: 'auto_ru'|'avito'|'drom'|'website'|'walk_in'|'referral'|'call'|'whatsapp'|'telegram'|'instagram'|'direct';
  source_listing_id: string | null;
  stage: 'new'|'contacted'|'test_drive'|'negotiation'|'deal'|'lost'|'duplicate';
  contact_type: 'call'|'message'|'email'|'walk_in'|'online_form'|'chat'|'unknown';
  message: string | null;
  buying_timeframe: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_makes: string[];
  finance_needed: boolean | null;
  assigned_to: string | null;
  priority: 'hot'|'high'|'normal'|'low';
  next_contact_at: string | null;
  contacted_at: string | null;
  last_activity_at: string;
  lost_reason: string | null;
  deal_id: string | null;
  notes: string | null;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutoDeal {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  lead_id: string | null;
  stage: 'interest'|'inspection'|'credit_check'|'docs_prep'|'signing'|'delivery'|'completed'|'cancelled';
  sale_price: number;
  discount: number;
  final_price: number;
  payment_method: 'cash'|'credit'|'leasing'|'trade_in'|'mixed' | null;
  credit_bank: string | null;
  credit_term_months: number | null;
  credit_rate: number | null;
  monthly_payment: number | null;
  down_payment: number | null;
  trade_in_vehicle_id: string | null;
  trade_in_value: number | null;
  deal_date: string | null;
  delivery_date: string | null;
  signing_date: string | null;
  docs_checklist: Array<{ type: string; status: 'pending'|'collected'|'verified'|'signed'; completed_at: string | null }>;
  purchase_price: number | null;
  gross_profit: number;
  notes: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutoValuation {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  make: string;
  model: string;
  year: number;
  mileage: number;
  condition: string;
  city: string | null;
  value_min: number;
  value_mid: number;
  value_max: number;
  confidence_pct: number | null;
  method: string;
  comparable_count: number | null;
  avg_market_price: number | null;
  median_market_price: number | null;
  days_avg_sell: number | null;
  recommended_price: number | null;
  price_position: 'underpriced'|'fair'|'overpriced' | null;
  market_trend: 'rising'|'stable'|'falling' | null;
  notes: string | null;
  valid_until: string;
  created_at: string;
}

export interface AutoTestDrive {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  lead_id: string | null;
  client_name: string;
  client_phone: string | null;
  scheduled_at: string;
  duration_min: number;
  location: string;
  status: 'scheduled'|'completed'|'cancelled'|'no_show'|'rescheduled';
  manager: string | null;
  result: string | null;
  notes: string | null;
  feedback: string | null;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutoDashboardStats {
  total_vehicles: number;
  active_listings: number;
  draft_listings: number;
  reserved: number;
  sold_this_month: number;
  total_views: number;
  total_contacts: number;
  avg_days_on_market: number;
  total_new_leads: number;
  leads_this_week: number;
  hot_leads: number;
  test_drives_today: number;
  deals_this_month: number;
  revenue_this_month: number;
  avg_sale_price: number;
}

export const AUTO_SOURCES = [
  { value: 'auto_ru',   label: 'auto.ru',       icon: '🚗' },
  { value: 'avito',     label: 'Авито',         icon: '🟢' },
  { value: 'drom',      label: 'Дром',           icon: '🔴' },
  { value: 'website',   label: 'Сайт',           icon: '🌐' },
  { value: 'walk_in',   label: 'Заход в салон',  icon: '🚪' },
  { value: 'call',      label: 'Звонок',         icon: '📞' },
  { value: 'whatsapp',  label: 'WhatsApp',       icon: '💬' },
  { value: 'telegram',  label: 'Telegram',       icon: '✈️' },
  { value: 'instagram', label: 'Instagram',      icon: '📷' },
  { value: 'referral',  label: 'Рекомендация',   icon: '👥' },
  { value: 'direct',    label: 'Прямое',         icon: '📋' },
] as const;

export const AUTO_LEAD_STAGES = [
  { value: 'new',         label: 'Новый',      color: 'bg-blue-500' },
  { value: 'contacted',   label: 'Контакт',    color: 'bg-indigo-500' },
  { value: 'test_drive',  label: 'Тест-драйв', color: 'bg-purple-500' },
  { value: 'negotiation', label: 'Переговоры', color: 'bg-amber-500' },
  { value: 'deal',        label: 'Сделка',     color: 'bg-green-500' },
  { value: 'lost',        label: 'Потерян',    color: 'bg-red-500' },
  { value: 'duplicate',   label: 'Дубль',      color: 'bg-slate-500' },
] as const;

export const AUTO_VEHICLE_CATEGORIES = [
  { value: 'car',               label: '🚗 Легковые' },
  { value: 'moto',              label: '🏍️ Мото' },
  { value: 'commercial',        label: '🚐 Коммерческие' },
  { value: 'special_equipment', label: '🚜 Спецтехника' },
  { value: 'parts',             label: '🔧 Запчасти' },
] as const;

export const AUTO_ENGINE_TYPES = [
  { value: 'gasoline', label: '⛽ Бензин' },
  { value: 'diesel',   label: '🛢️ Дизель' },
  { value: 'hybrid',   label: '🔋⛽ Гибрид' },
  { value: 'electric', label: '⚡ Электро' },
  { value: 'lpg',      label: '🔵 Газ (LPG)' },
] as const;

export const AUTO_TRANSMISSIONS = [
  { value: 'automatic', label: 'Автомат' },
  { value: 'manual',    label: 'Механика' },
  { value: 'robot',     label: 'Робот' },
  { value: 'variator',  label: 'Вариатор' },
] as const;

export const AUTO_BODY_TYPES = [
  { value: 'sedan',       label: 'Седан' },
  { value: 'hatchback',   label: 'Хэтчбек' },
  { value: 'suv',         label: 'Внедорожник' },
  { value: 'crossover',   label: 'Кроссовер' },
  { value: 'coupe',       label: 'Купе' },
  { value: 'wagon',       label: 'Универсал' },
  { value: 'minivan',     label: 'Минивэн' },
  { value: 'pickup',      label: 'Пикап' },
  { value: 'van',         label: 'Фургон' },
  { value: 'convertible', label: 'Кабриолет' },
] as const;

export const AUTO_LOST_REASONS = [
  'Нашёл дешевле у конкурента',
  'Не устроила цена',
  'Нет бюджета',
  'Раздумал покупать',
  'Купил другую марку',
  'Не устроило состояние',
  'Нет ответа',
  'Дубликат',
  'Другое',
] as const;

export const AUTO_PROMO_PACKAGES = [
  { value: 'free',     label: 'Бесплатно', price: 0,    color: 'text-slate-400' },
  { value: 'standard', label: 'Стандарт',  price: 299,  color: 'text-blue-400' },
  { value: 'premium',  label: 'Премиум',   price: 999,  color: 'text-purple-400' },
  { value: 'vip',      label: 'VIP',       price: 2999, color: 'text-amber-400' },
  { value: 'top',      label: 'ТОП',       price: 4999, color: 'text-red-400' },
] as const;

export const HR_COMPETENCIES = [
  'Технические навыки',
  'Коммуникация',
  'Командная работа',
  'Аналитическое мышление',
  'Проактивность',
  'Лидерство',
  'Клиентоориентированность',
  'Обучаемость',
  'Ответственность',
  'Стрессоустойчивость',
] as const;

export const HR_APP_STAGES: Array<{ value: HRAppStage; label: string; color: string }> = [
  { value: 'new',              label: 'Новый отклик',    color: 'bg-slate-600' },
  { value: 'screening',        label: 'Скрининг',        color: 'bg-blue-600' },
  { value: 'hr_call',          label: 'Звонок HR',       color: 'bg-indigo-600' },
  { value: 'tech_screen',      label: 'Техническое',     color: 'bg-violet-600' },
  { value: 'interview',        label: 'Интервью',        color: 'bg-purple-600' },
  { value: 'final_interview',  label: 'Финальное',       color: 'bg-fuchsia-600' },
  { value: 'test_task',        label: 'Тестовое задание', color: 'bg-amber-600' },
  { value: 'offer',            label: 'Оффер',           color: 'bg-orange-600' },
  { value: 'hired',            label: 'Принят ✓',        color: 'bg-green-600' },
  { value: 'rejected',         label: 'Отказ ✗',         color: 'bg-red-600' },
];

// ══════════════════════════════════════════════════════════════
// HR ADVANCED TYPES (Talantix + Skillaz + HRlink + Dream Job)
// ══════════════════════════════════════════════════════════════

export interface HRTemplate {
  id: string;
  user_id: string;
  name: string;
  category: 'rejection'|'invitation'|'offer'|'auto_reply'|'follow_up'|'onboarding'|'custom';
  subject: string | null;
  body: string;
  is_default: boolean;
  send_channel: 'email'|'telegram'|'both';
  created_at: string;
  updated_at: string;
}

export interface HROnboardingTask {
  id: string;
  title: string;
  day_offset: number;  // 0=first day, 1=day 1, 7=week 1, 30=month 1, 90=end of probation
  category: 'docs'|'access'|'intro'|'training'|'equipment'|'evaluation'|'culture';
  required: boolean;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
}

export interface HROnboarding {
  id: string;
  user_id: string;
  candidate_id: string | null;
  application_id: string | null;
  job_id: string | null;
  start_date: string;
  probation_end: string | null;
  buddy: string | null;
  manager: string | null;
  status: 'planned'|'in_progress'|'completed'|'failed';
  tasks: HROnboardingTask[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HREmploymentDoc {
  id: string;
  user_id: string;
  candidate_id: string | null;
  application_id: string | null;
  doc_type: 'offer_letter'|'employment_contract'|'hire_order'|'nda'|'personal_data_consent'|'probation_terms'|'equipment_receipt'|'remote_work_agreement'|'other';
  title: string;
  status: 'pending'|'sent'|'signed'|'rejected'|'expired';
  file_url: string | null;
  signed_url: string | null;
  send_method: 'email'|'gosuslugi'|'hrlink'|'manual';
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HREmployerBrand {
  id: string;
  user_id: string;
  company_name: string;
  industry: string | null;
  enps_score: number | null;        // -100..+100
  enps_respondents: number;
  enps_period: string | null;
  dreamjob_rating: number | null;   // 1.0-5.0
  dreamjob_reviews: number;
  positive_reviews_pct: number | null;
  evp_items: Array<{
    category: 'comp'|'culture'|'growth'|'work_life'|'mission'|'perks';
    title: string;
    highlight: boolean;
  }>;
  awards: string[];
  updated_at: string;
}

export interface HRAutomation {
  id: string;
  user_id: string;
  job_id: string | null;
  name: string;
  trigger_event: 'stage_entered'|'no_action_days'|'offer_sent'|'hired'|'rejection';
  trigger_stage: string | null;
  trigger_days: number;
  action_type: 'send_template'|'create_task'|'move_stage'|'notify_recruiter';
  template_id: string | null;
  action_stage: string | null;
  action_task: string | null;
  active: boolean;
  created_at: string;
}

// КЭДО document types in Russian
export const EMPLOYMENT_DOC_TYPES = [
  { value: 'offer_letter',          label: 'Письмо-оффер' },
  { value: 'employment_contract',   label: 'Трудовой договор' },
  { value: 'hire_order',            label: 'Приказ о приёме (Т-1)' },
  { value: 'nda',                   label: 'NDA / Конфиденциальность' },
  { value: 'personal_data_consent', label: 'Согласие на обработку ПДн' },
  { value: 'probation_terms',       label: 'Условия испытательного срока' },
  { value: 'equipment_receipt',     label: 'Акт выдачи оборудования' },
  { value: 'remote_work_agreement', label: 'Допсоглашение об удалённой работе' },
  { value: 'other',                 label: 'Другой документ' },
] as const;

export const ONBOARDING_CATEGORIES = {
  docs:       { label: '📄 Документы',    color: 'bg-blue-600' },
  access:     { label: '🔑 Доступы',      color: 'bg-indigo-600' },
  intro:      { label: '👋 Знакомство',   color: 'bg-purple-600' },
  training:   { label: '📚 Обучение',     color: 'bg-amber-600' },
  equipment:  { label: '💻 Оборудование', color: 'bg-cyan-600' },
  evaluation: { label: '⭐ Оценка',       color: 'bg-green-600' },
  culture:    { label: '🎯 Культура',     color: 'bg-pink-600' },
} as const;

export const AI_VERDICT_CONFIG = {
  strong_match: { label: '💚 Сильное совпадение', color: 'text-green-400', bgColor: 'bg-green-400/10' },
  good:         { label: '✓ Хороший кандидат',   color: 'text-blue-400',  bgColor: 'bg-blue-400/10' },
  weak:         { label: '⚠ Слабое совпадение',   color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
  no_match:     { label: '✗ Не подходит',          color: 'text-red-400',   bgColor: 'bg-red-400/10' },
} as const;

// Export singleton instance
export const crm = new CRMLib();

// Export class for multiple instances
export { CRMLib };
