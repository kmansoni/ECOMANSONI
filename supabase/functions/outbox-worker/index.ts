// Content Core — Edge Function: outbox-worker
// pg_cron every 10 seconds - claim → process → deliver/fail
// This is a placeholder for a Deno-based worker
// In production, this would be a separate service or use pg_cron with SQL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WORKER_ID = `outbox-worker-${Deno.hostname()}-${Date.now()}`;
const LEASE_SECONDS = 30;
const MAX_BATCH_SIZE = 10;

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

    // Step 1: Release stale locks from crashed workers (recovery)
    // This MUST run before claiming to prevent orphaned IN_FLIGHT events
    const { error: releaseError } = await supabase
      .rpc('release_stale_outbox_locks');

    if (releaseError) {
      console.error('Failed to release stale locks:', releaseError);
      // Non-fatal: continue processing, stale events will be picked up next cycle
    } else {
      const releasedCount = releaseError === null ? 'N/A' : '0'; // RPC doesn't return row count easily
      console.log('[Outbox] Stale locks released');
    }

    // Step 2: Claim next event with FOR UPDATE SKIP LOCKED
    const { data: event, error: claimError } = await supabase
      .rpc('claim_next_outbox_event', {
        p_worker_id: WORKER_ID,
        p_lease_seconds: LEASE_SECONDS,
      });

    if (claimError) {
      console.error('Failed to claim event:', claimError);
      return new Response(JSON.stringify({ error: 'Failed to claim event' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!event || event.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No events to process' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventData = event[0];
    let processed = 0;
    let failed = 0;

    // Process each claimed event
    for (const e of event) {
      try {
        // Route to appropriate handler based on aggregate_type and event_type
        await processEvent(supabase, e);

        // Mark as delivered
        const { error: deliverError } = await supabase
          .rpc('mark_outbox_delivered', {
            p_event_id: e.event_id,
            p_worker_id: WORKER_ID,
          });

        if (deliverError) {
          console.error('Failed to mark delivered:', deliverError);
          failed++;
        } else {
          processed++;
        }
      } catch (error) {
        console.error('Event processing failed:', error);

        // Mark as failed with retry
        await supabase
          .rpc('mark_outbox_failed', {
            p_event_id: e.event_id,
            p_worker_id: WORKER_ID,
            p_error_message: error instanceof Error ? error.message : String(error),
            p_retry_delay_seconds: 1,
            p_max_attempts: 5,
          });

        failed++;
      }
    }

    return new Response(JSON.stringify({
      processed,
      failed,
      workerId: WORKER_ID,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Outbox worker error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  event: {
    event_id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const { aggregate_type, event_type, payload } = event;

  switch (aggregate_type) {
    case 'asset':
      await handleAssetEvent(supabase, event_type, payload);
      break;
    case 'listing':
      await handleListingEvent(supabase, event_type, payload);
      break;
    case 'publication':
      await handlePublicationEvent(supabase, event_type, payload);
      break;
    case 'moderation_case':
      await handleModerationEvent(supabase, event_type, payload);
      break;
    default:
      console.warn(`Unknown aggregate type: ${aggregate_type}`);
  }
}

async function handleAssetEvent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (eventType) {
    case 'AssetPublished':
      // Update search index
      console.log('[Outbox] Asset published:', payload);
      break;
    case 'AssetDeleted':
      // Trigger CDN purge
      console.log('[Outbox] Asset deleted:', payload);
      break;
    default:
      console.warn(`Unknown asset event: ${eventType}`);
  }
}

async function handleListingEvent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (eventType) {
    case 'ListingPublished':
      // Update search index
      // Trigger notifications
      console.log('[Outbox] Listing published:', payload);
      break;
    case 'ListingDeleted':
      // Deindex from search
      console.log('[Outbox] Listing deleted:', payload);
      break;
    case 'ListingRejected':
      // Trigger compensation saga
      console.log('[Outbox] Listing rejected:', payload);
      break;
    default:
      console.warn(`Unknown listing event: ${eventType}`);
  }
}

async function handlePublicationEvent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (eventType) {
    case 'PublicationApproved':
      // Fanout to feeds
      console.log('[Outbox] Publication approved:', payload);
      break;
    case 'PublicationDeleted':
      // Remove from feeds
      console.log('[Outbox] Publication deleted:', payload);
      break;
    default:
      console.warn(`Unknown publication event: ${eventType}`);
  }
}

async function handleModerationEvent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (eventType) {
    case 'ModerationDecisionIssued':
      // Notify author
      console.log('[Outbox] Moderation decision:', payload);
      break;
    default:
      console.warn(`Unknown moderation event: ${eventType}`);
  }
}
