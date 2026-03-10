/**
 * auth-guard.ts — Fastify preHandler hook enforcing JWT authentication.
 *
 * Zero-trust: every request is treated as potentially hostile.
 * The user object is attached to request.user after successful verification.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, extractBearerToken, AuthError } from '../auth.js';

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  let token: string;
  try {
    token = extractBearerToken(authHeader);
  } catch (err) {
    if (err instanceof AuthError) {
      reply.code(401).send({ error: err.message, code: err.code });
      return;
    }
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = await verifyJwt(token);
    request.user = payload;
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === 'INSUFFICIENT_ROLE' ? 403 : 401;
      reply.code(status).send({ error: err.message, code: err.code });
      return;
    }
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
