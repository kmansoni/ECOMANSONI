# Phone Authentication Service

Timeweb-based phone authentication backend using OTP (One-Time Password) and JWT tokens.

## Security Features

- Helmet security headers (CSP, HSTS, noSniff, frameguard, referrer-policy)
- Global rate limiting per IP and stricter per-phone OTP request limiting
- Timing-safe OTP verification (`crypto.timingSafeEqual`)
- CORS deny-by-default allowlist via `CORS_ALLOWED_ORIGINS`
- Request body size limit (16KB) and per-request timeout (30s)
- Graceful shutdown for `SIGTERM` / `SIGINT`

## Overview

This service provides phone-based authentication (without passwords) for the ECOMANSONI platform:

1. **Request OTP**: User provides phone number → service sends SMS with 6-digit code
2. **Verify OTP**: User enters OTP → service creates/finds user in database and issues JWT token
3. **JWT Token**: Token is valid for 7 days and contains user ID and phone number (non-sensitive)

## API Endpoints

### 1. Request OTP

```http
POST /auth/phone/request-otp
Content-Type: application/json

{
  "phone": "+79991234567"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to phone number",
  "phone": "+***4567",
  "expiresIn": 300
}
```

**Response (429 - Rate Limited):**
```json
{
  "error": "Too many OTP requests. Please try again later.",
  "retryAfter": 42
}
```

### 2. Verify OTP

```http
POST /auth/phone/verify
Content-Type: application/json

{
  "phone": "+79991234567",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "phone": "+***4567"
  }
}
```

**Response (400 - Invalid OTP):**
```json
{
  "error": "Invalid OTP",
  "attemptsRemaining": 3
}
```

### 3. Health Check

```http
GET /health
```

**Response (200):**
```json
{
  "status": "ok",
  "service": "phone-auth",
  "env": "production",
  "timestamp": "2026-02-26T08:00:00.000Z"
}
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PHONE_AUTH_PORT` | Port to listen on | No | 3000 |
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `JWT_SECRET` | Secret for signing JWT tokens | Yes | - |
| `OTP_VALIDITY_SEC` | OTP code validity in seconds | No | 300 |
| `OTP_MAX_ATTEMPTS` | Max verification attempts per OTP | No | 5 |
| `SMS_PROVIDER` | SMS provider: 'stub', 'twilio', 'timeweb' | No | stub |
| `TIMEWEB_SMS_API_KEY` | Timeweb SMS API key | No (if using timeweb) | - |
| `CORS_ALLOWED_ORIGINS` | Comma-separated CORS origins allowlist | Yes in production | - |
| `NODE_ENV` | Environment: development, production | No | development |
| `RATE_LIMIT_WINDOW_MS` | Global rate-limit window in ms | No | 60000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max global requests per window (per IP) | No | 120 |

## Setup

### 1. Install Dependencies

```bash
cd server/phone-auth
npm install
```

### 2. Configure Environment

Create `.env.local`:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/mansoni
JWT_SECRET=your-super-secret-key-change-in-production
SMS_PROVIDER=stub  # Use 'stub' for development (logs OTP to console)
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
PHONE_AUTH_PORT=3001
```

### 3. Run Database Migrations

Ensure the Timeweb PostgreSQL database has the `users` table created (service auto-creates on startup):

```bash
npm run dev
```

The service will automatically create the `users` table on first run.

## Development

### Start Service

```bash
npm run dev
```

Service will listen on `http://localhost:3001` by default.

### Test Request OTP

```bash
curl -X POST http://localhost:3001/auth/phone/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567"}'
```

Check console output for the OTP code (when using `SMS_PROVIDER=stub`).

### Test Verify OTP

```bash
curl -X POST http://localhost:3001/auth/phone/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567", "otp": "123456"}'
```

## Database Schema

### users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_login_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_phone ON users(phone);
```

## JWT Token Structure

Payload:
```json
{
  "sub": "user-id-uuid",
  "phone": "79991234567",
  "iat": 1708952400,
  "exp": 1709557200
}
```

**Token Validation**:
- Use `JWT_SECRET` to verify signature
- Check `exp` claim for expiration (7 days)
- Extract `sub` for user ID

## Integration with Client

### Supabase Fallback Flow

1. **Primary**: Request OTP from Timeweb phone-auth service
2. **Fallback**: If Timeweb fails, fall back to Supabase OTP (send-sms-otp)
3. **Verify**: Same token structure, client uses JWT in Authorization header

### Client Code Example

```typescript
// Request OTP from Timeweb (primary)
const response = await fetch('https://api.mansoni.ru/auth/phone/request-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '+79991234567' })
});

// Verify OTP
const verifyResponse = await fetch('https://api.mansoni.ru/auth/phone/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '+79991234567', otp: '123456' })
});

const { token } = await verifyResponse.json();

// Use token in subsequent requests
fetch('https://api.mansoni.ru/api/user', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Production Deployment

### 1. Timeweb Container Setup

```bash
# SSH into Timeweb server
ssh root@5.42.99.76

# Install Node.js (if not present)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Pull latest code
cd /var/app && git pull origin main

# Install dependencies
cd server/phone-auth
npm install --production

# Start service with PM2
pm2 start index.mjs --name phone-auth

# Configure reverse proxy (Nginx)
# Add upstream block to /etc/nginx/nginx.conf or /etc/nginx/sites-available/mansoni-api
```

### 2. Nginx Configuration

```nginx
upstream phone_auth_backend {
  server localhost:3001;
  keepalive 32;
}

server {
  listen 443 ssl http2;
  server_name api.mansoni.ru;

  ssl_certificate /etc/letsencrypt/live/mansoni.ru/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/mansoni.ru/privkey.pem;

  location /auth/phone {
    proxy_pass http://phone_auth_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### 3. Environment Variables

Set on Timeweb server:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/mansoni"
export JWT_SECRET="secure-random-key-generated-on-deployment"
export SMS_PROVIDER="timeweb"
export TIMEWEB_SMS_API_KEY="api-key-from-timeweb-console"
export CORS_ALLOWED_ORIGINS="https://mansoni.ru,https://www.mansoni.ru"
export NODE_ENV="production"
```

## Monitoring

### Health Check

```bash
curl https://api.mansoni.ru/health
```

### Logs

```bash
# Local development
tail -f console.log

# Timeweb (PM2)
pm2 logs phone-auth
```

### Metrics to Track

- OTP request rate
- OTP verification success rate
- User creation rate (new vs. returning)
- JWT token issuance rate
- Error rates by type (OTP expired, max attempts exceeded, etc.)

## Next Steps

1. **SMS Provider Integration** - Implement Twilio or Timeweb SMS API
2. **Redis OTP Store** - Replace in-memory OTP store with Redis for distributed deployments
3. **Database Persistence** - Store OTP records in database (for audit and retry logic)
4. **Revoked JWT Storage** - Add token revocation / session management for explicit logout
5. **Observability** - Add structured metrics export (Prometheus/OpenTelemetry)
