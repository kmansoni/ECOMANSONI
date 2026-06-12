# Аудит профиля и safety-слоя

**Дата:** 2026-06-12  
**Scope:** активный файл `src/stores/profileStore.ts` + связанные потребители и репозитории профиля/safety.  
**Глубина:** последовательный аудит строк, типов, Supabase-запросов, RLS, RPC, потребителей и валидация TypeScript.  
**Отчётный файл:** `docs/audit/2026-06-12-profile-store-audit.md`

## 1. Резюме

### 1.1. Критические находки

| # | Severity | Область | Проблема | Последствие |
|---|----------|---------|----------|-------------|
| 1 | 🔴 Critical | RLS `profiles` | Политика `"Users can view all profiles"` даёт `SELECT USING (true)` всем, а политика `"Users read own age data"` добавляется через OR, а не ограничивает столбцы. | Любой авторизованный пользователь потенциально читает чужие `age_tier`, `date_of_birth`, `parental_guardian_id`, `content_rating_limit`, `strict_limited_content`. |
| 2 | 🔴 Critical | Миграции safety | В `parental_links.relationship` задан `DEFAULT 'parent'`, но enum содержит только `mother`, `father`, `guardian`, `other`. | Миграция может упасть на создании таблицы. |
| 3 | 🔴 Critical | RPC safety | Фронт вызывает `verify_age_and_enforce_mode`, `create_parental_invite`, `accept_parental_invite`, `parent_override_content_limit`, но в `supabase/migrations` и `src` RPC не найдены. | Runtime-ошибки Supabase RPC; age verification и parental controls неработоспособны. |
| 4 | 🔴 Critical | RLS DOB | Политика `"Users update own DOB"` проверяет `auth.uid() = id`, но `profiles.id` — это UUID профиля, а не `auth.users.id`; корректное поле — `user_id`. | Пользователь не сможет обновить `date_of_birth` даже для своего профиля. |
| 5 | 🔴 Critical | `profileRepository.fetchProfileByUserId` | Публичный профиль загружается через `.select('*')`. | При текущем RLS-дизайне есть риск утечки sensitive profile columns. |
| 6 | 🔴 Critical | `profileStore.updateProfile` | После `.update(...).eq(...).select()` возвращается только изменённый набор колонок, не полная строка профиля. | Zustand-состояние теряет поля профиля после сохранения. |

### 1.2. Высокие находки

| # | Severity | Область | Проблема |
|---|----------|---------|----------|
| 7 | 🟠 High | `profileStore` | `catch (err: any)` в `refreshProfile` и `updateProfile`. |
| 8 | 🟠 High | `profileStore` | `onAuthStateChange` подписывается на уровне модуля без cleanup; при HMR/повторной загрузке возможны дублирующие подписки. |
| 9 | 🟠 High | `profileStore` | `refreshProfile()` вызывается без `await`/`catch`, возможна необработанная rejection. |
| 10 | 🟠 High | `profileStore` | `updateProfile` принимает `Partial<Profile>`, то есть клиент может попытаться обновить системные поля. |
| 11 | 🟠 High | `useAgeVerification` | `profile?.id` передаётся в RPC; если профиль ещё не загружен, `p_user_id` будет `null`. |
| 12 | 🟠 High | `useAgeVerification` | `p_ip_address: undefined` передаётся в RPC, хотя таблица `age_verification_logs.ip_address INET NOT NULL`. |
| 13 | 🟠 High | `SafetyContext` | Realtime-подписка создаётся с `profile?.id`, который может быть `undefined`. |
| 14 | 🟠 High | `ParentalControlsPage` | Используется `profile!.id` без проверки `profile`, и UI обновляется до успешного RPC. |
| 15 | 🟠 High | `useParentalControls` | Значение `'parent'` не входит в тип и enum relationship. |
| 16 | 🟠 High | Типы Supabase | Сгенерированные типы не содержат новые safety-колонки/enums, хотя миграции их добавляют. |

### 1.3. Средние и низкие находки

