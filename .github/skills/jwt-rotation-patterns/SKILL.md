---
name: jwt-rotation-patterns
description: "JWT Rotation: refresh token ротация, revocation, Supabase Auth, silent refresh, session management. Use when: JWT refresh, ротация токенов, отзыв токена, logout all devices, session management, invalid token."
argument-hint: "[сценарий: refresh | revocation | logout-all | audit]"
---

# JWT Rotation Patterns — Ротация JWT токенов

---

## Supabase Auth — автоматический refresh

```typescript
// Supabase управляет refresh автоматически
// Клиент сам обновляет access_token перед истечением

// Слушать изменения сессии
supabase.auth.onAuthStateChange((event, session) => {
  switch (event) {
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
      // Обновить store с новым session
      useAuthStore.getState().setSession(session);
      break;
    case 'SIGNED_OUT':
      useAuthStore.getState().clearSession();
      navigate('/login');
      break;
    case 'USER_UPDATED':
      useAuthStore.getState().setSession(session);
      break;
  }
});

// Получить текущую сессию с auto-refresh
async function getValidSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error('Не авторизован');
  return session;
}
```

---

## Logout со всех устройств

```typescript
// Revoke всех refresh токенов пользователя
async function logoutAllDevices() {
  // Supabase: invalidate refresh token + все сессии
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) throw error;
  // После этого: все устройства получат SIGNED_OUT при следующем запросе
}

// Logout только текущего устройства
async function logoutCurrentDevice() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
```

---

## Edge Function — проверка токена

```typescript
// supabase/functions/_shared/auth.ts
export async function requireAuth(req: Request): Promise<{ userId: string; role: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw { status: 401, message: 'Missing Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  // Верификация через Supabase (проверяет подпись + истечение)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw { status: 401, message: 'Invalid or expired token' };
  }

  return {
    userId: user.id,
    role: user.role ?? 'authenticated',
  };
}
```

---

## Хранение токенов (fail-secure)

```typescript
// Supabase хранит токены в localStorage по умолчанию
// Для повышения безопасности — использовать secure memory storage

// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: sessionStorage,          // Session storage (закрывается с вкладкой)
      persistSession: true,
      autoRefreshToken: true,           // Обязательно!
      detectSessionInUrl: true,         // Для OAuth callbacks
    },
  }
);

// НИКОГДА не хранить service_role key на клиенте
// НИКОГДА не хранить JWT в cookie без httpOnly + secure флагов
```

---

## Мониторинг истечения токенов

```typescript
// Предупредить пользователя за 5 минут до истечения сессии
export function useSessionExpiry() {
  const { data: { session } } = useQuery({
    queryKey: ['session'],
    queryFn: () => supabase.auth.getSession().then(r => r.data.session),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!session?.expires_at) return;
    const expiresAt = session.expires_at * 1000; // unix → ms
    const warnAt = expiresAt - 5 * 60 * 1000;   // за 5 минут
    const timeout = warnAt - Date.now();

    if (timeout < 0) return;
    const timer = setTimeout(() => {
      toast.warning('Сессия истекает через 5 минут. Сохраните работу.');
    }, timeout);

    return () => clearTimeout(timer);
  }, [session?.expires_at]);
}
```

---

## Чеклист

- [ ] `autoRefreshToken: true` в Supabase клиенте
- [ ] `onAuthStateChange` — обрабатывает TOKEN_REFRESHED и SIGNED_OUT
- [ ] Edge Functions проверяют токен через `supabase.auth.getUser(token)` (не decode!)
- [ ] service_role key ТОЛЬКО на сервере (Edge Functions, backend)
- [ ] Logout global при подозрении на компрометацию
- [ ] sessionStorage для более безопасного хранения (vs localStorage)
