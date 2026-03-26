-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- ECOMANSONI Navigation Platform — Search, Geocoding, Saved Places, Location Sharing
-- Миграция: 20260307000006_navigation_search_tables.sql
-- Зависимости: 20260307000002_navigation_core_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. nav_search_history — история поисковых запросов пользователя
--    Используется для autocomplete и персонализации
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_search_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query            TEXT NOT NULL,
    result_type      TEXT CHECK (result_type IN ('address','poi','coordinate')),
    result_id        TEXT,                      -- UUID или внешний ID результата
    result_location  GEOMETRY(Point, 4326),
    result_label     TEXT,                      -- отображаемое название выбранного результата
    selected         BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_search_history IS 'История поиска пользователя. Хранить не более 90 дней по GDPR.';
COMMENT ON COLUMN public.nav_search_history.selected IS 'true — пользователь выбрал этот результат (клик/тап)';

CREATE INDEX IF NOT EXISTS idx_nav_search_history_user
    ON public.nav_search_history(user_id, created_at DESC);
-- Partial index: только выбранные результаты (для autocomplete «недавние»)
CREATE INDEX IF NOT EXISTS idx_nav_search_history_user_selected
    ON public.nav_search_history(user_id, created_at DESC)
    WHERE selected = true;
CREATE INDEX IF NOT EXISTS idx_nav_search_history_query_trgm
    ON public.nav_search_history USING GIN(query gin_trgm_ops);

