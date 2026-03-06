/**
 * pagination.js — Pagination middleware for API v1
 *
 * Извлекает и валидирует параметры пагинации из query string
 *
 * Default: page=1, limit=20
 * Max limit: 100
 */

import { createError } from '../router.js';

/**
 * @typedef {Object} RequestContext
 * @property {import('http').IncomingMessage} req
 * @property {import('http').ServerResponse} res
 */

/**
 * Creates pagination middleware
 * @param {Object} options
 * @param {number} [options.defaultPage=1]
 * @param {number} [options.defaultLimit=20]
 * @param {number} [options.maxLimit=100]
 * @returns {Function} Express-like middleware
 */
export function paginationMiddleware(options = {}) {
  const defaultPage = options.defaultPage ?? 1;
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  /**
   * @param {RequestContext} ctx
   * @param {Function} next
   */
  return async (ctx, next) => {
    const { req } = ctx;
    const query = req.query ?? {};

    // Parse page
    let page = defaultPage;
    if (query.page !== undefined) {
      const parsed = parseInt(query.page, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw createError('Invalid page parameter: must be a positive integer', 400);
      }
      page = parsed;
    }

    // Parse limit
    let limit = defaultLimit;
    if (query.limit !== undefined) {
      const parsed = parseInt(query.limit, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw createError('Invalid limit parameter: must be a positive integer', 400);
      }
      if (parsed > maxLimit) {
        throw createError(`Limit cannot exceed ${maxLimit}`, 400);
      }
      limit = parsed;
    }

    // Attach pagination data to request
    req.pagination = {
      page,
      limit,
      offset: (page - 1) * limit,
    };

    await next();
  };
}

/**
 * Создает объект пагинированного ответа
 * @param {any[]} items
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 * @returns {Object}
 */
export function createPaginatedResponse(items, total, page, limit) {
  const pages = Math.ceil(total / limit);

  return {
    items,
    total,
    page,
    limit,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}
