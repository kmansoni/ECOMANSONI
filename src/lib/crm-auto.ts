// Auto CRM: vehicles, leads, valuation, test drives.
import { CRMRpcClient } from "./crm-rpc";
import type { AutoDashboardStats, AutoLead, AutoTestDrive, AutoValuation, AutoVehicle } from "./crm.types";

export class CRMAutoMixin extends CRMRpcClient {
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

}
