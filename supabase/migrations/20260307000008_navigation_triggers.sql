-- =============================================================================
-- ECOMANSONI Navigation Platform — Триггеры
-- Миграция: 20260307000008_navigation_triggers.sql
-- Зависимости: 20260307000007_navigation_functions.sql
-- =============================================================================

-- =============================================================================
-- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: автоматическое обновление updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.nav_set_updated_at IS
    'Universal updated_at trigger function для всех nav_* таблиц.';

-- Применяем ко всем таблицам с updated_at
DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'nav_zones',
        'nav_road_segments',
        'nav_pois',
        'nav_addresses',
        'nav_trips',
        'nav_driver_profiles',
        'nav_crowdsource_reports',
        'nav_map_edits',
        'nav_reporter_reputation',
        'nav_saved_places',
        'nav_location_shares',
        'nav_risk_scores'
    ];
    v_table TEXT;
    v_trigger_name TEXT;
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        v_trigger_name := 'trg_' || v_table || '_updated_at';
        -- Удаляем старый триггер если существует (идемпотентность)
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON public.%I',
            v_trigger_name, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I
             BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.nav_set_updated_at()',
            v_trigger_name, v_table
        );
    END LOOP;
END;
$$;

-- =============================================================================
-- ТРИГГЕР 2: автоматическое обновление h3_index при INSERT/UPDATE location-колонок
--
-- Поскольку H3 вычисляется в application layer, триггер:
-- 1. Проверяет, что h3_index_r9 предоставлен приложением и соответствует формату H3
-- 2. При изменении GEOMETRY без обновления h3_index — сбрасывает h3_index в NULL
--    (сигнал для приложения пересчитать)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_validate_h3_index()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_h3_col TEXT;
    v_geo_col TEXT;
    v_h3_val TEXT;
BEGIN
    -- Определяем имена колонок в зависимости от таблицы
    v_h3_col  := 'h3_index_r9';
    v_geo_col := CASE TG_TABLE_NAME
        WHEN 'nav_pois'             THEN 'location'
        WHEN 'nav_addresses'        THEN 'location'
        WHEN 'nav_saved_places'     THEN 'location'
        WHEN 'nav_location_history' THEN 'location'
        ELSE 'location'
    END;

    -- Получаем текущее h3 значение через hstore-совместимый подход
    v_h3_val := NEW.h3_index_r9;

    -- Если h3_index_r9 заполнен — валидируем формат H3 cell
    -- H3 index для resolution 9: 15 шестнадцатеричных символов, начинается с '89'
    IF v_h3_val IS NOT NULL THEN
        IF v_h3_val !~ '^[0-9a-f]{15,16}$' THEN
            RAISE EXCEPTION 'Некорректный формат H3 индекса: %. Ожидается 15-16 hex символов.', v_h3_val
                USING ERRCODE = 'data_exception';
        END IF;
    END IF;

    -- Если location изменилась, но h3_index_r9 не обновился — обнуляем
    -- (приложение должно пересчитать H3 перед следующим запросом)
    IF TG_OP = 'UPDATE' THEN
        IF NOT ST_Equals(NEW.location, OLD.location) AND NEW.h3_index_r9 = OLD.h3_index_r9 THEN
            NEW.h3_index_r9 := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.nav_validate_h3_index IS
    'Валидирует формат H3 индекса при INSERT/UPDATE. '
    'При изменении geometry без обновления h3_index — сбрасывает его в NULL.';

-- Применяем к таблицам с h3_index_r9
DROP TRIGGER IF EXISTS trg_nav_pois_h3_index ON public.nav_pois;
CREATE TRIGGER trg_nav_pois_h3_index
    BEFORE INSERT OR UPDATE OF location, h3_index_r9 ON public.nav_pois
    FOR EACH ROW EXECUTE FUNCTION public.nav_validate_h3_index();

DROP TRIGGER IF EXISTS trg_nav_addresses_h3_index ON public.nav_addresses;
CREATE TRIGGER trg_nav_addresses_h3_index
    BEFORE INSERT OR UPDATE OF location, h3_index_r9 ON public.nav_addresses
    FOR EACH ROW EXECUTE FUNCTION public.nav_validate_h3_index();

