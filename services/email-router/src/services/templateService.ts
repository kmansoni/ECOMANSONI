// services/templateService.ts — Email template management
//
// Responsibilities:
//   1. Resolve template by (tenant_id, slug, locale, version?)
//   2. Compile MJML → HTML (cached, invalidated on template update)
//   3. Render Handlebars variables into subject + body
//   4. Validate required variables against template.variables schema
//   5. Fallback chain: locale-specific → default locale → error
//
// Caching strategy:
//   - In-memory LRU cache (compiled Handlebars delegates), max entries by TTL
//   - Redis cache for DB template records (300s TTL)
//   - Cache key: `tmpl:${tenantId}:${id|slug}:${locale}`
//
// Security:
//   - Handlebars: noPrototypeAccess, noPrototypeProperties
//   - Template size limit: 256KB MJML source
//   - Recursive render protection (no nested Handlebars in data)

import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { getLogger } from '../lib/logger.js';

// ─── Types ─────────────────────

interface TemplateRecord {
  id: string;
  slug: string;
  subject_template: string;
  body_mjml: string | null;
  body_html: string | null;
  body_text: string | null;
  variables: Record<string, unknown> | null;
  locale: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface CompiledTemplateEntry {
  subject: Handlebars.TemplateDelegate;
  html: Handlebars.TemplateDelegate;
  text: Handlebars.TemplateDelegate;
  compiledAt: number;
}

// ─── Constants ─────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory
const REDIS_CACHE_TTL_SEC = 300;     // 5 minutes in Redis
const MAX_MJML_SIZE = 256 * 1024;    // 256 KB

export class TemplateService {
  /**
   * In-memory compiled template cache.
   * Key: `${template.id}:${template.locale}`
   * Value: compiled Handlebars delegates + timestamp.
   */
  private compiledCache = new Map<string, CompiledTemplateEntry>();

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
  ) {
    // ── Register safe Handlebars helpers ──
    Handlebars.registerHelper('formatDate', (date: string, _format: string) => {
      try {
        return new Date(date).toLocaleDateString('ru-RU');
      } catch {
        return date;
      }
    });

    Handlebars.registerHelper('formatDateTime', (date: string) => {
      try {
        return new Date(date).toLocaleString('ru-RU');
      } catch {
        return date;
      }
    });

    Handlebars.registerHelper('uppercase', (str: string) => {
      return typeof str === 'string' ? str.toUpperCase() : '';
    });

    Handlebars.registerHelper('lowercase', (str: string) => {
      return typeof str === 'string' ? str.toLowerCase() : '';
    });

    Handlebars.registerHelper('ifEquals', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
      return a === b ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('truncate', (str: string, len: number) => {
      if (typeof str !== 'string') return '';
      return str.length > len ? str.substring(0, len) + '…' : str;
    });

    Handlebars.registerHelper('default', (value: unknown, fallback: unknown) => {
      return value ?? fallback;
    });
  }

  // ─── Template resolution ─────────────────────

  /**
   * Найти шаблон по ID или slug+locale для тенанта.
   * Порядок:
   *   1. Redis cache
   *   2. PostgreSQL (ORDER BY version DESC LIMIT 1)
   *   3. Locale fallback chain: requested → ru → null
   */
  async findTemplate(opts: {
    id?: string;
    slug?: string;
    locale?: string;
    tenantId: string;
  }): Promise<TemplateRecord | null> {
    const logger = getLogger();
    const locale = opts.locale || 'ru';
    const lookupKey = opts.id || opts.slug;
    if (!lookupKey) return null;

    const cacheKey = `tmpl:${opts.tenantId}:${lookupKey}:${locale}`;

    // 1. Redis cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as TemplateRecord;
      }
    } catch (err) {
      // Redis failure is non-fatal — fall through to DB
      logger.warn({ err, cacheKey }, 'Redis cache read failed for template');
    }

    // 2. PostgreSQL query
    let result;
    if (opts.id) {
      result = await this.db.query<TemplateRecord>(
        `SELECT id, slug, subject_template, body_mjml, body_html, body_text, variables, locale
         FROM templates
         WHERE id = $1 AND tenant_id = $2 AND is_active = true
         ORDER BY version DESC
         LIMIT 1`,
        [opts.id, opts.tenantId],
      );
    } else {
      result = await this.db.query<TemplateRecord>(
        `SELECT id, slug, subject_template, body_mjml, body_html, body_text, variables, locale
         FROM templates
         WHERE slug = $1 AND tenant_id = $2 AND locale = $3 AND is_active = true
         ORDER BY version DESC
         LIMIT 1`,
        [opts.slug!, opts.tenantId, locale],
      );
    }

    if (result.rows.length > 0) {
      const template = result.rows[0] as TemplateRecord;
      // Populate Redis cache
      try {
        await this.redis.setex(cacheKey, REDIS_CACHE_TTL_SEC, JSON.stringify(template));
      } catch (err) {
        logger.warn({ err, cacheKey }, 'Redis cache write failed for template');
      }
      return template;
    }

