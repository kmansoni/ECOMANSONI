# Timeweb Authentication Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React/Vite)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TimewebPhoneAuthClient (src/lib/auth/)               │   │
│  │ - Primary: Timeweb Phone Auth Service                │   │
│  │ - Fallback: Supabase Edge Functions                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
        ┌───────────────────┐   ┌────────────────────┐
        │  HTTPS/Nginx      │   │  HTTPS/Nginx       │
        │ Reverse Proxy     │   │  Reverse Proxy     │
        │ api.mansoni.ru    │   │ api.mansoni.ru     │
        │ :443              │   │ :443 (Supabase)    │
        └──────────┬────────┘   └────────┬───────────┘
                   │                     │
                   ▼                     ▼
        ┌───────────────────┐   ┌────────────────────┐
        │ phone-auth        │   │ Supabase Edge      │
        │ Service           │   │ Functions          │
        │ (Node.js)         │   │ (TypeScript/Deno)  │
        │ :3001             │   │ (Fallback)         │
        │                   │   │                    │
        │ - request-otp     │   │ - send-sms-otp     │
        │ - verify-otp      │   │ - verify-sms-otp   │
        └──────────┬────────┘   └────────┬───────────┘
                   │                     │
        ┌──────────┴─────────────────────┴──────────┐
        │         Timeweb PostgreSQL                 │
        │ (Primary - users, otp_audit, tokens)       │
        │ Port: 5432                                 │
        └─────────────────────────────────────────────┘
        
        Optional: Supabase PostgreSQL (Fallback)
```

## Service Architecture

### 1. Phone Auth Service (Timeweb)

**Location**: `server/phone-auth/`

**Technology Stack**:
- Node.js 18+ (LTS)
- PostgreSQL database
- JWT (jsonwebtoken) library
- CORS headers for security

**Endpoints**:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /auth/phone/request-otp` | POST | Request 6-digit OTP |
| `POST /auth/phone/verify` | POST | Verify OTP, issue JWT |
| `GET /health` | GET | Service health check |

**Environment Configuration**:

```bash
PHONE_AUTH_PORT=3001                              # Service port
DATABASE_URL=postgresql://user:pass@host/db       # Timeweb PostgreSQL
JWT_SECRET=<secure-random-key>                    # JWT signing key
OTP_VALIDITY_SEC=300                              # OTP code validity (5 min)
OTP_MAX_ATTEMPTS=5                                # Max verification attempts
SMS_PROVIDER=timeweb|twilio|stub                  # SMS backend
CORS_ALLOWED_ORIGINS=mansoni.ru,www.mansoni.ru   # CORS whitelist
NODE_ENV=production|development                   # Environment
```

### 2. Client SDK (TypeScript)

**Location**: `src/lib/auth/timeweb-phone-auth.ts`

**Class**: `TimewebPhoneAuthClient`

**Methods**:

```typescript
// Request OTP for phone number
async requestOTP(phone: string): Promise<{ phone: string; expiresIn: number }>

// Verify OTP code and receive JWT token
async verifyOTP(phone: string, otp: string): Promise<{ token: string; user: { id: string; phone: string } }>

// Get current authentication token
getToken(): string | undefined

// Check if user is authenticated
isAuthenticated(): boolean

// Logout and clear token
logout(): void

// Get Authorization header for API requests
getAuthHeaders(): { Authorization: string } | {}

// Make authenticated HTTP request
async fetchAuthenticated<T>(path: string, options?: RequestInit): Promise<T>
```

**Features**:

- ✅ Automatic failover to Supabase
- ✅ Token persistence (localStorage)
- ✅ Request timeout handling (30s default)
- ✅ CORS-aware
- ✅ TypeScript support
- ✅ Singleton pattern for app-wide instance

### 3. React Integration

**Location**: `src/context/AuthContext.tsx`

**Provides**:

