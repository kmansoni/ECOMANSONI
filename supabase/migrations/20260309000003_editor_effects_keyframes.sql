-- Migration: Эффекты и кейфреймная анимация для клипов видеоредактора

-- ─────────────────────────────────────────────
-- Таблица эффектов (привязаны к клипу)
-- ─────────────────────────────────────────────
CREATE TABLE editor_effects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id     UUID        NOT NULL REFERENCES editor_clips(id) ON DELETE CASCADE,
    project_id  UUID        NOT NULL REFERENCES editor_projects(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL
                            CHECK (type IN (
                                'filter','color_adjust','blur','chroma_key',
                                'voice_effect','noise_reduce','speed_ramp',
                                'stabilize','ai_enhance'
                            )),
    params      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    enabled     BOOLEAN     NOT NULL DEFAULT true,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE editor_effects ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE editor_effects IS 'Эффекты, применённые к клипу (фильтр, цветокоррекция, chroma key и др.)';
COMMENT ON COLUMN editor_effects.sort_order IS 'Порядок применения эффектов (pipeline order)';
COMMENT ON COLUMN editor_effects.params IS 'Параметры эффекта специфичны для type: {brightness, contrast, saturation, hue, ...}';

-- ─────────────────────────────────────────────
-- Таблица кейфреймов анимации
-- ─────────────────────────────────────────────
CREATE TABLE editor_keyframes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id         UUID        NOT NULL REFERENCES editor_clips(id) ON DELETE CASCADE,
    project_id      UUID        NOT NULL REFERENCES editor_projects(id) ON DELETE CASCADE,
    -- Имя свойства: 'transform.x', 'transform.scale', 'opacity', 'volume', 'filter.brightness' и др.
    property        TEXT        NOT NULL,
    time_ms         BIGINT      NOT NULL CHECK (time_ms >= 0),
    value           REAL        NOT NULL,
    easing          TEXT        NOT NULL DEFAULT 'linear'
                                CHECK (easing IN ('linear','ease_in','ease_out','ease_in_out','bezier')),
    bezier_points   JSONB,      -- [x1, y1, x2, y2] для cubic bezier easing
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Уникальность: на одном клипе, для одного свойства, в одной точке времени — один кейфрейм
    CONSTRAINT editor_keyframes_clip_property_time_unique UNIQUE (clip_id, property, time_ms)
);

ALTER TABLE editor_keyframes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE editor_keyframes IS 'Кейфреймы покадровой анимации свойств клипов';
COMMENT ON COLUMN editor_keyframes.property IS
    'Путь к анимируемому свойству: transform.x, transform.y, transform.scale, transform.rotation, opacity, volume, filter.brightness, filter.contrast, ...';
COMMENT ON COLUMN editor_keyframes.bezier_points IS 'Контрольные точки cubic bezier: [x1, y1, x2, y2], все в диапазоне [0..1]';

-- End migration