| # | Severity | Область | Проблема |
|---|----------|---------|----------|
| 17 | 🟡 Medium | `SafetyContext` | `content_rating_limit` приводится через `as any` без runtime-валидации. |
| 18 | 🟡 Medium | `useParentalControls` | `links` типизирован как `any[]`; ошибки RPC не пробрасываются в `fetchLinks`/`revokeLink`. |
| 19 | 🟡 Medium | `useProfile` | Fallback для отсутствующей строки профиля использует `user?.user_metadata`, то есть данные текущего зрителя, а не целевого пользователя. |
| 20 | 🟡 Medium | `useProfile` | `useEffect`-зависимости включают весь объект `user`, что может вызывать лишние refetch. |
| 21 | 🟡 Medium | `profileRepository` | Fallback по `display_name` через `ilike` без уникальности может вернуть случайный профиль. |
| 22 | 🟡 Medium | `profileRepository` | `syncAuthMetadata` игнорирует возможную ошибку `supabase.auth.updateUser`. |
| 23 | 🟡 Low | `profileStore` | Дублирование состояния профиля: `profileStore` и `useProfile` хранят профиль в разных местах. |
| 24 | 🟡 Low | `profileStore` | Комментарий `// Initialize profile on mount` неточный: инициализация происходит на auth state change, не на mount. |

## 2. Проверенные файлы

| Файл | Проверка |
|------|----------|
| `src/stores/profileStore.ts` | Полный проход по 79 строкам, Zustand-state, Supabase-запросы, auth listener. |
| `src/hooks/useProfile.tsx` | Полный проход по 348 строкам, profile loading/follow/update/posts. |
| `src/repositories/profileRepository.ts` | Полный проход по 135 строкам, Supabase queries, type mapping. |
| `src/contexts/SafetyContext.tsx` | Полный проход по 106 строкам, profile-driven safety settings, realtime. |
| `src/hooks/useAgeVerification.ts` | Полный проход по 38 строкам, RPC и loading state. |
| `src/hooks/useParentalControls.ts` | Полный проход по 91 строкам, parental links, RPC, typing. |
| `src/pages/settings/ParentalControlsPage.tsx` | Полный проход по 263 строкам, UI actions, relationship enum. |
| `supabase/migrations/20260118165346_f9442bcd-8640-4f1d-a6b7-00ec1b504555.sql` | Проверены базовые RLS для `profiles`. |
| `supabase/migrations/20260513000000_safety_age_verification.sql` | Проверены safety-колонки, enum, RLS, logs. |
| `src/integrations/supabase/types.ts` | Проверено наличие safety-полей в generated types. |

## 3. Детальный отчёт по файлам

### 3.1. `src/stores/profileStore.ts`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 5-15 | TypeScript / drift | 🟠 High | `ExtendedProfile` вручную добавляет safety-поля, потому что generated Supabase types не содержат новые колонки/enums. Это создаёт риск расхождения типов и runtime. |
| 2 | 21 | State contract | 🟡 Medium | `refreshProfile: () => Promise<void>` не описывает результат: success/failure, no-user case, stale request. |
| 3 | 30-49 | Error handling | 🟠 High | `catch (err: any)` теряет type safety. Нужно `unknown` + helper `getErrorMessage`. |
| 4 | 33 | Auth | 🟡 Low | `getUser()` может завершиться ошибкой; текущий код обрабатывает только общий `catch`, без явного clearing state. |
| 5 | 39-43 | Supabase query | 🟡 Low | `.select('*')` для own profile допустим, но лучше явно перечислять поля, чтобы не тащить sensitive columns в UI-стор. |
| 6 | 46 | State consistency | 🟠 High | `updateProfile` после `.select()` получает только обновлённые поля и перезаписывает `profile`, теряя остальные поля. |
| 7 | 52-69 | API contract | 🟠 High | `updateProfile` принимает `Partial<Profile>`, включая `user_id`, `verified`, `created_at`, `updated_at`. Нужно разрешать только editable fields. |
| 8 | 66 | TypeScript | 🟠 High | `catch (err: any)` в `updateProfile`. |
| 9 | 72-79 | Side effects | 🟠 High | Auth listener зарегистрирован на уровне модуля без cleanup. При HMR/повторной инициализации возможны дублирующие refresh-запросы. |
| 10 | 75 | Error handling | 🟠 High | `refreshProfile()` вызывается без `await`/`catch`; rejection может стать unhandled. |
| 11 | 77 | State cleanup | 🟡 Medium | На `SIGNED_OUT` очищается только `profile`; `isLoading` и `error` могут остаться stale. |
| 12 | 72 | Documentation | 🟡 Low | Комментарий `Initialize profile on mount` неточный: код слушает auth state changes, а не mount. |

