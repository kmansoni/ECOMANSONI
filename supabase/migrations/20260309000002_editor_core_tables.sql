-- Migration: Основные таблицы видеоредактора — проекты, дорожки, клипы

-- ─────────────────────────────────────────────
-- Таблица проектов видеоредактора
-- ─────────────────────────────────────────────
CREATE TABLE editor_projects (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title             TEXT        NOT NULL DEFAULT 'Untitled Project',
    description       TEXT,
    status            TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','rendering','rendered','published','archived')),
    aspect_ratio      TEXT        NOT NULL DEFAULT '9:16'
                                  CHECK (aspect_ratio IN ('9:16','16:9','1:1','4:5','21:9')),
    resolution_width  INT         NOT NULL DEFAULT 1080,
    resolution_height INT         NOT NULL DEFAULT 1920,
    fps               INT         NOT NULL DEFAULT 30
                                  CHECK (fps IN (24,25,30,50,60)),
    duration_ms       BIGINT      NOT NULL DEFAULT 0,
    settings          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    thumbnail_url     TEXT,
    output_url        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE editor_projects ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE editor_projects IS 'Проекты видеоредактора пользователей';
COMMENT ON COLUMN editor_projects.duration_ms IS 'Пересчитывается триггером на основе клипов (max start_ms + duration_ms)';
COMMENT ON COLUMN editor_projects.settings IS 'Произвольные настройки проекта: фоновый цвет, качество превью и др.';

-- ─────────────────────────────────────────────
-- Таблица дорожек (треков) таймлайна
-- ─────────────────────────────────────────────
CREATE TABLE editor_tracks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        NOT NULL REFERENCES editor_projects(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL
                            CHECK (type IN ('video','audio','text','sticker','effect')),
    name        TEXT        NOT NULL DEFAULT '',
    sort_order  INT         NOT NULL DEFAULT 0,
    is_locked   BOOLEAN     NOT NULL DEFAULT false,
    is_visible  BOOLEAN     NOT NULL DEFAULT true,
    volume      REAL        NOT NULL DEFAULT 1.0
                            CHECK (volume >= 0 AND volume <= 2.0),
    opacity     REAL        NOT NULL DEFAULT 1.0
                            CHECK (opacity >= 0 AND opacity <= 1.0),
    blend_mode  TEXT        NOT NULL DEFAULT 'normal'
                            CHECK (blend_mode IN ('normal','multiply','screen','overlay','darken','lighten')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE editor_tracks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE editor_tracks IS 'Дорожки таймлайна проекта';
COMMENT ON COLUMN editor_tracks.sort_order IS 'Порядок отображения дорожки в таймлайне (от 0, меньше — ниже)';

-- ─────────────────────────────────────────────
-- Таблица клипов на дорожках
-- ─────────────────────────────────────────────
CREATE TABLE editor_clips (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id         UUID        NOT NULL REFERENCES editor_tracks(id) ON DELETE CASCADE,
    project_id       UUID        NOT NULL REFERENCES editor_projects(id) ON DELETE CASCADE,
    type             TEXT        NOT NULL
                                 CHECK (type IN ('video','audio','image','text','sticker','transition','effect')),
    name             TEXT        NOT NULL DEFAULT '',
    start_ms         BIGINT      NOT NULL DEFAULT 0 CHECK (start_ms >= 0),
    duration_ms      BIGINT      NOT NULL CHECK (duration_ms > 0),
    -- Источник медиафайла
    source_url       TEXT,
    source_start_ms  BIGINT      DEFAULT 0,
    source_end_ms    BIGINT,
    -- Аудио/скорость
    volume           REAL        NOT NULL DEFAULT 1.0
                                 CHECK (volume >= 0 AND volume <= 2.0),
    speed            REAL        NOT NULL DEFAULT 1.0
                                 CHECK (speed > 0 AND speed <= 100.0),
    speed_ramp       JSONB,      -- [{time_ms, speed}] для плавного изменения скорости
    -- Трансформация (позиция, масштаб, поворот)
    transform        JSONB       NOT NULL DEFAULT '{"x":0,"y":0,"scale":1,"rotation":0,"anchor_x":0.5,"anchor_y":0.5}'::jsonb,
    crop             JSONB,      -- {top, right, bottom, left} в процентах [0..1]
    -- Фильтры и переходы
    filters          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    transition_in    JSONB,      -- {type, duration_ms, params}
    transition_out   JSONB,      -- {type, duration_ms, params}
    -- Текстовые клипы
    text_content     TEXT,
    text_style       JSONB,      -- {font, size, color, bg_color, alignment, line_height, letter_spacing, shadow, outline}
    -- Стикеры
    sticker_id       UUID,
    -- Метаданные
    sort_order       INT         NOT NULL DEFAULT 0,
    is_reversed      BOOLEAN     NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE editor_clips ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE editor_clips IS 'Клипы на дорожках таймлайна';
COMMENT ON COLUMN editor_clips.speed_ramp IS 'Массив точек speed ramp: [{time_ms: number, speed: number}]';
COMMENT ON COLUMN editor_clips.transform IS 'Трансформация клипа: x/y — смещение в единицах, scale — масштаб, rotation — градусы';
COMMENT ON COLUMN editor_clips.filters IS 'Массив фильтров: [{type: string, params: object}]';

-- End migration
