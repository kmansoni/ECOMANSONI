// Core CRM: profile, clients, deals, tasks, interactions, dashboard, chat integration.
import { CRMRpcClient } from "./crm-rpc";
import type { CRMClientRecord, CRMDeal, CRMInteraction, CRMTask, CRMUserProfile, DashboardStats, PipelineStage } from "./crm.types";

export class CRMCoreMixin extends CRMRpcClient {
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

}
