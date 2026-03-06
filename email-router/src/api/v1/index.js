/**
 * index.js — API v1 entry point
 *
 * Mounts all v1 routes and applies global middleware
 */

import { Router, json } from './router.js';
import { authMiddleware } from './middleware/auth.js';
import { createEmailsRouter } from './routes/emails.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createStatsRouter } from './routes/stats.js';
import { logger } from '../../logger.js';

/**
 * Creates the API v1 router with all endpoints
 * @returns {Router}
 */
export function createApiV1Router() {
  const router = new Router();

  // Apply auth middleware to all v1 routes
  router.use(authMiddleware());

  // Mount sub-routers
  router.use('/emails', createEmailsRouter());
  router.use('/templates', createTemplatesRouter());
  router.use('/stats', createStatsRouter());

  // Health check endpoint (no auth required)
  const healthRouter = new Router();
  healthRouter.get('/', async (req, res) => {
    json(res, {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });
  router.use('/health', healthRouter);

  logger.info('api.v1.loaded', {
    routes: [
      'GET /emails',
      'GET /emails/:id',
      'DELETE /emails/:id',
      'POST /emails/batch',
      'GET /emails/:id/status',
      'GET /templates',
      'POST /templates',
      'GET /templates/:name',
      'PUT /templates/:name',
      'DELETE /templates/:name',
      'GET /stats',
      'GET /stats/period',
      'GET /health',
    ],
  });

  return router;
}
