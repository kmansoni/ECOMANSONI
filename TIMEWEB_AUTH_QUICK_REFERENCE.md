# Timeweb Phone Auth Quick Reference

## What Was Built

✅ **Phone-based Authentication Backend for Timeweb**
- Node.js service for OTP request and verification
- JWT token generation
- PostgreSQL database integration
- SMS provider support (stub, Twilio, Timeweb)

✅ **TypeScript Client SDK**
- `TimewebPhoneAuthClient` for frontend integration
- Automatic fallback to Supabase
- Token persistence and management

✅ **React Integration**
- `AuthContext` for app-wide auth state
- `useAuth` hook for login/logout components
- Full CORS support with security hardening

✅ **Comprehensive Documentation**
- Architecture guide
- Migration strategy
- Deployment checklist
- Environment configuration template

## File Structure

```
server/phone-auth/
├── index.mjs              # Main service (Node.js)
├── package.json           # Dependencies
├── migration.sh           # Database setup script
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
└── README.md              # Service documentation

src/lib/auth/
├── timeweb-phone-auth.ts  # Client SDK
├── index.ts               # SDK exports
└── env.ts                 # Environment config

src/context/
└── AuthContext.tsx        # React context provider

Documentation/
├── TIMEWEB_AUTH_MIGRATION.md          # Step-by-step setup
├── TIMEWEB_AUTH_ARCHITECTURE.md       # Technical deep-dive
└── TIMEWEB_AUTH_DEPLOYMENT_CHECKLIST  # Deployment guide
```

## Quick Start

### 1. Start Backend (Local Development)

```bash
cd server/phone-auth

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with:
# DATABASE_URL=postgresql://...
# JWT_SECRET=your-secret-key

# Run migrations (create database tables)
bash migration.sh

# Start service
npm run dev
# Service listens on http://localhost:3001
```

### 2. Verify Backend

```bash
# Health check
curl http://localhost:3001/health

# Request OTP
curl -X POST http://localhost:3001/auth/phone/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567"}'

# Response will show OTP in console (stub SMS provider)
# [STUB SMS] Phone: 79991234567, OTP: 123456
```

### 3. Frontend Setup

```bash
# Environment variables
cat > .env.local <<EOF
VITE_PHONE_AUTH_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
EOF

# Start frontend
npm run dev
# Frontend on http://localhost:5173
```

### 4. Test Login Flow

1. Navigate to http://localhost:5173/login
2. Enter phone number → "Send OTP"
3. Check console for OTP code
4. Enter OTP code → "Verify"
5. Should see JWT token in localStorage
6. Redirect to home page

## Environment Variables

### Backend (server/phone-auth/)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | - | Timeweb PostgreSQL connection |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `PHONE_AUTH_PORT` | No | 3000 | Service port |
| `OTP_VALIDITY_SEC` | No | 300 | OTP code lifetime (5 min) |
| `OTP_MAX_ATTEMPTS` | No | 5 | Max verification attempts |
| `SMS_PROVIDER` | No | stub | SMS backend (stub/twilio/timeweb) |
| `CORS_ALLOWED_ORIGINS` | No | * | Comma-separated allowed origins |
| `NODE_ENV` | No | development | Environment mode |

### Frontend (src/)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_PHONE_AUTH_API_URL` | Yes | Timeweb phone-auth endpoint |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (fallback) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key (fallback) |

## API Endpoints

### POST /auth/phone/request-otp

**Request**:
```json
{
  "phone": "+79991234567"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "OTP sent to phone number",
  "phone": "+***4567",
  "expiresIn": 300
}
```

**Response (429)** - Rate Limited:
```json
{
  "error": "OTP already requested. Please wait 30 seconds before retrying."
}
```

### POST /auth/phone/verify

**Request**:
```json
{
  "phone": "+79991234567",
  "otp": "123456"
}
```

**Response (200)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+***4567"
  }
}
```

**Response (400)** - Invalid OTP:
```json
{
  "error": "Invalid OTP",
  "attemptsRemaining": 3
}
```

### GET /health

**Response (200)**:
```json
{
  "status": "ok",
  "service": "phone-auth",
  "env": "production"
}
```

## Client SDK Usage

### Initialize

```typescript
import { createAuthClient } from '@/lib/auth/timeweb-phone-auth';