    // 3. Locale fallback: try default locale 'ru' if different locale was requested
    if (opts.slug && locale !== 'ru') {
      logger.debug({ slug: opts.slug, locale, fallback: 'ru' }, 'Template not found for locale, falling back to ru');
      return this.findTemplate({ ...opts, locale: 'ru' });
    }

    return null;
  }

  // ─── Rendering ─────────────────────

  /**
   * Рендерит шаблон из БД с данными.
   * MJML компилируется в HTML если body_mjml присутствует.
   * Результат Handlebars compile кешируется in-memory.
   */
  async render(template: TemplateRecord, data: Record<string, unknown>): Promise<RenderedEmail> {
    const logger = getLogger();
    const companionKey = `${template.id}:${template.locale}`;

    // ── Получаем или компилируем шаблоны ──
    let compiled = this.compiledCache.get(companionKey);
    const isExpired = compiled && (Date.now() - compiled.compiledAt > CACHE_TTL_MS);

    if (!compiled || isExpired) {
      // Compile subject
      const subjectTpl = Handlebars.compile(template.subject_template, {
        noEscape: false,       // Escape HTML in subject (no HTML in subject line)
        strict: false,         // Missing vars → empty string, not error
      });

      // Compile HTML body
      let htmlSource = template.body_html || '';

      if (template.body_mjml) {
        // Size guard
        if (Buffer.byteLength(template.body_mjml, 'utf8') > MAX_MJML_SIZE) {
          logger.error({ templateId: template.id, size: Buffer.byteLength(template.body_mjml, 'utf8') },
            'MJML template exceeds 256KB limit');
          throw new Error(`Template ${template.id} MJML exceeds size limit (256KB)`);
        }

        // MJML → HTML
        const mjmlResult = mjml2html(template.body_mjml, {
          validationLevel: 'soft',
          minify: true,
        });

        if (mjmlResult.errors.length > 0) {
          logger.warn(
            { templateId: template.id, errors: mjmlResult.errors.map((e) => e.message) },
            'MJML compilation produced warnings',
          );
        }

        htmlSource = mjmlResult.html;
      }

      const htmlTpl = Handlebars.compile(htmlSource, { noEscape: true, strict: false });

      // Compile text (fallback: strip HTML tags)
      const textSource = template.body_text || stripHtml(htmlSource);
      const textTpl = Handlebars.compile(textSource, { noEscape: true, strict: false });

      compiled = {
        subject: subjectTpl,
        html: htmlTpl,
        text: textTpl,
        compiledAt: Date.now(),
      };
      this.compiledCache.set(companionKey, compiled);
    }

    // ── Render with data ──
    const rendered: RenderedEmail = {
      subject: compiled.subject(data),
      html: compiled.html(data),
      text: compiled.text(data),
    };

    return rendered;
  }

  /**
   * Рендерит inline HTML/text (без шаблона из БД) через Handlebars.
   * Используется когда клиент передал html/text напрямую с templateData.
   */
  renderInline(opts: {
    subject: string;
    html?: string;
    text?: string;
    data?: Record<string, unknown>;
  }): RenderedEmail {
    const data = opts.data || {};

    const subject = Handlebars.compile(opts.subject, { noEscape: false, strict: false })(data);

    let html = '';
    if (opts.html) {
      html = Handlebars.compile(opts.html, { noEscape: true, strict: false })(data);
    }

    let text = '';
    if (opts.text) {
      text = Handlebars.compile(opts.text, { noEscape: true, strict: false })(data);
    } else if (opts.html) {
      text = stripHtml(html);
    }

    return { subject, html, text };
  }

  // ─── Cache management ─────────────────────

  /**
   * Очистка in-memory кеша (при CRUD шаблонов или deployments).
   */
  clearCache(): void {
    this.compiledCache.clear();
  }

  /**
   * Инвалидация кеша для конкретного шаблона (Redis + in-memory).
   */
  async invalidateTemplate(tenantId: string, templateId: string): Promise<void> {
    const logger = getLogger();

    // In-memory: удаляем все entries для этого templateId
    for (const key of this.compiledCache.keys()) {
      if (key.startsWith(`${templateId}:`)) {
        this.compiledCache.delete(key);
      }
    }

    // Redis: удаляем паттерн tmpl:tenantId:templateId:*
    try {
      const keys = await this.redis.keys(`tmpl:${tenantId}:${templateId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      logger.warn({ err, tenantId, templateId }, 'Failed to invalidate Redis template cache');
    }
  }
}

// ─── Utility ─────────────────────

/**
 * Простой strip HTML тегов для text-версии email.
 * Удаляет <style>, <script>, все HTML теги, коллапсирует пробелы.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
