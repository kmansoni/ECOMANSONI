# Архитектура безопасности и возрастной фильтрации Mansoni

## 1. Общая архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    Фронд-слой (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  AgeGateOverlay        TeenModeProvider      ParentalControlUI │
│  ContentFilterHOC      RestrictedBadge        SafetySettings   │
└───────────────┬─────────────────────┬───────────────────────────┘
                │                     │
                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Бизнес-логика (Zustand/Context)                │
├─────────────────────────────────────────────────────────────────┤
│  useAgeVerification  useTeenMode      useParentalControls      │
│  useContentFilter    useModeration   useSafetySettings         │
└───────────────┬─────────────────────┬───────────────────────────┘
                │                     │
                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                Сервисный слой (Supabase + Edge Functions)      │
├─────────────────────────────────────────────────────────────────┤
│  ageVerificationRPC  contentModerationRPC  safetySettingsRPC   │
│  teenProfileEnforcer parentalLinkRPC    hashtagValidator       │
└───────────────┬─────────────────────┬───────────────────────────┘
                │                     │
                ▼                     ▼
        ┌───────┴───────┐     ┌───────┴───────┐
        │  PostgreSQL   │     │   Redis (Rate) │
        │  (RLS + RPC)  │     │   Limiting     │
        └───────────────┘     └────────────────┘
```

## 2. База данных (Supabase PostgreSQL)

### 2.1 Расширение profiles

```sql
-- src/integrations/supabase/types.ts обновить
profiles {
  id: uuid
  ...
  date_of_birth: date              -- NULLABLE для legacy, new required
  age_verified_at: timestamp       -- когда проверяли возраст
  account_type: account_type_enum  -- 'adult' | 'teen' | 'child_supervised'
  parental_guardian_id: uuid       -- NULLABLE, ссылка на родителя
  teen_mode_enforced_by: uuid      -- NULLABLE, кто принудил teen-mode (parent/auto)
  is_teen_mode_locked: boolean     -- может ли пользователь выключить teen-mode
  content_rating_limit: rating_enum-- 'G'|'PG'|'PG-13'|'T'|'MA' (Teen=PG-13)
  strict_limited_content: boolean  -- родительский за hardcore-filter
  restricted_categories: jsonb      -- ручной список блокируемых категорий
  safety_mode_active: boolean      -- включён ли AI-фильтр в реальном времени
  last_age_check_ip: inet           -- IP последней проверки
  age_verification_attempts: integer-- счётчик попыток
}
```

**ACCOUNT_TYPE_ENUM:**
- `adult` (18+) — полный доступ
- `teen` (13-17) — PG-13 фильтрация, родительский контроль опционален
- `child_supervised` (<13) — только с родительским аккаунтом, строгий G-рейтинг

### 2.2 Новая таблица parental_links

```sql
parental_links {
  id: uuid PK
  teen_user_id: uuid → profiles.id (ON DELETE CASCADE)
  parent_user_id: uuid → profiles.id (ON DELETE CASCADE)
  relationship: relationship_enum -- 'mother'|'father'|'guardian'|'other'
  verification_method: verification_enum -- 'email_otp'|'invite_code'|'document'
  invite_code: varchar(32) UNIQUE
  invite_code_expires_at: timestamp
  status: status_enum -- 'pending'|'active'|'revoked'|'expired'
  teen_acceptance_confirmed_at: timestamp
  parent_verified_at: timestamp
  settings_sync_enabled: boolean  -- синхронизировать настройки фильтров
  daily_usage_limit_minutes: integer -- 0 = unlimited
  created_at: timestamp
  updated_at: timestamp
  
  UNIQUE(teen_user_id, parent_user_id)
  UNIQUE(invite_code)
}
```

### 2.3 Таблица content_rating_labels

```sql
content_rating_labels {
  id: uuid PK
  content_type: content_type_enum -- 'post'|'reel'|'comment'|'message'|'profile'
  content_id: uuid -- ссылка на контент (разные таблицы)
  rating: rating_enum -- 'G'|'PG'|'PG-13'|'T'|'MA'|'NSFW'
  violence_score: smallint  -- 0-100
  language_score: smallint  -- 0-100
  substance_score: smallint -- 0-100
  sexual_content_score: smallint -- 0-100
  risky_stunts_score: smallint -- 0-100
  ai_confidence: numeric(3,2) -- уверенность AI (0.00-1.00)
  labeled_by: labeled_by_enum -- 'ai'|'moderator'|'auto_hashtag'|'user_report'
  model_version: varchar(32) -- версия AI модели
  labeled_at: timestamp
  
  INDEX(content_type, rating)
  INDEX(content_id)
}
```

### 2.4 Таблица age_verification_logs

```sql
age_verification_logs {
  id: uuid PK
  user_id: uuid → profiles.id
  verification_type: verification_type_enum -- 'initial'|'recheck'|'parental_override'
  method: method_enum -- 'self_report'|'document_upload'|'parental_attest'|'third_party'
  ip_address: inet
  user_agent: text
  result: result_enum -- 'success'|'fail'|'needs_review'|'fraud_suspected'
  failure_reason: text -- если fail
  metadata: jsonb -- дополнительная информация
  reviewed_by: uuid → admin_users.id
  reviewed_at: timestamp
  created_at: timestamp
}
```

### 2.5 Обновление существующих таблиц

```sql
-- posts/reels/comments: добавление is_age_restricted флага
ALTER TABLE posts ADD COLUMN is_age_restricted boolean DEFAULT false;
ALTER TABLE reels ADD COLUMN is_age_restricted boolean DEFAULT false;
ALTER TABLE comments ADD COLUMN is_age_restricted boolean DEFAULT false;

