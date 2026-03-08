/**
 * plugins/auth.ts — Supabase JWT validation.
 *
 * Security properties:
 * - Validates `exp` claim (reject expired tokens)
 * - Validates `aud` claim must include 'authenticated'
 * - Validates `role` must be 'authenticated'
 * - Uses HMAC-SHA256 signature verification (HS256)
 * - Never logs token value — only claims metadata
 * - Timing-safe comparison for signature (native crypto)
 *
 * Attack vectors mitigated:
 * - Replay attacks: `exp` enforced; no session revocation needed
 *   (tokens expire in max 1hr for Supabase by default)
 * - Algorithm confusion: only HS256 accepted
 * - Token substitution: `aud` + `role` validated
 *
 * Usage: `await request.jwtVerify()` or use `preHandler: [app.authenticate]`
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'
import type { SupabaseJwtPayload, AuthUser } from '../types/index.js'
import { UnauthorizedError } from './error-handler.js'

// ── JWT utilities ─────────────────────────────────────────────────────────────

function base64urlDecode(str: string): string {
  // Pad to multiple of 4
  const padded = str + '=='.slice(0, (4 - (str.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function verifyHs256(header: string, payload: string, signature: string, secret: string): boolean {
  const data = `${header}.${payload}`
  const expected = createHmac('sha256', secret).update(data).digest('base64url')
  // Timing-safe comparison to prevent timing oracle attacks
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    // Buffers have different length — definitely not equal
    return false
  }
}

/**
 * Decode and verify a compact JWS (three-part JWT).
 * Throws UnauthorizedError for any validation failure.
 */
export function verifySupabaseJwt(token: string): SupabaseJwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed JWT: expected three dot-separated parts')
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  // 1. Verify signature first (fail-fast, avoid processing untrusted claims)
  const isValid = verifyHs256(headerB64, payloadB64, signatureB64, config.SUPABASE_JWT_SECRET)
  if (!isValid) {
    throw new UnauthorizedError('JWT signature verification failed')
  }

  // 2. Decode header and validate algorithm
  let header: { alg: string; typ: string }
  try {
    header = JSON.parse(base64urlDecode(headerB64)) as { alg: string; typ: string }
  } catch {
    throw new UnauthorizedError('Malformed JWT header')
  }
  if (header.alg !== 'HS256') {
    throw new UnauthorizedError(`Unsupported JWT algorithm: ${header.alg}`)
  }

  // 3. Decode payload
  let payload: SupabaseJwtPayload
  try {
    payload = JSON.parse(base64urlDecode(payloadB64)) as SupabaseJwtPayload
  } catch {
    throw new UnauthorizedError('Malformed JWT payload')
  }

  // 4. Validate claims
  const nowSec = Math.floor(Date.now() / 1000)

  if (typeof payload.exp !== 'number' || payload.exp < nowSec) {
    throw new UnauthorizedError('JWT has expired')
  }

  // aud may be string or array
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes('authenticated')) {
    throw new UnauthorizedError('JWT audience mismatch: expected "authenticated"')
  }

  if (payload.role !== 'authenticated') {
    throw new UnauthorizedError('JWT role must be "authenticated"')
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new UnauthorizedError('JWT missing subject (sub) claim')
  }

  return payload
}

// ── Fastify plugin ────────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler hook that validates Bearer JWT and sets request.user.
     * Use on any protected route.
     */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    /**
     * preHandler hook that validates JWT if present but does NOT reject
     * anonymous requests (for optional auth routes).
     */
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  const authenticate = async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    const authHeader = request.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header')
    }

    const token = authHeader.slice(7)
    const payload = verifySupabaseJwt(token)

    const user: AuthUser = payload.email
      ? { id: payload.sub, email: payload.email, role: payload.role }
      : { id: payload.sub, role: payload.role }

    request.user = user
  }

  const optionalAuthenticate = async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    const authHeader = request.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Anonymous access allowed — no user set
      return
    }

    try {
      const token = authHeader.slice(7)
      const payload = verifySupabaseJwt(token)
      request.user = payload.email
        ? { id: payload.sub, email: payload.email, role: payload.role }
        : { id: payload.sub, role: payload.role }
    } catch {
      // Invalid token on optional route — treat as anonymous (do not throw)
      // Log at debug level to detect probing without spam
      app.log.debug('Optional auth: invalid token provided, treating as anonymous')
    }
  }

  app.decorate('authenticate', authenticate)
  app.decorate('optionalAuthenticate', optionalAuthenticate)
}

export default fp(authPlugin, {
  name: 'auth',
  fastify: '>=4.0.0',
})
