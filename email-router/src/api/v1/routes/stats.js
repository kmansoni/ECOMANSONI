/**
 * stats.js — Routes for email statistics
 *
 * Endpoints:
 * - GET /api/v1/stats - Get overall statistics
 * - GET /api/v1/stats/period?from=...&to=... - Get statistics for a period
 */

import { Router, json, createError } from '../router.js';
import { emailStore } from './emails.js';
import { logger } from '../../../logger.js';

/**
 * Creates the stats router
 * @returns {Router}
 */
export function createStatsRouter() {
  const router = new Router();

  // GET /api/v1/stats - Get overall statistics
  router.get('/', async (req, res) => {
    logger.info('stats.get');

    const stats = {
      sent: emailStore.count('sent'),
      delivered: emailStore.count('delivered'),
      failed: emailStore.count('failed'),
      bounced: emailStore.count('bounced'),
      queued: emailStore.count('queued'),
      total: emailStore.count(),
    };

    json(res, stats);
  });

  // GET /api/v1/stats/period - Get statistics for a period
  router.get('/period', async (req, res) => {
    const { from, to } = req.query;

    logger.info('stats.period', { from, to });

    // Validate date parameters
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        throw createError('Invalid from date format. Use ISO 8601.', 400);
      }
    }

    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        throw createError('Invalid to date format. Use ISO 8601.', 400);
      }
    }

    const stats = emailStore.getStats(from, to);

    json(res, {
      period: {
        from: from ?? 'beginning',
        to: to ?? 'now',
      },
      stats,
    });
  });

  return router;
}