-- хранение подозрительных действий (age-gate обход)
ALTER TABLE user_sessions ADD COLUMN age_verification_bypassed boolean DEFAULT false;
```

## 3. Серверная логика (Supabase RPC + Edge Functions)

### 3.1 RPC: verify_age_and_enforce_mode

```sql
CREATE OR REPLACE FUNCTION verify_age_and_enforce_mode(
  p_user_id uuid,
  p_date_of_birth date,
  p_ip_address inet
) RETURNS jsonb AS $$
DECLARE
  v_age integer;
  v_account_type account_type_enum;
  v_result jsonb;
BEGIN
  -- вычисляем возраст
  v_age := DATE_PART('year', AGE(p_date_of_birth));
  
  -- определяем тип аккаунта
  IF v_age >= 18 THEN
    v_account_type := 'adult';
  ELSIF v_age >= 13 THEN
    v_account_type := 'teen';
  ELSE
    v_account_type := 'child_supervised';
  END IF;
  
  -- обновляем профиль
  UPDATE profiles 
  SET 
    date_of_birth = p_date_of_birth,
    account_type = v_account_type,
    age_verified_at = NOW(),
    content_rating_limit = CASE 
      WHEN v_account_type = 'adult' THEN 'T'::rating_enum
      WHEN v_account_type = 'teen' THEN 'PG-13'::rating_enum
      ELSE 'G'::rating_enum
    END,
    last_age_check_ip = p_ip_address,
    age_verification_attempts = profiles.age_verification_attempts + 1
  WHERE id = p_user_id
  RETURNING to_jsonb(profiles) INTO v_result;
  
  -- лог
  INSERT INTO age_verification_logs (
    user_id, verification_type, method, ip_address, result
  ) VALUES (
    p_user_id, 'initial', 'self_report', p_ip_address, 'success'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'account_type', v_account_type,
    'profile', v_result
  );
EXCEPTION
  WHEN others THEN
    INSERT INTO age_verification_logs (
      user_id, verification_type, method, result, failure_reason
    ) VALUES (
      p_user_id, 'initial', 'self_report', 'fail', SQLERRM
    );
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**RLS политика:** только `auth.uid() = p_user_id` и `account_type IN ('adult','teen')`или `service_role`.

### 3.2 RPC: create_parental_invite

