-- Migration: Таблицы ассетов — шаблоны, музыка, стикеры, пользовательские файлы

-- ─────────────────────────────────────────────
-- Шаблоны проектов
-- ─────────────────────────────────────────────
CREATE TABLE editor_templates (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT        NOT NULL,
    description   TEXT,
    category      TEXT        NOT NULL
                              CHECK (category IN (
                                  'trending','business','social','education',
                                  'lifestyle','music','gaming','holiday','custom'
                              )),
    thumbnail_url TEXT        NOT NULL,
    preview_url   TEXT,
    project_data  JSONB       NOT NULL, -- полный snapshot проекта (tracks + clips + effects)
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    aspect_ratio  TEXT        NOT NULL DEFAULT '9:16',
    duration_ms   BIGINT      NOT NULL,
    use_count     BIGINT      NOT NULL DEFAULT 0,
    is_premium    BOOLEAN     NOT NULL DEFAULT false,
    is_published  BOOLEAN     NOT NULL DEFAULT true,
    author_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE editor_templates ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE editor_templates IS 'Шаблоны проектов видеоредактора (готовые пресеты для пользователей)';
COMMENT ON COLUMN editor_templates.project_data IS 'Полный JSON-снимок проекта: треки, клипы, эффекты, кейфреймы';

-- ─────────────────────────────────────────────
-- Музыкальная библиотека
-- ─────────────────────────────────────────────
CREATE TABLE music_library (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT        NOT NULL,
    artist        TEXT        NOT NULL DEFAULT 'Unknown',
    album         TEXT,
    genre         TEXT        NOT NULL DEFAULT 'other'
                              CHECK (genre IN (
                                  'pop','rock','electronic','hip_hop','jazz',
                                  'classical','ambient','cinematic','lofi','other'
                              )),
    mood          TEXT        NOT NULL DEFAULT 'neutral'
                              CHECK (mood IN (
                                  'happy','sad','energetic','calm',
                                  'dramatic','romantic','dark','neutral'
                              )),
    bpm           INT         CHECK (bpm > 0 AND bpm < 300),
    duration_ms   BIGINT      NOT NULL,
    file_url      TEXT        NOT NULL,
    waveform_url  TEXT,
    preview_url   TEXT,
    cover_url     TEXT,
    license_type  TEXT        NOT NULL DEFAULT 'platform'
                              CHECK (license_type IN ('platform','creative_commons','royalty_free','user_uploaded')),
    is_premium    BOOLEAN     NOT NULL DEFAULT false,
    use_count     BIGINT      NOT NULL DEFAULT 0,
    -- Полнотекстовый поиск: генерируется триггером из title + artist + album
    search_vector tsvector,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE music_library ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE music_library IS 'Библиотека музыкальных треков для использования в проектах';
COMMENT ON COLUMN music_library.search_vector IS 'tsvector для полнотекстового поиска, генерируется триггером';

-- ─────────────────────────────────────────────
-- Стикерпаки
-- ─────────────────────────────────────────────
CREATE TABLE sticker_packs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT        NOT NULL,
    description  TEXT,
    cover_url    TEXT        NOT NULL,
    category     TEXT        NOT NULL
                             CHECK (category IN ('emoji','animated','text','seasonal','memes','custom')),
    is_premium   BOOLEAN     NOT NULL DEFAULT false,
    is_published BOOLEAN     NOT NULL DEFAULT true,
    item_count   INT         NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sticker_packs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sticker_packs IS 'Наборы стикеров (паки)';

-- ─────────────────────────────────────────────
-- Элементы стикерпаков
-- ─────────────────────────────────────────────
CREATE TABLE sticker_items (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id       UUID        NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    file_url      TEXT        NOT NULL,
    thumbnail_url TEXT,
    format        TEXT        NOT NULL
                              CHECK (format IN ('png','webp','gif','lottie','apng')),
    width         INT         NOT NULL,
    height        INT         NOT NULL,
    duration_ms   BIGINT,     -- только для анимированных стикеров
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    sort_order    INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sticker_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sticker_items IS 'Отдельные стикеры внутри пака';
COMMENT ON COLUMN sticker_items.duration_ms IS 'Длительность анимации (только для gif, lottie, apng)';

-- ─────────────────────────────────────────────
-- Пользовательские медиаассеты (загруженные файлы)
-- ─────────────────────────────────────────────
CREATE TABLE editor_assets (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id     UUID        REFERENCES editor_projects(id) ON DELETE SET NULL,
    type           TEXT        NOT NULL
                               CHECK (type IN ('video','audio','image','font')),
    name           TEXT        NOT NULL,
    file_url       TEXT        NOT NULL,
    thumbnail_url  TEXT,
    mime_type      TEXT        NOT NULL,
    file_size      BIGINT      NOT NULL, -- байты
    duration_ms    BIGINT,     -- для видео и аудио
    width          INT,        -- для видео и изображений, пиксели
    height         INT,        -- для видео и изображений, пиксели
    waveform_data  JSONB,      -- для аудио: массив значений амплитуды [{t, v}]
    metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE editor_assets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE editor_assets IS 'Медиафайлы, загруженные пользователем в редактор';
COMMENT ON COLUMN editor_assets.waveform_data IS 'Данные формы волны для отображения в аудио-дорожке';

-- End migration
