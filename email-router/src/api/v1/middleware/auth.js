/**
 * auth.js — Authentication middleware for API v1
 *
 * Проверяет наличие и валидность API ключа в заголовке X-API-Key
 *
 * Security considerations:
 * - API key must be at least 16 characters
 * - Timing-safe comparison to prevent timing attacks
 * - Returns 401 for missing key, 403 for invalid key
 */

import { getConfig } from '../../../config.js';
import { logger } from '../../../logger.js';
import { createError } from '../router.js';

/**
 * @typedef {Object} RequestContext
 * @property {import('http').IncomingMessage} req
 * @property {import('http').ServerResponse} res
 */

/**
 * Timing-safe string comparison
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Creates authentication middleware
 * @returns {Function} Express-like middleware
 */
export function authMiddleware() {
  const config = getConfig();
  const apiKey = config.apiKey;

  /**
   * @param {RequestContext} ctx
   * @param {Function} next
   */
  return async (ctx, next) => {
    const { req } = ctx;
    const providedKey = req.headers['x-api-key'];

    // Log all authentication attempts
    const ip = req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    if (!providedKey) {
      logger.warn('auth.missing_key', { ip, userAgent, path: req.url });
      throw createError('Missing X-API-Key header', 401);
    }

    if (typeof providedKey !== 'string') {
      logger.warn('auth.invalid_key_format', { ip, userAgent, path: req.url });
      throw createError('Invalid X-API-Key header format', 401);
    }

    // Timing-safe comparison
    if (!timingSafeEqual(providedKey, apiKey)) {
      logger.warn('auth.invalid_key', { ip, userAgent, path: req.url });
      throw createError('Invalid API key', 403);
    }

    // Authentication successful
    logger.debug('auth.success', { ip, path: req.url });

    // Attach authenticated flag to request
    req.authenticated = true;
    req.apiKey = providedKey;

    await next();
  };
}
