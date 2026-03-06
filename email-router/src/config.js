/**
 * config.js — Typed configuration loader from environment variables.
 *
 * Security note: EMAIL_ROUTER_API_KEY must be set; if absent the process
 * exits immediately so the service never starts in an unauthenticated state.
 * No secrets are logged — only structural config shape is emitted.
 */

export function loadConfig() {
  const apiKey = process.env.EMAIL_ROUTER_API_KEY;
  if (!apiKey || apiKey.length < 16) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'config.fatal',
        message:
          'EMAIL_ROUTER_API_KEY is missing or too short (min 16 chars). Refusing to start.',
      })
    );
    process.exit(1);
  }

  const smtpPortRaw = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const smtpPort = Number.isFinite(smtpPortRaw) ? smtpPortRaw : 587;

  const routerPortRaw = parseInt(process.env.EMAIL_ROUTER_PORT ?? '8090', 10);
  const routerPort = Number.isFinite(routerPortRaw) ? routerPortRaw : 8090;

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const logLevel = (['info', 'debug', 'error'].includes(process.env.LOG_LEVEL ?? ''))
    ? /** @type {'info'|'debug'|'error'} */ (process.env.LOG_LEVEL)
    : 'info';

  return Object.freeze({
    port: routerPort,
    apiKey,
    smtp: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: smtpPort,
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from: process.env.SMTP_FROM ?? 'noreply@mansoni.ru',
      secure: process.env.SMTP_SECURE === 'true',
    },
    corsOrigins,
    logLevel,
    domain: process.env.MAIL_DOMAIN ?? 'mansoni.ru',
  });
}

/** @type {ReturnType<typeof loadConfig>} */
let _config;

export function getConfig() {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
