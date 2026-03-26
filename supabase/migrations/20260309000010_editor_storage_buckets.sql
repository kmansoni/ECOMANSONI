-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Migration: Supabase Storage buckets для видеоредактора

-- ─────────────────────────────────────────────
-- Создание buckets
-- ─────────────────────────────────────────────

-- Медиафайлы проектов пользователей (видео, аудио, изображения)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'editor-projects',
    'editor-projects',
    false,              -- приватный: доступ только через signed URLs
    524288000,          -- лимит файла: 500 МБ
    ARRAY[
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
        'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/flac',
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Результаты рендеринга (готовые видео)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'editor-renders',
    'editor-renders',
    false,              -- приватный; владелец получает signed URL
    2147483648,         -- 2 ГБ (финальное видео может быть большим)
    ARRAY[
        'video/mp4', 'video/webm', 'video/quicktime',
        'image/gif'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Ассеты шаблонов (превью, превью-видео, данные)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'editor-templates',
    'editor-templates',
    true,               -- публичный: шаблоны доступны всем пользователям
    52428800,           -- 50 МБ
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'video/webm',
        'application/json'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Музыкальная библиотека (аудиофайлы, обложки, waveforms)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'editor-music',
    'editor-music',
    true,               -- публичный: стриминг без overhead signed URLs
    52428800,           -- 50 МБ на трек
    ARRAY[
        'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/flac',
        'image/jpeg', 'image/png', 'image/webp',
        'application/json'   -- waveform JSON
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Стикеры и анимации
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'editor-stickers',
    'editor-stickers',
    true,               -- публичный
    5242880,            -- 5 МБ на стикер
    ARRAY[
        'image/png', 'image/webp', 'image/gif', 'image/apng',
        'application/json'   -- lottie JSON
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Пользовательские шрифты
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'editor-fonts',
    'editor-fonts',
    false,              -- приватный: шрифты привязаны к пользователю
    10485760,           -- 10 МБ на файл шрифта
    ARRAY[
        'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
        'application/font-woff', 'application/font-woff2',
        'application/octet-stream'   -- fallback для некоторых загрузчиков
    ]
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- Storage Policies: editor-projects (приватный)
-- ─────────────────────────────────────────────

-- Пользователь читает только свои файлы (путь: {user_id}/*)
CREATE POLICY "editor-projects: owner read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'editor-projects'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Пользователь загружает только в свою папку
CREATE POLICY "editor-projects: owner insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'editor-projects'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Пользователь удаляет только свои файлы
CREATE POLICY "editor-projects: owner delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'editor-projects'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- service_role имеет полный доступ (для воркеров рендеринга)
CREATE POLICY "editor-projects: service_role full"
    ON storage.objects FOR ALL
    USING (
        bucket_id = 'editor-projects'
        AND auth.role() = 'service_role'
    )
    WITH CHECK (
        bucket_id = 'editor-projects'
        AND auth.role() = 'service_role'
    );

-- ─────────────────────────────────────────────
-- Storage Policies: editor-renders (приватный)
-- ─────────────────────────────────────────────

-- Владелец читает свои рендеры
CREATE POLICY "editor-renders: owner read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'editor-renders'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- service_role записывает результаты рендеринга
CREATE POLICY "editor-renders: service_role write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'editor-renders'
        AND auth.role() = 'service_role'
    );

-- service_role обновляет (перезапись при повторном рендере)
CREATE POLICY "editor-renders: service_role update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'editor-renders'
        AND auth.role() = 'service_role'
    )
    WITH CHECK (
        bucket_id = 'editor-renders'
        AND auth.role() = 'service_role'
    );

-- Владелец удаляет свои рендеры
CREATE POLICY "editor-renders: owner delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'editor-renders'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- ─────────────────────────────────────────────
-- Storage Policies: editor-templates (публичный)
-- ─────────────────────────────────────────────

-- Чтение: все аутентифицированные
CREATE POLICY "editor-templates: authenticated read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'editor-templates'
        AND auth.role() = 'authenticated'
    );

-- Запись: только service_role
CREATE POLICY "editor-templates: service_role write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'editor-templates'
        AND auth.role() = 'service_role'
    );

CREATE POLICY "editor-templates: service_role delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'editor-templates'
        AND auth.role() = 'service_role'
    );

-- ─────────────────────────────────────────────
-- Storage Policies: editor-music (публичный)
-- ─────────────────────────────────────────────

CREATE POLICY "editor-music: authenticated read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'editor-music'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "editor-music: service_role write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'editor-music'
        AND auth.role() = 'service_role'
    );

CREATE POLICY "editor-music: service_role delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'editor-music'
        AND auth.role() = 'service_role'
    );

-- ─────────────────────────────────────────────
-- Storage Policies: editor-stickers (публичный)
-- ─────────────────────────────────────────────

CREATE POLICY "editor-stickers: authenticated read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'editor-stickers'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "editor-stickers: service_role write"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'editor-stickers'
        AND auth.role() = 'service_role'
    );

CREATE POLICY "editor-stickers: service_role delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'editor-stickers'
        AND auth.role() = 'service_role'
    );

-- ─────────────────────────────────────────────
-- Storage Policies: editor-fonts (приватный)
-- ─────────────────────────────────────────────

CREATE POLICY "editor-fonts: owner read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'editor-fonts'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "editor-fonts: owner insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'editor-fonts'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "editor-fonts: owner delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'editor-fonts'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- End migration