```typescript
interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  phone?: string;
  token?: string;
  requestOTP: (phone: string) => Promise<{ phone: string; expiresIn: number }>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  logout: () => void;
}
```

**Usage**:

```typescript
import { useAuth } from '@/context/AuthContext';

function LoginComponent() {
  const { isAuthenticated, requestOTP, verifyOTP } = useAuth();
  
  // Component logic...
}
```

## Data Flow

### OTP Request Flow

```
User enters phone number
          ↓
Frontend: TimewebPhoneAuthClient.requestOTP("+7999...")
          ↓
POST https://api.mansoni.ru/auth/phone/request-otp
          ↓
Nginx reverse proxy → Backend :3001
          ↓
Server validates phone format
          ↓
Rate limit check (30s)
          ↓
Generate 6-digit OTP
          ↓
Store in memory: { otp, expiresAt, attempts }
          ↓
Send via SMS (stub/timeweb/twilio provider)
          ↓
Return masked phone + 300s expiration
          ↓
Frontend receives and shows "Check your SMS"
```

### OTP Verification Flow

```
User enters OTP code
          ↓
Frontend: TimewebPhoneAuthClient.verifyOTP("+7999...", "123456")
          ↓
POST https://api.mansoni.ru/auth/phone/verify
          ↓
Nginx reverse proxy → Backend :3001
          ↓
Server validates OTP format
          ↓
Lookup phone in OTP store
          ↓
┌─ Check expiration ─┐
│                    ├─→ Invalid/Expired → Return error
└────────────────────┘
          ↓
Check attempts remaining
          ↓
┌─ Verify OTP match ─┐
│                    ├─→ Mismatch → Increment attempts, return error
└────────────────────┘
          ↓
OTP verified! ✓
          ↓
Database lookup/create user
┌─ User exists ─────────────────┐
│ Update last_login_at          │
├───────────────────────────────┤
│ Generate JWT with user.id     │
└─────────────────────────────────┘
          ↓
Issue JWT token (7-day expiration)
          ↓
Clear OTP store
          ↓
Return token + user info
          ↓
Frontend stores token in localStorage
          ↓
Frontend redirects to home page
          ↓
Token sent in Authorization header for all API requests
```

## JWT Token Structure

**Header**:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload**:
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "phone": "79991234567",
  "iat": 1708952400,
  "exp": 1709557200
}
```

**Signature**: HMAC SHA-256 with JWT_SECRET

**Claims**:
- `sub` (subject): User UUID
- `phone`: Normalized phone number (digits only)
- `iat` (issued at): Unix timestamp
- `exp` (expiration): 7 days from issue

## Security Considerations

### 1. OTP Security

**Strengths**:
- ✅ 6-digit code (1 million combinations)
- ✅ 5-minute expiration (default)
- ✅ Rate limiting: 3 SMS per 10 minutes per phone
- ✅ Max 5 verification attempts per OTP
- ✅ Logged to audit table (production)

**Weaknesses** (Design Trade-offs):
- ⚠️ In-memory OTP store (not distributed - single-instance only)
- ⚠️ No IP-based rate limiting (per phone only)
- ⚠️ SMS delivery not guaranteed (carrier dependent)

**Mitigation Path**:
- Redis for OTP store (distributed)
- IP + phone combined rate limiting
- Fallback SMS providers
- OTP delivery confirmation logging

### 2. JWT Security

**Strengths**:
- ✅ HMAC-SHA256 signature (requires JWT_SECRET)
- ✅ JWT_SECRET never exposed to client
- ✅ 7-day expiration (token refresh recommended)
- ✅ Token verification required via Authorization header

**Weaknesses**:
- ⚠️ No token revocation list (logout is client-side only)
- ⚠️ Stolen token is valid until expiration
- ⚠️ No refresh token mechanism

**Mitigation Path**:
- Implement revoked_tokens table
- Add token refresh endpoint
- Implement logout endpoint
- Short-lived access tokens + longer-lived refresh tokens

### 3. API Security

**HTTPS/TLS**:
- ✅ Let's Encrypt certificates
- ✅ TLS 1.2+ only
- ✅ HSTS headers enabled

**CORS**:
- ✅ Deny-by-default (CORS_ALLOWED_ORIGINS env required)
- ✅ Explicit origin validation
- ✅ No `Access-Control-Allow-Origin: *`

**Rate Limiting**:
- ✅ Per-phone OTP request limiting (30s cooldown)
- ✅ Max 5 verification attempts per OTP
- ⚠️ Global rate limiting not yet implemented

**SMS Provider Security**:
- ✅ API key stored in environment only (not in code)
- ⚠️ SMS provider choice affects delivery guarantees

## Fallback to Supabase

### When Fallback Triggers

1. **Connection Failure**: Timeweb service unreachable
2. **Timeout**: No response within 30 seconds
3. **5xx Error**: Timeweb service error
4. **Configuration**: NEVER fallback if explicitly disabled

### Fallback Flow

```
Frontend attempts Timeweb requestOTP()
          ↓
