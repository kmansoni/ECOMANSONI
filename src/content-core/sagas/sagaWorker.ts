// Content Core — Saga Worker
// Executes compensation sagas with persistence and recovery
// pg_cron every 30 seconds

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CompensationSaga, CompensationStep } from '../domain/listing';
import {
  executeNextSagaStep,
  completeSagaStep,
  failSagaStep,
  completeSaga,
  type SagaExecutionResult,
} from './compensationSaga';
import { createSagaStore, type SagaStorePort } from './sagaStore';

// ============================================================================
// Configuration
// ============================================================================

const WORKER_CONFIG = {
  maxBatchSize: 10,
  staleAfterMinutes: 5,
  stepTimeoutMs: 30000,
  leaseRenewalIntervalMs: 10000,
};

// ============================================================================
// Saga Worker
// ============================================================================

export class SagaWorker {
  private supabase: SupabaseClient;
  private sagaStore: SagaStorePort;
  private running = false;
  private leaseRenewalInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    sagaStore?: SagaStorePort
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    this.sagaStore = sagaStore ?? createSagaStore(supabaseUrl, supabaseKey);
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    if (this.running) {
      console.log('[SagaWorker] Already running');
      return;
    }

    this.running = true;
    console.log('[SagaWorker] Started');

    // Start lease renewal loop
    this.leaseRenewalInterval = setInterval(() => {
      this.renewLeases().catch(console.error);
    }, WORKER_CONFIG.leaseRenewalIntervalMs);

