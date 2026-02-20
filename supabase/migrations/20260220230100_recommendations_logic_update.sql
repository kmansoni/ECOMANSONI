-- =====================================================
-- Обновление логики рекомендаций
-- =====================================================

-- Добавляем поле для хранения номеров телефонов из контактов пользователя
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS contacts_phones TEXT[], -- Массив номеров телефонов из контактов
ADD COLUMN IF NOT EXISTS contacts_access_granted BOOLEAN DEFAULT false; -- Разрешил ли доступ к контактам

-- Индекс для быстрого поиска по номерам телефонов
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_contacts_phones ON public.profiles USING GIN(contacts_phones);

-- Обновляем функцию рекомендаций
DROP FUNCTION IF EXISTS public.get_recommended_users_for_new_user(INTEGER);

-- Новая функция: рекомендации на основе контактов или случайные
CREATE OR REPLACE FUNCTION public.get_recommended_users_for_new_user(
    p_user_id UUID,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    verified BOOLEAN,
    followers_count BIGINT,
    is_from_contacts BOOLEAN
) AS $$
DECLARE
    v_contacts_access BOOLEAN;
    v_contacts_phones TEXT[];
BEGIN
    -- Получаем информацию о доступе к контактам
    SELECT contacts_access_granted, contacts_phones 
    INTO v_contacts_access, v_contacts_phones
    FROM public.profiles
    WHERE profiles.user_id = p_user_id;

    -- Если доступ к контактам дан И есть контакты
    IF v_contacts_access = true AND array_length(v_contacts_phones, 1) > 0 THEN
        -- Возвращаем пользователей из контактов
        RETURN QUERY
        SELECT 
            p.user_id,
            p.display_name,
            p.avatar_url,
            p.verified,
            COUNT(DISTINCT f.follower_id) as followers_count,
            true as is_from_contacts
        FROM public.profiles p
        LEFT JOIN public.followers f ON f.following_id = p.user_id
        WHERE p.phone = ANY(v_contacts_phones)
          AND p.user_id != p_user_id -- Исключаем самого пользователя
        GROUP BY p.user_id, p.display_name, p.avatar_url, p.verified
        ORDER BY followers_count DESC, RANDOM()
        LIMIT limit_count;
    ELSE
        -- Возвращаем случайных пользователей
        RETURN QUERY
        SELECT 
            p.user_id,
            p.display_name,
            p.avatar_url,
            p.verified,
            COUNT(DISTINCT f.follower_id) as followers_count,
            false as is_from_contacts
        FROM public.profiles p
        LEFT JOIN public.followers f ON f.following_id = p.user_id
        WHERE p.user_id != p_user_id -- Исключаем самого пользователя
          AND p.display_name IS NOT NULL -- Только с заполненными профилями
        GROUP BY p.user_id, p.display_name, p.avatar_url, p.verified
        ORDER BY RANDOM()
        LIMIT limit_count;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для сохранения контактов пользователя
CREATE OR REPLACE FUNCTION public.save_user_contacts(
    p_user_id UUID,
    p_contacts_phones TEXT[]
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET 
        contacts_phones = p_contacts_phones,
        contacts_access_granted = true,
        updated_at = now()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для отзыва доступа к контактам
CREATE OR REPLACE FUNCTION public.revoke_contacts_access(
    p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET 
        contacts_phones = NULL,
        contacts_access_granted = false,
        updated_at = now()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.profiles.contacts_phones IS 'Номера телефонов из контактов пользователя для рекомендаций';
COMMENT ON COLUMN public.profiles.contacts_access_granted IS 'Разрешил ли пользователь доступ к своим контактам';
COMMENT ON FUNCTION public.get_recommended_users_for_new_user IS 'Рекомендации: из контактов если доступ дан, иначе случайные пользователи';
COMMENT ON FUNCTION public.save_user_contacts IS 'Сохранение контактов пользователя для рекомендаций';