const authClient = createAuthClient({
  apiBaseUrl: 'https://api.mansoni.ru',
  fallbackToSupabase: true,
  supabaseUrl: 'https://...',
  supabaseAnonKey: '...',
});
```

### Request OTP

```typescript
try {
  const { phone, expiresIn } = await authClient.requestOTP('+79991234567');
  console.log(`OTP sent to ${phone}, expires in ${expiresIn}s`);
} catch (error) {
  console.error('OTP request failed:', error.message);
}
```

### Verify OTP

```typescript
try {
  const { token, user } = await authClient.verifyOTP('+79991234567', '123456');
  console.log(`Logged in as ${user.id}`);
  // Token automatically stored in localStorage
} catch (error) {
  console.error('OTP verification failed:', error.message);
}
```

### Use in API Requests

```typescript
// Option 1: Get auth headers
const headers = authClient.getAuthHeaders();
fetch('/api/user', { headers });

// Option 2: Use authenticated fetch
const user = await authClient.fetchAuthenticated<User>('/api/user');
```

### React Hook

```typescript
import { useAuth } from '@/context/AuthContext';

function MyComponent() {
  const { isAuthenticated, phone, requestOTP, verifyOTP, logout } = useAuth();
  
  return (
    <>
      {isAuthenticated ? (
        <p>Logged in as {phone} <button onClick={logout}>Logout</button></p>
      ) : (
        <LoginForm />
      )}
    </>
  );
}
```

## Deployment

### Minimal Timeweb Setup (5 min)

```bash
# 1. SSH to server
ssh root@5.42.99.76

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs npm

# 3. Clone & setup
cd /var/app && npm --prefix server/phone-auth install

# 4. Configure environment
nano server/phone-auth/.env.local
# Set: DATABASE_URL, JWT_SECRET, SMS_PROVIDER, CORS_ALLOWED_ORIGINS

# 5. Run migrations
bash server/phone-auth/migration.sh

# 6. Start with PM2
npm install -g pm2
pm2 start server/phone-auth/index.mjs --name phone-auth

# 7. Configure Nginx (upstream + location blocks)
nano /etc/nginx/sites-available/mansoni-api
# Add: upstream phone_auth_backend { server 127.0.0.1:3001; }
# Add location /auth/phone block with proxy_pass

nginx -t && systemctl reload nginx

# 8. Test
curl https://api.mansoni.ru/health
```

## Monitoring

### Service Status

```bash
pm2 status                 # Check service status
pm2 logs phone-auth        # View logs
pm2 logs phone-auth --tail 50  # Last 50 lines
```

### Database Health

```bash
# Connect to database
psql $DATABASE_URL

# Check users created today
SELECT COUNT(*), DATE(created_at) FROM users GROUP BY DATE(created_at);

# Check OTP success rate
SELECT action, COUNT(*) FROM otp_audit_log 
WHERE created_at > CURRENT_DATE 
GROUP BY action;
```

### API Health

```bash
# Health check endpoint
curl https://api.mansoni.ru/health

# Test OTP endpoint
curl -X POST https://api.mansoni.ru/auth/phone/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567"}'
```

## Troubleshooting

### Service won't start

```bash
# Check if port is in use
lsof -i :3001

# Check logs
pm2 logs phone-auth

# Verify JWT_SECRET is set
env | grep JWT_SECRET

# Test database connection
psql $DATABASE_URL -c "SELECT 1"
```

### OTP not being sent

```bash
# Check SMS provider configuration
env | grep SMS_PROVIDER

# For stub provider, check logs for OTP code
pm2 logs phone-auth | grep "STUB SMS"

# For Timeweb SMS, verify API key
env | grep TIMEWEB_SMS_API_KEY
```

### Frontend can't reach backend

```bash
# Check CORS_ALLOWED_ORIGINS
env | grep CORS_ALLOWED_ORIGINS

# Test from browser console
fetch('https://api.mansoni.ru/health')
  .then(r => r.json())
  .then(console.log)

# Verify Nginx is routing correctly
curl -I https://api.mansoni.ru/auth/phone/request-otp
```

## Next Steps

1. **SMS Integration**: Implement Timeweb or Twilio SMS provider
2. **Fallback Testing**: Verify automatic fallback to Supabase works
3. **Production Deployment**: Deploy to Timeweb production server
4. **Monitoring Setup**: Configure alerts for OTP failures
5. **Documentation**: Update user-facing auth flow documentation
6. **Team Training**: Brief team on new auth system architecture

## Support

For issues or questions:
1. Check [TIMEWEB_AUTH_MIGRATION.md](./TIMEWEB_AUTH_MIGRATION.md) for detailed setup
2. Review [TIMEWEB_AUTH_ARCHITECTURE.md](./TIMEWEB_AUTH_ARCHITECTURE.md) for technical details
3. See [server/phone-auth/README.md](./server/phone-auth/README.md) for service documentation
4. Check server logs: `pm2 logs phone-auth`
5. Review database: `psql $DATABASE_URL`
