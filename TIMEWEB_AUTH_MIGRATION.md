# Timeweb Auth Migration Guide

This document describes the migration from Supabase-based authentication to Timeweb-based phone authentication, while keeping Supabase as a fallback.

## Overview

### Architecture

```
Frontend (React/Vite)
    ↓
Timeweb Phone Auth Service (Primary)
    ↓ [on failure]
Supabase Edge Functions (Fallback)
    ↓
Timeweb PostgreSQL + Supabase PostgreSQL (Dual DB)
```

### Auth Flow

1. **Primary Path**: Timeweb Phone Auth Service
   - User enters phone number → Request OTP endpoint
   - Receives 6-digit code via SMS
   - Verifies OTP → Receives JWT token
   - Uses token in `Authorization: Bearer <token>` header

2. **Fallback Path**: Supabase (if Timeweb unavailable)
   - Automatically switch to Supabase Edge Functions
   - Same OTP → JWT flow, backward compatible
   - Token structure matches (JWT with user ID and phone)

## Deployment Steps

### Phase 1: Backend Setup (Timeweb)

#### 1. SSH into Timeweb Server

```bash
ssh root@5.42.99.76
```

#### 2. Install Node.js (if needed)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get update && sudo apt-get install -y nodejs
```

#### 3. Clone/Update Repository

```bash
cd /var/app
git pull origin main
```

#### 4. Install Phone Auth Service Dependencies

```bash
cd server/phone-auth
npm install --production
```

#### 5. Configure Environment

Create or update `.env.local`:

```bash
cat > /var/app/server/phone-auth/.env.local <<EOF
DATABASE_URL=postgresql://mansoni_user:$(read -sp 'DB Password: ')@localhost:5432/mansoni
JWT_SECRET=$(openssl rand -base64 32)
SMS_PROVIDER=timeweb
TIMEWEB_SMS_API_KEY=$(read -sp 'Timeweb SMS API Key: ')
CORS_ALLOWED_ORIGINS=https://mansoni.ru,https://www.mansoni.ru,https://api.mansoni.ru
NODE_ENV=production
PHONE_AUTH_PORT=3001
EOF
```

#### 6. Run Database Migration

```bash
bash /var/app/server/phone-auth/migration.sh
```

This creates:
- `users` table (phone, created_at, last_login_at)
- `otp_audit_log` table (for tracking)
- `revoked_tokens` table (for logout support)

#### 7. Start Service with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Navigate to service directory
cd /var/app/server/phone-auth

# Start service
pm2 start index.mjs --name phone-auth --env production

# Save PM2 config
pm2 save

# Enable startup on reboot
pm2 startup
```

#### 8. Configure Nginx Reverse Proxy

Edit `/etc/nginx/sites-available/mansoni-api`:

```nginx
upstream phone_auth_backend {
  server 127.0.0.1:3001;
  keepalive 32;
}

server {
  listen 443 ssl http2;
  server_name api.mansoni.ru;

  ssl_certificate /etc/letsencrypt/live/mansoni.ru/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/mansoni.ru/privkey.pem;

  # Phone Auth Endpoints
  location /auth/phone {
    proxy_pass http://phone_auth_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
    proxy_connect_timeout 30s;
  }

  # Health check endpoint
  location /health {
    proxy_pass http://phone_auth_backend;
  }

  # Other existing endpoints...
}
```

Reload Nginx:

```bash
nginx -t && systemctl reload nginx
```

#### 9. Verify Service is Running

```bash
# Check logs
pm2 logs phone-auth

# Health check
curl https://api.mansoni.ru/health

# Test OTP request (stub provider for now)
curl -X POST https://api.mansoni.ru/auth/phone/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567"}'
```

### Phase 2: Client SDK Integration

#### 1. Create Client Auth Module

Create `src/lib/auth/index.ts`:

```typescript
import { createAuthClient } from './timeweb-phone-auth';

// Initialize auth client on app startup
export const authClient = createAuthClient({
  apiBaseUrl: 'https://api.mansoni.ru',
  fallbackToSupabase: true,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

export { TimewebPhoneAuthClient } from './timeweb-phone-auth';
```

#### 2. Create Auth Context (React)

Create `src/context/AuthContext.tsx`:

