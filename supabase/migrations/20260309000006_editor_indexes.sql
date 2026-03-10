-- Migration: Индексы для всех таблиц видеоредактора

-- ─────────────────────────────────────────────
-- editor_projects
-- ─────────────────────────────────────────────
CREATE INDEX idx_editor_projects_user_id
    ON editor_projects (user_id);

CREATE INDEX idx_editor_projects_status
    ON editor_projects (status);

CREATE INDEX idx_editor_projects_created_at_desc
    ON editor_projects (created_at DESC);

CREATE INDEX idx_editor_projects_user_status
    ON editor_projects (user_id, status);

-- ─────────────────────────────────────────────
-- editor_tracks
-- ─────────────────────────────────────────────
CREATE INDEX idx_editor_tracks_project_id
    ON editor_tracks (project_id);

CREATE INDEX idx_editor_tracks_project_sort
    ON editor_tracks (project_id, sort_order);

-- ─────────────────────────────────────────────
-- editor_clips
-- ─────────────────────────────────────────────
CREATE INDEX idx_editor_clips_track_id
    ON editor_clips (track_id);

CREATE INDEX idx_editor_clips_project_id
    ON editor_clips (project_id);

CREATE INDEX idx_editor_clips_start_ms
    ON editor_clips (project_id, start_ms);

CREATE INDEX idx_editor_clips_type
    ON editor_clips (project_id, type);

-- ─────────────────────────────────────────────
-- editor_effects
-- ─────────────────────────────────────────────
CREATE INDEX idx_editor_effects_clip_id
    ON editor_effects (clip_id);

CREATE INDEX idx_editor_effects_project_id
    ON editor_effects (project_id);

-- ─────────────────────────────────────────────
-- editor_keyframes
-- ─────────────────────────────────────────────
CREATE INDEX idx_editor_keyframes_clip_id
    ON editor_keyframes (clip_id);

-- Индекс для выборки всех кейфреймов клипа по свойству (анимационный timeline query)
CREATE INDEX idx_editor_keyframes_clip_property
    ON editor_keyframes (clip_id, property, time_ms);

-- ─────────────────────────────────────────────
-- editor_templates
-- ─────────────────────────────────────────────
CREATE INDEX idx_editor_templates_category
    ON editor_templates (category);

CREATE INDEX idx_editor_templates_is_published
    ON editor_templates (is_published) WHERE is_published = true;

-- GIN-индекс для массива тегов (поиск по тегам)
CREATE INDEX idx_editor_templates_tags_gin
    ON editor_templates USING GIN (tags);

-- GIN-индекс для полнотекстового поиска по данным шаблона
CREATE INDEX idx_editor_templates_title_trgm
    ON editor_templates USING GIN (title gin_trgm_ops);

-- ─────────────────────────────────────────────
-- music_library
-- ─────────────────────────────────────────────
CREATE INDEX idx_music_library_genre
    ON music_library (genre);

CREATE INDEX idx_music_library_mood
    ON music_library (mood);

CREATE INDEX idx_music_library_bpm
    ON music_library (bpm);

CREATE INDEX idx_music_library_license_type
    ON music_library (license_type);

-- GIN-индекс для полнотекстового поиска (tsvector)
CREATE INDEX idx_music_library_search_vector_gin
    ON music_library USING GIN (search_vector);

-- ─────────────────────────────────────────────
-- sticker_items
-- ─────────────────────────────────────────────
CREATE INDEX idx_sticker_items_pack_id
    ON sticker_items (pack_id);

CREATE INDEX idx_sticker_items_tags_gin
    ON sticker_items USING GIN (tags);

-- ─────────────────────────────────────────────
-- editor_assets
-- ─────────────────────────────────────────────
CREATE INDEX idx_editor_assets_user_id
    ON editor_assets (user_id);

CREATE INDEX idx_editor_assets_project_id
    ON editor_assets (project_id);

CREATE INDEX idx_editor_assets_type
    ON editor_assets (user_id, type);

-- ─────────────────────────────────────────────
-- render_jobs
-- ─────────────────────────────────────────────
CREATE INDEX idx_render_jobs_project_id
    ON render_jobs (project_id);

CREATE INDEX idx_render_jobs_user_id
    ON render_jobs (user_id);

CREATE INDEX idx_render_jobs_status
    ON render_jobs (status);

-- Составной индекс для выборки очереди по приоритету (воркеры)
CREATE INDEX idx_render_jobs_queue_priority
    ON render_jobs (priority DESC, created_at ASC)
    WHERE status = 'queued';

-- ─────────────────────────────────────────────
-- render_job_logs
-- ─────────────────────────────────────────────
CREATE INDEX idx_render_job_logs_job_id
    ON render_job_logs (job_id);

CREATE INDEX idx_render_job_logs_created_at
    ON render_job_logs (job_id, created_at DESC);

-- End migration