    // Main processing loop
    await this.processLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.leaseRenewalInterval) {
      clearInterval(this.leaseRenewalInterval);
      this.leaseRenewalInterval = null;
    }
    console.log('[SagaWorker] Stopped');
  }

  // ============================================================================
  // Main Processing Loop
  // ============================================================================

  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.processBatch();
      } catch (error) {
        console.error('[SagaWorker] Batch processing error:', error);
      }

      // Small delay between batches
      await this.sleep(1000);
    }
  }

  private async processBatch(): Promise<void> {
    // Step 1: Recover stale sagas from crashed workers
    await this.recoverStaleSagas();

    // Step 2: Find sagas that need processing
    const sagas = await this.findSagasToProcess();
    console.log(`[SagaWorker] Found ${sagas.length} sagas to process`);

    // Step 3: Process each saga
    for (const saga of sagas.slice(0, WORKER_CONFIG.maxBatchSize)) {
      await this.processSaga(saga);
    }
  }

  private async findSagasToProcess(): Promise<CompensationSaga[]> {
    // Find running sagas that haven't been processed recently
    const runningSagas = await this.sagaStore.findRunningSagas(WORKER_CONFIG.staleAfterMinutes);

    // Also find sagas requiring manual review (for monitoring)
    const manualReviewSagas = await this.sagaStore.findSagasRequiringManualReview();

    return [...runningSagas, ...manualReviewSagas];
  }

  // ============================================================================
  // Saga Processing
  // ============================================================================

  private async processSaga(saga: CompensationSaga): Promise<void> {
    console.log(`[SagaWorker] Processing saga ${saga.id}, currentStep: ${saga.currentStep}`);

    try {
      // Execute next step
      const result = executeNextSagaStep(saga);

      if (result.completed) {
        // All steps completed
        await this.handleSagaCompleted(result.saga);
        return;
      }

      if (result.requiresManualReview) {
        await this.handleSagaRequiresReview(result.saga);
        return;
      }

      // Execute the actual step action
      const stepResult = await this.executeStepAction(result.saga, result.step!);

      if (stepResult.success) {
        // Step succeeded - mark complete and persist
        const completedSaga = completeSagaStep(
          result.saga,
          result.step!.name,
          stepResult.targetId ?? saga.id,
          stepResult.result ?? {}
        );
        await this.sagaStore.save(completedSaga);
        console.log(`[SagaWorker] Step ${result.step!.name} completed for saga ${saga.id}`);
      } else {
        // Step failed - handle retry or dead letter
        const failedSaga = failSagaStep(
          result.saga,
          result.step!.name,
          stepResult.error ?? 'Unknown error'
        );
        await this.sagaStore.save(failedSaga);
        console.error(`[SagaWorker] Step ${result.step!.name} failed for saga ${saga.id}: ${stepResult.error}`);
      }
    } catch (error) {
      console.error(`[SagaWorker] Unexpected error processing saga ${saga.id}:`, error);
      // Don't update saga state on unexpected errors - let it be picked up again
    }
  }

  private async executeStepAction(
    saga: CompensationSaga,
    step: CompensationStep
  ): Promise<{ success: boolean; targetId?: string; result?: Record<string, unknown>; error?: string }> {
    const { name, actionType, targetTable, targetId } = step;

    try {
      switch (actionType) {
        case 'UPDATE_STATUS':
          return await this.executeUpdateStatus(saga, step);
        case 'SEND_NOTIFICATION':
          return await this.executeSendNotification(saga, step);
        case 'CALL_EXTERNAL':
          return await this.executeCallExternal(saga, step);
        case 'WRITE_AUDIT':
          return await this.executeWriteAudit(saga, step);
        case 'DELETE_ROW':
          return await this.executeDeleteRow(saga, step);
        default:
          return { success: false, error: `Unknown action type: ${actionType}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // Step Executors
  // ============================================================================

  private async executeUpdateStatus(
    saga: CompensationSaga,
    step: CompensationStep
  ): Promise<{ success: boolean; targetId?: string }> {
    const { name, targetTable } = step;
    const containerId = saga.containerId ?? saga.context.containerId as string;

    console.log(`[SagaWorker] Updating ${targetTable} ${containerId} for step ${name}`);

    // Determine target status based on step name
    let newStatus: string;
    if (name.includes('suspend')) {
      newStatus = 'suspended';
    } else if (name.includes('restore')) {
      newStatus = 'published';
    } else {
      newStatus = name;
    }

    // Update via Supabase
    const { error } = await this.supabase
      .from(targetTable!)
      .update({ status: newStatus })
      .eq('id', containerId);

    if (error) {
      throw error;
    }

    return { success: true, targetId: containerId };
  }

  private async executeSendNotification(
    saga: CompensationSaga,
    step: CompensationStep
  ): Promise<{ success: boolean; result?: Record<string, unknown> }> {
    const authorId = saga.context.authorId as string ?? saga.context.userId as string;
    const reason = saga.triggerReason;

    console.log(`[SagaWorker] Sending notification to ${authorId}: ${reason}`);

    // Send notification via Edge Function or direct insert
    const { error } = await this.supabase.from('notifications').insert({
      user_id: authorId,
      type: 'moderation_rejected',
      title: 'Content Rejected',
      body: reason,
      data: {
        sagaId: saga.id,
        triggerEventId: saga.triggerEventId,
      },
    });

    if (error && error.code !== '23505') { // Ignore duplicate key (idempotent)
      throw error;
    }

    return { success: true, result: { notified: authorId } };
  }

  private async executeCallExternal(
    saga: CompensationSaga,
    step: CompensationStep
  ): Promise<{ success: boolean }> {
    const { name } = step;

    // Route to appropriate external service
    if (name.includes('withdraw_distribution')) {
      // Call distribution service to withdraw content
      console.log(`[SagaWorker] Withdrawing distribution for ${saga.containerId}`);
      // In production: await callDistributionService('withdraw', saga.containerId);
    } else if (name.includes('deindex_search')) {
      // Call search service to deindex
      console.log(`[SagaWorker] Deindexing ${saga.containerId}`);
      // In production: await callSearchService('deindex', saga.containerId);
    }

    return { success: true };
  }

  private async executeWriteAudit(
    saga: CompensationSaga,
    step: CompensationStep
  ): Promise<{ success: boolean; targetId?: string }> {
    const containerId = saga.containerId ?? saga.context.containerId as string;

    console.log(`[SagaWorker] Writing audit log for saga ${saga.id}`);

    // Insert lifecycle log
    const { data, error } = await this.supabase
      .from('container_lifecycle_logs')
      .insert({
        entity_type: 'saga',
        entity_id: saga.id,
        from_status: saga.status,
        to_status: saga.status,
        actor_type: 'service',
        actor_id: '00000000-0000-0000-0000-000000000000',
        reason: `Saga completed: ${saga.triggerReason}`,
        metadata: {
          sagaId: saga.id,
          triggerEventId: saga.triggerEventId,
          containerId,
          steps: saga.steps.map((s) => ({
            name: s.name,
            status: s.status,
          })),
        },
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return { success: true, targetId: data.id };
  }

  private async executeDeleteRow(
    saga: CompensationSaga,
    step: CompensationStep
  ): Promise<{ success: boolean }> {
    const { targetTable, targetId } = step;

    if (!targetTable || !targetId) {
      return { success: false, error: 'Missing targetTable or targetId for DELETE_ROW' };
    }

    const { error } = await this.supabase
      .from(targetTable)
      .delete()
      .eq('id', targetId);

    if (error) {
      throw error;
    }

    return { success: true };
  }

  // ============================================================================
  // Completion Handlers
  // ============================================================================

  private async handleSagaCompleted(saga: CompensationSaga): Promise<void> {
    const completed = completeSaga(saga);
    await this.sagaStore.save(completed);
    console.log(`[SagaWorker] Saga ${saga.id} completed successfully`);
  }

  private async handleSagaRequiresReview(saga: CompensationSaga): Promise<void> {
    await this.sagaStore.save(saga);
    console.log(`[SagaWorker] Saga ${saga.id} requires manual review`);
  }

  // ============================================================================
  // Recovery
  // ============================================================================

  private async recoverStaleSagas(): Promise<void> {
    // Find sagas that were running when worker crashed
    const staleSagas = await this.sagaStore.findRunningSagas(WORKER_CONFIG.staleAfterMinutes);

    for (const saga of staleSagas) {
      console.log(`[SagaWorker] Recovering stale saga ${saga.id}, currentStep: ${saga.currentStep}`);

      // Re-execute current step
      await this.processSaga(saga);
    }
  }

  private async renewLeases(): Promise<void> {
    // In production, this would renew any long-running saga step leases
    // For now, sagas are stateless and don't need lease renewal
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  async getMetrics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
  }> {
    const byStatus = await this.sagaStore.getSagasByStatus();
    const total = await this.sagaStore.getSagaCount();

    return { total, byStatus };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Standalone Worker Entry Point (for pg_cron)
// ============================================================================

// This would be deployed as a separate Edge Function
export async function runSagaWorker(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const worker = new SagaWorker(supabaseUrl, supabaseKey);

  // Process one batch and exit (for pg_cron)
  await worker.processBatch();

  // Log metrics
  const metrics = await worker.getMetrics();
  console.log('[SagaWorker] Metrics:', JSON.stringify(metrics));
}

// ============================================================================
// CLI Entry Point (for local testing)
// ============================================================================

export async function main(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables');
    process.exit(1);
  }

  const worker = new SagaWorker(supabaseUrl, supabaseKey);

  console.log('[SagaWorker] Starting...');
  await worker.start();
}

// Run if executed directly
if (typeof Deno !== 'undefined' && Deno.mainModule === Deno.specifier) {
  main().catch(console.error);
}