```typescript
import { createContext, useContext, useState, useEffect } from 'react';
import { authClient } from '@/lib/auth';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  phone?: string;
  token?: string;
  requestOTP: (phone: string) => Promise<{ phone: string; expiresIn: number }>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [phone, setPhone] = useState<string>();

  useEffect(() => {
    // Check if user has existing token
    const token = authClient.getToken();
    if (token) {
      setIsAuthenticated(true);
      // Decode token to extract phone (JWT payload)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setPhone(payload.phone);
      } catch {
        // Invalid token, clear it
        authClient.logout();
      }
    }
    setIsLoading(false);
  }, []);

  const requestOTP = async (phoneNumber: string) => {
    setIsLoading(true);
    try {
      return await authClient.requestOTP(phoneNumber);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOTP = async (phoneNumber: string, otp: string) => {
    setIsLoading(true);
    try {
      const { user } = await authClient.verifyOTP(phoneNumber, otp);
      setPhone(user.phone);
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authClient.logout();
    setIsAuthenticated(false);
    setPhone(undefined);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        phone,
        token: authClient.getToken(),
        requestOTP,
        verifyOTP,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

#### 3. Update Layout to Use Auth Provider

In `src/App.tsx` or main layout file:

```typescript
import { AuthProvider } from '@/context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <YourAppRouter />
    </AuthProvider>
  );
}
```

#### 4. Replace Auth Components

Update `src/components/auth/PhoneLoginForm.tsx`:

```typescript
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export function PhoneLoginForm() {
  const { requestOTP, verifyOTP } = useAuth();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [phone, setPhone] = useState('');
  const [otp, setOTP] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await requestOTP(phone);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await verifyOTP(phone, otp);
      // Redirect to home page on success
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'request') {
    return (
      <form onSubmit={handleRequestOTP}>
        <input
          type="tel"
          placeholder="+7 (999) 123-45-67"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send OTP'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={handleVerifyOTP}>
      <p>Enter OTP sent to {phone}</p>
      <input
        type="text"
        placeholder="123456"
        value={otp}
        onChange={(e) => setOTP(e.target.value)}
        disabled={isLoading}
        maxLength={6}
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Verifying...' : 'Verify'}
      </button>
      <button type="button" onClick={() => setStep('request')} disabled={isLoading}>
        Back
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

### Phase 3: Environment Configuration

#### 1. Update `.env.example`

```bash
# Timeweb Phone Auth
VITE_PHONE_AUTH_API_URL=https://api.mansoni.ru

# Supabase (Fallback)
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```

#### 2. Update `.env.local` (local development)

```bash
VITE_PHONE_AUTH_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```

### Phase 4: Testing

#### 1. Start Services Locally

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Phone Auth Backend
npm run phone:auth:dev
```

#### 2. Test OTP Request

```bash
curl -X POST http://localhost:3001/auth/phone/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567"}'
```

Check console output for OTP code (stub SMS provider logs it).

#### 3. Test OTP Verification

```bash
curl -X POST http://localhost:3001/auth/phone/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79991234567", "otp":"123456"}'
```

Response should include JWT token:

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

#### 4. Test Browser Integration

Navigate to login page and:
1. Enter phone number → clicks "Send OTP"
2. Check console for OTP code
3. Enter OTP → clicks "Verify"
4. Should redirect to home page with JWT token in localStorage

### Phase 5: Failover Testing

#### 1. Simulate Timeweb Unavailability

```bash
# Stop phone-auth service
pm2 stop phone-auth

# Clear browser cache/token
localStorage.removeItem('auth_token')

# Try login again
# Should automatically fall back to Supabase
```

#### 2. Verify Fallback Works

Check browser console for warning:
```
[Timeweb Auth] Falling back to Supabase for OTP request
```

## SMS Provider Configuration

### Stub Provider (Development)

Default. Logs OTP to console:

```
[STUB SMS] Phone: 79991234567, OTP: 123456 (Valid for 300s)
```

### Timeweb SMS Provider (Production)

1. Get API key from Timeweb Console
2. Set environment variable:

```bash
TIMEWEB_SMS_API_KEY=your_api_key_here
SMS_PROVIDER=timeweb
```

3. Implement SMS sending in `server/phone-auth/index.mjs` (see `sendOTP` function):

```javascript
case "timeweb":
  const response = await fetch("https://api.timeweb.com/api/v1/sms/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TIMEWEB_SMS_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      phone: normalizedPhone,
      text: `Your ECOMANSONI login code: ${otp}. Valid for 5 minutes.`
    })
  });
  
  if (response.ok) {
    return { success: true, provider: "timeweb" };
  }
  return { success: false, error: `Timeweb API error: ${response.status}` };
```

## Database Management

### Backup Strategy

```bash
# Backup Timeweb PostgreSQL
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup-20260226.sql
```

### Monitor Phone Auth Tables

```bash
# Check users created today
SELECT COUNT(*), DATE(created_at) FROM users GROUP BY DATE(created_at);

# Check OTP failures
SELECT phone, COUNT(*), action FROM otp_audit_log 
  WHERE action IN ('expired', 'max_attempts') 
  GROUP BY phone, action;
```

## Monitoring & Logging

### PM2 Logs

```bash
# Real-time logs
pm2 logs phone-auth

# Last 100 lines
pm2 logs phone-auth --lines 100

# Monitor resources
pm2 monit
```

### Nginx Logs

```bash
# Auth endpoint access
tail -f /var/log/nginx/access.log | grep "auth/phone"

# Errors
tail -f /var/log/nginx/error.log
```

### Application Metrics to Track

- OTP request rate
- OTP verification success rate
- User creation rate (new vs. returning)
- API response times
- Error rates by type
- Fallback to Supabase frequency

## Rollback Plan

If Timeweb auth service becomes unstable:

1. **Immediate**: Disable Timeweb in client config:

   ```typescript
   export const authClient = createAuthClient({
     apiBaseUrl: 'https://api.mansoni.ru',
     fallbackToSupabase: true, // ← Force Supabase
   });
   ```

2. **Restart Services**:

   ```bash
   pm2 restart phone-auth
   systemctl reload nginx
   ```

3. **Monitor**: Watch for automatic fallback to Supabase
4. **Debug**: Check Timeweb logs and database
5. **Deploy Fix**: Update service code and restart

## Future Enhancements

- [ ] Redis OTP store (distributed sessions)
- [ ] Twilio SMS provider integration
- [ ] Rate limiting per IP (distributed)
- [ ] OTP audit dashboard
- [ ] Passwordless login with magic links
- [ ] 2FA support
- [ ] Biometric authentication
- [ ] Token refresh endpoint
- [ ] User profile endpoints
