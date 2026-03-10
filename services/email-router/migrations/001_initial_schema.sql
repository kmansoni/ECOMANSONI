-- =============================================================================
-- Migration 001: Initial Schema for Email Router
-- =============================================================================
-- Service: @mansoni/email-router
-- Created: 2026-03-09
-- Description: Creates all core tables, indexes, triggers, partitioning,
--              and utility functions for the email platform.
--
-- IMPORTANT: Run inside a transaction. Rollback is safe — no data mutations.
--
-- Tables created:
--   1. templates           — Email templates (MJML + Handlebars)
--   2. email_messages      — Core email message table
--   3. email_events        — Append-only event log (partitioned by month)
--   4. suppression_list    — Suppressed email addresses
--   5. tenant_limits       — Per-tenant rate & resource limits
--   6. smtp_identities     — SMTP sending identities (domain/DKIM)
--   7. retry_log           — Detailed retry attempt log
--
-- Conventions:
--   - All timestamps are TIMESTAMPTZ (UTC stored, TZ-aware)
--   - UUIDs via gen_random_uuid() (pg >= 13, no extension needed)
--   - JSONB for flexible structured data
--   - CHECK constraints for enum-like columns (no pg enums — easier migrations)
--   - Partial indexes where appropriate (reduce index size + write amplification)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Extensions (idempotent)
-- ---------------------------------------------------------------------------
-- gen_random_uuid() is built-in since PostgreSQL 13.
-- pgcrypto is NOT required unless targeting pg < 13.
-- We add pgcrypto defensively for encrypt/decrypt functions used on DKIM keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Utility: auto-update updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if the row actually changed (avoid write amplification on no-op updates)
    IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS
    'Trigger function: sets updated_at = NOW() only when row content changes. '
    'Prevents write amplification on idempotent UPDATE statements.';

-- ---------------------------------------------------------------------------
-- 2. Table: templates
-- ---------------------------------------------------------------------------
-- Created BEFORE email_messages because email_messages.template_id references it.
CREATE TABLE templates (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL,
    slug            VARCHAR(100)    NOT NULL,
    name            VARCHAR(255)    NOT NULL,
    description     TEXT,
    subject_template TEXT           NOT NULL,
    body_mjml       TEXT,
    body_html       TEXT,
    body_text       TEXT,
    variables       JSONB,          -- Schema: [{ name: string, required: boolean, default?: string }]
    locale          VARCHAR(10)     DEFAULT 'ru',
    version         INTEGER         DEFAULT 1,
    is_active       BOOLEAN         DEFAULT true,
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW(),

    -- A template is uniquely identified by tenant + slug + locale + version.
    -- This allows versioned templates per locale per tenant.
    CONSTRAINT uq_templates_tenant_slug_locale_version
        UNIQUE (tenant_id, slug, locale, version),

    -- Minimum constraints on content
    CONSTRAINT chk_templates_slug_format
        CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,98}[a-z0-9]$'),
    CONSTRAINT chk_templates_version_positive
        CHECK (version >= 1),
    CONSTRAINT chk_templates_locale_format
        CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

COMMENT ON TABLE templates IS
    'Email templates with MJML source, compiled HTML, plain text, and Handlebars variables. '
    'Versioned per (tenant, slug, locale) tuple. Only is_active=true templates are served.';

