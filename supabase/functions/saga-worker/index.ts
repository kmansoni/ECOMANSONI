// Content Core — Edge Function: saga-worker
// Executes compensation sagas with Supabase persistence
// pg_cron every 30 seconds

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { CompensationSaga, CompensationStep } from './types';
import {
  executeNextSagaStep,
  completeSagaStep,
  failSagaStep,
  completeSaga,
} from './compensationSaga';

// ============================================================================
// Configuration
// ============================================================================

const WORKER_CONFIG = {
  maxBatchSize: 10,
  staleAfterMinutes: 5,
};

// ============================================================================
// Type Adapters
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
    status: row.status as CompensationSaga['status'],
    context: row.context,
    containerId: row.container_id,
    assetId: row.asset_id,
    contentItemId: row.content_item_id,
    steps: row.steps as CompensationStep[],
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
// Supabase helpers
// ============================================================================

async function saveSaga(supabase: any, saga: CompensationSaga): Promise<void> {
  const row = sagaToDbRow(saga);
  const { error } = await supabase.from('compensation_sagas').upsert(row, {
    onConflict: 'id',
  });
  if (error) {
    throw new Error(`Failed to save saga: ${error.message}`);
  }
}

async function findRunningSagas(supabase: any, staleAfterMinutes: number): Promise<CompensationSaga[]> {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('compensation_sagas')
    .select('*')
    .eq('status', 'running')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(WORKER_CONFIG.maxBatchSize);

  if (error) {
    throw new Error(`Failed to find running sagas: ${error.message}`);
  }

  return (data ?? []).map(dbRowToSaga);
}

async function findSagasRequiringReview(supabase: any): Promise<CompensationSaga[]> {
  const { data, error } = await supabase
    .from('compensation_sagas')
    .select('*')
    .eq('status', 'requires_manual_review')
    .order('updated_at', { ascending: true })
    .limit(WORKER_CONFIG.maxBatchSize);

  if (error) {
    throw new Error(`Failed to find sagas requiring review: ${error.message}`);
  }

  return (data ?? []).map(dbRowToSaga);
}

// ============================================================================
// Step Executors
// ============================================================================

async function executeUpdateStatus(
  supabase: any,
  saga: CompensationSaga,
  step: CompensationStep
): Promise<{ success: boolean; error?: string }> {
  const { name, targetTable } = step;
  const containerId = saga.containerId ?? (saga.context.containerId as string);

  if (!targetTable || !containerId) {
    return { success: false, error: 'Missing targetTable or containerId' };
  }

  // Determine target status
  let newStatus: string;
  if (name.includes('suspend')) {
    newStatus = 'suspended';
  } else if (name.includes('restore')) {
    newStatus = 'published';
  } else {
    newStatus = name;
  }

  const { error } = await supabase
    .from(targetTable)
    .update({ status: newStatus })
    .eq('id', containerId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

async function executeSendNotification(
  supabase: any,
  saga: CompensationSaga
): Promise<{ success: boolean; error?: string }> {
  const authorId = (saga.context.authorId ?? saga.context.userId) as string;
  const reason = saga.triggerReason;

  if (!authorId) {
    return { success: false, error: 'Missing authorId in saga context' };
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: authorId,
    type: 'moderation_rejected',
    title: 'Content Rejected',
    body: reason,
    data: {
      sagaId: saga.id,
      triggerEventId: saga.triggerEventId,
    },
  });

  // Ignore duplicate key errors (idempotent)
  if (error && error.code !== '23505') {
    return { success: false, error: error.message };
  }

  return { success: true };
}

async function executeWriteAudit(
  supabase: any,
  saga: CompensationSaga
): Promise<{ success: boolean; error?: string }> {
  const containerId = saga.containerId ?? (saga.context.containerId as string);

  const { error } = await supabase.from('container_lifecycle_logs').insert({
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
      steps: saga.steps.map((s) => ({ name: s.name, status: s.status })),
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

async function executeStep(
  supabase: any,
  saga: CompensationSaga,
  step: CompensationStep
): Promise<{ success: boolean; error?: string }> {
  switch (step.actionType) {
    case 'UPDATE_STATUS':
      return executeUpdateStatus(supabase, saga, step);
    case 'SEND_NOTIFICATION':
      return executeSendNotification(supabase, saga);
    case 'WRITE_AUDIT':
      return executeWriteAudit(supabase, saga);
    case 'CALL_EXTERNAL':
      // External calls would be handled here
      console.log(`[SagaWorker] External call for step ${step.name}`);
      return { success: true };
    case 'DELETE_ROW':
      return { success: false, error: 'DELETE_ROW not implemented in Edge Function' };
    default:
      return { success: false, error: `Unknown action type: ${step.actionType}` };
  }
}

// ============================================================================
// Saga Processing
// ============================================================================

async function processSaga(supabase: any, saga: CompensationSaga): Promise<void> {
  console.log(`[SagaWorker] Processing saga ${saga.id}, step: ${saga.currentStep}`);

  // Execute next step
  const result = executeNextSagaStep(saga);

  if (result.completed) {
    const completed = completeSaga(result.saga);
    await saveSaga(supabase, completed);
    console.log(`[SagaWorker] Saga ${saga.id} completed`);
    return;
  }

  if (result.requiresManualReview) {
    await saveSaga(supabase, result.saga);
    console.log(`[SagaWorker] Saga ${saga.id} requires manual review`);
    return;
  }

  const step = result.step!;

  // Execute the step
  const stepResult = await executeStep(supabase, result.saga, step);

  if (stepResult.success) {
    const completedSaga = completeSagaStep(result.saga, step.name, saga.id, {});
    await saveSaga(supabase, completedSaga);
    console.log(`[SagaWorker] Step ${step.name} completed`);
  } else {
    const failedSaga = failSagaStep(result.saga, step.name, stepResult.error ?? 'Unknown error');
    await saveSaga(supabase, failedSaga);
    console.error(`[SagaWorker] Step ${step.name} failed: ${stepResult.error}`);
  }
}

// ============================================================================
// Main Handler
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    let processed = 0;
    let failed = 0;

    // Find and process running sagas
    const runningSagas = await findRunningSagas(supabase, WORKER_CONFIG.staleAfterMinutes);

    for (const saga of runningSagas) {
      try {
        await processSaga(supabase, saga);
        processed++;
      } catch (error) {
        console.error(`[SagaWorker] Error processing saga ${saga.id}:`, error);
        failed++;
      }
    }

    // Find and log sagas requiring manual review
    const reviewSagas = await findSagasRequiringReview(supabase);

    // Get metrics
    const { data: metrics } = await supabase
      .from('compensation_sagas')
      .select('status');

    const statusCounts: Record<string, number> = {};
    for (const row of metrics ?? []) {
      const status = row.status as string;
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }

    const response = {
      processed,
      failed,
      reviewPending: reviewSagas.length,
      metrics: {
        total: metrics?.length ?? 0,
        byStatus: statusCounts,
      },
      timestamp: new Date().toISOString(),
    };

    console.log('[SagaWorker]', JSON.stringify(response));

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SagaWorker] Fatal error:', error);
    return new Response(JSON.stringify({
      error: 'Worker failed',
      message: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
