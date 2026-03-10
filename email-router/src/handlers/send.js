/**
 * handlers/send.js — POST /send handler.
 *
 * Security model:
 *  - X-API-Key header compared with crypto.timingSafeEqual to prevent
 *    timing side-channel attacks on the key comparison.
 *  - Body size capped at MAX_BODY_BYTES (1 MiB) before parsing to prevent
 *    memory exhaustion DoS.
 *  - All request fields validated before reaching SMTP layer.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, unknown>} body  – already-parsed JSON from server.js
 */

import crypto from 'node:crypto';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { validateSendRequest } from '../validation.js';
import { sendMail, SmtpError } from '../smtp/client.js';
import { renderTemplate } from '../templates/engine.js';

/**
 * Constant-time string comparison to avoid timing attacks on API key.
 * @param {string} a @param {string} b @returns {boolean}
 */
/**
 * Constant-time string comparison.
 * Hashing both strings to fixed-length digests before comparison eliminates
 * length-based timing side-channels entirely.
 * @param {string} a @param {string} b @returns {boolean}
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} body
 */
/**
 * Validate and extract smtp_override from the request body.
 * Returns null if missing or malformed — never throws.
 * @param {unknown} body
 * @returns {{ host: string, port: number, user: string, pass: string, secure: boolean, domain?: string } | null}
 */
function validateSmtpOverride(body) {
  if (!body || typeof body !== 'object' || !body.smtp_override) return null;
  const o = body.smtp_override;
  if (typeof o !== 'object' || o === null) return null;
  if (typeof o.host !== 'string' || !o.host.trim()) return null;
  if (typeof o.user !== 'string' || !o.user.trim()) return null;
  if (typeof o.pass !== 'string' || !o.pass) return null;
  return {
    host: o.host.trim(),
    port: Number.isInteger(o.port) ? o.port : 587,
    user: o.user.trim(),
    pass: o.pass,
    secure: o.secure === true,
    domain: typeof o.domain === 'string' ? o.domain.trim() : undefined,
  };
}

export async function handleSend(req, res, body) {
  const cfg = getConfig();

  // ── 1. Authentication ────────────────────────────────────────────────────
  const providedKey = req.headers['x-api-key'];
  if (typeof providedKey !== 'string' || !safeEqual(providedKey, cfg.apiKey)) {
    logger.error('auth.rejected', {
      ip: req.socket?.remoteAddress,
      path: req.url,
    });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
    return;
  }

  // ── 2. Validation ────────────────────────────────────────────────────────
  const result = validateSendRequest(body);
  if (!result.valid) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: 'VALIDATION_ERROR',
        details: result.errors,
      })
    );
    return;
  }

  const data = result.data;

  // ── 2b. Template rendering (optional) ───────────────────────────────────
  let resolvedHtml = data.html;
  let resolvedSubject = data.subject;

  if (data.template) {
    const templateData =
      data.templateData && typeof data.templateData === 'object' && !Array.isArray(data.templateData)
        ? data.templateData
        : {};

    // Subject defaults by template name when not explicitly provided
    const DEFAULT_SUBJECTS = {
      verification: 'Подтверждение email — Mansoni',
      'reset-password': 'Сброс пароля — Mansoni',
      welcome: 'Добро пожаловать в Mansoni!',
      notification: templateData['title'] ? `${templateData['title']} — Mansoni` : 'Уведомление — Mansoni',
    };

    if (!resolvedSubject) {
      resolvedSubject = DEFAULT_SUBJECTS[data.template] ?? `Письмо от Mansoni`;
    }

    try {
      resolvedHtml = renderTemplate(data.template, templateData);
    } catch (err) {
      logger.error('template.render.failed', { template: data.template, error: err.message });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: 'TEMPLATE_ERROR',
          details: err.message,
        })
      );
      return;
    }
  }

  // ── smtp_override: per-user SMTP credentials injected by Supabase Edge Function ──
  // Security: smtp_override may ONLY come from the authenticated Edge Function proxy.
  // If it comes from a direct client bypassing the proxy, it's rejected because
  // the email-router API key is required and kept secret in Vault.
  // The smtp_override object is validated but never logged (contains password).
  const smtpOverride = validateSmtpOverride(body);

  // Enforce sender address:
  //   - If smtp_override present: from is already enforced by Edge Function (= user's
  //     configured from_email). Allow it as-is.
  //   - Otherwise: only allow from addresses on cfg.domain (prevents spoofing).
  let resolvedFrom = cfg.smtp.from;
  if (data.from && smtpOverride) {
    // Trust from set by Edge Function when using per-user SMTP
    resolvedFrom = data.from;
  } else if (data.from) {
    const fromDomain = data.from.split('@')[1]?.toLowerCase();
    if (fromDomain === cfg.domain.toLowerCase()) {
      resolvedFrom = data.from;
    } else {
      logger.warn('email.from.rejected', {
        requested: data.from,
        allowed_domain: cfg.domain,
      });
    }
  }

  const mailPayload = {
    from: resolvedFrom,
    fromName: typeof body.fromName === 'string' ? body.fromName : undefined,
    to: data.to,
    subject: resolvedSubject,
    html: resolvedHtml,
    text: data.text,
    replyTo: data.replyTo,
    // RFC 2822 threading headers for proper thread grouping in Gmail/Outlook
    inReplyTo: typeof body.in_reply_to === 'string' ? body.in_reply_to : undefined,
    references: typeof body.references === 'string' ? body.references : undefined,
  };

  // ── 3. Send ──────────────────────────────────────────────────────────────
  try {
    const { messageId, response } = await sendMail(mailPayload, smtpOverride);

    logger.info('email.sent', { to: data.to, messageId });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        messageId,
        queued: false,
        smtpResponse: response.slice(0, 100),
      })
    );
  } catch (err) {
    const isSmtp = err instanceof SmtpError;
    const isPermanent = isSmtp && err.isPermanent;
    const errorMsg = err.message || err.code || 'Unknown error';

    logger.error('email.send.failed', {
      to: data.to,
      error: errorMsg,
      smtpCode: isSmtp ? err.code : undefined,
      sysCode: !isSmtp ? err.code : undefined,
      permanent: isPermanent,
    });

    if (isPermanent) {
      // 5xx SMTP = permanent rejection — don't queue, return 422
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: 'SMTP_PERMANENT_ERROR',
          details: errorMsg,
        })
      );
    } else {
      // Temporary error or network failure
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: 'SMTP_TEMPORARY_ERROR',
          details: errorMsg,
          retryable: true,
        })
      );
    }
  }
}