#### Рекомендованный минимальный патч для `profileStore`

```ts
type EditableProfileFields = Pick<
  Profile,
  'display_name' | 'username' | 'bio' | 'website' | 'avatar_url'
>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to access profile';
}

// updateProfile:
const { data, error } = await supabase
  .from('profiles')
  .update(updates)
  .eq('id', profile.id)
  .select('*')
  .single();

if (error) throw error;
set({ profile: data, error: null });
```

```ts
let authUnsubscribe: (() => void) | undefined;

export function initProfileAuthSync() {
  if (authUnsubscribe) return authUnsubscribe;

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      void useProfileStore.getState().refreshProfile().catch((error) => {
        useProfileStore.setState({ error: toErrorMessage(error), isLoading: false });
      });
    }

    if (event === 'SIGNED_OUT') {
      useProfileStore.setState({ profile: null, isLoading: false, error: null });
    }
  });

  authUnsubscribe = subscription.unsubscribe;
  return authUnsubscribe;
}
```

### 3.2. `src/hooks/useProfile.tsx`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 69-87 | Data correctness | 🟡 Medium | Если публичный профиль не найден, fallback берёт `display_name` и `avatar_url` из `user` текущего зрителя. Это неверная семантика для чужого профиля. |
| 2 | 106 | React hooks | 🟡 Low | Зависимость `[targetUserId, user]` слишком широкая: новый объект `user` может запускать лишний refetch. |
| 3 | 142-154 | API contract | 🟡 Low | `updateProfileCb` зависит только от `user`, но логика ограничивает поля через тип. Хорошо, но лучше вынести allowlist. |
| 4 | 213 | React hooks | 🟡 Low | Зависимость `[username, user]` слишком широкая. |
| 5 | 298-335 | Error handling | 🟡 Medium | Fallback-загрузка постов срабатывает на любую `joinError`, включая не relation error. Это может скрывать реальные ошибки. |
| 6 | 337-339 | Error handling | 🟡 Medium | `useUserPosts` логирует ошибку, но не хранит `error` state. UI не видит failure. |

### 3.3. `src/repositories/profileRepository.ts`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 34-47 | TypeScript | 🟡 Low | `status_emoji` и `status_sticker_url` приводятся через `(row as Record<string, unknown>)`, хотя поля уже есть в generated types. |
| 2 | 52-61 | Supabase query | 🟠 High | `fetchProfileByUserId` делает `.select('*')` для публичного профиля. Нужно явно выбирать public-safe поля. |
| 3 | 70-89 | Data correctness | 🟡 Medium | Поиск по `display_name` через `ilike` не уникален и может вернуть не тот профиль. |
| 4 | 109-116 | API contract | 🟡 Low | `updateProfile` обновляет по `user_id`, но не возвращает обновлённую строку. Для UI лучше `.select('*').single()`. |
| 5 | 118-132 | Error handling | 🟡 Low | `syncAuthMetadata` игнорирует ошибку `updateUser`; caller узнает только об ошибке профиля, не auth metadata. |

### 3.4. `src/contexts/SafetyContext.tsx`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 38-40 | Safety state | 🟡 Low | `ageTier` и `isAgeVerified` корректно берутся из профиля, но зависят от актуальности `profileStore.refreshProfile`. |
| 2 | 47 | TypeScript | 🟡 Medium | `profile.content_rating_limit as any` обходит проверку union. |
| 3 | 44-49 | Validation | 🟡 Medium | Нет runtime-валидации `content_rating_limit` перед записью в `ContentFilter.maxRating`. |
| 4 | 58-63 | Realtime | 🟠 High | Подписка создаётся с `profile?.id`; при `undefined` фильтр может стать невалидным. |
| 5 | 68-70 | Runtime safety | 🟡 Medium | `payload.new.content_rating_limit` принимается без проверки допустимого rating. |
| 6 | 81-84 | API contract | 🟡 Low | `refreshSafetySettings` просто делегирует `refreshProfile`, без явной обработки ошибки. |

