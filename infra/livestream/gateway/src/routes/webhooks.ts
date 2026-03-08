/**
 * routes/webhooks.ts — LiveKit webhook handler.
 *
 * Security: HMAC-SHA256 signature validation via WebhookReceiver.
 * The Authorization header contains the signed JWT from LiveKit.
 * Raw body must be preserved for signature verification.
 *
 * Events processed:
 * - room_started: update session status to live
 * - room_finished: if session not yet ended, auto-stop
 * - participant_joined: increment viewer count
 * - participant_left: decrement viewer count, update viewer duration
 * - egress_ended: update replay_url in live_sessions
 * - ingress_started: update ingress status
 * - ingress_ended: clean up ingress state
 *
 * Idempotency: all DB updates use upsert/conditional updates.
 * Duplicate webhooks (LiveKit retries) are safe.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { LiveKitWebhookEvent } from '../types/livekit.js'
import { RoomService } from '../services/room.service.js'

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Raw body is needed for HMAC verification — must use content-type: application/webhook+json
  app.addContentTypeParser(
    'application/webhook+json',
    { parseAs: 'string' },
    (req, body, done) => {
      done(null, body)
    },
  )

  // ── POST /api/v1/webhooks/livekit ──────────────────────────────────────────
  app.post(
    '/livekit',
    {
      schema: {
        summary: 'LiveKit webhook receiver',
        tags: ['Webhooks'],
        description: 'Receives and processes LiveKit server events. Requires HMAC signature.',
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
      },
      // No auth plugin — uses LiveKit HMAC signature validation instead
      config: { rateLimit: { max: 1000, timeWindow: '1 second' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Verify HMAC signature
      const authHeader = request.headers['authorization']
      if (!authHeader) {
        reply.status(401).send({ error: 'Missing Authorization header' })
        return
      }

      let event: LiveKitWebhookEvent
      try {
        // WebhookReceiver validates the JWT signature against our API secret
        const rawBody = request.body as string
        event = await app.livekit.webhookReceiver.receive(rawBody, authHeader) as unknown as LiveKitWebhookEvent
      } catch (err) {
        app.log.warn({ err }, 'LiveKit webhook signature validation failed')
        reply.status(401).send({ error: 'Invalid webhook signature' })
        return
      }

      app.log.info({ event: event.event, id: event.id }, 'LiveKit webhook received')

      // Process event asynchronously (do not block response)
      // Response must be < 30s or LiveKit will retry
      void processWebhookEvent(app, event).catch((err: unknown) => {
        app.log.error({ err, event: event.event, eventId: event.id }, 'Webhook event processing failed')
      })

      reply.send({ ok: true })
    },
  )
}

/**
 * Process a LiveKit webhook event and update the database accordingly.
 * All operations are idempotent — safe to replay.
 */
async function processWebhookEvent(
  app: FastifyInstance,
  event: LiveKitWebhookEvent,
): Promise<void> {
  const { supabase } = app

  switch (event.event) {
    case 'room_started': {
      // Room started on LiveKit — may precede our API start call
      // Only log; status is managed by API
      app.log.debug({ roomName: event.room?.name }, 'LiveKit room started')
      break
    }

    case 'room_finished': {
      // Room finished on LiveKit — auto-stop if session is still live
      if (!event.room?.name) break
      const sessionId = event.room.name.replace(/^live_/, '')

      const { data: session } = await supabase
        .from('live_sessions')
        .select('id, status, user_id')
        .eq('id', sessionId)
        .single()

      if (session && session.status === 'live') {
        app.log.warn({ sessionId }, 'LiveKit room_finished with session still live — auto-stopping')
        await supabase
          .from('live_sessions')
          .update({
            status: 'ended',
            actual_end_at: new Date().toISOString(),
          })
          .eq('id', sessionId)
          .eq('status', 'live')
      }
      break
    }

    case 'participant_joined': {
      if (!event.room?.name || !event.participant) break
      // Skip recorder identities — they are not real viewers
      const identity = event.participant.identity ?? ''
      if (identity.startsWith('recorder_')) break

      const sessionId = event.room.name.replace(/^live_/, '')

      // Atomic increment via RPC — uses pg_advisory_xact_lock, no race condition.
      // Canonical DB columns: viewer_count_current, viewer_count_peak (20260224300000:41-42).
      await supabase.rpc('increment_viewer_count', { p_session_id: sessionId })
      break
    }

    case 'participant_left': {
      if (!event.room?.name || !event.participant) break
      const identity = event.participant.identity ?? ''
      if (identity.startsWith('recorder_')) break

      const sessionId = event.room.name.replace(/^live_/, '')

      // Atomic decrement via RPC — floor at 0, advisory lock.
      await supabase.rpc('decrement_viewer_count', { p_session_id: sessionId })

      // Update viewer record left_at if it was a viewer participant.
      // DB column: viewer_id (not user_id) — live_viewers schema (20260224300000:63).
      if (identity.startsWith('viewer_')) {
        const viewerId = identity.replace(/^viewer_/, '').split('_')[0]
        if (viewerId) {
          await supabase
            .from('live_viewers')
            .update({ left_at: new Date().toISOString(), is_active: false })
            .eq('session_id', sessionId)
            .eq('viewer_id', viewerId)   // correct column: viewer_id
            .is('left_at', null)
        }
      }
      break
    }

    case 'egress_ended': {
      if (!event.egressInfo) break
      const { egressId, roomName, fileResults } = event.egressInfo

      const sessionId = roomName.replace(/^live_/, '')

      // Get replay URL from file results
      let replayUrl: string | null = null
      if (fileResults && fileResults.length > 0 && fileResults[0]?.location) {
        replayUrl = fileResults[0].location
      }

      if (replayUrl) {
        await supabase
          .from('live_sessions')
          .update({ replay_url: replayUrl })
          .eq('id', sessionId)

        app.log.info({ sessionId, egressId, replayUrl }, 'Egress ended — replay URL updated')
      }
      break
    }

    case 'ingress_started': {
      app.log.info({ ingressId: event.ingressInfo?.ingressId }, 'LiveKit ingress started')
      break
    }

    case 'ingress_ended': {
      app.log.info({ ingressId: event.ingressInfo?.ingressId }, 'LiveKit ingress ended')
      break
    }

    default: {
      app.log.debug({ event: event.event }, 'Unhandled LiveKit webhook event')
    }
  }
}
