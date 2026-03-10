-- Migration: Хранимые функции видеоредактора

-- ─────────────────────────────────────────────
-- Функция: пересчёт duration_ms проекта
-- Вызывается триггером при изменении editor_clips
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_project_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_project_id UUID;
    v_duration   BIGINT;
BEGIN
    -- Определяем project_id из изменённой строки
    IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
    ELSE
        v_project_id := NEW.project_id;
    END IF;

    -- Пересчёт: максимум (start_ms + duration_ms) по всем клипам проекта
    SELECT COALESCE(MAX(start_ms + duration_ms), 0)
    INTO v_duration
    FROM editor_clips
    WHERE project_id = v_project_id;

    UPDATE editor_projects
    SET duration_ms = v_duration,
        updated_at  = now()
    WHERE id = v_project_id;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_project_duration() IS
    'Триггерная функция: атомарно пересчитывает duration_ms проекта при изменении клипов';

-- ─────────────────────────────────────────────
-- Функция: обновление updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_updated_at_column() IS
    'Универсальный триггер: автоматически проставляет updated_at = now() при UPDATE';

-- ─────────────────────────────────────────────
-- Функция: атомарный инкремент счётчика использования шаблона
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_template_use_count(p_template_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Требуется аутентификация: счётчик инкрементируется только для
    -- авторизованных пользователей; анонимные вызовы игнорируются во избежание
    -- накрутки рейтингов.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '28000';
    END IF;

    UPDATE editor_templates
    SET use_count  = use_count + 1,
        updated_at = now()
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Шаблон % не найден', p_template_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION increment_template_use_count(UUID) IS
    'Атомарный инкремент use_count шаблона. Вызывать при создании проекта из шаблона.';

-- ─────────────────────────────────────────────
-- Функция: атомарный инкремент счётчика использования музыки
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_music_use_count(p_music_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Требуется аутентификация (аналогично increment_template_use_count).
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '28000';
    END IF;

    UPDATE music_library
    SET use_count = use_count + 1
    WHERE id = p_music_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Музыкальный трек % не найден', p_music_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION increment_music_use_count(UUID) IS
    'Атомарный инкремент use_count музыкального трека';

-- ─────────────────────────────────────────────
-- Функция: полнотекстовый поиск музыки
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_music(
    p_query  TEXT    DEFAULT NULL,
    p_genre  TEXT    DEFAULT NULL,
    p_mood   TEXT    DEFAULT NULL,
    p_limit  INT     DEFAULT 20,
    p_offset INT     DEFAULT 0
)
RETURNS TABLE (
    id           UUID,
    title        TEXT,
    artist       TEXT,
    album        TEXT,
    genre        TEXT,
    mood         TEXT,
    bpm          INT,
    duration_ms  BIGINT,
    file_url     TEXT,
    waveform_url TEXT,
    preview_url  TEXT,
    cover_url    TEXT,
    license_type TEXT,
    is_premium   BOOLEAN,
    use_count    BIGINT,
    rank         REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.title,
        m.artist,
        m.album,
        m.genre,
        m.mood,
        m.bpm,
        m.duration_ms,
        m.file_url,
        m.waveform_url,
        m.preview_url,
        m.cover_url,
        m.license_type,
        m.is_premium,
        m.use_count,
        CASE
            WHEN p_query IS NOT NULL AND p_query <> ''
            THEN ts_rank(m.search_vector, plainto_tsquery('russian', p_query))
            ELSE 1.0
        END::REAL AS rank
    FROM music_library m
    WHERE
        -- Фильтр по полнотекстовому запросу
        (
            p_query IS NULL
            OR p_query = ''
            OR m.search_vector @@ plainto_tsquery('russian', p_query)
        )
        -- Фильтр жанра
        AND (p_genre IS NULL OR m.genre = p_genre)
        -- Фильтр настроения
        AND (p_mood IS NULL OR m.mood = p_mood)
    ORDER BY rank DESC, m.use_count DESC
    LIMIT  LEAST(p_limit, 100)   -- защита от слишком больших выборок
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION search_music(TEXT, TEXT, TEXT, INT, INT) IS
    'Полнотекстовый поиск по music_library с фильтрами по жанру и настроению. Лимит max 100.';

-- ─────────────────────────────────────────────
-- Функция: глубокое копирование проекта
-- Копирует project → tracks → clips → effects → keyframes
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION duplicate_project(
    p_source_project_id UUID,
    p_new_user_id       UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_project_id UUID;
    v_new_track_id   UUID;
    v_new_clip_id    UUID;

    r_track   RECORD;
    r_clip    RECORD;
    r_effect  RECORD;
    r_kf      RECORD;

    -- Маппинг старых track_id → новых track_id
    track_id_map  HSTORE;
    -- Маппинг старых clip_id → новых clip_id
    clip_id_map   HSTORE;
BEGIN
    -- ── Авторизация ──────────────────────────────────────────────────────────
    -- Вызывающий должен быть аутентифицирован и владеть исходным проектом.
    -- Дублирование в чужой аккаунт запрещено на уровне функции.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '28000';  -- invalid_authorization_specification
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM editor_projects
        WHERE id = p_source_project_id
          AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: project % not found or you are not its owner',
            p_source_project_id
            USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;

    IF p_new_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access denied: p_new_user_id must match the calling user (auth.uid())'
            USING ERRCODE = '42501';
    END IF;
    -- ─────────────────────────────────────────────────────────────────────────

    -- Требуется расширение hstore для маппинга (uuid → uuid)
    -- Используем временные таблицы как альтернативу
    CREATE TEMP TABLE _track_map (old_id UUID, new_id UUID) ON COMMIT DROP;
    CREATE TEMP TABLE _clip_map  (old_id UUID, new_id UUID) ON COMMIT DROP;

    -- 1. Копируем проект (без duration_ms — пересчитается триггером)
    INSERT INTO editor_projects (
        user_id, title, description, status, aspect_ratio,
        resolution_width, resolution_height, fps, settings,
        thumbnail_url
    )
    SELECT
        p_new_user_id,
        title || ' (копия)',
        description,
        'draft',
        aspect_ratio,
        resolution_width,
        resolution_height,
        fps,
        settings,
        thumbnail_url
    FROM editor_projects
    WHERE id = p_source_project_id
    RETURNING id INTO v_new_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Исходный проект % не найден', p_source_project_id;
    END IF;

    -- 2. Копируем дорожки
    FOR r_track IN
        SELECT * FROM editor_tracks WHERE project_id = p_source_project_id
        ORDER BY sort_order
    LOOP
        INSERT INTO editor_tracks (
            project_id, type, name, sort_order,
            is_locked, is_visible, volume, opacity, blend_mode
        )
        VALUES (
            v_new_project_id, r_track.type, r_track.name, r_track.sort_order,
            r_track.is_locked, r_track.is_visible, r_track.volume,
            r_track.opacity, r_track.blend_mode
        )
        RETURNING id INTO v_new_track_id;

        INSERT INTO _track_map VALUES (r_track.id, v_new_track_id);
    END LOOP;

    -- 3. Копируем клипы
    FOR r_clip IN
        SELECT * FROM editor_clips WHERE project_id = p_source_project_id
        ORDER BY sort_order
    LOOP
        SELECT new_id INTO v_new_track_id
        FROM _track_map WHERE old_id = r_clip.track_id;

        INSERT INTO editor_clips (
            track_id, project_id, type, name,
            start_ms, duration_ms, source_url, source_start_ms, source_end_ms,
            volume, speed, speed_ramp, transform, crop,
            filters, transition_in, transition_out,
            text_content, text_style, sticker_id,
            sort_order, is_reversed
        )
        VALUES (
            v_new_track_id, v_new_project_id, r_clip.type, r_clip.name,
            r_clip.start_ms, r_clip.duration_ms, r_clip.source_url,
            r_clip.source_start_ms, r_clip.source_end_ms,
            r_clip.volume, r_clip.speed, r_clip.speed_ramp,
            r_clip.transform, r_clip.crop,
            r_clip.filters, r_clip.transition_in, r_clip.transition_out,
            r_clip.text_content, r_clip.text_style, r_clip.sticker_id,
            r_clip.sort_order, r_clip.is_reversed
        )
        RETURNING id INTO v_new_clip_id;

        INSERT INTO _clip_map VALUES (r_clip.id, v_new_clip_id);
    END LOOP;

    -- 4. Копируем эффекты
    FOR r_effect IN
        SELECT e.*
        FROM editor_effects e
        INNER JOIN _clip_map cm ON cm.old_id = e.clip_id
    LOOP
        SELECT new_id INTO v_new_clip_id
        FROM _clip_map WHERE old_id = r_effect.clip_id;

        INSERT INTO editor_effects (
            clip_id, project_id, type, params, enabled, sort_order
        )
        VALUES (
            v_new_clip_id, v_new_project_id,
            r_effect.type, r_effect.params, r_effect.enabled, r_effect.sort_order
        );
    END LOOP;

    -- 5. Копируем кейфреймы
    FOR r_kf IN
        SELECT kf.*
        FROM editor_keyframes kf
        INNER JOIN _clip_map cm ON cm.old_id = kf.clip_id
    LOOP
        SELECT new_id INTO v_new_clip_id
        FROM _clip_map WHERE old_id = r_kf.clip_id;

        INSERT INTO editor_keyframes (
            clip_id, project_id, property, time_ms, value, easing, bezier_points
        )
        VALUES (
            v_new_clip_id, v_new_project_id,
            r_kf.property, r_kf.time_ms, r_kf.value, r_kf.easing, r_kf.bezier_points
        );
    END LOOP;

    RETURN v_new_project_id;
END;
$$;

COMMENT ON FUNCTION duplicate_project(UUID, UUID) IS
    'Глубокое копирование проекта: project + tracks + clips + effects + keyframes. '
    'Возвращает UUID нового проекта. Безопасно запускать в транзакции.';

-- ─────────────────────────────────────────────
-- Функция: разделение клипа на два
-- Создаёт второй клип начиная с split_at_ms
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION split_clip(
    p_clip_id     UUID,
    p_split_at_ms BIGINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clip           RECORD;
    v_new_clip_id    UUID;
    v_split_relative BIGINT; -- позиция split внутри клипа (относительно start_ms клипа)
BEGIN
    -- Получаем исходный клип
    SELECT * INTO v_clip FROM editor_clips WHERE id = p_clip_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Клип % не найден', p_clip_id;
    END IF;

    -- ── Авторизация ──────────────────────────────────────────────────────────
    -- Вызывающий обязан быть аутентифицирован и владеть проектом, содержащим клип.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '28000';
    END IF;

    IF NOT editor_user_owns_project(v_clip.project_id) THEN
        RAISE EXCEPTION 'Access denied: you do not own the project (%) containing clip %',
            v_clip.project_id, p_clip_id
            USING ERRCODE = '42501';
    END IF;
    -- ─────────────────────────────────────────────────────────────────────────

    -- Валидация точки разреза
    v_split_relative := p_split_at_ms - v_clip.start_ms;

    IF v_split_relative <= 0 THEN
        RAISE EXCEPTION 'split_at_ms (%) должен быть больше start_ms клипа (%)',
            p_split_at_ms, v_clip.start_ms;
    END IF;

    IF v_split_relative >= v_clip.duration_ms THEN
        RAISE EXCEPTION 'split_at_ms (%) должен быть меньше end_ms клипа (%)',
            p_split_at_ms, v_clip.start_ms + v_clip.duration_ms;
    END IF;

    -- Укорачиваем первый клип до точки разреза
    UPDATE editor_clips
    SET duration_ms = v_split_relative,
        updated_at  = now()
    WHERE id = p_clip_id;

    -- Вычисляем trim второго клипа (продолжение исходного файла)
    INSERT INTO editor_clips (
        track_id, project_id, type, name,
        start_ms, duration_ms,
        source_url,
        source_start_ms,
        source_end_ms,
        volume, speed, speed_ramp, transform, crop,
        filters, transition_in, transition_out,
        text_content, text_style, sticker_id,
        sort_order, is_reversed
    )
    VALUES (
        v_clip.track_id,
        v_clip.project_id,
        v_clip.type,
        v_clip.name || ' (2)',
        p_split_at_ms,                          -- новый start_ms
        v_clip.duration_ms - v_split_relative,  -- оставшаяся длительность
        v_clip.source_url,
        -- trim start сдвигается на split_relative (c учётом speed)
        COALESCE(v_clip.source_start_ms, 0) + ROUND(v_split_relative * v_clip.speed)::BIGINT,
        v_clip.source_end_ms,
        v_clip.volume,
        v_clip.speed,
        v_clip.speed_ramp,
        v_clip.transform,
        v_clip.crop,
        v_clip.filters,
        NULL,                   -- transition_in у второй половины сбрасывается
        v_clip.transition_out,  -- transition_out переходит ко второй половине
        v_clip.text_content,
        v_clip.text_style,
        v_clip.sticker_id,
        v_clip.sort_order + 1,
        v_clip.is_reversed
    )
    RETURNING id INTO v_new_clip_id;

    -- Переносим кейфреймы, относящиеся ко второй половине клипа
    -- (time_ms >= split_relative от начала клипа)
    INSERT INTO editor_keyframes (
        clip_id, project_id, property, time_ms, value, easing, bezier_points
    )
    SELECT
        v_new_clip_id,
        project_id,
        property,
        time_ms - v_split_relative, -- пересчёт относительно нового start
        value,
        easing,
        bezier_points
    FROM editor_keyframes
    WHERE clip_id = p_clip_id
      AND time_ms >= v_split_relative;

    -- Удаляем перенесённые кейфреймы из первого клипа
    DELETE FROM editor_keyframes
    WHERE clip_id = p_clip_id
      AND time_ms >= v_split_relative;

    RETURN v_new_clip_id;
END;
$$;

COMMENT ON FUNCTION split_clip(UUID, BIGINT) IS
    'Разрезает клип по временной метке p_split_at_ms (абсолютное время проекта). '
    'Возвращает UUID второго (нового) клипа. '
    'Кейфреймы распределяются между двумя клипами. '
    'Вызывать внутри транзакции.';

-- End migration
