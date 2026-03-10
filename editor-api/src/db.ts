/**
 * db.ts — PostgreSQL connection pool via `pg`.
 *
 * Architecture decisions:
 *  - Pool is a module-level singleton — shared across all requests.
 *  - SSL is auto-detected from DATABASE_URL (sslmode=require or ?ssl=true).
 *  - All queries are logged with structured events (no raw SQL in production logs).
 *  - transaction() wrapper ensures ROLLBACK on any thrown error.
 *  - gracefulShutdown() must be called on SIGTERM to drain in-flight queries.
 */

import pg, { type QueryResultRow } from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

// SSL: if DATABASE_URL contains sslmode=require, pg handles it automatically.
// For Supabase Transaction Pooler (port 6543) SSL is mandatory.
const pool = new Pool({
  connectionString: config.db.connectionString,
  min: config.db.poolMin,
  max: config.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: config.db.connectionString.includes('sslmode=require') ||
       config.db.connectionString.includes('ssl=true')
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => {
  logger.error({ event: 'pg_pool_error', err: err.message });
});

pool.on('connect', () => {
  logger.debug({ event: 'pg_pool_connect' });
});

/**
 * Execute a parameterised query on a pooled connection.
 * Returns typed rows.
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug({ event: 'db_query', rowCount: result.rowCount, duration });
    return result;
  } catch (err: unknown) {
    const duration = Date.now() - start;
    logger.error({ event: 'db_query_error', duration, err: (err as Error).message });
    throw err;
  }
}

/**
 * Acquire a client for manual transaction management.
 * Caller MUST call client.release() after use.
 */
export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

/**
 * Execute a callback inside a BEGIN/COMMIT/ROLLBACK transaction.
 * If callback throws, ROLLBACK is executed and the error re-thrown.
 *
 * Isolation level: READ COMMITTED (PostgreSQL default) — sufficient for
 * most editor operations. Callers needing SERIALIZABLE must handle
 * retry logic at the service layer.
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Graceful shutdown — drain pool before process exit.
 * Called from SIGTERM / SIGINT handlers.
 */
export async function gracefulShutdown(): Promise<void> {
  logger.info({ event: 'db_pool_shutdown' });
  await pool.end();
}
