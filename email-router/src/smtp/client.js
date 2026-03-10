/**
 * smtp/client.js — Raw SMTP client over net.Socket / tls.TLSSocket.
 *
 * No external dependencies. Full SMTP session:
 *   TCP connect → 220 banner → EHLO → STARTTLS (if needed) →
 *   EHLO (post-TLS) → AUTH PLAIN → MAIL FROM → RCPT TO → DATA → QUIT
 *
 * RFC 5321 compliant timeouts per section 4.5.3.2.
 * Thread-safe: each sendMail() call opens its own socket.
 *
 * Attack surface hardening:
 *  - All SMTP parameters are sanitized before insertion into protocol lines.
 *  - Header injection in subject / addresses is blocked via sanitizeSmtpParam().
 *  - Socket is always destroyed on error path to prevent fd leaks.
 */

import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

// ─── Timeouts (ms) ────────────────────────────────────────────────────────────
const T = {
  CONNECT: 30_000,
  BANNER: 300_000,
  EHLO: 300_000,
  STARTTLS: 30_000,
  AUTH: 300_000,
  MAIL_FROM: 300_000,
  RCPT_TO: 300_000,
  DATA_INIT: 120_000,
  DATA_BODY: 600_000,
  DATA_FINAL: 600_000,
  QUIT: 5_000,
};

// ─── Header injection guard ──────────────────────────────────────────────────
function sanitizeSmtpParam(value) {
  // Strip CR, LF, NUL characters — any of these could inject additional SMTP commands
  return String(value).replace(/[\r\n\0]/g, '');
}

// ─── RFC 2047 encoded-word for non-ASCII subjects ────────────────────────────
function encodeSubject(subject) {
  const raw = sanitizeSmtpParam(subject);
  // Always encode to avoid ASCII-subset confusion with UTF-8 subjects
  return `=?UTF-8?B?${Buffer.from(raw, 'utf8').toString('base64')}?=`;
}