CREATE TRIGGER trg_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Table: email_messages
-- ---------------------------------------------------------------------------
CREATE TABLE email_messages (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL,
    idempotency_key     VARCHAR(255),
    from_email          VARCHAR(320)    NOT NULL,   -- RFC 5321: max 320 chars
    from_name           VARCHAR(255),
    to_emails           JSONB           NOT NULL,   -- Array of { email: string, name?: string }
    cc_emails           JSONB,                      -- Array of { email: string, name?: string }
    bcc_emails          JSONB,                      -- Array of { email: string, name?: string }
    subject             TEXT            NOT NULL,
    body_html           TEXT,
    body_text           TEXT,
    template_id         UUID            REFERENCES templates(id) ON DELETE SET NULL,
    template_data       JSONB,                      -- Variables passed to template renderer
    headers             JSONB,                      -- Custom MIME headers (e.g., List-Unsubscribe)
    attachments         JSONB,                      -- Array of { filename, content_type, size, storage_key }
    priority            SMALLINT        DEFAULT 3,  -- 1=critical, 2=high, 3=normal, 4=low, 5=bulk
    status              VARCHAR(20)     DEFAULT 'queued',
    smtp_message_id     VARCHAR(500),               -- Message-ID returned by SMTP server
    smtp_response       TEXT,                       -- Full SMTP server response string
    retry_count         SMALLINT        DEFAULT 0,
    max_retries         SMALLINT        DEFAULT 5,
    next_retry_at       TIMESTAMPTZ,
    metadata            JSONB,                      -- Arbitrary caller metadata (tags, campaign_id, etc.)
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW(),
    sent_at             TIMESTAMPTZ,

    -- Idempotency: one key per tenant. NULL keys are allowed (non-idempotent sends).
    CONSTRAINT uq_messages_tenant_idempotency
        UNIQUE (tenant_id, idempotency_key),

    -- Status must be one of the defined states
    CONSTRAINT chk_messages_status
        CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'bounced', 'failed', 'rejected')),

    -- Priority range
    CONSTRAINT chk_messages_priority
        CHECK (priority BETWEEN 1 AND 5),

    -- Retry sanity
    CONSTRAINT chk_messages_retry_count
        CHECK (retry_count >= 0 AND retry_count <= max_retries),
    CONSTRAINT chk_messages_max_retries
        CHECK (max_retries BETWEEN 0 AND 20),

    -- At least one recipient
    CONSTRAINT chk_messages_has_recipients
        CHECK (jsonb_array_length(to_emails) >= 1),

    -- Subject cannot be empty
    CONSTRAINT chk_messages_subject_not_empty
        CHECK (length(trim(subject)) > 0),

    -- From email basic format check
    CONSTRAINT chk_messages_from_email_format
        CHECK (from_email ~* '^[^@]+@[^@]+\.[^@]+$')
);

COMMENT ON TABLE email_messages IS
    'Core email message table. Each row represents a single email send attempt. '
    'Status transitions: queued → processing → sent → delivered (happy path). '
    'Failure paths: queued → processing → failed/bounced/rejected. '
    'Idempotency enforced via (tenant_id, idempotency_key) UNIQUE constraint.';

CREATE TRIGGER trg_email_messages_updated_at
    BEFORE UPDATE ON email_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Table: email_events (partitioned by month)