### 3.5. `src/hooks/useAgeVerification.ts`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 9 | API contract | 🟠 High | `verifyAge` может быть вызван до загрузки профиля; `profile?.id` будет `null`. |
| 2 | 12-18 | Backend contract | 🔴 Critical | RPC `verify_age_and_enforce_mode` не найден в миграциях/коде. |
| 3 | 18 | Data contract | 🟠 High | `p_ip_address: undefined` конфликтует с `age_verification_logs.ip_address INET NOT NULL`, если RPC пишет лог. |
| 4 | 19-22 | Logging | 🟡 Medium | Используется `console.error`, проект предусматривает `logger`. |
| 5 | 30 | TypeScript | 🟠 High | `catch (err: any)` теряет type safety. |
| 6 | 31-35 | React hooks | 🟡 Low | Зависимость `profile?.id` означает, что после refresh RPC callback пересоздаётся. |

### 3.6. `src/hooks/useParentalControls.ts`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 6 | TypeScript | 🟡 Medium | `useState<any[]>([])` теряет тип parental link. |
| 2 | 8 | Type mismatch | 🟠 High | Default `relationship = 'parent'` не входит в union `'mother' | 'father' | 'guardian' | 'other'`. |
| 3 | 11-18 | Backend contract | 🔴 Critical | RPC `create_parental_invite` не найден. |
| 4 | 19-21 | Logging | 🟡 Medium | `console.error` вместо `logger`. |
| 5 | 27-34 | Backend contract | 🔴 Critical | RPC `accept_parental_invite` не найден. |
| 6 | 38-40 | Logging | 🟡 Medium | `console.error` вместо `logger`. |
| 7 | 46-56 | Null safety | 🟠 High | `userId` может быть `undefined`; запрос строится без guard. |
| 8 | 59-68 | Error handling | 🟡 Medium | `revokeLink` не пробрасывает ошибку и не возвращает результат. |
| 9 | 70-79 | Backend contract | 🔴 Critical | RPC `parent_override_content_limit` не найден. |

### 3.7. `src/pages/settings/ParentalControlsPage.tsx`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 50, 58, 69 | TypeScript | 🟡 Medium | `catch (err: any)` в UI handlers. |
| 2 | 68 | Null safety | 🟠 High | `profile!.id` используется без проверки `profile`; условие проверяет только `parentalSettings?.parentalGuardianId`. |
| 3 | 126 | Type mismatch | 🟠 High | `handleSendInvite('parent')` не соответствует допустимым relationship values. |
| 4 | 218 | Type mismatch | 🟠 High | Кнопка также вызывает `handleSendInvite('parent')`. |
| 5 | 249-253 | UI consistency | 🟡 Medium | `newLimit` обновляется до успешного RPC. При ошибке UI показывает несохранённое значение. |
| 6 | 59 | Async sequencing | 🟡 Low | `fetchLinks()` после `acceptInvite` не awaited; возможны stale UI states. |

### 3.8. `supabase/migrations/20260118165346_f9442bcd-8640-4f1d-a6b7-00ec1b504555.sql`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 244-247 | RLS | 🔴 Critical | `"Users can view all profiles"` даёт всем authenticated `SELECT` по `profiles`. |
| 2 | 246-247 | RLS | 🟡 Low | Обновление профиля проверяет `auth.uid() = user_id`, это корректно для базового профиля. |