// ─── MIME multipart/alternative message builder ───────────────────────────────
function buildMessage({ from, to, subject, html, text, replyTo, inReplyTo, references, messageId, domain }) {
  const boundary = `----=_Part_${crypto.randomBytes(12).toString('hex')}`;
  const date = new Date().toUTCString();
  const safeTo = sanitizeSmtpParam(to);
  const safeFrom = sanitizeSmtpParam(from);
  const safeReplyTo = replyTo ? sanitizeSmtpParam(replyTo) : null;
  const encodedSubject = encodeSubject(subject);

  const lines = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${encodedSubject}`,
    `Date: ${date}`,
    `Message-ID: <${messageId}>`,
    `MIME-Version: 1.0`,
    `X-Mailer: mansoni-email-router/1.0.0`,
  ];

  if (safeReplyTo) lines.push(`Reply-To: ${safeReplyTo}`);
  // RFC 2822 threading headers — critical for Gmail/Outlook to group replies correctly
  if (inReplyTo) lines.push(`In-Reply-To: <${sanitizeSmtpParam(inReplyTo)}>`);
  if (references) lines.push(`References: <${sanitizeSmtpParam(references)}>`);

  if (html && text) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(text, 'utf8').toString('base64'));
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html, 'utf8').toString('base64'));
    lines.push('');
    lines.push(`--${boundary}--`);
  } else {
    const body = html || text || '';
    const ct = html ? 'text/html' : 'text/plain';
    lines.push(`Content-Type: ${ct}; charset=UTF-8`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(body, 'utf8').toString('base64'));
  }

  // RFC 5321: DATA terminator — lone dot on a line. Dot-stuffing handled below.
  return lines.join('\r\n');
}

// ─── Dot-stuffing (RFC 5321 §4.5.2) ─────────────────────────────────────────
function dotStuff(message) {
  return message
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join('\r\n');
}

// ─── Low-level: read one SMTP response (may be multi-line) ───────────────────
function readResponse(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let timer;

    function onData(chunk) {
      buffer += chunk.toString('latin1');
      // Multi-line: last line has no dash after code, e.g. "250 OK\r\n"
      const lines = buffer.split('\r\n');
      for (const line of lines) {
        if (/^\d{3} /.test(line)) {
          clearTimeout(timer);
          socket.off('data', onData);
          socket.off('error', onError);
          resolve(buffer.trim());
          return;
        }
        // Still in multi-line response (code-dash)
      }
    }

    function onError(err) {
      clearTimeout(timer);
      socket.off('data', onData);
      reject(err);
    }

    timer = setTimeout(() => {
      socket.off('data', onData);
      socket.off('error', onError);
      reject(new Error(`SMTP timeout waiting for response (${timeoutMs}ms)`));
    }, timeoutMs);

    socket.on('data', onData);
    socket.once('error', onError);
  });
}

// ─── Send one SMTP command + receive response ─────────────────────────────────
async function command(socket, cmd, timeoutMs) {
  logger.debug('smtp.cmd.send', { cmd: cmd.startsWith('AUTH') ? 'AUTH PLAIN [redacted]' : cmd });
  socket.write(cmd + '\r\n');
  const resp = await readResponse(socket, timeoutMs);
  const code = parseInt(resp.slice(0, 3), 10);
  logger.debug('smtp.cmd.resp', { code, resp: resp.slice(0, 200) });
  return { code, resp };
}

// ─── Parse EHLO capabilities ─────────────────────────────────────────────────
function parseCapabilities(ehloResp) {
  const caps = new Set();
  for (const line of ehloResp.split('\r\n')) {
    const m = line.match(/^\d{3}[-\s](.+)/);
    if (m) caps.add(m[1].trim().toUpperCase());
  }
  return caps;
}

// ─── Main sendMail function ───────────────────────────────────────────────────

/**
 * @typedef {{ host: string, port: number, user: string, pass: string, secure: boolean, from?: string, domain?: string }} SmtpOverride
 *
 * @param {{ from: string, to: string, subject: string, html?: string, text?: string, replyTo?: string, inReplyTo?: string, references?: string, fromName?: string }} mail
 * @param {SmtpOverride|null} [smtpOverride]  — per-request SMTP credentials (user SMTP settings)
 * @returns {Promise<{ messageId: string, response: string }>}
 */
export async function sendMail(mail, smtpOverride = null) {
  const cfg = getConfig();

  // Per-request SMTP override — allows per-user Gmail/Yandex/Outlook credentials
  // Security: smtpOverride is injected ONLY from the Supabase Edge Function proxy
  // after decrypting from Vault. It never comes from the client directly.
  const smtpCfg = smtpOverride ? {
    host: sanitizeSmtpParam(smtpOverride.host),
    port: Number(smtpOverride.port) || 587,
    user: sanitizeSmtpParam(smtpOverride.user),
    pass: smtpOverride.pass, // NOT sanitized — password is opaque binary
    secure: smtpOverride.secure ?? false,
    from: smtpOverride.from ? sanitizeSmtpParam(smtpOverride.from) : null,
    domain: smtpOverride.domain ?? cfg.domain,
  } : {
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    user: cfg.smtp.user,
    pass: cfg.smtp.pass,
    secure: cfg.smtp.secure,
    from: cfg.smtp.from,
    domain: cfg.domain,
  };

  const { host, port, user, pass, secure } = smtpCfg;
  const messageDomain = smtpCfg.domain;

  const messageId = `er-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@${messageDomain}`;

  logger.info('smtp.session.start', { to: mail.to, messageId, host, port });

  // ── 1. TCP Connect ────────────────────────────────────────────────────────
  let socket = await new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port });
    s.setTimeout(T.CONNECT);
    s.once('connect', () => { s.setTimeout(0); resolve(s); });
    s.once('timeout', () => { s.destroy(); reject(new Error('TCP connect timeout')); });
    s.once('error', (err) => {
      const msg = err.message || `TCP connect failed: ${err.code || 'unknown'}`;
      if (!err.message) err.message = msg;
      reject(err);
    });
  });

  socket.setEncoding('utf8');

  try {
    // ── 2. 220 Banner ───────────────────────────────────────────────────────
    const banner = await readResponse(socket, T.BANNER);
    if (!banner.startsWith('220')) {
      throw new SmtpError(parseInt(banner.slice(0, 3), 10), `Unexpected banner: ${banner}`);
    }

    const hostname = `email-router.${messageDomain}`;

    // ── 3. EHLO ─────────────────────────────────────────────────────────────
    let { code, resp } = await command(socket, `EHLO ${hostname}`, T.EHLO);
    if (code !== 250) throw new SmtpError(code, resp);

    const caps = parseCapabilities(resp);

    // ── 4. STARTTLS (if server advertises and not already TLS) ──────────────
    if (!secure && caps.has('STARTTLS')) {
      const st = await command(socket, 'STARTTLS', T.STARTTLS);
      if (st.code !== 220) throw new SmtpError(st.code, st.resp);

      // Upgrade socket to TLS
      socket = await new Promise((resolve, reject) => {
        const tlsSocket = tls.connect({
          socket,
          host,
          servername: host,
          rejectUnauthorized: process.env.NODE_ENV === 'production',
        });
        tlsSocket.once('secureConnect', () => resolve(tlsSocket));
        tlsSocket.once('error', reject);
      });
      socket.setEncoding('utf8');

      // Re-EHLO after TLS upgrade (RFC 5321 §3.1)
      const ehlo2 = await command(socket, `EHLO ${hostname}`, T.EHLO);
      if (ehlo2.code !== 250) throw new SmtpError(ehlo2.code, ehlo2.resp);
    }

    // ── 5. AUTH PLAIN ────────────────────────────────────────────────────────
    if (user && pass) {
      // AUTH PLAIN: base64("\0username\0password")
      const credentials = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
      const auth = await command(socket, `AUTH PLAIN ${credentials}`, T.AUTH);
      if (auth.code !== 235) throw new SmtpError(auth.code, `AUTH failed: ${auth.resp}`);
    }

    // ── 6. MAIL FROM ─────────────────────────────────────────────────────────
    const from = sanitizeSmtpParam(mail.from || smtpCfg.from || cfg.smtp.from);
    // Build "From Name" header: "Display Name <email>" if fromName provided
    const fromHeader = mail.fromName
      ? `${sanitizeSmtpParam(mail.fromName)} <${from}>`
      : from;
    const mf = await command(socket, `MAIL FROM:<${from}>`, T.MAIL_FROM);
    if (mf.code !== 250) throw new SmtpError(mf.code, mf.resp);

    // ── 7. RCPT TO ───────────────────────────────────────────────────────────
    const to = sanitizeSmtpParam(mail.to);
    const rt = await command(socket, `RCPT TO:<${to}>`, T.RCPT_TO);
    if (rt.code !== 250) throw new SmtpError(rt.code, rt.resp);

    // ── 8. DATA ──────────────────────────────────────────────────────────────
    const di = await command(socket, 'DATA', T.DATA_INIT);
    if (di.code !== 354) throw new SmtpError(di.code, di.resp);

    const rawMessage = buildMessage({
      from: fromHeader,
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: mail.replyTo,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      messageId,
      domain: messageDomain,
    });

    const stuffed = dotStuff(rawMessage);

    // Write body + DATA terminator — split into chunks to avoid blocking event loop
    await new Promise((resolve, reject) => {
      socket.write(stuffed + '\r\n.\r\n', 'utf8', (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const df = await readResponse(socket, T.DATA_FINAL);
    const dfCode = parseInt(df.slice(0, 3), 10);
    if (dfCode !== 250) throw new SmtpError(dfCode, df);

    // ── 9. QUIT ──────────────────────────────────────────────────────────────
    await command(socket, 'QUIT', T.QUIT).catch(() => {/* ignore QUIT errors */});

    logger.info('smtp.session.ok', { messageId, to: mail.to, response: df.slice(0, 100) });

    return { messageId, response: df };

  } catch (err) {
    const errorMsg = err.message || err.code || 'Unknown SMTP error';
    logger.error('smtp.session.error', {
      to: mail.to,
      messageId,
      error: errorMsg,
      smtpCode: err instanceof SmtpError ? err.code : undefined,
      sysCode: err.code,
    });
    // Ensure the error has a meaningful message for upstream handlers
    if (!err.message && err.code) {
      err.message = `SMTP connection error: ${err.code}`;
    }
    throw err;
  } finally {
    socket.destroy();
  }
}

// ─── SmtpError ────────────────────────────────────────────────────────────────

export class SmtpError extends Error {
  /** @param {number} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'SmtpError';
    this.code = code;
    this.isPermanent = code >= 500 && code < 600;
    this.isTemporary = code >= 400 && code < 500;
  }
}

/**
 * Probe SMTP connectivity (for /health).
 * Opens TCP, waits for 220, then sends QUIT. Does NOT authenticate.
 * @returns {Promise<{ connected: boolean, lastError?: string, lastCheck: string }>}
 */
export async function probeSmtp() {
  const cfg = getConfig();
  const { host, port } = cfg.smtp;
  const lastCheck = new Date().toISOString();
  try {
    const socket = await new Promise((resolve, reject) => {
      const s = net.createConnection({ host, port });
      s.setTimeout(5_000);
      s.once('connect', () => { s.setTimeout(0); resolve(s); });
      s.once('timeout', () => { s.destroy(); reject(new Error('Probe TCP timeout')); });
      s.once('error', (err) => {
        if (!err.message) err.message = `Probe connect failed: ${err.code || 'unknown'}`;
        reject(err);
      });
    });
    socket.setEncoding('utf8');
    const banner = await readResponse(socket, 5_000);
    socket.destroy();
    return { connected: banner.startsWith('220'), lastCheck };
  } catch (err) {
    return { connected: false, lastError: err.message || err.code || 'Unknown error', lastCheck };
  }
}
