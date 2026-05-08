# Skill: Multi-Account & Identity

**Domain:** SSO, session management, account switching, token revocation  
**Files:** `src/contexts/MultiAccountContext.tsx`, `src/lib/auth/`, `src/components/account/`  
**When to apply:** Login/logout, account switching, session tokens

---

## Knowledge

### OAuth 2.1 / OIDC (OpenID Connect)
- **Authorization Code Flow with PKCE**: prevent code interception
- **Implicit Flow**: deprecated (no fragments)
- **Refresh Tokens**: rotation, revocation (detect reuse)
- **Device Authorization Grant**: TV/IoT devices
- **Token introSpec**: validate token server-side
- **JWKS**: JSON Web Key Set rotation
- **AtHash/CHash**: access token hash validation

### Session Management
- **Session fixation prevention**: rotate session ID on login
- **Concurrent session limits**: max 5 devices
- **Session expiration**: idle timeout (30d), absolute timeout (90d)
- **Remembered devices**: trusted device list (1 year)
- **Token revocation endpoint**: `/auth/revoke`
- **Refresh token rotation**: on every use (one-time use)

### Account Linking & Merging
- **Merge duplicates**: fold data (messages, contacts) into primary
- **OAuth account linking**: "Sign in with Google" → link to existing account
- **Deduplication**: fuzzy match email/phone
- **Merge conflicts**: choose primary, merge avatar/name/preferences

### SSO Integration
- **SAML 2.0**: enterprise SSO (Okta, Azure AD)
- **Shibboleth**: academic institutions
- **OpenID Connect**: Google, Apple, Yandex, Telegram Login Widget
- **Just-In-Time provisioning**: auto-create on first SSO login
- **Session bridging**: SSO SSO session → app session

### Security Considerations
- **Token storage**: httpOnly cookie (best) vs localStorage (XSS risk)
- **CSRF**: SameSite=strict, CSRF token for state-changing ops
- **Replay protection**: nonce, timestamp, jti
- **Brute force protection**: rate limit login attempts (5 per 5min per IP)
- **Credential stuffing**: breached password detection

### Multi-Account UX
- **Account switcher UI**: avatar dropdown, recent accounts
- **Persistent choice**: remember last selected account
- **Isolation**: data per account (RLS enforces)
- **Logout all**: global sign-out from all devices

---

## Quality Gates

1. **Session timeout**: enforced at 30d inactivity, 90d absolute
2. **Token revocation**: < 5s from revocation call to invalidation
3. **SSO**: first-time login flow < 10s
4. **Multi-account isolation**: RLS ensures cross-account data leak = 0
5. **Brute force**: account lock after 5 failed attempts
6. **Passwordless**: magic link login < 30s end-to-end

---

## When to Apply

- Login/logout functionality
- "Switch account" UI
- SSO integration (Google, Apple, Yandex, Telegram)
- Session timeout logic
- Token refresh & rotation
- Account linking/unlinking
- Merge duplicate accounts
- Forgot password flow
- 2FA/MFA implementation
