/**
 * templates.js — Routes for email templates
 *
 * Endpoints:
 * - GET /api/v1/templates - List available templates
 * - POST /api/v1/templates - Create a template
 * - GET /api/v1/templates/:name - Get template by name
 * - PUT /api/v1/templates/:name - Update template
 * - DELETE /api/v1/templates/:name - Delete template
 */

import { Router, json, createError } from '../router.js';
import { logger } from '../../../logger.js';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '../../../../templates');

/**
 * In-memory template store (for custom templates)
 * @type {Map<string, Object>}
 */
const customTemplates = new Map();

/**
 * Gets list of built-in templates from the templates directory
 * @returns {string[]}
 */
function getBuiltInTemplates() {
  try {
    if (!existsSync(TEMPLATES_DIR)) {
      return [];
    }
    return readdirSync(TEMPLATES_DIR)
      .filter((f) => f.endsWith('.html'))
      .map((f) => f.replace('.html', ''));
  } catch {
    return [];
  }
}

/**
 * Serializes template for response
 * @param {Object} template
 * @param {string} name
 * @returns {Object}
 */
function serializeTemplate(template, name) {
  return {
    name,
    subject: template.subject,
    html: template.html,
    text: template.text,
    isBuiltIn: template.isBuiltIn,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

/**
 * Creates the templates router
 * @returns {Router}
 */
export function createTemplatesRouter() {
  const router = new Router();

  // GET /api/v1/templates - List all templates
  router.get('/', async (req, res) => {
    logger.info('templates.list');

    const builtIn = getBuiltInTemplates();
    const custom = Array.from(customTemplates.keys());

    const templates = [
      ...builtIn.map((name) => ({
        name,
        isBuiltIn: true,
      })),
      ...custom.map((name) => ({
        name,
        isBuiltIn: false,
      })),
    ];

    json(res, { templates });
  });

  // POST /api/v1/templates - Create custom template
  router.post('/', async (req, res) => {
    const body = req.body ?? {};

    if (!body.name) {
      throw createError('Missing required field: name', 400);
    }

    const name = body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    if (!body.subject) {
      throw createError('Missing required field: subject', 400);
    }

    if (!body.html) {
      throw createError('Missing required field: html', 400);
    }

    // Check if template already exists
    if (customTemplates.has(name)) {
      throw createError('Template already exists. Use PUT to update.', 409);
    }

    const now = new Date().toISOString();
    const template = {
      subject: body.subject,
      html: body.html,
      text: body.text,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };

    customTemplates.set(name, template);

    logger.info('templates.create', { name });

    json(res, serializeTemplate(template, name), 201);
  });

  // GET /api/v1/templates/:name - Get template by name
  router.get('/:name', async (req, res) => {
    const { name } = req.params;

    logger.debug('templates.get', { name });

    // Check custom templates first
    if (customTemplates.has(name)) {
      json(res, serializeTemplate(customTemplates.get(name), name));
      return;
    }

    // Check built-in templates
    const builtInTemplates = getBuiltInTemplates();
    if (builtInTemplates.includes(name)) {
      // For built-in templates, we only return metadata
      json(res, {
        name,
        isBuiltIn: true,
        subject: `Template: ${name}`,
        note: 'Built-in templates are read-only',
      });
      return;
    }

    throw createError('Template not found', 404);
  });

  // PUT /api/v1/templates/:name - Update template
  router.put('/:name', async (req, res) => {
    const { name } = req.params;
    const body = req.body ?? {};

    logger.info('templates.update', { name });

    // Check if template exists
    if (!customTemplates.has(name)) {
      throw createError('Template not found', 404);
    }

    const existing = customTemplates.get(name);

    // Cannot update built-in templates
    if (existing.isBuiltIn) {
      throw createError('Cannot update built-in templates', 403);
    }

    const updated = {
      ...existing,
      subject: body.subject ?? existing.subject,
      html: body.html ?? existing.html,
      text: body.text ?? existing.text,
      updatedAt: new Date().toISOString(),
    };

    customTemplates.set(name, updated);

    json(res, serializeTemplate(updated, name));
  });

  // DELETE /api/v1/templates/:name - Delete template
  router.delete('/:name', async (req, res) => {
    const { name } = req.params;

    logger.info('templates.delete', { name });

    if (!customTemplates.has(name)) {
      throw createError('Template not found', 404);
    }

    const existing = customTemplates.get(name);

    // Cannot delete built-in templates
    if (existing.isBuiltIn) {
      throw createError('Cannot delete built-in templates', 403);
    }

    customTemplates.delete(name);

    json(res, { success: true, message: 'Template deleted' });
  });

  return router;
}
