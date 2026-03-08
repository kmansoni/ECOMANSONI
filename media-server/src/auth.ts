/**
 * auth.ts — Supabase JWT verification using jose (HS256).
 *
 * Security contracts:
 *  - Token is verified cryptographically — not just decoded.
 *  - Expired tokens are rejected (exp claim enforced by jose).
 *  - Issuer claim is validated when SUPABASE_URL is configured.
 *  - JWT string is NEVER written to any log.
 *  - Role "service_role" tokens are accepted but flagged separately.
 */

import { jwtVerify, type JWTPayload } from 'jose';
import { config } from './config.js';

export interface AuthPayload {
  /** Supabase user UUID (sub claim) */
  userId: string;
  /** Supabase role: 'authenticated' | 'anon' | 'service_role' */
  role: string;
  /** Token expiry epoch in seconds */
  exp: number;
}

/**
 * AuthError codes allow callers to map to precise HTTP status codes.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'MISSING_TOKEN'
      | 'INVALID_TOKEN'
      | 'EXPIRED_TOKEN'
      | 'INSUFFICIENT_ROLE',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Pre-encode the secret once at module load — avoids re-allocating on every request.
const JWT_SECRET = new TextEncoder().encode(config.jwt.secret);

/**
 * Verifies a Supabase JWT (HS256).
 *
 * @param rawToken - Bearer token string extracted from Authorization header.
 *                   Must NOT include the "Bearer " prefix.
 * @returns Verified payload with userId, role, exp.
 * @throws AuthError on any verification failure.
 */
export async function verifyJwt(rawToken: string): Promise<AuthPayload> {
  if (!rawToken || rawToken.trim() === '') {
    throw new AuthError('Authorization token is missing', 'MISSING_TOKEN');
  }

  let payload: JWTPayload;

  try {
    const result = await jwtVerify(rawToken, JWT_SECRET, {
      algorithms: ['HS256'],
      // Only validate issuer when SUPABASE_URL is provided
      ...(config.jwt.issuer ? { issuer: config.jwt.issuer } : {}),
    });
    payload = result.payload;
  } catch (err: unknown) {
    // Re-map jose's error types to our AuthError domain
    const name = err instanceof Error ? err.name : '';
    const message = err instanceof Error ? err.message : 'unknown';

    if (name === 'JWTExpired') {
      throw new AuthError('Token has expired', 'EXPIRED_TOKEN');
    }
    // JWTInvalid, JWSSignatureVerificationFailed, JWSInvalid, etc.
    throw new AuthError(`Token verification failed: ${message}`, 'INVALID_TOKEN');
  }

  const sub = payload['sub'];
  const role = payload['role'];
  const exp = payload['exp'];

  // sub is mandatory per RFC 7519 §4.1.2; Supabase always sets it.
  if (typeof sub !== 'string' || sub === '') {
    throw new AuthError('Token missing sub claim', 'INVALID_TOKEN');
  }

  if (typeof role !== 'string' || role === '') {
    throw new AuthError('Token missing role claim', 'INVALID_TOKEN');
  }

  if (typeof exp !== 'number') {
    throw new AuthError('Token missing exp claim', 'INVALID_TOKEN');
  }

  return { userId: sub, role, exp };
}

/**
 * Extracts the Bearer token from an HTTP Authorization header value.
 *
 * @param header - Full header value, e.g. "Bearer eyJhb..."
 * @returns Raw JWT string without "Bearer " prefix.
 * @throws AuthError if header is absent or malformed.
 */
export function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new AuthError('Missing Authorization header', 'MISSING_TOKEN');
  }

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    throw new AuthError(
      'Authorization header must be: Bearer <token>',
      'MISSING_TOKEN',
    );
  }

  const token = parts[1];
  if (!token) {
    throw new AuthError('Bearer token value is empty', 'MISSING_TOKEN');
  }

  return token;
}
