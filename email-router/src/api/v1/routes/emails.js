/**
 * emails.js — Routes for email operations
 *
 * Endpoints:
 * - GET /api/v1/emails - List emails with pagination
 * - GET /api/v1/emails/:id - Get email by ID
 * - DELETE /api/v1/emails/:id - Delete email
 * - POST /api/v1/emails/batch - Batch send emails (up to 50)
 * - GET /api/v1/emails/:id/status - Get delivery status
 */

import { Router, json, createError } from '../router.js';
import { paginationMiddleware, createPaginatedResponse } from '../middleware/pagination.js';
import { createEmailStore } from '../lib/store.js';
import { logger } from '../../../logger.js';
import { getConfig } from '../../../config.js';

const MAX_BATCH_SIZE = 50;

// Create email store instance
const emailStore = createEmailStore();

/**
 * Validates email data
 * @param {Object} data
 * @throws {Error}
 */
function validateEmailData(data) {
  if (!data.to) {
    throw createError('Missing required field: to', 400);
  }
  if (!data.subject) {
    throw createError('Missing required field: subject', 400);
  }

  // Validate email format (simple check)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.to)) {
    throw createError('Invalid email format: to', 400);
  }
  if (data.from && !emailRegex.test(data.from)) {
    throw createError('Invalid email format: from', 400);
  }
}

/**
 * Serializes email for response
 * @param {Object} email
 * @returns {Object}
 */
function serializeEmail(email) {
  return {
    id: email.id,
    to: email.to,
    from: email.from,
    subject: email.subject,
    template: email.template,
    status: email.status,
    messageId: email.messageId,
    createdAt: email.createdAt,
    sentAt: email.sentAt,
    deliveredAt: email.deliveredAt,
    failedAt: email.failedAt,
    bouncedAt: email.bouncedAt,
    error: email.error,
  };
}

/**
 * Creates the emails router
 * @returns {Router}
 */
export function createEmailsRouter() {
  const router = new Router();

  // Apply pagination middleware to all routes
  router.use(paginationMiddleware());

  // GET /api/v1/emails - List emails with filters
  router.get('/', async (req, res) => {
    const { offset, limit } = req.pagination;
    const { from, to, status, template } = req.query;

    logger.info('emails.list', {
      page: req.pagination.page,
      limit: req.pagination.limit,
      filters: { from, to, status, template },
    });

    const result = emailStore.findAll({
      offset,
      limit,
      from,
      to,
      status,
      template,
    });

    const response = createPaginatedResponse(
      result.emails.map(serializeEmail),
      result.total,
      req.pagination.page,
      req.pagination.limit
    );

    json(res, response);
  });

  // GET /api/v1/emails/:id - Get email by ID
  router.get('/:id', async (req, res) => {
    const { id } = req.params;

    logger.debug('emails.get', { id });

    const email = emailStore.findById(id);
    if (!email) {
      throw createError('Email not found', 404);
    }

    json(res, serializeEmail(email));
  });

  // GET /api/v1/emails/:id/status - Get delivery status
  router.get('/:id/status', async (req, res) => {
    const { id } = req.params;

    logger.debug('emails.status', { id });

    const email = emailStore.findById(id);
    if (!email) {
      throw createError('Email not found', 404);
    }

    json(res, {
      id: email.id,
      status: email.status,
      messageId: email.messageId,
      sentAt: email.sentAt,
      deliveredAt: email.deliveredAt,
      failedAt: email.failedAt,
      bouncedAt: email.bouncedAt,
      error: email.error,
    });
  });

  // DELETE /api/v1/emails/:id - Delete email
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    logger.info('emails.delete', { id });

    const email = emailStore.findById(id);
    if (!email) {
      throw createError('Email not found', 404);
    }

    // Only allow deleting queued emails (not yet sent)
    if (email.status !== 'queued') {
      throw createError('Cannot delete email that has already been sent', 400);
    }

    emailStore.delete(id);

    json(res, { success: true, message: 'Email deleted' });
  });

  // POST /api/v1/emails/batch - Batch send emails
  router.post('/batch', async (req, res) => {
    const body = req.body ?? {};

    if (!body.emails || !Array.isArray(body.emails)) {
      throw createError('Missing required field: emails (array)', 400);
    }

    if (body.emails.length === 0) {
      throw createError('Emails array cannot be empty', 400);
    }

    if (body.emails.length > MAX_BATCH_SIZE) {
      throw createError(`Maximum ${MAX_BATCH_SIZE} emails per batch`, 400);
    }

    logger.info('emails.batch', { count: body.emails.length });

    const config = getConfig();
    const results = [];

    // Process each email (atomic - one failure doesn't stop others)
    for (const emailData of body.emails) {
      try {
        validateEmailData(emailData);

        // Create email record
        const email = emailStore.create({
          to: emailData.to,
          from: emailData.from ?? config.smtp.from,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          template: emailData.template,
        });

        // Simulate sending (in real implementation, would use SMTP client)
        const sentAt = new Date().toISOString();
        const messageId = `<${email.id}@${config.domain}>`;

        emailStore.update(email.id, {
          status: 'sent',
          sentAt,
          messageId,
        });

        results.push({
          success: true,
          messageId: email.id,
        });
      } catch (err) {
        results.push({
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    logger.info('emails.batch_complete', {
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
    });

    json(res, {
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
      },
    });
  });

  return router;
}

// Export for testing
export { emailStore };
