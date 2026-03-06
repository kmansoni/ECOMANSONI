/**
 * templates/engine.js — Zero-dependency HTML template engine.
 *
 * Security model:
 *  - All variable values are HTML-escaped before interpolation to prevent
 *    XSS if an attacker controls templateData values (e.g. via compromised
 *    upstream caller).
 *  - Template names are validated against an allowlist (alphanumeric + dash)
 *    to prevent path traversal attacks (e.g. "../../../etc/passwd").
 *  - Templates are loaded once and cached in-process memory; no FS reads
 *    during hot path.
 *
 * @module templates/engine
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = __dirname;

/** In-process LRU-free cache: template name → raw HTML string */
const cache = new Map();

/** Allowlist: template names must match this pattern (no path traversal) */
const SAFE_NAME_RE = /^[a-z0-9][a-z0-9\-]{0,63}$/;

/**
 * HTML-escape a string value to prevent XSS via templateData.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize a URL value for insertion into href="" attributes.
 *
 * Security: rejects any value whose trimmed lowercase start matches an
 * exploitable scheme (javascript:, vbscript:, data:).
 * Falls back to '#' so the anchor element remains valid but inert.
 *
 * Values are also HTML-escaped after scheme validation so the result is
 * safe to embed directly inside a double-quoted HTML attribute.
 *
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeUrl(value) {
  const raw = String(value ?? '').trim();
  const lower = raw.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:')
  ) {
    return '#';
  }
  return escapeHtml(raw);
}

/**
 * Load a template from disk (or return from cache).
 *
 * @param {string} name  Template name without extension (e.g. "verification")
 * @returns {string}     Raw HTML template string
 * @throws {Error}       If name is invalid or file not found
 */
export function loadTemplate(name) {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(`TEMPLATE_INVALID_NAME: "${name}" contains unsafe characters`);
  }

  if (cache.has(name)) {
    return /** @type {string} */ (cache.get(name));
  }

  const filePath = path.join(TEMPLATES_DIR, `${name}.html`);

  // Verify resolved path stays inside TEMPLATES_DIR (defense-in-depth)
  const resolved = path.resolve(filePath);
  const base = path.resolve(TEMPLATES_DIR);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`TEMPLATE_PATH_TRAVERSAL: resolved path escapes templates directory`);
  }

  let html;
  try {
    html = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    throw new Error(`TEMPLATE_NOT_FOUND: template "${name}" does not exist`);
  }

  cache.set(name, html);
  return html;
}

/**
 * Render a template by substituting all `{{variable}}` occurrences.
 *
 * All values are HTML-escaped. Unknown variables are replaced with empty string.
 *
 * @param {string} name                     Template name
 * @param {Record<string, unknown>} variables  Key-value substitution map
 * @returns {string}  Rendered HTML
 */
export function renderTemplate(name, variables) {
  if (typeof variables !== 'object' || variables === null || Array.isArray(variables)) {
    throw new Error('TEMPLATE_RENDER_ERROR: variables must be a plain object');
  }

  const template = loadTemplate(name);

  // Replace {{url:varname}} — URL-safe substitution (rejects javascript:/vbscript:/data: schemes)
  let rendered = template.replace(/\{\{\s*url:([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? sanitizeUrl(variables[key])
      : '#';
  });

  // Replace {{varname}} — standard HTML-escaped substitution
  rendered = rendered.replace(/\{\{(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*)\}\}/g, (_match, key) => {
    const trimmed = key.trim();
    return Object.prototype.hasOwnProperty.call(variables, trimmed)
      ? escapeHtml(variables[trimmed])
      : '';
  });

  return rendered;
}

/**
 * List all available template names (scans directory, returns cached names + disk).
 *
 * @returns {string[]}
 */
export function listTemplates() {
  let files;
  try {
    files = fs.readdirSync(TEMPLATES_DIR);
  } catch {
    return [];
  }

  return files
    .filter(f => f.endsWith('.html'))
    .map(f => f.slice(0, -5))
    .filter(name => SAFE_NAME_RE.test(name));
}

/**
 * Clear the template cache (useful for hot-reload in development).
 */
export function clearTemplateCache() {
  cache.clear();
}