ALTER TABLE public.nav_search_history ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свою историю
CREATE POLICY "nav_search_history_select_own"
    ON public.nav_search_history FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "nav_search_history_insert_own"
    ON public.nav_search_history FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "nav_search_history_delete_own"
    ON public.nav_search_history FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "nav_search_history_all_service_role"
    ON public.nav_search_history FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. nav_saved_places — сохранённые места пользователя (дом, работа, избранное)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_saved_places (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label       TEXT NOT NULL CHECK (label IN ('home','work','custom')),
    custom_name TEXT,
    location    GEOMETRY(Point, 4326) NOT NULL,
    address     TEXT,
    h3_index_r9 TEXT,
    icon        TEXT,                           -- имя иконки в дизайн-системе
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_saved_places IS 'Сохранённые места. Частичные unique index гарантируют уникальность home/work.';

CREATE INDEX IF NOT EXISTS idx_nav_saved_places_user
    ON public.nav_saved_places(user_id);
CREATE INDEX IF NOT EXISTS idx_nav_saved_places_location
    ON public.nav_saved_places USING GIST(location);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_saved_places_unique_home
    ON public.nav_saved_places(user_id)
    WHERE label = 'home';
CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_saved_places_unique_work
    ON public.nav_saved_places(user_id)
    WHERE label = 'work';

ALTER TABLE public.nav_saved_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_saved_places_select_own"
    ON public.nav_saved_places FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "nav_saved_places_insert_own"
    ON public.nav_saved_places FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "nav_saved_places_update_own"
    ON public.nav_saved_places FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "nav_saved_places_delete_own"
    ON public.nav_saved_places FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "nav_saved_places_all_service_role"
    ON public.nav_saved_places FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. nav_geocoding_cache — кеш результатов геокодинга (forward + reverse)
--    Снижает нагрузку на платные провайдеры (Yandex, Google, Nominatim)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_geocoding_cache (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash  TEXT NOT NULL UNIQUE,           -- SHA-256(lowercase(query_text))
    query_text  TEXT,
    result      JSONB NOT NULL,                 -- полный ответ провайдера
    source      TEXT NOT NULL DEFAULT 'nominatim', -- nominatim, yandex, google, manual
    hit_count   INTEGER NOT NULL DEFAULT 1 CHECK (hit_count >= 1),
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_geocoding_cache IS 'Кеш геокодинга. query_hash = SHA-256(lower(query_text)). TTL через expires_at.';
COMMENT ON COLUMN public.nav_geocoding_cache.query_hash IS 'SHA-256 хеш нормализованного запроса — ключ кеша';

CREATE INDEX IF NOT EXISTS idx_nav_geocoding_cache_query_hash
    ON public.nav_geocoding_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_nav_geocoding_cache_expires
    ON public.nav_geocoding_cache(expires_at)
    WHERE expires_at IS NOT NULL;
-- Trigram поиск по оригинальному тексту (для диагностики)
CREATE INDEX IF NOT EXISTS idx_nav_geocoding_cache_query_trgm
    ON public.nav_geocoding_cache USING GIN(query_text gin_trgm_ops)
    WHERE query_text IS NOT NULL;

ALTER TABLE public.nav_geocoding_cache ENABLE ROW LEVEL SECURITY;

-- Кеш доступен для чтения всем авторизованным клиентам
CREATE POLICY "nav_geocoding_cache_select_authenticated"
    ON public.nav_geocoding_cache FOR SELECT
    TO authenticated
    USING (
        -- Не отдаём просроченные записи
        (expires_at IS NULL OR expires_at > now())
    );

-- Только service_role пишет в кеш (геокодер-сервис)
CREATE POLICY "nav_geocoding_cache_all_service_role"
    ON public.nav_geocoding_cache FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. nav_location_shares — live location sharing (Telegram-style)
--    expires_at обязателен — бесконечный sharing недопустим
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_location_shares (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sharer_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shared_with      UUID[],                    -- массив user_id получателей
    chat_id          UUID,                      -- опциональная привязка к чату
    current_location GEOMETRY(Point, 4326),     -- обновляется по WebSocket
    is_active        BOOLEAN NOT NULL DEFAULT true,
    expires_at       TIMESTAMPTZ NOT NULL,      -- максимум 8 часов от created_at
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Нельзя создать шаринг с истёкшим expires_at
    CONSTRAINT nav_location_shares_expires_future CHECK (expires_at > created_at),
    -- Максимальный TTL 8 часов принудительно
    CONSTRAINT nav_location_shares_max_ttl CHECK (
        expires_at <= created_at + INTERVAL '8 hours'
    )
);

COMMENT ON TABLE  public.nav_location_shares IS 'Live location sharing. Автоматически деактивируется через expires_at триггером.';
COMMENT ON COLUMN public.nav_location_shares.shared_with IS 'Массив UUID получателей. NULL = публичная ссылка (только через явный chat_id).';

CREATE INDEX IF NOT EXISTS idx_nav_location_shares_sharer
    ON public.nav_location_shares(sharer_id, is_active);
CREATE INDEX IF NOT EXISTS idx_nav_location_shares_active
    ON public.nav_location_shares(expires_at)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nav_location_shares_chat
    ON public.nav_location_shares(chat_id) WHERE chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_location_shares_shared_with
    ON public.nav_location_shares USING GIN(shared_with) WHERE shared_with IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_location_shares_location
    ON public.nav_location_shares USING GIST(current_location) WHERE current_location IS NOT NULL;

ALTER TABLE public.nav_location_shares ENABLE ROW LEVEL SECURITY;

-- Sharer управляет своими шарингами
CREATE POLICY "nav_location_shares_select_sharer"
    ON public.nav_location_shares FOR SELECT
    TO authenticated
    USING (sharer_id = auth.uid());

-- Получатель видит активные шаринги, где он в списке
CREATE POLICY "nav_location_shares_select_recipient"
    ON public.nav_location_shares FOR SELECT
    TO authenticated
    USING (
        is_active = true
        AND expires_at > now()
        AND shared_with @> ARRAY[auth.uid()]
    );

CREATE POLICY "nav_location_shares_insert_own"
    ON public.nav_location_shares FOR INSERT
    TO authenticated
    WITH CHECK (sharer_id = auth.uid());

CREATE POLICY "nav_location_shares_update_own"
    ON public.nav_location_shares FOR UPDATE
    TO authenticated
    USING (sharer_id = auth.uid())
    WITH CHECK (sharer_id = auth.uid());

CREATE POLICY "nav_location_shares_delete_own"
    ON public.nav_location_shares FOR DELETE
    TO authenticated
    USING (sharer_id = auth.uid());

CREATE POLICY "nav_location_shares_all_service_role"
    ON public.nav_location_shares FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
