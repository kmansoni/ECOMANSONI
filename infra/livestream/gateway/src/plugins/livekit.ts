/**
 * plugins/livekit.ts — LiveKit SDK client plugin.
 *
 * Decorates the Fastify instance with:
 *   - `livekit.roomService`  — RoomServiceClient (manage rooms, participants)
 *   - `livekit.egressClient` — EgressClient (recording, HLS)
 *   - `livekit.ingressClient`— IngressClient (RTMP/WHIP ingest management)
 *   - `livekit.webhookReceiver` — WebhookReceiver (signature validation)
 *
 * All clients use the same API key/secret pair which is passed
 * via environment variables (never hardcoded).
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import {
  RoomServiceClient,
  EgressClient,
  IngressClient,
  WebhookReceiver,
} from 'livekit-server-sdk'
import { config } from '../config.js'

export interface LiveKitClients {
  roomService: RoomServiceClient
  egressClient: EgressClient
  ingressClient: IngressClient
  webhookReceiver: WebhookReceiver
}

declare module 'fastify' {
  interface FastifyInstance {
    livekit: LiveKitClients
  }
}

async function livekitPlugin(app: FastifyInstance): Promise<void> {
  // Convert ws:// → http:// for the REST API base URL
  // LiveKit SDK accepts both http and ws URL forms for APIs
  const apiUrl = config.LIVEKIT_URL.replace(/^ws(s?):\/\//, 'http$1://')

  const roomService = new RoomServiceClient(
    apiUrl,
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET,
  )

  const egressClient = new EgressClient(
    apiUrl,
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET,
  )

  const ingressClient = new IngressClient(
    apiUrl,
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET,
  )

  const webhookReceiver = new WebhookReceiver(
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET,
  )

  // Verify connectivity: list rooms (lightweight call)
  try {
    await roomService.listRooms()
    app.log.info({ livekitUrl: apiUrl }, 'LiveKit client connected')
  } catch (err) {
    app.log.warn({ err, livekitUrl: apiUrl }, 'LiveKit connectivity check failed — will retry on demand')
  }

  app.decorate('livekit', {
    roomService,
    egressClient,
    ingressClient,
    webhookReceiver,
  })
}

export default fp(livekitPlugin, {
  name: 'livekit',
  fastify: '>=4.0.0',
})
