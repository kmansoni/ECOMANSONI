// Real estate CRM: properties, showings, deal documents, client requirements.
import { CRMRpcClient } from "./crm-rpc";
import type { CRMClientRequirements, CRMDealDocument, CRMProperty, CRMShowing, DashboardStats } from "./crm.types";

export class CRMRealEstateMixin extends CRMRpcClient {
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

}
