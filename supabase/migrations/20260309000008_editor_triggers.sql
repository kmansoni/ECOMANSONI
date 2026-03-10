-- Migration: Триггеры видеоредактора

-- ─────────────────────────────────────────────
-- Триггеры updated_at для таблиц проекта
-- ─────────────────────────────────────────────
CREATE TRIGGER trg_editor_projects_updated_at
    BEFORE UPDATE ON editor_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_editor_tracks_updated_at
    BEFORE UPDATE ON editor_tracks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_editor_clips_updated_at
    BEFORE UPDATE ON editor_clips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_editor_templates_updated_at
    BEFORE UPDATE ON editor_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- Триггер пересчёта duration_ms проекта
-- Срабатывает при INSERT, UPDATE, DELETE в editor_clips
-- ─────────────────────────────────────────────
CREATE TRIGGER trg_editor_clips_update_project_duration
    AFTER INSERT OR UPDATE OR DELETE ON editor_clips
    FOR EACH ROW
    EXECUTE FUNCTION update_project_duration();

-- ─────────────────────────────────────────────
-- Функция генерации tsvector для music_library
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION music_library_search_vector_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('russian', COALESCE(NEW.title, '')),  'A') ||
        setweight(to_tsvector('russian', COALESCE(NEW.artist, '')), 'B') ||
        setweight(to_tsvector('russian', COALESCE(NEW.album, '')),  'C') ||
        -- Дополнительно: поиск на английском (для транслитерации и заимствований)
        setweight(to_tsvector('english', COALESCE(NEW.title, '')),  'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.artist, '')), 'B');
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION music_library_search_vector_update() IS
    'Триггерная функция: генерирует search_vector для music_library при INSERT/UPDATE';

-- Триггер генерации search_vector
CREATE TRIGGER trg_music_library_search_vector
    BEFORE INSERT OR UPDATE OF title, artist, album ON music_library
    FOR EACH ROW
    EXECUTE FUNCTION music_library_search_vector_update();

-- End migration
