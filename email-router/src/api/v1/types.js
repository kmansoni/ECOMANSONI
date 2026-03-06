/**
 * types.js — Type definitions for API v1
 */

import http from 'node:http';

/**
 * @typedef {Object} RequestContext
 * @property {http.IncomingMessage} req
 * @property {http.ServerResponse} res
 */

/**
 * @typedef {Function} Middleware
 * @param {RequestContext} ctx
 * @param {Function} next
 * @returns {Promise<void>}
 */

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

/**
 * @typedef {Object} PaginationParams
 * @property {number} page
 * @property {number} limit
 */

/**
 * @typedef {Object} PaginatedResponse
 * @property {any[]} items
 * @property {number} total
 * @property {number} page
 * @property {number} limit
 * @property {number} pages
 */

/**
 * @typedef {Object} Template
 * @property {string} name
 * @property {string} subject
 * @property {string} html
 * @property {string} [text]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Stats
 * @property {number} sent
 * @property {number} delivered
 * @property {number} failed
 * @property {number} bounced
 * @property {number} queued
 */

/**
 * @typedef {Object} BatchResult
 * @property {boolean} success
 * @property {string} [messageId]
 * @property {string} [error]
 */

export {};