### 3.9. `supabase/migrations/20260513000000_safety_age_verification.sql`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 13-21 | Schema | 🟡 Low | `relationship_type` не содержит `'parent'`, но ниже используется default `'parent'`. |
| 2 | 27-39 | Schema | 🟡 Low | Safety-колонки добавлены, но generated types не обновлены. |
| 3 | 51-53 | Validation | 🟡 Low | `date_of_birth < CURRENT_DATE` корректно запрещает будущие даты. |
| 4 | 58-78 | Schema | 🔴 Critical | `relationship relationship_type NOT NULL DEFAULT 'parent'` невалиден относительно enum. |
| 5 | 181-185 | RLS | 🔴 Critical | `"Users read own age data"` использует `auth.uid() = id`, но должно быть `auth.uid() = user_id`. |
| 6 | 186-196 | RLS | 🔴 Critical | `"Users update own DOB"` также использует `auth.uid() = id`, из-за чего policy не сработает для собственного профиля. |
| 7 | 179-185 | RLS design | 🔴 Critical | RLS не является column-level. Эта политика не ограничивает age columns при наличии другой SELECT policy `true`. |
| 8 | 224-234 | RLS | 🟡 Medium | Content rating labels доступны всем authenticated/anon, но записываются только service_role. Это допустимо, если ratings публичные. |
| 9 | 236-244 | RLS | 🟡 Low | Age verification logs читаются только пользователем, пишутся service_role. Корректно, если RPC пишет логи как service_role. |

### 3.10. `src/integrations/supabase/types.ts`

| # | Строка | Категория | Severity | Проблема |
|---|--------|-----------|----------|----------|
| 1 | 15834-15952 | Generated types | 🟠 High | Типы `profiles` не содержат `date_of_birth`, `age_verified_at`, `age_tier`, `parental_guardian_id`, `teen_mode_enforced_by`, `is_teen_mode_locked`, `content_rating_limit`, `strict_limited_content`, `restricted_categories`, `safety_mode_active`, `last_age_check_ip`, `age_verification_attempts`. |
| 2 | 15834-15952 | Generated enums | 🟠 High | Не найдены generated enums `age_tier`, `content_rating`, `relationship_type`, `verification_method`, `parental_link_status`, `content_type`, `label_source`, `age_verification_type`, `verification_result`. |

## 4. Cross-file анализ

### 4.1. Data flow

1. `profileStore.refreshProfile()` загружает профиль текущего пользователя по `auth.getUser()` → `profiles.user_id`.
2. `SafetyContext`, `useAgeVerification`, `useTeenMode`, `ParentalControlsPage` читают safety-поля из `profileStore`.
3. `useProfile` и `profileRepository` используют отдельный локальный React state для страниц профиля.
4. `useAgeVerification.verifyAge()` вызывает отсутствующий RPC `verify_age_and_enforce_mode`.
5. `useParentalControls` вызывает отсутствующие RPC для parental links и override rating.
6. `ParentalControlsPage` передаёт недопустимое значение `'parent'` в relationship API.

### 4.2. Import chains

В audited-файлах локальные `@/...` импорты существуют:

| Import | Файл | Статус |
|--------|------|--------|
| `@/stores/profileStore` | `SafetyContext`, `useAgeVerification`, `ParentalControlsPage` | Существует |
| `@/repositories/profileRepository` | `useProfile` | Существует |
| `@/lib/supabase` | `profileStore`, `useAgeVerification`, `SafetyContext` | Существует |
| `@/integrations/supabase/client` | `useProfile`, `profileRepository` | Существует |
| `@/hooks/useTeenMode` | `SafetyContext`, `ParentalControlsPage` | Существует |
| `@/hooks/useParentalControls` | `ParentalControlsPage` | Существует |

Broken local imports в audited-файлах не найдены. Глобальный TypeScript check выявил множество ошибок в других модулях, не входящих в данный scope.

### 4.3. RLS/security conclusion

Текущая комбинация политик небезопасна для age/safety-данных:

```sql
-- Сейчас
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users read own age data" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
```

Проблемы:

1. RLS-политики одного уровня доступа объединяются логическим `OR`.
2. Column-level restriction в PostgreSQL/Supabase RLS таким способом не работает.
3. `auth.uid() = id` сравнивает auth user id с profile id, а не с `profiles.user_id`.

Безопасная модель должна разделять public-safe профиль и sensitive profile columns. На уровне Supabase это обычно решается:

