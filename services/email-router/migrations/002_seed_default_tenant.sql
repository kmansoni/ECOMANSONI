-- =============================================================================
-- Migration 002: Seed Default Tenant and Welcome Template
-- =============================================================================
-- Service: @mansoni/email-router
-- Created: 2026-03-09
-- Description: Inserts default tenant limits and a "welcome" email template.
--
-- This migration is idempotent (uses ON CONFLICT DO NOTHING).
-- Safe to re-run without data duplication.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Default tenant limits
-- ---------------------------------------------------------------------------
-- The "zero UUID" tenant is the system default / fallback tenant.
-- Used for platform-level emails (password reset, verification, etc.)
-- when no specific tenant context exists.

INSERT INTO tenant_limits (
    id,
    tenant_id,
    max_per_minute,
    max_per_hour,
    max_per_day,
    max_attachment_size_mb,
    max_recipients_per_message,
    allowed_from_domains,
    is_active
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    120,        -- 120/min — elevated for system emails
    5000,       -- 5000/hr — password resets, verifications
    50000,      -- 50000/day
    10,         -- 10 MB max attachment
    50,         -- 50 recipients per message
    '["mansoni.ru"]'::jsonb,  -- Only allow sending from mansoni.ru
    true
) ON CONFLICT (tenant_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Welcome email template (MJML)
-- ---------------------------------------------------------------------------
-- Template slug: "welcome"
-- Used when a new user registers on the platform.
-- Variables: {{ userName }}, {{ verificationUrl }}, {{ platformName }}

INSERT INTO templates (
    id,
    tenant_id,
    slug,
    name,
    description,
    subject_template,
    body_mjml,
    body_html,
    body_text,
    variables,
    locale,
    version,
    is_active
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'welcome',
    'Welcome Email',
    'Sent to new users upon registration. Contains verification link.',
    'Добро пожаловать в {{ platformName }}, {{ userName }}!',

    -- MJML source (compiled to HTML below)
    '<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="16px" line-height="1.6" color="#333333" />
    </mj-attributes>
    <mj-style>
      .cta-button a {
        background-color: #4F46E5 !important;
        color: #ffffff !important;
      }
    </mj-style>
  </mj-head>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" border-radius="8px" padding="32px 24px">
      <mj-column>
        <mj-image
          src="https://cdn.mansoni.ru/logo.png"
          alt="{{ platformName }}"
          width="120px"
          padding-bottom="24px"
        />
        <mj-text font-size="24px" font-weight="700" color="#111827">
          Добро пожаловать, {{ userName }}!
        </mj-text>
        <mj-text>
          Спасибо за регистрацию на платформе <strong>{{ platformName }}</strong>.
          Чтобы начать пользоваться всеми возможностями, подтвердите ваш email-адрес.
        </mj-text>
        <mj-button
          css-class="cta-button"
          href="{{ verificationUrl }}"
          background-color="#4F46E5"
          color="#ffffff"
          border-radius="6px"
          font-size="16px"
          font-weight="600"
          inner-padding="14px 32px"
        >
          Подтвердить email
        </mj-button>
        <mj-text font-size="13px" color="#6B7280" padding-top="24px">
          Если вы не регистрировались на {{ platformName }}, просто проигнорируйте это письмо.
          Ссылка действительна 24 часа.
        </mj-text>
        <mj-divider border-color="#E5E7EB" padding-top="24px" />
        <mj-text font-size="12px" color="#9CA3AF" align="center">
          © 2026 {{ platformName }}. Все права защищены.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>',

    -- body_html: Will be compiled from MJML at runtime on first use.
    -- Pre-compiled version left NULL; templateService.ts handles compilation + caching.
    NULL,

    -- body_text: Plain text fallback
    'Добро пожаловать, {{ userName }}!

Спасибо за регистрацию на платформе {{ platformName }}.

Подтвердите ваш email-адрес, перейдя по ссылке:
{{ verificationUrl }}

Если вы не регистрировались на {{ platformName }}, просто проигнорируйте это письмо.
Ссылка действительна 24 часа.

© 2026 {{ platformName }}. Все права защищены.',

    -- variables: JSON schema for template variables
    '[
      {"name": "userName",        "required": true,  "description": "Имя пользователя для приветствия"},
      {"name": "verificationUrl", "required": true,  "description": "URL для подтверждения email (с токеном)"},
      {"name": "platformName",    "required": false, "default": "Mansoni Platform", "description": "Название платформы"}
    ]'::jsonb,

    'ru',       -- locale
    1,          -- version
    true        -- is_active
) ON CONFLICT (tenant_id, slug, locale, version) DO NOTHING;

COMMIT;