┌─ Network/timeout error ─┐
└─────────────────────────┤
                          ├→ Check fallbackToSupabase flag
                          │
                   ┌──────┘
                   ↓
              YES: Continue to Supabase
              NO: Throw error
                   ↓
         Console warning:
         [Timeweb Auth] Falling back to Supabase
                   ↓
         Call Supabase Edge Function
         (send-sms-otp)
                   ↓
         Response format is compatible
         (same OTP flow)
```

### Token Compatibility

Both systems issue JWT tokens with compatible structure:

| Property | Timeweb | Supabase | Compatible |
|----------|---------|----------|-----------|
| Sub | User UUID | User UUID | ✓ |
| Phone | Digits only | Digits only | ✓ |
| Iat | Unix timestamp | Unix timestamp | ✓ |
| Exp | 7 days | 7 days | ✓ |
| Algorithm | HS256 | HS256 | ✓ |

**Client-side**: Tokens are identical structurally, indistinguishable to frontend

**Server-side**: Tokens must be validated with correct secret key (Timeweb or Supabase)

## Deployment Topology

### Timeweb Cloud Server (5.42.99.76)

```
┌────────────────────────────────────────────────────────────┐
│ Timeweb Server (Ubuntu 22.04)                              │
│                                                            │
│  Port 443 (HTTPS)                                          │
│    ↓                                                        │
│  ┌────────────────────────────────────────┐               │
│  │ Nginx Reverse Proxy                    │               │
│  │ /etc/nginx/sites-available/mansoni-api │               │
│  │                                         │               │
│  │ ├─ /auth/phone → upstream :3001        │               │
│  │ ├─ /health → upstream :3001            │               │
│  │ └─ [other endpoints]                   │               │
│  └────────────┬───────────────────────────┘               │
│               │                                             │
│  ┌────────────▼───────────────────────────┐               │
│  │ Port 3001 (localhost only)              │               │
│  │                                         │               │
│  │ ┌─────────────────────────────────┐   │               │
│  │ │ phone-auth Service              │   │               │
│  │ │ (Node.js / index.mjs)           │   │               │
│  │ │ Started with PM2                │   │               │
│  │ │                                 │   │               │
│  │ │ - request-otp endpoint          │   │               │
│  │ │ - verify-otp endpoint           │   │               │
│  │ │ - OTP store (in-memory)         │   │               │
│  │ │ - Database connection pool      │   │               │
│  │ └─────────────────────────────────┘   │               │
│  └────────────┬───────────────────────────┘               │
│               │                                             │
│  ┌────────────▼───────────────────────────┐               │
│  │ PostgreSQL (Port 5432)                  │               │
│  │                                         │               │
│  │ Tables:                                 │               │
│  │ ├─ users (phone, created_at)           │               │
│  │ ├─ otp_audit_log (audit trail)         │               │
│  │ └─ revoked_tokens (for logout)         │               │
│  └─────────────────────────────────────────┘               │
│                                                            │
│ SSL Certificates:                                         │
│ /etc/letsencrypt/live/mansoni.ru/                         │
│ └─ fullchain.pem, privkey.pem                             │
└────────────────────────────────────────────────────────────┘
```

### Client Environment (React/Vite)

```
localhost:5173 (dev)
      ↓
