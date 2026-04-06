# OAuth2 Implementation

## Описание

Реализация OAuth2 Authorization Code Flow с PKCE для аутентификации через внешних провайдеров.

## Когда использовать

- "Войти через Google / GitHub / Apple"
- Интеграция с внешними API от имени пользователя
- SSO для корпоративных клиентов
- Доступ к данным пользователя на стороннем сервисе

## Authorization Code Flow + PKCE

```
Клиент                  Auth Server              Resource Server
  │                          │                         │
  │── 1. /authorize ────────►│                         │
  │   (code_challenge)       │                         │
  │◄── 2. redirect + code ──│                         │
  │                          │                         │
  │── 3. /token ────────────►│                         │
  │   (code + code_verifier) │                         │
  │◄── 4. access_token ─────│                         │
  │                          │                         │
  │── 5. API call ──────────────────────────────────►│
  │   (Bearer token)         │                         │
  │◄── 6. data ──────────────────────────────────────│
```

## Supabase OAuth (встроенный)

```typescript
// Вход через Google
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',       // refresh token
        prompt: 'consent',            // всегда показывать consent screen
      },
    },
  });
  if (error) throw error;
}

// Обработка callback
// src/pages/auth/callback.tsx
function AuthCallback() {
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/dashboard');
      }
    });
  }, []);

  return <LoadingSpinner />;
}
```

## PKCE — генерация (для кастомного OAuth)

```typescript
async function generatePKCE() {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { verifier, challenge };
}
```

## Хранение токенов

```typescript
// Supabase хранит токены автоматически в localStorage/SecureStorage
// Для кастомных OAuth провайдеров:

// НЕ хранить в localStorage (XSS уязвимость)
// Хранить в httpOnly cookie или Supabase vault

// Серверная сторона — зашифровать в БД
async function storeProviderTokens(userId: string, provider: string, tokens: OAuthTokens) {
  const { error } = await supabaseAdmin
    .from('user_oauth_tokens')
    .upsert({
      user_id: userId,
      provider,
      access_token: encrypt(tokens.access_token),
      refresh_token: encrypt(tokens.refresh_token),
      expires_at: tokens.expires_at,
    });
  if (error) throw error;
}
```

## Refresh Token Flow

```typescript
async function refreshProviderToken(userId: string, provider: string) {
  const { data: stored, error } = await supabaseAdmin
    .from('user_oauth_tokens')
    .select('refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error) throw error;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decrypt(stored.refresh_token),
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
    }),
  });

  if (!response.ok) throw new Error('Token refresh failed');
  return response.json();
}
```

## Чеклист

1. **PKCE обязателен** — для SPA и мобильных (нет client_secret)
2. **state параметр** — защита от CSRF (Supabase делает автоматически)
3. **Redirect URI** — whitelist на стороне провайдера, exact match
4. **Token storage** — серверная сторона, зашифровано
5. **Refresh** — автоматический refresh до истечения access_token
6. **Revocation** — при logout отзывать токены у провайдера
7. **Scopes** — запрашивать минимальные необходимые scope

## Anti-patterns

- Implicit flow вместо Authorization Code — небезопасен
- Client secret в клиентском коде — компрометация
- Access token в URL параметрах — утечка в логи
- Нет PKCE для публичных клиентов — перехват code
- Хранение refresh token в localStorage — XSS = полный доступ
- Бесконечный scope — запрашивать только нужное
