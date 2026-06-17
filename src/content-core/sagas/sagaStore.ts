// Content Core — Saga Store
// Saga persistence with Supabase support for production reliability
// Survives worker restarts

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CompensationSaga, SagaStatus } from '../domain/listing';
import {
  createCompensationSaga,
  LISTING_REJECTION_STEPS,
  PUBLICATION_REJECTION_STEPS,
  canStartNewSaga,
  filterSagas,
  type SagaTriggerEvent,
  type SagaExecutionContext,
} from './compensationSaga';

// ============================================================================
// Type Adapters (Supabase JSONB ↔ TypeScript)
// ============================================================================

interface DbSagaRow {
  id: string;
  saga_type: string;
  trigger_event_id: string;
  trigger_reason: string;
  status: string;
  context: Record<string, unknown>;
  container_id: string | null;
  asset_id: string | null;
  content_item_id: string | null;
  steps: unknown[];
  current_step: number;
  retry_count: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function dbRowToSaga(row: DbSagaRow): CompensationSaga {
  return {
    id: row.id,
    sagaType: row.saga_type,
    triggerEventId: row.trigger_event_id,
    triggerReason: row.trigger_reason,
    status: row.status as SagaStatus,
    context: row.context,
    containerId: row.container_id,
    assetId: row.asset_id,
    contentItemId: row.content_item_id,
    steps: row.steps as CompensationSaga['steps'],
    currentStep: row.current_step,
    retryCount: row.retry_count,
    lastError: row.last_error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sagaToDbRow(saga: CompensationSaga): Partial<DbSagaRow> {
  return {
    id: saga.id,
    saga_type: saga.sagaType,
    trigger_event_id: saga.triggerEventId,
    trigger_reason: saga.triggerReason,
    status: saga.status,
    context: saga.context as Record<string, unknown>,
    container_id: saga.containerId,
    asset_id: saga.assetId,
    content_item_id: saga.contentItemId,
    steps: saga.steps,
    current_step: saga.currentStep,
    retry_count: saga.retryCount,
    last_error: saga.lastError,
    started_at: saga.startedAt,
    completed_at: saga.completedAt,
    created_at: saga.createdAt,
    updated_at: saga.updatedAt,
  };
}

// ============================================================================
// Saga Store Interface
// ============================================================================

export interface SagaStorePort {
  // CRUD
  save(saga: CompensationSaga): Promise<void>;
  findById(sagaId: string): Promise<CompensationSaga | null>;
  findByTriggerEventId(triggerEventId: string): Promise<CompensationSaga | null>;
  findAll(filter?: SagaFilter): Promise<CompensationSaga[]>;

  // Lifecycle
  createSaga(
    triggerEventId: string,
    triggerReason: string,
    context: SagaExecutionContext,
    triggerEvent?: SagaTriggerEvent
  ): Promise<{ saga: CompensationSaga } | { error: string; existingSaga: CompensationSaga | null }>;

  // Queries
  findRunningSagas(staleAfterMinutes?: number): Promise<CompensationSaga[]>;
  findPendingSagas(): Promise<CompensationSaga[]>;
  findSagasRequiringManualReview(): Promise<CompensationSaga[]>;
  findDeadLetterSagas(): Promise<CompensationSaga[]>;
  findByContainer(containerId: string): Promise<CompensationSaga[]>;

  // Metrics
  getSagasByStatus(): Promise<Record<SagaStatus, number>>;
  getSagaCount(): Promise<number>;

  // Cleanup
  bulkDelete(sagaIds: string[]): Promise<number>;
  cleanupCompletedOlderThan(days: number): Promise<number>;
}

export interface SagaFilter {
  status?: SagaStatus;
  containerId?: string;
  authorId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Supabase Saga Store (Production)
// ============================================================================

export class SupabaseSagaStore implements SagaStorePort {
  private supabase: SupabaseClient;
  private readonly tableName = 'compensation_sagas';

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  async save(saga: CompensationSaga): Promise<void> {
    const row = sagaToDbRow(saga);

    const { error } = await this.supabase.from(this.tableName).upsert(row, {
      onConflict: 'id',
    });

    if (error) {
      console.error('[SupabaseSagaStore] Save failed:', error);
      throw new Error(`Failed to save saga ${saga.id}: ${error.message}`);
    }

    console.log(`[SupabaseSagaStore] Saved saga ${saga.id}, status: ${saga.status}`);
  }

  async findById(sagaId: string): Promise<CompensationSaga | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', sagaId)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found
      console.error('[SupabaseSagaStore] FindById failed:', error);
      throw new Error(`Failed to find saga ${sagaId}: ${error.message}`);
    }

    return data ? dbRowToSaga(data as DbSagaRow) : null;
  }

  async findByTriggerEventId(triggerEventId: string): Promise<CompensationSaga | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('trigger_event_id', triggerEventId)
      .neq('status', 'dead_letter')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SupabaseSagaStore] FindByTriggerEventId failed:', error);
      throw new Error(`Failed to find saga by trigger ${triggerEventId}: ${error.message}`);
    }