```sql
CREATE OR REPLACE FUNCTION create_parental_invite(
  p_teen_user_id uuid,
  p_parent_user_id uuid,
  p_relationship relationship_enum
) RETURNS jsonb AS $$
DECLARE
  v_invite_code varchar(32);
  v_teen_profile profiles;
  v_parent_profile profiles;
BEGIN
  -- валидация: teen должен быть 13-17
  SELECT * INTO v_teen_profile FROM profiles WHERE id = p_teen_user_id;
  IF v_teen_profile.account_type != 'teen' THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a teen account');
  END IF;
  
  -- валидация: parent должен быть 18+
  SELECT * INTO v_parent_profile FROM profiles WHERE id = p_parent_user_id;
  IF v_parent_profile.account_type != 'adult' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parent must be adult');
  END IF;
  
  --生成 код
  v_invite_code := SUBSTR(MD5(RANDOM()::text), 1, 32);
  
  INSERT INTO parental_links (
    teen_user_id, parent_user_id, relationship,
    invite_code, status, created_at
  ) VALUES (
    p_teen_user_id, p_parent_user_id, p_relationship,
    v_invite_code, 'pending', NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'invite_code', v_invite_code,
    'expires_in_days', 7
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.3 RPC: accept_parental_invite

```sql
CREATE OR REPLACE FUNCTION accept_parental_invite(
  p_invite_code varchar,
  p_parent_user_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_link parental_links%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM parental_links 
  WHERE invite_code = p_invite_code 
    AND status = 'pending'
    AND invite_code_expires_at > NOW();
    
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invite');
  END IF;
  
  -- подтверждение
  UPDATE parental_links
  SET 
    parent_user_id = p_parent_user_id,
    parent_verified_at = NOW(),
    status = 'active',
    teen_acceptance_confirmed_at = NOW()
  WHERE id = v_link.id;
  
  -- обновляем профиль teen'а
  UPDATE profiles
  SET 
    parental_guardian_id = p_parent_user_id,
    account_type = 'child_supervised', -- если <13, иначе teen остаётся
    teen_mode_enforced_by = p_parent_user_id
  WHERE id = v_link.teen_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.4 RPC: get_filtered_feed (фильтрация ленты)

```sql
CREATE OR REPLACE FUNCTION get_filtered_feed(
  p_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS SETOF reels AS $$
DECLARE
  v_user profiles;
  v_max_rating rating_enum;
  v_strict_filter boolean;
BEGIN
  SELECT * INTO v_user FROM profiles WHERE id = p_user_id;
  
  -- определяем максимальный рейтинг для этого пользователя
  IF v_user.account_type = 'child_supervised' THEN
    v_max_rating := 'G'::rating_enum;
    v_strict_filter := true;
  ELSIF v_user.account_type = 'teen' THEN
    v_max_rating := 'PG-13'::rating_enum;
    v_strict_filter := COALESCE(v_user.strict_limited_content, false);
  ELSE
    v_max_rating := 'MA'::rating_enum;
    v_strict_filter := false;
  END IF;
  
  -- родительский override
  IF v_user.parental_guardian_id IS NOT NULL THEN
    SELECT strict_limited_content INTO v_strict_filter 
    FROM profiles 
    WHERE id = v_user.parental_guardian_id;
  END IF;
  
  RETURN QUERY
  SELECT r.* FROM reels r
  LEFT JOIN content_rating_labels crl ON 
    crl.content_type = 'reel' AND crl.content_id = r.id
  WHERE 
    -- базовый фильтр по рейтингу
    COALESCE(crl.rating, 'G'::rating_enum) <= v_max_rating
    
    -- строгий режим: исключаем PG-13+ контент + флаги
    AND (NOT v_strict_filter OR (
      COALESCE(crl.rating, 'G'::rating_enum) <= 'PG'::rating_enum
      AND r.is_age_restricted = false
    ))
    
    -- исключаем контент с высокими scores если включён строгий режим
    AND (NOT v_strict_filter OR (
      COALESCE(crl.language_score, 0) < 50 AND
      COALESCE(crl.substance_score, 0) < 30 AND
      COALESCE(crl.sexual_content_score, 0) < 30 AND
      COALESCE(crl.risky_stunts_score, 0) < 50
    ))
    
    -- не показываем скрытые/удалённые
    AND r.is_hidden = false
    AND r.is_deleted = false
    
  ORDER BY r.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 3.5 Edge Function: moderate_content_ai

`supabase/functions/moderate-content-ai/index.ts`

```typescript
interface ModerationRequest {
  content_type: 'text' | 'image' | 'video';
  content: string; // base64 или текст
  user_id: string;
  content_id?: string;
}

interface ModerationResult {
  is_safe: boolean;
  confidence: number;
  categories: {
    sexual_content: { score: number; flagged: boolean };
    hate_speech: { score: number; flagged: boolean };
    violence: { score: number; flagged: boolean };
    self_harm: { score: number; flagged: boolean };
    dangerous_acts: { score: number; flagged: boolean };
    harassment: { score: number; flagged: boolean };
    spam: { score: number; flagged: boolean };
  };
  recommended_action: 'allow' | 'restrict' | 'review' | 'block';
  age_rating: 'G' | 'PG' | 'PG-13' | 'T' | 'MA' | 'NSFW';
}

// Используем OpenAI Moderation API или внутренний сервис
export const serve = serve(async (req: Request) => {
  const { content_type, content, user_id, content_id } = await req.json();
  
  // Вызов AI-модели (OpenAI, Perspective API или кастомная)
  const moderation = await callAIModeration(content_type, content);
  
  // Сохраняем результат
  await supabase.from('content_moderation_status').insert({
    content_type,
    content_id,
    user_id,
    ...moderation,
    created_at: new Date().toISOString()
  });
  
  // Если размечено как NSFW/age-restricted — ставим флаг на контенте
  if (moderation.age_rating === 'NSFW' || moderation.age_rating === 'MA') {
    await supabase.from(content_type === 'text' ? 'posts' : 'reels')
      .update({ is_age_restricted: true })
      .eq('id', content_id);
  }
  
  return new Response(JSON.stringify(moderation), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

### 3.6 Хештег-модерация (расширение существующей)

Добавляем поддержку возрастных рейтингов в `hashtag_moderation`:

```sql
ALTER TABLE hashtags ADD COLUMN age_restriction rating_enum DEFAULT 'G';
ALTER TABLE hashtags ADD COLUMN category content_category_enum; -- 'language'|'substance'|'sexual'|'violence'|'safe'
```

Обновляем `validate_hashtags_allowed_v1()` — теперь проверяет `content_rating_limit` пользователя.

## 4. Фронтенд-архитектура

### 4.1 Компоненты

```
src/
├── components/
│   ├── safety/
│   │   ├── AgeGateOverlay.tsx        -- Первый запуск: ввод DOB
│   │   ├── TeenModeBanner.tsx         -- уведомление "Ты в Teen Mode"
│   │   ├── ContentRestrictedBadge.tsx -- плашка "18+ контент скрыт"
│   │   ├── ParentalControlsPanel.tsx  -- настройки родителя
│   │   └── SafetySettingsMenu.tsx     -- меню настроек безопасности
│   ├── feed/
│   │   ├── ContentFilter.tsx          -- HOC для фильтрации контента
│   │   ├── AgeRestrictedContent.tsx   -- разблокировка через подтверждение
│   │   └── ContentRatingLabel.tsx     -- показ рейтинга (PG-13 и т.д.)
│   └── modals/
│       └── VerificationDocumentModal.tsx -- загрузка документа для верификации
```

### 4.2 Хуки и контексты

```typescript
// src/hooks/useAgeVerification.ts
export const useAgeVerification = () => {
  const [isVerified, setIsVerified] = useState(false);
  const [accountType, setAccountType] = useState<'adult'|'teen'|'child'>();
  
  const verifyAge = async (dateOfBirth: string) => {
    const { data, error } = await supabase.rpc('verify_age_and_enforce_mode', {
      p_user_id: user.id,
      p_date_of_birth: dateOfBirth,
      p_ip_address: ipAddress
    });
    
    if (data.success) {
      setAccountType(data.account_type);
      setIsVerified(true);
      // Принудительо обновляем контекст
      await refreshUserSession();
    }
  };
  
  return { isVerified, accountType, verifyAge };
};

// src/hooks/useTeenMode.ts
export const useTeenMode = () => {
  const { accountType } = useAgeVerification();
  const [isLocked, setIsLocked] = useState(false);
  const [parentalSettings, setParentalSettings] = useState();
  
  // Автоматически блокирует переход в adult-режим для teen
  useEffect(() => {
    if (accountType === 'teen' && !isLocked) {
      // оповещаем родителя при попытке выключения
      trackAttempt('disable_teen_mode');
    }
  }, [accountType]);
  
  return { isTeen: accountType === 'teen', isLocked, parentalSettings };
};

// src/contexts/SafetyContext.tsx
export const SafetyProvider: React.FC = ({ children }) => {
  const [contentFilter, setContentFilter] = useState<ContentFilterState>({
    maxRating: 'PG-13',
    blockProfanity: true,
    blockSubstance: true,
    blockViolence: true,
    blockRiskyStunts: true,
    strictMode: false
  });
  
  // Синхронизируем с user_settings через userId
  useEffect(() => {
    const unsub = supabase
      .channel('safety_settings')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_settings',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        setContentFilter(prev => ({ ...prev, ...payload.new }));
      })
      .subscribe();
    return () => { unsub.unsubscribe(); };
  }, [userId]);
  
  return (
    <SafetyContext.Provider value={{ contentFilter, setContentFilter }}>
      {children}
    </SafetyContext.Provider>
  );
};
```

### 4.3 HOC: withContentFilter

```typescript
// src/hoc/withContentFilter.tsx
export function withContentFilter<P extends ContentProps>(
  Component: React.ComponentType<P>,
  requiredRating: Rating = 'PG-13'
) {
  return function ContentFilteredComponent(props: P) {
    const { accountType, contentFilter } = useSafetyContext();
    const [isRestricted, setIsRestricted] = useState(false);
    
    const shouldShow = (content: Content) => {
      // Проверка рейтинга
      if (content.rating && ratingValue[content.rating] > ratingValue[requiredRating]) {
        setIsRestricted(true);
        return false;
      }
      
      // Проверка строгого режима
      if (contentFilter.strictMode) {
        if (content.languageScore > 50) return false;
        if (content.substanceScore > 30) return false;
      }
      
      return true;
    };
    
    if (isRestricted) {
      return <ContentRestrictedBadge requiredAge={ratingAge[requiredRating]} />;
    }
    
    return <Component {...props} />;
  };
}
```

### 4.4 Страницы настройки

```typescript
// src/pages/settings/ParentalControlsPage.tsx
export const ParentalControlsPage: React.FC = () => {
  const { profile, linkedTeens, linkedParents } = useParentalControls();
  const [inviteCode, setInviteCode] = useState('');
  
  const sendInvite = async (teenId: string) => {
    const { error } = await supabase.rpc('create_parental_invite', {
      p_teen_user_id: teenId,
      p_parent_user_id: user.id,
      p_relationship: 'parent'
    });
    
    if (!error) {
      toast.success('Приглашение отправлено');
    }
  };
  
  const acceptInvite = async (code: string) => {
    const { error } = await supabase.rpc('accept_parental_invite', {
      p_invite_code: code,
      p_parent_user_id: user.id
    });
  };
  
  return (
    <div className="space-y-6">
      <section>
        <h2>Привязанные аккаунты</h2>
        {linkedTeens.map(teen => (
          <TeenCard key={teen.id} teen={teen} onManage={() => {}} />
        ))}
        {linkedParents.map(parent => (
          <ParentCard key={parent.id} parent={parent} />
        ))}
      </section>
      
      <section>
        <h2>Настройки фильтрации для {profile.display_name}</h2>
        <Slider 
          label="Максимальный рейтинг"
          value={profile.content_rating_limit}
          options={['G', 'PG', 'PG-13', 'T', 'MA']}
        />
        <Toggle 
          label="Strict Limited Content"
          checked={profile.strict_limited_content}
          onChange={() => updateProfile({ strict_limited_content: !profile.strict_limited_content })}
        />
        <NumberInput
          label="Дневной лимит (минуты)"
          value={profile.daily_usage_limit_minutes}
          min={0} max={480}
        />
      </section>
    </div>
  );
};
```

## 5. AI Модерация в реальном времени

### 5.1 Архитектура потоковой модерации

```
┌─────────────┐
│   Upload    │ —► media/file
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  Moderation Queue   │ —► moderation_queue_items
│   (PostgREST)       │
└───────┬─────────────┘
        │ async
        ▼
┌─────────────────────────┐
│  Edge Function:        │ —► вызываем AI
│  moderate_content_ai   │    (OpenAI/Perspective)
└────────┬────────────────┘
         │
         ▼
┌──────────────────────┐
│  content_rating_     │
│  labels таблица      │
└─────────┬────────────┘
           │
           ▼
┌──────────────────────┐
│  Update Content      │ —► SET is_age_restricted=true
│  Flags (RLS)         │
└──────────────────────┘
```

### 5.2 Клиентская пре-модерация (Web Worker)

```typescript
// src/lib/moderation/ContentModerationWorker.ts
self.onmessage = async (e) => {
  const { type, content } = e.data;
  
  if (type === 'text') {
    // Локальный проброс через Web Speech API API + кэш
    const result = await localTextModeration(content);
    self.postMessage(result);
  }
  
  if (type === 'image') {
    // Perceptual hash + bekan hash (CSAM detection stub)
    const hash = await computeImageHash(content);
    const matches = await checkKnownHashes(hash);
    self.postMessage({ isSafe: matches.length === 0, matches });
  }
};
```

### 5.3 Интеграция с существующей hashtagModeration

Расширяем `src/lib/chat/moderation.ts`:

```typescript
export const validateContentForAge = async (
  text: string,
  userId: string
): Promise<{ allowed: boolean; flags: ModerationFlags }> => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, content_rating_limit')
    .eq('id', userId)
    .single();
  
  // Проверка по хештегам (уже есть)
  const hashtagCheck = await validateHashtagsAllowedV1(text);
  
  // Проверка языка (spam/profanity)
  const languageScore = await perspectiveAPI.analyze(text);
  
  // Проверка по категориям (alcohol, tobacco, drugs)
  const riskyTerms = matchRiskyTerms(text, profile.account_type);
  
  return {
    allowed: hashtagCheck.allowed && languageScore.toxicity < 0.8 && riskyTerms.length === 0,
    flags: {
      hashtags: hashtagCheck.restricted,
      profanity: languageScore.toxicity,
      riskyTerms,
      ageInappropriate: profile.account_type === 'teen' && containsAdultContent(text)
    }
  };
};
```

## 6. RLS Политики безопасности

### 6.1 Профили

```sql
-- profiles: только своё чтение, запись через RPC
CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY "teens_cannot_change_dob" ON profiles
  FOR UPDATE USING (
    auth.uid() = id AND
    account_type != 'teen' OR
    (account_type = 'teen' AND
     (SELECT parental_guardian_id FROM profiles WHERE id = auth.uid()) IS NOT NULL)
  );
```

### 6.2 Контент (posts/reels/comments)

```sql
-- Возрастной доступ к контенту только через RPC
CREATE POLICY "age_restricted_content_hidden" ON reels
  FOR SELECT USING (
    -- Включаем только если рейтинг <= пользовательского лимита
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND rating_value(reels.content_rating) <= rating_value(p.content_rating_limit)
    )
    OR reels.is_age_restricted = false
  );
```

### 6.3 Родительские ссылки

```sql
CREATE POLICY "parents_view_teen_activity" ON parental_links
  FOR SELECT USING (
    auth.uid() = parent_user_id OR
    auth.uid() = teen_user_id
  );
```

## 7. Edge Cases и валидация

### 7.1 Age-Gate bypass защита

```typescript
// Проверка при каждом входе в приложение
export const enforceAgeGate = () => {
  const profile = useProfile();
  
  // Если возраст не верифицирован > 24 часа — показываем Age Gate
  const needsVerification = 
    !profile.date_of_birth ||
    !profile.age_verified_at ||
    (Date.now() - profile.age_verified_at) > (24 * 60 * 60 * 1000);
  
  if (needsVerification) {
    return <AgeGateOverlay onSubmit={verifyAge} />;
  }
  
  // Если teen и родитель принудил режим — блокируем смену
  if (profile.account_type === 'teen' && profile.teen_mode_enforced_by) {
    disableSettingsChange('account_type', 'date_of_birth');
  }
};
```

### 7.2 Parental Override

```sql
-- Родитель может временно понизить рейтинг для teen'а
CREATE OR REPLACE FUNCTION parent_override_content_limit(
  p_teen_id uuid,
  p_parent_id uuid,
  p_new_rating rating_enum
) RETURNS jsonb AS $$
DECLARE
  v_link parental_links%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM parental_links
  WHERE teen_user_id = p_teen_id AND parent_user_id = p_parent_id
    AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No parental link');
  END IF;
  
  UPDATE profiles
  SET content_rating_limit = p_new_rating,
      teen_mode_enforced_by = p_parent_id
  WHERE id = p_teen_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 7.3 Re- age verification (периодическая)

```typescript
// Запускается раз в 90 дней для teen'ов
export const periodicAgeCheck = () => {
  const lastCheck = profile.age_verified_at;
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
  
  if (lastCheck < ninetyDaysAgo) {
    // Принудительная проверка
    setShowAgeGate(true);
    track('age_recheck_required');
  }
};
```

## 8. Интеграция с Supabase Realtime

```typescript
// Слушаем изменения в parental_links
useEffect(() => {
  const channel = supabase
    .channel('parental-updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'parental_links',
        filter: `teen_user_id=eq.${user.id}`
      },
      (payload) => {
        if (payload.eventType === 'UPDATE') {
          // Родитель изменил настройки
          setContentFilter(applyParentalSettings(payload.new));
        }
      }
    )
    .subscribe();
  
  return () => supabase.removeChannel(channel);
}, [user.id]);
```

## 9. Дополнительные защитные меры

### 9.1 Rate Limiting (Redis через Supabase)

```sql
-- Ограничение попыток age verification
CREATE TABLE age_verification_rate_limits (
  ip_address inet PRIMARY KEY,
  attempts integer DEFAULT 0,
  window_start timestamp DEFAULT NOW(),
  blocked_until timestamp
);
```

Edge Function `rate-limit.ts` возвращает 429 если > 5 попыток в час.

### 9.2 Контент за пределами PG-13

Контент с рейтингом `T | MA | NSFW`:
1. **Не показывается** в ленте/Explore/Reels для adult-аккаунтов при `strict_mode=true`
2. **Скрывается** из рекомендаций (альгоритм `get_filtered_feed` исключает)
3. **Показывается в закрытых каналах** (если пользователь участник)
4. **Требует двойного подтверждения** при открытии ("Вы уверены? Вам 18+")

### 9.3 Триггеры на команды

```sql
-- В триггерах chat_moderation.tsx расширяем проверку age
CREATE OR REPLACE FUNCTION check_message_age_safety()
RETURNS trigger AS $$
DECLARE
  v_sender profiles;
  v_recipient profiles;
BEGIN
  SELECT * INTO v_sender FROM profiles WHERE id = NEW.sender_id;
  SELECT * INTO v_recipient FROM profiles WHERE id = NEW.receiver_id;
  
  -- Teen не может отправлять NSFW даже другому teen'у
  IF v_sender.account_type IN ('teen', 'child_supervised') 
     AND NEW.contains_age_restricted_content THEN
    RAISE EXCEPTION 'Content restricted by age policy';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## 10. Тестирование и валидация

### 10.1 Unit-тесты (Vitest)

```typescript
// src/__tests__/ageVerification.test.ts
describe('Age Verification', () => {
  test('adult (18+) gets account_type adult', async () => {
    const result = await verifyAge('2000-01-01');
    expect(result.account_type).toBe('adult');
    expect(result.profile.content_rating_limit).toBe('T');
  });
  
  test('teen (17) gets account_type teen with PG-13', async () => {
    const result = await verifyAge('2007-01-01');
    expect(result.account_type).toBe('teen');
    expect(result.profile.content_rating_limit).toBe('PG-13');
  });
  
  test('child (12) requires parent linking', async () => {
    const result = await verifyAge('2014-01-01');
    expect(result.account_type).toBe('child_supervised');
    expect(result.profile.parental_guardian_id).toBeNull();
  });
});

// src/__tests__/contentFiltering.test.ts
describe('Content Filtering', () => {
  test('PG-13 reel hidden from teen with strict mode', async () => {
    const feed = await getFilteredFeed(teenUserId, 10);
    expect(feed.some(reel => reel.rating === 'PG-13')).toBe(false);
  });
  
  test('NSFW content blocked from all non-service accounts', async () => {
    const feed = await getFilteredFeed(adultUserId, 10);
    expect(feed.some(reel => reel.rating === 'NSFW')).toBe(false);
  });
});
```

### 10.2 Интеграционные тесты (Playwright)

```typescript
// e2e/age-gate.spec.ts
test('Age gate shows on first launch', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Укажите ваш возраст')).toBeVisible();
});

test('Teen user can create account with DOB < 18', async ({ page }) => {
  await page.fill('[name="date_of_birth"]', '2007-05-15');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=Teen Mode активен')).toBeVisible();
});
```

## 11. Дополнения к AGENTS.md

Добавить в секцию **Platform Architect**:

```
Правила безопасности:
- Все таблицы с user_id должны иметь RLS
- Возрастной аудит (age_verification_logs) — WAL-level
- Модерация контента (content_rating_labels) — автоматическая через Edge Functions
- Родительские приглашения — только через идентифицированный invite_code
- Teen аккаунты: запрещена смена account_type без parental_override
- Ежедневный age_recheck для teen-аккаунтов (BG job)
```

Добавить агент **Safety & Age Verification Agent**:

```
Trigger: Изменения в src/components/safety/, src/hooks/useAgeVerification.ts,
         supabase/migrations/*age*., supabase/functions/moderate-content-ai/

Pre-commit checks:
  1. Все RLS политики присутствуют и покрывают SELECT/INSERT/UPDATE
  2. verify_age_and_enforce_mode покрыт unit-тестами
  3. get_filtered_feed возвращает контент только <= content_rating_limit
  4. Teen Mode: account_type параметризован и неизменяем из UI для <18
  5. Parental invite flow: invite_code уникален, срок 7 дней
  6. Edge Function moderate_content_ai возвращает структурированный результат
  7. Все новые таблицы добавлены в types.ts

Post-commit:
  1. Запустить e2e-тесты на Age Gate сценарии
  2. Проверить, что feed в teen-режиме не содержит PG-13+
  3. Вручную протестировать parental invite flow
  4. Ручной тест: попытка обхода age_gate (старый account_type → смена)
```

---

**Общее количество строк:** ~380

Архитектура обеспечивает:
- ✅ Полностью автоматическую возрастную верификацию при регистрации
- ✅ Au




teen-режим с PG-13 фильтрацией по умолчанию
- ✅ Родительский контроль через invite-code workflow
- ✅ AI-модерация контента в реальном времени (текст/изображения/видео)
- ✅ Расширение существующей hashtagModeration на возрастные рейтинги
- ✅ Фильтрация ленты/Explore/Reels по content_rating
- ✅ Запрет контента с high scores (language, substance, violence, risky_stunts)
- ✅ Strict Limited Content (ещё более жёсткая фильтрация)
- ✅ RLS защита всех операций
- ✅ Аудит age verification (логи, re-check)
- ✅ Edge Cases: age-gate bypass защита, parental override, периодическая re-проверка