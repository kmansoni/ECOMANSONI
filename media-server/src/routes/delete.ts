/**
 * routes/delete.ts — DELETE /api/media/:bucket/:key
 *
 * Authorization model (zero-trust):
 *  - JWT required on every request — server validates signature, not just presence.
 *  - Non-admin users may only delete files under their own userId prefix.
 *    Key format stored by upload.ts: <userId>/<timestamp>_<uuid>.<ext>
 *    → Prefix check: key.startsWith(`${auth.userId}/`)
 *  - service_role JWT bypasses the prefix check (admin/backend operations).
 *  - 404 vs 403: always return 403 for ownership mismatch to prevent key enumeration.
 *
 * Idempotency: DELETE is idempotent — if object doesn't exist, 200 is returned.
 * This prevents retry loops from becoming errors.
 *
 * Replay protection: JWT exp claim enforced by verifyJwt(). Short-lived tokens
 * (15 min Supabase default) limit the replay window.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, extractBearerToken, AuthError } from '../auth.js';
import { deleteFile } from '../storage.js';
import { getBucketMimePrefixes } from '../validation.js';

interface DeleteParams {
  bucket: string;
  // ':key' captures everything after /api/media/:bucket/
  // Fastify wildcard param — key may contain slashes
  '*': string;
}

export async function deleteRoute(app: FastifyInstance): Promise<void> {
  app.delete(
    '/api/media/:bucket/*',
    async (
      request: FastifyRequest<{ Params: DeleteParams }>,
      reply: FastifyReply,
    ): Promise<void> => {
      let userId = 'unknown';

      try {
        // ── Auth ───────────────────────────────────────────────────────────────
        const token = extractBearerToken(request.headers.authorization);
        const auth = await verifyJwt(token);
        userId = auth.userId;

        if (auth.role === 'anon') {
          return reply.code(401).send({ error: 'Authentication required' });
        }

        // ── Params ─────────────────────────────────────────────────────────────
        const { bucket } = request.params;
        const key = request.params['*'];

        if (!bucket || !key) {
          return reply.code(400).send({ error: 'bucket and key are required' });
        }

        // ── Bucket existence check ─────────────────────────────────────────────
        const allowedPrefixes = getBucketMimePrefixes(bucket);
        if (!allowedPrefixes) {
          return reply.code(400).send({ error: `Unknown bucket: ${bucket}` });
        }

        // ── Authorisation: ownership check ─────────────────────────────────────
        const isAdmin = auth.role === 'service_role';
        const isOwner = key.startsWith(`${userId}/`);

        if (!isAdmin && !isOwner) {
          // Do NOT reveal whether the object exists — return 403 unconditionally
          app.log.warn({
            event: 'delete_forbidden',
            userId,
            bucket,
            key,
            role: auth.role,
          });
          return reply.code(403).send({ error: 'Forbidden' });
        }

        // ── Delete ─────────────────────────────────────────────────────────────
        await deleteFile(bucket, key);

        // Attempt to delete thumbnail too (best-effort — not an error if absent)
        const thumbKey = key.replace(/(\.[^.]+)?$/, '_thumb.jpg');
        if (thumbKey !== key) {
          await deleteFile(bucket, thumbKey).catch((_err) => {
            // Non-fatal: thumbnail may not exist for all media types
          });
        }

        app.log.info({
          event: 'delete_success',
          userId,
          bucket,
          key,
          isAdmin,
        });

        return reply.code(200).send({ ok: true });
      } catch (err: unknown) {
        if (err instanceof AuthError) {
          return reply.code(401).send({ error: err.message });
        }

        app.log.error({ event: 'delete_error', userId, err });
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );
}