    return data ? dbRowToSaga(data as DbSagaRow) : null;
  }

  async findAll(filter?: SagaFilter): Promise<CompensationSaga[]> {
    let query = this.supabase.from(this.tableName).select('*');

    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    if (filter?.containerId) {
      query = query.eq('container_id', filter.containerId);
    }
    if (filter?.fromDate) {
      query = query.gte('created_at', filter.fromDate);
    }
    if (filter?.toDate) {
      query = query.lte('created_at', filter.toDate);
    }

    query = query.order('created_at', { ascending: false });

    if (filter?.offset) {
      query = query.range(filter.offset, filter.offset + (filter.limit ?? 100) - 1);
    } else if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[SupabaseSagaStore] FindAll failed:', error);
      throw new Error(`Failed to find sagas: ${error.message}`);
    }

    return (data ?? []).map((row) => dbRowToSaga(row as DbSagaRow));
  }

  async createSaga(
    triggerEventId: string,
    triggerReason: string,
    context: SagaExecutionContext,
    triggerEvent?: SagaTriggerEvent
  ): Promise<{ saga: CompensationSaga } | { error: string; existingSaga: CompensationSaga | null }> {
    // Step 1: Check deduplication
    const existing = await this.findByTriggerEventId(triggerEventId);
    if (existing && existing.status !== 'dead_letter') {
      return {
        error: 'Saga already exists for this trigger event',
        existingSaga: existing,
      };
    }

    // Step 2: Select step definitions
    const stepDefinitions =
      triggerEvent?.includes('Listing') || triggerEvent === undefined
        ? LISTING_REJECTION_STEPS
        : PUBLICATION_REJECTION_STEPS;

    // Step 3: Create saga
    const saga = createCompensationSaga(
      triggerEventId,
      triggerReason,
      context,
      stepDefinitions
    );

    // Step 4: Persist to database
    await this.save(saga);

    console.log(`[SupabaseSagaStore] Created saga ${saga.id} for trigger ${triggerEventId}`);

    return { saga };
  }

  async findRunningSagas(staleAfterMinutes = 5): Promise<CompensationSaga[]> {
    const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('status', 'running')
      .lt('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('[SupabaseSagaStore] FindRunningSagas failed:', error);
      throw new Error(`Failed to find running sagas: ${error.message}`);
    }

    return (data ?? []).map((row) => dbRowToSaga(row as DbSagaRow));
  }

  async findPendingSagas(): Promise<CompensationSaga[]> {
    return this.findAll({ status: 'running' });
  }

  async findSagasRequiringManualReview(): Promise<CompensationSaga[]> {
    return this.findAll({ status: 'requires_manual_review' });
  }

  async findDeadLetterSagas(): Promise<CompensationSaga[]> {
    return this.findAll({ status: 'dead_letter' });
  }

  async findByContainer(containerId: string): Promise<CompensationSaga[]> {
    return this.findAll({ containerId });
  }

  async getSagasByStatus(): Promise<Record<SagaStatus, number>> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('status');

    if (error) {
      console.error('[SupabaseSagaStore] GetSagasByStatus failed:', error);
      throw new Error(`Failed to get saga status counts: ${error.message}`);
    }

    const counts: Record<SagaStatus, number> = {
      running: 0,
      completed: 0,
      failed: 0,
      requires_manual_review: 0,
      dead_letter: 0,
    };

    for (const row of data ?? []) {
      const status = row.status as SagaStatus;
      if (status in counts) {
        counts[status]++;
      }
    }

    return counts;
  }

  async getSagaCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[SupabaseSagaStore] GetSagaCount failed:', error);
      throw new Error(`Failed to get saga count: ${error.message}`);
    }

    return count ?? 0;
  }

  async bulkDelete(sagaIds: string[]): Promise<number> {
    if (sagaIds.length === 0) return 0;

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .in('id', sagaIds);

    if (error) {
      console.error('[SupabaseSagaStore] BulkDelete failed:', error);
      throw new Error(`Failed to delete sagas: ${error.message}`);
    }

    console.log(`[SupabaseSagaStore] Deleted ${sagaIds.length} sagas`);
    return sagaIds.length;
  }

  async cleanupCompletedOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('id')
      .in('status', ['completed', 'failed'])
      .lt('completed_at', cutoff);

    if (error) {
      console.error('[SupabaseSagaStore] Cleanup failed:', error);
      throw new Error(`Failed to cleanup sagas: ${error.message}`);
    }

    const sagaIds = (data ?? []).map((row) => row.id);
    if (sagaIds.length === 0) return 0;

    return this.bulkDelete(sagaIds);
  }
}