-- ---------------------------------------------------------------------------
-- Append-only event log. Never UPDATE or DELETE in normal operation.
-- Partitioned by created_at to enable efficient retention management
-- and fast range queries (e.g., "all events for March 2026").
CREATE TABLE email_events (
    id                  BIGSERIAL,
    message_id          UUID            NOT NULL,   -- FK enforced per-partition or via trigger
    event_type          VARCHAR(30)     NOT NULL,
    event_data          JSONB,                      -- Event-specific payload
    smtp_code           SMALLINT,                   -- SMTP status code (250, 451, 550, etc.)
    smtp_enhanced_code  VARCHAR(20),                -- Enhanced status code (e.g., "5.1.1")
    smtp_response       TEXT,                       -- Full SMTP response
    remote_ip           INET,                       -- Remote server IP (for deliverability analysis)
    user_agent          TEXT,                       -- For open/click tracking events
    created_at          TIMESTAMPTZ     DEFAULT NOW(),

    -- Event type must be one of the defined types
    CONSTRAINT chk_events_event_type
        CHECK (event_type IN (
            'queued', 'processing', 'sent', 'delivered',
            'opened', 'clicked', 'bounced', 'complained',
            'unsubscribed', 'failed', 'rejected', 'deferred'
        )),

    -- SMTP code range (informational: 2xx, temp fail: 4xx, perm fail: 5xx)
    CONSTRAINT chk_events_smtp_code
        CHECK (smtp_code IS NULL OR (smtp_code BETWEEN 200 AND 599))
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE email_events IS
    'Append-only event log for email lifecycle tracking. Partitioned by month on created_at. '
    'RETENTION POLICY: Events older than 90 days should be archived or deleted. '
    'Recommended cron: DELETE FROM email_events WHERE created_at < NOW() - INTERVAL ''90 days''; '
    'Or use pg_partman for automated partition management.';

-- NOTE on FK: Standard FKs cannot reference partitioned parent tables in all PG versions.
-- message_id integrity is enforced at the application layer + periodic consistency checks.
-- If PG >= 15, you can add FK on each partition individually.

-- Create partitions for current month and 3 months ahead.
-- In production, use pg_cron or external scheduler to create partitions monthly.

-- Helper function to create monthly partitions
CREATE OR REPLACE FUNCTION create_email_events_partition(
    p_year INTEGER,
    p_month INTEGER
) RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    partition_name := format('email_events_y%sm%s', p_year, lpad(p_month::text, 2, '0'));
    start_date := make_date(p_year, p_month, 1);
    end_date := start_date + INTERVAL '1 month';

    -- Idempotent: skip if partition already exists
    IF EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        RETURN format('Partition %s already exists, skipping', partition_name);
    END IF;

    EXECUTE format(
        'CREATE TABLE %I PARTITION OF email_events '
        'FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
    );

    -- Add primary key on partition (BIGSERIAL + created_at for partition pruning)
    EXECUTE format(
        'ALTER TABLE %I ADD PRIMARY KEY (id, created_at)',
        partition_name
    );

    -- Add index for message_id lookups within partition
    EXECUTE format(
        'CREATE INDEX %I ON %I (message_id)',
        'idx_' || partition_name || '_message_id',
        partition_name
    );

    -- Add index for event_type + created_at within partition
    EXECUTE format(
        'CREATE INDEX %I ON %I (event_type, created_at)',
        'idx_' || partition_name || '_type_created',
        partition_name
    );

    RETURN format('Created partition %s [%s, %s)', partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_email_events_partition(INTEGER, INTEGER) IS
    'Creates a monthly partition for email_events. Idempotent — skips if already exists. '
    'Call monthly via pg_cron: SELECT create_email_events_partition(EXTRACT(YEAR FROM NOW() + INTERVAL ''1 month'')::int, EXTRACT(MONTH FROM NOW() + INTERVAL ''1 month'')::int);';

-- Create partitions: current month + next 3 months
-- Using 2026-03 as base (migration creation date)
SELECT create_email_events_partition(2026, 3);
SELECT create_email_events_partition(2026, 4);
SELECT create_email_events_partition(2026, 5);
SELECT create_email_events_partition(2026, 6);

-- Default partition for any data outside defined ranges (safety net)
CREATE TABLE IF NOT EXISTS email_events_default PARTITION OF email_events DEFAULT;
ALTER TABLE email_events_default ADD PRIMARY KEY (id, created_at);

-- ---------------------------------------------------------------------------
-- 5. Table: suppression_list
-- ---------------------------------------------------------------------------
CREATE TABLE suppression_list (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL,
    email               VARCHAR(320)    NOT NULL,
    reason              VARCHAR(30)     NOT NULL,
    source_message_id   UUID            REFERENCES email_messages(id) ON DELETE SET NULL,
    expires_at          TIMESTAMPTZ,    -- NULL = permanent suppression
    created_at          TIMESTAMPTZ     DEFAULT NOW(),

    -- One suppression entry per email per tenant
    CONSTRAINT uq_suppression_tenant_email
        UNIQUE (tenant_id, email),

    -- Reason must be one of the defined types
    CONSTRAINT chk_suppression_reason
        CHECK (reason IN ('bounce_hard', 'complaint', 'unsubscribe', 'manual', 'spam_trap')),

    -- Basic email format
    CONSTRAINT chk_suppression_email_format
        CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

COMMENT ON TABLE suppression_list IS
    'Per-tenant suppression list. Emails here will be rejected before SMTP attempt. '
    'Hard bounces and complaints create permanent suppressions (expires_at = NULL). '
    'Soft bounces create temporary suppressions (expires_at = bounce_time + 72h). '
    'GDPR note: email can be hashed for anonymization while maintaining suppression.';

-- ---------------------------------------------------------------------------
-- 6. Table: tenant_limits
-- ---------------------------------------------------------------------------
CREATE TABLE tenant_limits (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID            NOT NULL UNIQUE,
    max_per_minute              INTEGER         DEFAULT 60,
    max_per_hour                INTEGER         DEFAULT 1000,
    max_per_day                 INTEGER         DEFAULT 10000,
    max_attachment_size_mb      INTEGER         DEFAULT 10,
    max_recipients_per_message  INTEGER         DEFAULT 50,
    allowed_from_domains        JSONB,          -- Array of allowed sender domains, NULL = any
    is_active                   BOOLEAN         DEFAULT true,
    created_at                  TIMESTAMPTZ     DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     DEFAULT NOW(),

    -- Sanity checks on limits
    CONSTRAINT chk_limits_per_minute
        CHECK (max_per_minute > 0 AND max_per_minute <= 10000),
    CONSTRAINT chk_limits_per_hour
        CHECK (max_per_hour > 0 AND max_per_hour <= 100000),
    CONSTRAINT chk_limits_per_day
        CHECK (max_per_day > 0 AND max_per_day <= 1000000),
    CONSTRAINT chk_limits_attachment_size
        CHECK (max_attachment_size_mb > 0 AND max_attachment_size_mb <= 100),
    CONSTRAINT chk_limits_recipients
        CHECK (max_recipients_per_message > 0 AND max_recipients_per_message <= 1000),

    -- Hierarchical consistency: minute <= hour <= day
    CONSTRAINT chk_limits_hierarchy
        CHECK (max_per_minute <= max_per_hour AND max_per_hour <= max_per_day)
);

COMMENT ON TABLE tenant_limits IS
    'Per-tenant sending limits and resource constraints. '
    'Cached in Redis with 60s TTL for fast rate-limit checks. '
    'is_active=false suspends all sending for the tenant.';

CREATE TRIGGER trg_tenant_limits_updated_at
    BEFORE UPDATE ON tenant_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. Table: smtp_identities
-- ---------------------------------------------------------------------------
CREATE TABLE smtp_identities (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID            NOT NULL,
    domain              VARCHAR(255)    NOT NULL,
    from_email          VARCHAR(320)    NOT NULL,
    from_name           VARCHAR(255),
    dkim_selector       VARCHAR(63),                -- e.g., "s1", "mail2026"
    dkim_private_key    TEXT,                       -- AES-256-GCM encrypted (EMAIL_ENCRYPTION_KEY)
    spf_verified        BOOLEAN         DEFAULT false,
    dkim_verified       BOOLEAN         DEFAULT false,
    dmarc_verified      BOOLEAN         DEFAULT false,
    is_default          BOOLEAN         DEFAULT false,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW(),

    -- One from_email per tenant
    CONSTRAINT uq_smtp_identity_tenant_email
        UNIQUE (tenant_id, from_email),

    -- Domain format (basic check)
    CONSTRAINT chk_smtp_identity_domain
        CHECK (domain ~* '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),

    -- Email format
    CONSTRAINT chk_smtp_identity_email_format
        CHECK (from_email ~* '^[^@]+@[^@]+\.[^@]+$'),

    -- DKIM selector format (if set)
    CONSTRAINT chk_smtp_identity_dkim_selector
        CHECK (dkim_selector IS NULL OR dkim_selector ~ '^[a-zA-Z0-9_-]{1,63}$')
);

COMMENT ON TABLE smtp_identities IS
    'SMTP sending identities per tenant. Stores DKIM keys (encrypted at rest), '
    'SPF/DKIM/DMARC verification status, and default sender configuration. '
    'dkim_private_key is encrypted with AES-256-GCM using EMAIL_ENCRYPTION_KEY. '
    'Only one identity per tenant can have is_default=true (enforced at app layer).';

CREATE TRIGGER trg_smtp_identities_updated_at
    BEFORE UPDATE ON smtp_identities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8. Table: retry_log
-- ---------------------------------------------------------------------------
CREATE TABLE retry_log (
    id                  BIGSERIAL       PRIMARY KEY,
    message_id          UUID            NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
    attempt_number      SMALLINT        NOT NULL,
    smtp_code           SMALLINT,
    smtp_response       TEXT,
    next_retry_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),

    -- Attempt number must be positive
    CONSTRAINT chk_retry_log_attempt
        CHECK (attempt_number > 0 AND attempt_number <= 20),

    -- SMTP code range
    CONSTRAINT chk_retry_log_smtp_code
        CHECK (smtp_code IS NULL OR (smtp_code BETWEEN 200 AND 599))
);

COMMENT ON TABLE retry_log IS
    'Detailed log of every retry attempt for email delivery. '
    'One row per attempt, linked to email_messages via message_id. '
    'Used for debugging delivery issues and retry pattern analysis.';

-- =============================================================================
-- INDEXES
-- =============================================================================
-- Naming convention: idx_{table}_{columns}
-- Partial indexes used where applicable to reduce index size and write amplification.

-- email_messages indexes
CREATE INDEX idx_messages_tenant_status
    ON email_messages (tenant_id, status);

CREATE INDEX idx_messages_status_next_retry
    ON email_messages (status, next_retry_at)
    WHERE status IN ('queued', 'processing');
    -- Partial: only index rows that are candidates for processing/retry.
    -- This is the primary index used by the BullMQ worker to find work.

CREATE INDEX idx_messages_idempotency
    ON email_messages (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
    -- Partial: skip rows without idempotency keys (majority of rows).
    -- Lookups are (tenant_id, idempotency_key) exact match.

CREATE INDEX idx_messages_created_at
    ON email_messages (created_at);
    -- Used for time-range queries, retention cleanup, and dashboard metrics.

CREATE INDEX idx_messages_smtp_message_id
    ON email_messages (smtp_message_id)
    WHERE smtp_message_id IS NOT NULL;
    -- Partial: only sent messages have smtp_message_id.
    -- Used to correlate bounce DSNs back to the original message.

-- email_events indexes (on partitioned table — applied to each partition)
-- Note: Per-partition indexes are created in create_email_events_partition().
-- Global indexes below serve as documentation; PG applies them to new partitions.
CREATE INDEX idx_events_message_id
    ON email_events (message_id);

CREATE INDEX idx_events_type_created
    ON email_events (event_type, created_at);

-- suppression_list indexes
CREATE INDEX idx_suppression_tenant_email
    ON suppression_list (tenant_id, email);
    -- Primary lookup path: "is this email suppressed for this tenant?"

CREATE INDEX idx_suppression_expires
    ON suppression_list (expires_at)
    WHERE expires_at IS NOT NULL;
    -- Partial: only temporary suppressions have expires_at.
    -- Used by cleanup job to remove expired suppressions.

-- templates indexes
CREATE INDEX idx_templates_tenant_slug
    ON templates (tenant_id, slug, locale);
    -- Primary lookup: resolve template by tenant + slug + locale.

-- retry_log indexes
CREATE INDEX idx_retry_log_message
    ON retry_log (message_id);
    -- Lookup all retry attempts for a given message.

-- =============================================================================
-- RETENTION POLICY RECOMMENDATIONS
-- =============================================================================
-- These are NOT automatically enforced. Set up a cron job or pg_cron.
--
-- 1. email_events: DROP old partitions after 90 days
--    Monthly cron:
--      SELECT drop_email_events_partition(
--          EXTRACT(YEAR FROM NOW() - INTERVAL '90 days')::int,
--          EXTRACT(MONTH FROM NOW() - INTERVAL '90 days')::int
--      );
--
-- 2. retry_log: DELETE entries older than 30 days
--    Daily cron:
--      DELETE FROM retry_log WHERE created_at < NOW() - INTERVAL '30 days';
--
-- 3. email_messages: Archive (move to cold storage) after 180 days
--    Weekly cron:
--      INSERT INTO email_messages_archive SELECT * FROM email_messages
--          WHERE created_at < NOW() - INTERVAL '180 days' AND status IN ('sent','delivered','bounced','failed');
--      DELETE FROM email_messages
--          WHERE created_at < NOW() - INTERVAL '180 days' AND status IN ('sent','delivered','bounced','failed');
--
-- 4. suppression_list: Clean expired entries daily
--    Daily cron:
--      DELETE FROM suppression_list WHERE expires_at IS NOT NULL AND expires_at < NOW();
--
-- 5. Create next month's email_events partition
--    Monthly cron (1st of each month):
--      SELECT create_email_events_partition(
--          EXTRACT(YEAR FROM NOW() + INTERVAL '3 months')::int,
--          EXTRACT(MONTH FROM NOW() + INTERVAL '3 months')::int
--      );

-- Helper function to drop old partitions (for retention)
CREATE OR REPLACE FUNCTION drop_email_events_partition(
    p_year INTEGER,
    p_month INTEGER
) RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
BEGIN
    partition_name := format('email_events_y%sm%s', p_year, lpad(p_month::text, 2, '0'));

    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        RETURN format('Partition %s does not exist, nothing to drop', partition_name);
    END IF;

    -- DETACH first (allows concurrent queries to finish), then DROP
    EXECUTE format(
        'ALTER TABLE email_events DETACH PARTITION %I CONCURRENTLY',
        partition_name
    );

    EXECUTE format('DROP TABLE %I', partition_name);

    RETURN format('Dropped partition %s', partition_name);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION drop_email_events_partition(INTEGER, INTEGER) IS
    'Drops a monthly email_events partition. Uses DETACH CONCURRENTLY first '
    'to avoid locking active queries. Idempotent — no-op if partition missing.';

COMMIT;