┌─────────────────────────────────────────┐
│ React Application                       │
│                                         │
│ ┌─────────────────────────────────┐    │
│ │ TimewebPhoneAuthClient          │    │
│ │ - apiBaseUrl: env config        │    │
│ │ - fallbackToSupabase: env flag  │    │
│ │ - JWT token in localStorage     │    │
│ └──────────┬──────────────────────┘    │
│            │                            │
│ ┌──────────▼──────────────────────┐    │
│ │ AuthContext (React)             │    │
│ │ - useAuth hook                  │    │
│ │ - login/logout state            │    │
│ │ - token persistence             │    │
│ └──────────┬──────────────────────┘    │
│            │                            │
│ ┌──────────▼──────────────────────┐    │
│ │ LoginForm Component             │    │
│ │ - Phone input                   │    │
│ │ - OTP input                     │    │
│ │ - Timer (5 min expiration)      │    │
│ │ - Resend OTP button             │    │
│ │ - Error messages                │    │
│ └─────────────────────────────────┘    │
│                                         │
│ Stores:                                 │
│ ├─ localStorage: auth_token             │
│ └─ Memory: auth state                   │
└─────────────────────────────────────────┘
```

## Monitoring & Observability

### Metrics to Track

**OTP Service**:
- Request rate (OTP requests per minute)
- Request success rate (% successful requests)
- Verification success rate (% valid OTPs)
- User creation rate (new vs. returning)
- API response times (p50, p95, p99)
- Error rate by type

**Database**:
- Connection pool utilization
- Query execution time
- Users table size growth
- OTP audit log growth

**Fallback**:
- Fallback trigger rate (how often)
- Fallback success rate (% successful)
- Fallback error patterns

### Logging

**Application Logs**:
```
[request-otp] Incoming request from 192.168.1.1
[request-otp] Phone: 79991234567
[request-otp] Rate limit check: OK
[request-otp] OTP generated: xxxxxx
[STUB SMS] Phone: 79991234567, OTP: 123456 (Valid for 300s)
[request-otp] Response sent (200 OK)
```

**Error Logs**:
```
[verify-otp] Invalid OTP for 79991234567
[verify-otp] OTP expired for 79991234567
[verify-otp] Database error during user lookup: connection timeout
[request-otp] Rate limit exceeded for 79991234567: 429 Too Many Requests
```

**Audit Logs** (in database):
```sql
INSERT INTO otp_audit_log (phone, action, ip_address, user_agent)
VALUES ('79991234567', 'requested', '192.168.1.1', 'Mozilla/5.0...');

INSERT INTO otp_audit_log (phone, action, ip_address, user_agent)
VALUES ('79991234567', 'verified', '192.168.1.1', 'Mozilla/5.0...');
```

## Future Enhancements

### High Priority
- [ ] Redis OTP store (distributed deployment ready)
- [ ] Token revocation endpoint (proper logout)
- [ ] Token refresh endpoint (extend session)
- [ ] IP-based rate limiting
- [ ] Passwordless magic link auth
- [ ] Email fallback (if SMS fails)

### Medium Priority
- [ ] Twilio SMS provider integration
- [ ] 2FA support (OTP + password)
- [ ] Biometric authentication (WebAuthn)
- [ ] Account recovery (email verification)
- [ ] User profile endpoints
- [ ] Admin dashboard for OTP audit logs

### Low Priority
- [ ] LDAP integration
- [ ] OAuth2 social login
- [ ] SAML support
- [ ] API key authentication for services
- [ ] Rate limiting dashboard