// ============================================================================
// In-Memory Saga Store (Testing / Dev)
// ============================================================================

export class InMemorySagaStore implements SagaStorePort {
  private sagas: Map<string, CompensationSaga> = new Map();
  private triggerEventIndex: Map<string, string> = new Map();

  async save(saga: CompensationSaga): Promise<void> {
    this.sagas.set(saga.id, saga);
    if (saga.triggerEventId) {
      this.triggerEventIndex.set(saga.triggerEventId, saga.id);
    }
  }

  async findById(sagaId: string): Promise<CompensationSaga | null> {
    return this.sagas.get(sagaId) ?? null;
  }

  async findByTriggerEventId(triggerEventId: string): Promise<CompensationSaga | null> {
    const sagaId = this.triggerEventIndex.get(triggerEventId);
    if (!sagaId) return null;
    return this.sagas.get(sagaId) ?? null;
  }

  async findAll(filter?: SagaFilter): Promise<CompensationSaga[]> {
    let result = Array.from(this.sagas.values());

    if (filter) {
      result = filterSagas(result, filter);
    }

    result.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (filter?.offset) result = result.slice(filter.offset);
    if (filter?.limit) result = result.slice(0, filter.limit);

    return result;
  }

  async createSaga(
    triggerEventId: string,
    triggerReason: string,
    context: SagaExecutionContext,
    triggerEvent?: SagaTriggerEvent
  ): Promise<{ saga: CompensationSaga } | { error: string; existingSaga: CompensationSaga | null }> {
    const existingSagas = Array.from(this.sagas.values());
    if (!canStartNewSaga(existingSagas, triggerEventId)) {
      const existing = await this.findByTriggerEventId(triggerEventId);
      return { error: 'Saga already exists', existingSaga: existing };
    }

    const stepDefinitions =
      triggerEvent?.includes('Listing') || triggerEvent === undefined
        ? LISTING_REJECTION_STEPS
        : PUBLICATION_REJECTION_STEPS;

    const saga = createCompensationSaga(triggerEventId, triggerReason, context, stepDefinitions);
    await this.save(saga);

    return { saga };
  }

  async findRunningSagas(staleAfterMinutes = 5): Promise<CompensationSaga[]> {
    const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);
    return this.findAll({ status: 'running' })
      .then((sagas) => sagas.filter((s) =>
        new Date(s.updatedAt) < cutoff
      ));
  }

  async findPendingSagas(): Promise<CompensationSaga[]> {
    return this.findAll({ status: 'running' });
  }

  async findSagasRequiringManualReview(): Promise<CompensationSaga[]> {
    return this.findAll({ status: 'requires_manual_review' });
  }

  async findDeadLetterSagas(): Promise<CompensationSaga[]> {
    return this.findAll({ status: 'dead_letter' });
  }

  async findByContainer(containerId: string): Promise<CompensationSaga[]> {
    return this.findAll({ containerId });
  }

  async getSagasByStatus(): Promise<Record<SagaStatus, number>> {
    const result: Record<SagaStatus, number> = {
      running: 0, completed: 0, failed: 0, requires_manual_review: 0, dead_letter: 0,
    };
    for (const saga of this.sagas.values()) {
      result[saga.status]++;
    }
    return result;
  }

  async getSagaCount(): Promise<number> {
    return this.sagas.size;
  }

  async bulkDelete(sagaIds: string[]): Promise<number> {
    let deleted = 0;
    for (const id of sagaIds) {
      const saga = this.sagas.get(id);
      if (saga) {
        if (saga.triggerEventId) {
          this.triggerEventIndex.delete(saga.triggerEventId);
        }
        this.sagas.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async cleanupCompletedOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const toDelete: string[] = [];

    for (const saga of this.sagas.values()) {
      if (
        (saga.status === 'completed' || saga.status === 'failed') &&
        saga.completedAt &&
        new Date(saga.completedAt) < cutoff
      ) {
        toDelete.push(saga.id);
      }
    }

    return this.bulkDelete(toDelete);
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalStore: SagaStorePort | null = null;

export function createSagaStore(
  supabaseUrl?: string,
  supabaseKey?: string
): SagaStorePort {
  if (supabaseUrl && supabaseKey) {
    return new SupabaseSagaStore(supabaseUrl, supabaseKey);
  }
  return new InMemorySagaStore();
}

export function getSagaStore(): SagaStorePort {
  if (!globalStore) {
    const supabaseUrl = typeof process !== 'undefined' ? process.env.SUPABASE_URL : undefined;
    const supabaseKey = typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;
    globalStore = createSagaStore(supabaseUrl, supabaseKey);
  }
  return globalStore;
}

export function resetSagaStore(): void {
  globalStore = null;
}

// ============================================================================
// Type Re-exports for convenience
// ============================================================================

export type { SagaTriggerEvent, SagaExecutionContext } from './compensationSaga';