- view для публичного профиля без sensitive columns;
- отдельные RLS policies для sensitive fields;
- RPC/security definer для age verification;
- generated types, синхронизированные с миграциями.

## 5. Валидация

### 5.1. TypeScript

Команда:

```bash
npm run typecheck -- --pretty false --incremental false
```

Результат: **не прошла**. Ошибки находятся в других модулях проекта; `src/stores/profileStore.ts` не попал в список ошибок typecheck.

Найденные ошибки в audited-related файлах:

| Файл | Ошибка |
|------|--------|
| `src/hooks/useParentalControls.ts:8` | `'parent'` не входит в union relationship. |
| `src/pages/settings/ParentalControlsPage.tsx:126` | `'parent'` не входит в union relationship. |
| `src/pages/settings/ParentalControlsPage.tsx:218` | `'parent'` не входит в union relationship. |

### 5.2. Поиск RPC

Команда/поиск:

```bash
grep -R "verify_age_and_enforce_mode\|parent_override_content_limit\|create_parental_invite\|accept_parental_invite" -n supabase src
```

Результат: RPC упоминаются только во frontend-коде, определений в миграциях/коде не найдено.

### 5.3. Поиск sensitive-полей в generated types

Проверены `src/integrations/supabase/types.ts` вокруг `profiles`.

Результат: safety-поля из миграции `20260513000000_safety_age_verification.sql` отсутствуют в generated types.

## 6. Приоритизированный план исправлений

### P0 — блокирует production

1. Исправить RLS для `profiles`:
   - заменить `auth.uid() = id` на `auth.uid() = user_id`;
   - убрать `SELECT USING (true)` для sensitive columns;
   - создать public-safe view или селект только public-safe полей.
2. Исправить `relationship_type` default:
   - заменить `'parent'` на `'other'` или добавить enum value, если продукт действительно требует `parent`.
3. Добавить missing RPC:
   - `verify_age_and_enforce_mode`;
   - `create_parental_invite`;
   - `accept_parental_invite`;
   - `parent_override_content_limit`.
4. Обновить generated Supabase types после миграций.

### P1 — высокий риск runtime/state corruption

5. Исправить `profileStore.updateProfile`:
   - разрешить только editable fields;
   - делать `.select('*').single()`;
   - использовать `unknown` в catch.
6. Исправить auth listener:
   - вынести subscription в инициализируемую функцию;
   - добавить cleanup;
   - обрабатывать rejection.
7. Исправить `ParentalControlsPage`:
   - убрать `'parent'`;
   - проверять `profile?.id`;
   - обновлять `newLimit` только после успешного RPC.
8. Исправить `useParentalControls`:
   - типизировать `links`;
   - добавить guards для `userId`;
   - пробрасывать ошибки.

### P2 — качество и поддерживаемость

9. Убрать `console.error` из `useAgeVerification` и `useParentalControls`, использовать `logger`.
10. Заменить fallback `display_name` в `useProfile` на безопасное поведение: если профиль не найден, показывать skeleton/not found, а не данные текущего зрителя.
11. Заменить `.select('*')` в публичных profile queries на явный public-safe список.
12. Добавить runtime-валидацию rating в `SafetyContext`.
13. Убрать `as any` в `SafetyContext` и других audited-файлах.
14. Разделить текущий user profile и public profile state, чтобы избежать drift между `profileStore` и `useProfile`.

## 7. Итоговая оценка

| Область | Оценка |
|---------|--------|
| Активный `profileStore.ts` | Требует исправлений P1: unsafe catch, state corruption после update, auth listener без cleanup. |
| Safety/profile subsystem | Не готов к production: критические RLS/RPC/schema issues. |
| Родственные UI/hooks | Есть type/runtime ошибки: `'parent'`, missing profile guard, stale UI update. |
| Generated types | Устарели относительно safety-миграций. |
| Broken local imports в scope | Не найдены. |
| Глобальный typecheck проекта | Не проходит из-за большого количества ошибок вне scope. |

## 8. Рекомендуемый следующий шаг

Начать исправления с P0: RLS + missing RPC + relationship enum. Без этих изменений age verification и parental controls нельзя считать безопасными или работоспособными.