DROP TRIGGER IF EXISTS trg_nav_saved_places_h3_index ON public.nav_saved_places;
CREATE TRIGGER trg_nav_saved_places_h3_index
    BEFORE INSERT OR UPDATE OF location, h3_index_r9 ON public.nav_saved_places
    FOR EACH ROW EXECUTE FUNCTION public.nav_validate_h3_index();

-- =============================================================================
-- ТРИГГЕР 3: пересчёт репутации репортёра после изменения голосов или статуса
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_trg_update_reporter_reputation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reporter_id UUID;
BEGIN
    -- Определяем reporter_id в зависимости от таблицы
    IF TG_TABLE_NAME = 'nav_report_votes' THEN
        -- Голос изменился — пересчитываем репутацию автора репорта
        SELECT reporter_id INTO v_reporter_id
        FROM public.nav_crowdsource_reports
        WHERE id = COALESCE(NEW.report_id, OLD.report_id);
    ELSIF TG_TABLE_NAME = 'nav_crowdsource_reports' THEN
        v_reporter_id := COALESCE(NEW.reporter_id, OLD.reporter_id);
    ELSE
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Обновляем репутацию в фоне (не блокируем основную транзакцию)
    -- В production используем pg_background или Supabase Edge Function
    -- Здесь — синхронный вызов (безопасно, т.к. быстрая агрегация)
    IF v_reporter_id IS NOT NULL THEN
        PERFORM public.nav_update_reporter_reputation(v_reporter_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.nav_trg_update_reporter_reputation IS
    'Триггерная функция: пересчёт trust_score и XP репортёра при изменении голосов или статуса репорта.';

-- Триггер на голоса
DROP TRIGGER IF EXISTS trg_nav_report_votes_reputation ON public.nav_report_votes;
CREATE TRIGGER trg_nav_report_votes_reputation
    AFTER INSERT OR UPDATE OR DELETE ON public.nav_report_votes
    FOR EACH ROW EXECUTE FUNCTION public.nav_trg_update_reporter_reputation();

-- Триггер на изменение статуса репорта
DROP TRIGGER IF EXISTS trg_nav_crowdsource_reports_reputation ON public.nav_crowdsource_reports;
CREATE TRIGGER trg_nav_crowdsource_reports_reputation
    AFTER UPDATE OF status ON public.nav_crowdsource_reports
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.nav_trg_update_reporter_reputation();

-- =============================================================================
-- ТРИГГЕР 3b: обновление счётчиков upvotes/downvotes в репорте при голосовании
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_trg_sync_report_vote_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_report_id UUID;
BEGIN
    v_report_id := COALESCE(NEW.report_id, OLD.report_id);

    UPDATE public.nav_crowdsource_reports
    SET
        upvotes   = (SELECT COUNT(*) FROM public.nav_report_votes
                     WHERE report_id = v_report_id AND vote_type = 'up'),
        downvotes = (SELECT COUNT(*) FROM public.nav_report_votes
                     WHERE report_id = v_report_id AND vote_type = 'down'),
        -- Пересчёт confidence_score с учётом голосов
        confidence_score = GREATEST(0.1, LEAST(0.99,
            0.5 +
            (SELECT (COUNT(*) FILTER (WHERE vote_type = 'up') - COUNT(*) FILTER (WHERE vote_type = 'down'))::NUMERIC
             / GREATEST(COUNT(*), 1) * 0.4
             FROM public.nav_report_votes WHERE report_id = v_report_id)
        )),
        updated_at = now()
    WHERE id = v_report_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.nav_trg_sync_report_vote_counts IS
    'Синхронизирует денормализованные счётчики upvotes/downvotes и пересчитывает confidence_score.';

DROP TRIGGER IF EXISTS trg_nav_report_votes_sync_counts ON public.nav_report_votes;
CREATE TRIGGER trg_nav_report_votes_sync_counts
    AFTER INSERT OR UPDATE OR DELETE ON public.nav_report_votes
    FOR EACH ROW EXECUTE FUNCTION public.nav_trg_sync_report_vote_counts();

-- =============================================================================
-- ТРИГГЕР 4: обновление рейтинга водителя при завершении поездки
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_trg_update_driver_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_rating         NUMERIC(3,2);
    v_new_total          INTEGER;
    v_new_cancel_rate    NUMERIC(5,2);
BEGIN
    -- Срабатываем только при переходе в terminal статусы
    IF NEW.status NOT IN ('completed', 'cancelled') THEN
        RETURN NEW;
    END IF;
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    IF NEW.driver_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Пересчёт рейтинга водителя на основе последних 500 завершённых поездок
    SELECT
        COALESCE(AVG(rating_by_rider) FILTER (WHERE rating_by_rider IS NOT NULL), 5.0),
        COUNT(*) FILTER (WHERE status = 'completed'),
        ROUND(
            COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'driver')::NUMERIC
            / GREATEST(COUNT(*), 1) * 100,
        2)
    INTO v_new_rating, v_new_total, v_new_cancel_rate
    FROM (
        SELECT rating_by_rider, status, cancelled_by
        FROM public.nav_trips
        WHERE
            driver_id = NEW.driver_id
            AND status IN ('completed', 'cancelled')
        ORDER BY completed_at DESC NULLS LAST, cancelled_at DESC NULLS LAST
        LIMIT 500
    ) recent_trips;

    UPDATE public.nav_driver_profiles
    SET
        rating            = GREATEST(1.0, LEAST(5.0, v_new_rating)),
        total_trips       = v_new_total,
        cancellation_rate = GREATEST(0, LEAST(100, v_new_cancel_rate)),
        updated_at        = now()
    WHERE id = NEW.driver_id;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.nav_trg_update_driver_rating IS
    'Пересчёт рейтинга и статистики водителя при завершении/отмене поездки. '
    'Учитывает последние 500 поездок для скользящего среднего.';

