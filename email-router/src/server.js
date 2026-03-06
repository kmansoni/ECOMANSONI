/**
 * server.js — HTTP server: routing, CORS, JSON body parsing, error handling.
 *
 * Security decisions:
 *  - Request body is capped at MAX_BODY_BYTES (1 MiB) — exceeded bodies abort
 *    the request immediately with 413 to prevent memory exhaustion.
 *  - CORS origins are checked against an allowlist from config; wildcard '*'
 *    is never emitted unless CORS_ORIGINS explicitly contains '*'.
 *  - X-Content-Type-Options / X-Frame-Options headers always set.
 *  - Unknown routes return 404 (no path reflection to avoid XSS via 404 body).
 *
 * Graceful shutdown:
 *  - SIGTERM / SIGINT cause server.close() which stops accepting new
 *    connections while in-flight requests complete (up to SHUTDOWN_TIMEOUT).
 */

import http from 'node:http';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { handleSend } from './handlers/send.js';
import { handleHealth } from './handlers/health.js';
import { createApiV1Router } from './api/v1/index.js';

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MiB
const SHUTDOWN_TIMEOUT = 10_000; // 10 s

// Create API v1 router
const apiV1Router = createApiV1Router();

// ─── CORS ─────────────────────────────────────────────────────────────────────

function applyCors(req, res) {
  const cfg = getConfig();
  const origin = req.headers['origin'];

  const allowed =
    cfg.corsOrigins.includes('*') ||
    (origin && cfg.corsOrigins.includes(origin));

  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ─── Query parser ─────────────────────────────────────────────────────────────

/**
 * @param {string} queryString
 * @returns {Record<string, string>}
 */
function parseQuery(queryString) {
  if (!queryString) return {};
  /** @type {Record<string, string>} */
  const query = {};
  const pairs = queryString.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      query[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
    }
  }
  return query;
}

// ─── Security headers (always) ────────────────────────────────────────────────

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
}

// ─── JSON body reader ─────────────────────────────────────────────────────────

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<unknown>}  parsed JSON or throws
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });

    req.on('error', reject);
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function route(req, res) {
  applySecurityHeaders(res);
  applyCors(req, res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url?.split('?')[0] ?? '/';

  // API v1 routes
  if (url.startsWith('/api/v1')) {
    // Parse query string for API routes
    const queryString = req.url?.split('?')[1] ?? '';
    req.query = parseQuery(queryString);
    
    // Read body for POST/PUT requests
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        req.body = await readJsonBody(req);
      } catch (err) {
        const status = err.status ?? 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
    }
    
    // Try to handle with API v1 router
    const handled = await apiV1Router.handle(req, res);
    if (handled) {
      return;
    }
  }

  if (req.method === 'GET' && url === '/health') {
    await handleHealth(req, res);
    return;
  }

  if (req.method === 'POST' && url === '/send') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      const status = err.status ?? 400;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return;
    }
    await handleSend(req, res, body);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
}

// ─── createServer ─────────────────────────────────────────────────────────────

export function createServer() {
  const server = http.createServer(async (req, res) => {
    const start = Date.now();
    try {
      await route(req, res);
    } catch (err) {
      logger.error('server.unhandled', { error: err.message, stack: err.stack?.slice(0, 400) });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR' }));
      }
    } finally {
      const ms = Date.now() - start;
      logger.info('http.request', {
        method: req.method,
        url: req.url?.split('?')[0],
        status: res.statusCode,
        ms,
        ip: req.socket?.remoteAddress,
      });
    }
  });

  return server;
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

export function registerShutdown(server) {
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('server.shutdown', { signal });

    server.close(() => {
      logger.info('server.shutdown.complete', {});
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('server.shutdown.forced', { reason: 'timeout' });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
