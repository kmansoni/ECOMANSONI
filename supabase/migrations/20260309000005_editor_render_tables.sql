-- Migration: Таблицы очереди рендеринга и логов

-- ─────────────────────────────────────────────
-- Задания рендеринга (очередь)
-- ─────────────────────────────────────────────
CREATE TABLE render_jobs (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID        NOT NULL REFERENCES editor_projects(id) ON DELETE CASCADE,
    user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status               TEXT        NOT NULL DEFAULT 'queued'
                                     CHECK (status IN (
                                         'queued','processing','compositing',
                                         'encoding','uploading','completed',
                                         'failed','cancelled'
                                     )),
    -- Приоритет: 1 (низший) .. 10 (высший), дефолт 5
    priority             INT         NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    progress             REAL        NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    -- Параметры выходного файла
    output_format        TEXT        NOT NULL DEFAULT 'mp4'
                                     CHECK (output_format IN ('mp4','webm','mov','gif')),
    output_codec         TEXT        NOT NULL DEFAULT 'h264'
                                     CHECK (output_codec IN ('h264','h265','vp9','av1')),
    output_resolution    TEXT        NOT NULL DEFAULT '1080x1920',
    output_fps           INT         NOT NULL DEFAULT 30,
    output_bitrate       TEXT        NOT NULL DEFAULT '8M',
    -- Результат
    output_url           TEXT,
    output_size          BIGINT,     -- размер результирующего файла в байтах
    error_message        TEXT,
    -- Оркестрация воркеров
    worker_id            TEXT,       -- идентификатор воркера (pod name / worker uuid)
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    estimated_duration_s INT,        -- ETA в секундах
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE render_jobs IS 'Очередь заданий рендеринга видеопроектов';
COMMENT ON COLUMN render_jobs.priority IS '1 — низший приоритет, 10 — наивысший (для premium-пользователей)';
COMMENT ON COLUMN render_jobs.worker_id IS 'Идентификатор воркера, захватившего задание (для at-most-once processing)';

-- ─────────────────────────────────────────────
-- Логи рендеринга (append-only, BIGSERIAL)
-- ─────────────────────────────────────────────
CREATE TABLE render_job_logs (
    id         BIGSERIAL   PRIMARY KEY,
    job_id     UUID        NOT NULL REFERENCES render_jobs(id) ON DELETE CASCADE,
    level      TEXT        NOT NULL DEFAULT 'info'
                           CHECK (level IN ('debug','info','warn','error')),
    message    TEXT        NOT NULL,
    metadata   JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE render_job_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE render_job_logs IS 'Структурированные логи процесса рендеринга (append-only)';
COMMENT ON COLUMN render_job_logs.metadata IS 'Доп. контекст: {stage, frame, percent, ffmpeg_output, ...}';

-- End migration
