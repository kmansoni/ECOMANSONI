---
name: authentication-failure-audit
description: "Аудит OWASP A07 Authentication Failures: JWT уязвимости, brute force, OTP bypass, session management, credential stuffing. Use when: A07, authentication, JWT, сессии, brute force, OTP, вход в систему."
argument-hint: "[компонент: jwt | otp | session | all]"
user-invocable: true
---

# Authentication Failure Audit — OWASP A07:2025

Ошибки аутентификации дают злоумышленнику доступ под чужой учётной записью.

---

## Вектор 1: JWT Уязвимости

```bash
# Поиск JWT обработки
grep -rn "jwt\|JWT\|jsonwebtoken\|jose\|decode\|verify" src/ supabase/ --include="*.ts"
grep -rn "alg.*none\|algorithm.*none" src/ supabase/  # уязвимость "none" algorithm
grep -rn "\.decode(\|parseJwt" src/  # decode без верификации?
```

### Критические проблемы JWT

```typescript
// ❌ КРИТИЧНО — decode без верификации
const payload = JSON.parse(atob(token.split('.')[1]));
// Злоумышленник может подменить payload!

// ✅ БЕЗОПАСНО — Supabase Auth верифицирует
const { data: { user }, error } = await supabase.auth.getUser();
// Supabase Auth сервер проверяет подпись JWT

// ❌ ОПАСНО — используем данные напрямую из JWT без верификации
const userId = parseJwt(token).sub;  // не верифицировано!

// ✅ В Edge Function — верификация через SDK
const userClient = createClient(url, anon, { global: { headers: { Authorization: bearer } } });
const { data: { user } } = await userClient.auth.getUser();
const userId = user?.id;  // верифицировано
```

**Чеклист JWT:**
- [ ] Нет ручного decode без verify
- [ ] Нет алгоритма "none"
- [ ] JWT expiry настроен (рекомендуется: access=15min, refresh=7d)
- [ ] JWT не передаётся в URL (только в Authorization header)
- [ ] Не храним JWT в localStorage (риск XSS) — предпочтительно httpOnly cookie или memory

---

## Вектор 2: Brute Force Protection

```bash
# Rate limiting на auth endpoints
grep -rn "signIn\|signUp\|sendOTP\|verifyOTP" supabase/functions/ src/ --include="*.ts"
grep -rn "rate_limit\|rateLimit\|cooldown\|attempts" src/ supabase/functions/ --include="*.ts"
```

### Supabase Auth Rate Limits

Supabase имеет встроенный rate limiting, но проверить настройки:
- Email OTP: max 5 запросов в час по умолчанию
- Password reset: max 3 в час
- Signup: настраивается в dashboard

**Собственный rate limiting для OTP:**

```typescript
// ✅ Дополнительный rate limiting через RLS/RPC
async function checkOTPRateLimit(phone: string): Promise<boolean> {
  const { data } = await supabase.rpc('check_otp_rate_limit', { p_phone: phone });
  return data?.allowed ?? false;
}
```

```sql
-- SQL rate limiting функция
CREATE OR REPLACE FUNCTION check_otp_rate_limit(p_phone text)
RETURNS jsonb AS $$
DECLARE
  attempt_count int;
BEGIN
  SELECT COUNT(*) INTO attempt_count
  FROM otp_attempts
  WHERE phone = p_phone
  AND created_at > NOW() - INTERVAL '15 minutes';

  IF attempt_count >= 5 THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after', 900);
  END IF;

  INSERT INTO otp_attempts (phone) VALUES (p_phone);
  RETURN jsonb_build_object('allowed', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Чеклист Brute Force:**
- [ ] Rate limiting на /auth/v1/otp (Supabase настройки)
- [ ] Rate limiting на login: lockout после 5-10 неудач
- [ ] IP-based и account-based rate limiting
- [ ] Нет verbose ошибок "Неверный пароль" vs "Пользователь не найден"
- [ ] CAPTCHA на регистрации (Turnstile/hCaptcha)

---

## Вектор 3: OTP Security

```bash
grep -rn "otp\|OTP\|one.time\|sendOTP\|verifyOTP" src/ supabase/ --include="*.ts"
```

**Чеклист OTP:**
- [ ] Короткие коды (6 цифр): срок действия ≤ 10 минут
- [ ] OTP одноразовый: после использования инвалидируется
- [ ] Нет OTP в URL (только POST body)
- [ ] Нет OTP в client-side localStorage
- [ ] Email-based OTP: не раскрывать "такой email не зарегистрирован"
- [ ] Суpabase magic link: срок действия настроен

---

## Вектор 4: Session Management

```bash
grep -rn "session\|Session\|signOut\|logout" src/ --include="*.ts" --include="*.tsx"
grep -rn "supabase\.auth\.signOut\|clearSession" src/
```

### Уязвимые паттерны

```typescript
// ❌ Неполный logout
const logout = () => {
  localStorage.removeItem('user');  // только удаляем local state
  navigate('/login');               // JWT всё ещё валиден на сервере!
};

// ✅ Полный logout
const logout = async () => {
  await supabase.auth.signOut();  // инвалидирует refresh token
  // + очистить E2EE ключи
  clearE2EEKeys();
  // + очистить кэш TanStack Query
  queryClient.clear();
  navigate('/login');
};
```

**Чеклист Session:**
- [ ] signOut инвалидирует refresh token на сервере
- [ ] E2EE ключи очищаются при logout
- [ ] TanStack Query кэш очищается при logout
- [ ] Zustand store очищается при logout
- [ ] Автоматический logout при неактивности (опционально, для mobile)
- [ ] "Logout everywhere" функция (для параноидальных пользователей)

---

## Вектор 5: Password Security

```bash
grep -rn "password\|Password" src/ supabase/ --include="*.ts" | grep -v "test\|spec\|mock"
grep -rn "weak\|short.*pass\|min.*4\|min.*5\|min.*6" src/
```

**Чеклист Password:**
- [ ] Минимальная длина ≥ 8 символов
- [ ] Supabase Auth: password policy настроена
- [ ] Нет hardcoded credentials в коде или тестах (except fake test data)
- [ ] Password reset ссылки одноразовые с TTL

---

## Вектор 6: Multi-Account Issues

```bash
# Проверить multi-account switching
grep -rn "switchAccount\|addAccount\|accounts\." src/ --include="*.ts"
# Из /memories/repo/multi-account-switch-consistency.md
```

**Чеклист Multi-Account:**
- [ ] Смена аккаунта: корректно очищает данные предыдущего
- [ ] Нет утечки данных одного аккаунта в другой
- [ ] Storage/cache изолированы по userId

---

## Итоговая матрица

| Вектор | Статус | Severity |
|---|---|---|
| JWT decode без verify | ✅/🔴 | CRITICAL |
| Brute force rate limit | ✅/🔴 | HIGH |
| OTP срок/одноразовость | ✅/🔴 | HIGH |
| Неполный logout | ✅/🔴 | HIGH |
| Слабый password policy | ✅/🔴 | MEDIUM |
| Session timeout | ✅/🟡 | LOW |
