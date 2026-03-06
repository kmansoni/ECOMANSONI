/**
 * handlers/health.js — GET /health handler.
 *
 * No authentication required (used by load balancers / k8s probes).
 * Probes SMTP connectivity asynchronously with a 5s timeout.
 * Returns 200 when ok, 503 when SMTP is unreachable.
 *
 * @param {import('node:http').IncomingMessage} _req
 * @param {import('node:http').ServerResponse} res
 */

import { getConfig } from '../config.js';
import { probeSmtp } from '../smtp/client.js';

const VERSION = '1.0.0';

export async function handleHealth(_req, res) {
  const cfg = getConfig();
  const smtpProbe = await probeSmtp();

  const status = smtpProbe.connected ? 'ok' : 'degraded';
  const httpCode = smtpProbe.connected ? 200 : 503;

  // Security: host/port/lastError MUST NOT appear in the public response —
  // they would disclose internal SMTP infrastructure to unauthenticated callers.
  const body = {
    status,
    uptime: Math.floor(process.uptime()),
    smtp: {
      connected: smtpProbe.connected,
      lastCheck: smtpProbe.lastCheck,
    },
    version: VERSION,
  };

  res.writeHead(httpCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
