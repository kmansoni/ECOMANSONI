/**
 * validation.js — Input validation for POST /send.
 *
 * Zero dependencies. All validation is explicit and deterministic.
 *
 * Security considerations:
 *  - RFC 5321 §4.5.3.1 limits Subject to 998 chars (including CRLF header fold).
 *  - Email regex is conservative (rejects edge cases) — better to reject valid
 *    than to accept injection vectors.
 *  - No eval, no dynamic schema compilation.
 */

// RFC 5322-inspired conservative email validator.
// Accepts: local@domain.tld, user+tag@sub.domain.tld
// Rejects: IP literals, quoted local parts, comments.
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

const MAX_SUBJECT_LENGTH = 998;
const MAX_TO_LENGTH = 320; // RFC 5321: 64 local + 1 @ + 255 domain

/** Safe template name: alphanumeric + dash, no path traversal */
const SAFE_TEMPLATE_NAME_RE = /^[a-z0-9][a-z0-9\-]{0,63}$/;

/**
 * Validate a POST /send request body.
 *
 * @param {unknown} body
 * @returns {{ valid: true, data: SendData } | { valid: false, errors: ValidationError[] }}
 */
export function validateSendRequest(body) {
  const errors = [];

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const b = /** @type {Record<string, unknown>} */ (body);

  // ── to ───────────────────────────────────────────────────────────────────
  if (!b.to) {
    errors.push({ field: 'to', message: 'Field "to" is required' });
  } else if (typeof b.to !== 'string') {
    errors.push({ field: 'to', message: 'Field "to" must be a string' });
  } else if (b.to.length > MAX_TO_LENGTH) {
    errors.push({ field: 'to', message: `Field "to" exceeds max length ${MAX_TO_LENGTH}` });
  } else if (!EMAIL_RE.test(b.to.trim())) {
    errors.push({ field: 'to', message: 'Invalid email format' });
  }

  // ── template (optional) ──────────────────────────────────────────────────
  const hasTemplate = typeof b.template === 'string' && b.template.trim().length > 0;
  if (b.template !== undefined) {
    if (typeof b.template !== 'string') {
      errors.push({ field: 'template', message: 'Field "template" must be a string' });
    } else if (!SAFE_TEMPLATE_NAME_RE.test(b.template.trim())) {
      errors.push({ field: 'template', message: 'Field "template" contains invalid characters' });
    }
  }

  // ── templateData (optional, only valid with template) ────────────────────
  if (b.templateData !== undefined) {
    if (typeof b.templateData !== 'object' || b.templateData === null || Array.isArray(b.templateData)) {
      errors.push({ field: 'templateData', message: 'Field "templateData" must be a plain object' });
    }
  }

  // ── subject (required unless template is provided) ───────────────────────
  if (!hasTemplate) {
    if (!b.subject) {
      errors.push({ field: 'subject', message: 'Field "subject" is required (or provide "template")' });
    } else if (typeof b.subject !== 'string') {
      errors.push({ field: 'subject', message: 'Field "subject" must be a string' });
    } else if (b.subject.length > MAX_SUBJECT_LENGTH) {
      errors.push({
        field: 'subject',
        message: `Field "subject" exceeds RFC 5321 max length ${MAX_SUBJECT_LENGTH}`,
      });
    } else if (b.subject.trim().length === 0) {
      errors.push({ field: 'subject', message: 'Field "subject" cannot be blank' });
    }
  } else if (b.subject !== undefined) {
    // Subject provided alongside template — still validate it if present
    if (typeof b.subject !== 'string') {
      errors.push({ field: 'subject', message: 'Field "subject" must be a string' });
    } else if (b.subject.length > MAX_SUBJECT_LENGTH) {
      errors.push({
        field: 'subject',
        message: `Field "subject" exceeds RFC 5321 max length ${MAX_SUBJECT_LENGTH}`,
      });
    }
  }

  // ── html / text (at least one required unless template is provided) ──────
  const hasHtml = typeof b.html === 'string' && b.html.trim().length > 0;
  const hasText = typeof b.text === 'string' && b.text.trim().length > 0;

  if (!hasTemplate && !hasHtml && !hasText) {
    errors.push({
      field: 'html|text',
      message: 'At least one of "html", "text", or "template" fields is required',
    });
  }

  // ── from (optional, validated if present) ───────────────────────────────
  if (b.from !== undefined) {
    if (typeof b.from !== 'string') {
      errors.push({ field: 'from', message: 'Field "from" must be a string' });
    } else if (!EMAIL_RE.test(b.from.trim())) {
      errors.push({ field: 'from', message: 'Field "from" has invalid email format' });
    }
  }

  // ── replyTo (optional) ──────────────────────────────────────────────────
  if (b.replyTo !== undefined) {
    if (typeof b.replyTo !== 'string') {
      errors.push({ field: 'replyTo', message: 'Field "replyTo" must be a string' });
    } else if (!EMAIL_RE.test(b.replyTo.trim())) {
      errors.push({ field: 'replyTo', message: 'Field "replyTo" has invalid email format' });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      to: /** @type {string} */ (b.to).trim(),
      subject: typeof b.subject === 'string' ? b.subject : undefined,
      html: hasHtml ? /** @type {string} */ (b.html) : undefined,
      text: hasText ? /** @type {string} */ (b.text) : undefined,
      from: typeof b.from === 'string' ? b.from.trim() : undefined,
      replyTo: typeof b.replyTo === 'string' ? b.replyTo.trim() : undefined,
      template: hasTemplate ? /** @type {string} */ (b.template).trim() : undefined,
      templateData: (b.templateData && typeof b.templateData === 'object' && !Array.isArray(b.templateData))
        ? /** @type {Record<string, unknown>} */ (b.templateData)
        : undefined,
    },
  };
}

/**
 * @typedef {{ to: string, subject?: string, html?: string, text?: string, from?: string, replyTo?: string, template?: string, templateData?: Record<string, unknown> }} SendData
 * @typedef {{ field: string, message: string }} ValidationError
 */