DROP TRIGGER IF EXISTS trg_nav_trips_driver_rating ON public.nav_trips;
CREATE TRIGGER trg_nav_trips_driver_rating
    AFTER UPDATE OF status ON public.nav_trips
    FOR EACH ROW
    WHEN (NEW.status IN ('completed', 'cancelled') AND OLD.status != NEW.status)
    EXECUTE FUNCTION public.nav_trg_update_driver_rating();

-- =============================================================================
-- ТРИГГЕР 5: запрет самоголосования (voter != reporter)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_trg_prevent_self_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reporter_id UUID;
BEGIN
    SELECT reporter_id INTO v_reporter_id
    FROM public.nav_crowdsource_reports
    WHERE id = NEW.report_id;

    IF v_reporter_id = NEW.voter_id THEN
        RAISE EXCEPTION 'Нельзя голосовать за собственный репорт'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.nav_trg_prevent_self_vote IS
    'Предотвращает накрутку рейтинга: автор репорта не может голосовать за него.';

DROP TRIGGER IF EXISTS trg_nav_report_votes_no_self_vote ON public.nav_report_votes;
CREATE TRIGGER trg_nav_report_votes_no_self_vote
    BEFORE INSERT OR UPDATE ON public.nav_report_votes
    FOR EACH ROW EXECUTE FUNCTION public.nav_trg_prevent_self_vote();

-- =============================================================================
-- ТРИГГЕР 6: автоматическая деактивация location share по истечении expires_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_trg_deactivate_expired_shares()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- При обновлении current_location проверяем не истёк ли TTL
    IF NEW.expires_at <= now() THEN
        NEW.is_active := false;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.nav_trg_deactivate_expired_shares IS
    'Автоматически ставит is_active=false если expires_at прошёл при любом UPDATE.';

DROP TRIGGER IF EXISTS trg_nav_location_shares_deactivate ON public.nav_location_shares;
CREATE TRIGGER trg_nav_location_shares_deactivate
    BEFORE UPDATE ON public.nav_location_shares
    FOR EACH ROW EXECUTE FUNCTION public.nav_trg_deactivate_expired_shares();

-- =============================================================================
-- ТРИГГЕР 7: автоматическое создание записи reporter_reputation для нового пользователя
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_trg_init_reporter_reputation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.nav_reporter_reputation (user_id)
    VALUES (NEW.reporter_id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.nav_trg_init_reporter_reputation IS
    'Создаёт начальную запись репутации при первом репорте пользователя.';

DROP TRIGGER IF EXISTS trg_nav_crowdsource_reports_init_reputation ON public.nav_crowdsource_reports;
CREATE TRIGGER trg_nav_crowdsource_reports_init_reputation
    AFTER INSERT ON public.nav_crowdsource_reports
    FOR EACH ROW EXECUTE FUNCTION public.nav_trg_init_reporter_reputation();
