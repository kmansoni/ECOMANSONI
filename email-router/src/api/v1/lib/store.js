/**
 * store.js — In-memory email store for API v1
 *
 * Хранит записи об отправленных письмах в памяти
 * В production использовать базу данных
 *
 * Security considerations:
 * - Email IDs are randomly generated (not sequential)
 * - Data is isolated per API key in multi-tenant setup
 */

import crypto from 'node:crypto';

/**
 * @typedef {Object} EmailRecord
 * @property {string} id
 * @property {string} to
 * @property {string} from
 * @property {string} subject
 * @property {string} [html]
 * @property {string} [text]
 * @property {string} [template]
 * @property {string} status
 * @property {string} [messageId]
 * @property {string} [error]
 * @property {string} createdAt
 * @property {string} [sentAt]
 * @property {string} [deliveredAt]
 * @property {string} [failedAt]
 * @property {string} [bouncedAt]
 */

const EMAIL_STATUSES = ['queued', 'sent', 'delivered', 'failed', 'bounced'];

/**
 * Generates a unique email ID
 * @returns {string}
 */
function generateId() {
  return `msg_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Creates a new email store
 * @returns {Object} Store interface
 */
export function createEmailStore() {
  /** @type {Map<string, EmailRecord>} */
  const emails = new Map();

  return {
    /**
     * Creates a new email record
     * @param {Object} data
     * @returns {EmailRecord}
     */
    create(data) {
      const now = new Date().toISOString();
      /** @type {EmailRecord} */
      const record = {
        id: generateId(),
        to: data.to,
        from: data.from ?? 'noreply@mansoni.ru',
        subject: data.subject,
        html: data.html,
        text: data.text,
        template: data.template,
        status: 'queued',
        createdAt: now,
      };
      emails.set(record.id, record);
      return record;
    },

    /**
     * Finds email by ID
     * @param {string} id
     * @returns {EmailRecord|undefined}
     */
    findById(id) {
      return emails.get(id);
    },

    /**
     * Gets all emails with optional filters
     * @param {Object} options
     * @param {number} options.offset
     * @param {number} options.limit
     * @param {string} [options.from]
     * @param {string} [options.to]
     * @param {string} [options.status]
     * @param {string} [options.template]
     * @returns {{ emails: EmailRecord[], total: number }}
     */
    findAll(options) {
      const { offset, limit, from, to, status, template } = options;

      let result = Array.from(emails.values());

      // Apply filters
      if (from) {
        result = result.filter((e) => e.from === from);
      }
      if (to) {
        result = result.filter((e) => e.to === to);
      }
      if (status) {
        result = result.filter((e) => e.status === status);
      }
      if (template) {
        result = result.filter((e) => e.template === template);
      }

      // Sort by createdAt descending (newest first)
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = result.length;
      const paginated = result.slice(offset, offset + limit);

      return { emails: paginated, total };
    },

    /**
     * Updates an email record
     * @param {string} id
     * @param {Partial<EmailRecord>} data
     * @returns {EmailRecord|undefined}
     */
    update(id, data) {
      const existing = emails.get(id);
      if (!existing) return undefined;

      const updated = { ...existing, ...data };
      emails.set(id, updated);
      return updated;
    },

    /**
     * Deletes an email record
     * @param {string} id
     * @returns {boolean}
     */
    delete(id) {
      return emails.delete(id);
    },

    /**
     * Gets email count by status
     * @param {string} [status]
     * @returns {number}
     */
    count(status) {
      if (status) {
        return Array.from(emails.values()).filter((e) => e.status === status).length;
      }
      return emails.size;
    },

    /**
     * Gets statistics for a period
     * @param {string} from
     * @param {string} to
     * @returns {Object}
     */
    getStats(from, to) {
      const fromDate = from ? new Date(from) : new Date(0);
      const toDate = to ? new Date(to) : new Date();

      const filtered = Array.from(emails.values()).filter((e) => {
        const created = new Date(e.createdAt);
        return created >= fromDate && created <= toDate;
      });

      return {
        sent: filtered.filter((e) => e.status === 'sent').length,
        delivered: filtered.filter((e) => e.status === 'delivered').length,
        failed: filtered.filter((e) => e.status === 'failed').length,
        bounced: filtered.filter((e) => e.status === 'bounced').length,
        queued: filtered.filter((e) => e.status === 'queued').length,
        total: filtered.length,
      };
    },
  };
}

/**
 * @typedef {ReturnType<typeof createEmailStore>} EmailStore
 */

export { EMAIL_STATUSES };
