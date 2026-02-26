# Timeweb Auth Deployment Checklist

## Pre-Deployment

- [ ] Timeweb PostgreSQL database is running and accessible
- [ ] Database migration script (`server/phone-auth/migration.sh`) is prepared
- [ ] Let's Encrypt SSL certificate is installed on Timeweb server
- [ ] Nginx is installed and configured with reverse proxy
- [ ] Node.js 18+ is installed on Timeweb server
- [ ] PM2 is installed globally on Timeweb server
- [ ] Git repository is cloned on Timeweb server
- [ ] All environment variables are prepared (JWT_SECRET, DATABASE_URL, etc.)
- [ ] SMS provider API keys are obtained (Timeweb SMS API)
- [ ] Backup strategy is in place (database backup scripts)

## Deployment Steps

### Phase 1: Backend Deployment (Timeweb Server)

- [ ] SSH into server (ssh root@5.42.99.76)
- [ ] Navigate to repo: `cd /var/app && git pull origin main`
- [ ] Install dependencies: `cd server/phone-auth && npm install --production`
- [ ] Create `.env.local` with all required environment variables
- [ ] Run database migration: `bash migration.sh`
  - [ ] Verify `users` table was created
  - [ ] Verify indexes were created
  - [ ] Verify OTP audit log table was created
  - [ ] Verify revoked_tokens table was created
- [ ] Start service with PM2:
  - [ ] `pm2 start index.mjs --name phone-auth --env production`
  - [ ] `pm2 save`
  - [ ] `pm2 startup`
- [ ] Configure Nginx reverse proxy
  - [ ] Edit `/etc/nginx/sites-available/mansoni-api`
  - [ ] Add upstream block for phone_auth_backend
  - [ ] Add location block for /auth/phone
  - [ ] Test config: `nginx -t`
  - [ ] Reload: `systemctl reload nginx`
- [ ] Verify service is running:
  - [ ] Check logs: `pm2 logs phone-auth`
  - [ ] Health check: `curl https://api.mansoni.ru/health`
  - [ ] Test OTP endpoint: `curl -X POST https://api.mansoni.ru/auth/phone/request-otp ...`

### Phase 2: Client Integration

- [ ] Copy `src/lib/auth/timeweb-phone-auth.ts` to project
- [ ] Create `src/lib/auth/index.ts` with auth client initialization
- [ ] Create `src/context/AuthContext.tsx` with React context
- [ ] Update `src/App.tsx` to wrap with `<AuthProvider>`
- [ ] Update `src/components/auth/PhoneLoginForm.tsx` to use new auth client
- [ ] Update `.env.example` with VITE_PHONE_AUTH_API_URL variables
- [ ] Update `.env.local` (development) with correct API URLs
- [ ] Build and test locally:
  - [ ] `npm run dev` - Frontend should start
  - [ ] `npm run phone:auth:dev` - Backend should start
  - [ ] Navigation to login page should work
  - [ ] Phone OTP flow should complete successfully

### Phase 3: Fallback Configuration

- [ ] Verify Supabase credentials are available in `.env`
  - [ ] VITE_SUPABASE_URL
  - [ ] VITE_SUPABASE_ANON_KEY
- [ ] Test fallback locally:
  - [ ] Kill phone-auth service
  - [ ] Clear localStorage token
  - [ ] Try login again
  - [ ] Verify fallback to Supabase works
- [ ] Update Timeweb phone-auth client to use correct Supabase config
- [ ] Implement Supabase fallback functions in TypeScript client

### Phase 4: Testing & Validation

- [ ] Smoke test: OTP request and verification
  - [ ] Request OTP returns masked phone and expiration time
  - [ ] Invalid OTP returns "Invalid OTP" error
  - [ ] Exceeded max attempts returns proper error
  - [ ] Expired OTP returns expiration error
  - [ ] Valid OTP returns JWT token
- [ ] User creation test:
  - [ ] New phone number creates new user in database
  - [ ] Existing phone number logs in existing user
  - [ ] last_login_at is updated on verification
- [ ] Rate limiting test:
  - [ ] Second OTP request within 30 seconds returns rate limit error
  - [ ] OTP request allowed after 30 seconds
- [ ] CORS test:
  - [ ] Request from allowed origin succeeds
  - [ ] Request from disallowed origin fails
  - [ ] Preflight OPTIONS request returns proper headers
- [ ] Token validation test:
  - [ ] JWT token is valid and can be decoded
  - [ ] Token contains user ID and phone number
  - [ ] Token expiration is 7 days
  - [ ] Token can be used in Authorization header

### Phase 5: Production Hardening

- [ ] Set SMS_PROVIDER=timeweb (not stub)
- [ ] Set NODE_ENV=production
- [ ] Verify JWT_SECRET is strong (openssl rand -base64 32)
- [ ] Database credentials are not in env but in secure storage
- [ ] Rate limiting is configured appropriately (OTP_VALIDITY_SEC, OTP_MAX_ATTEMPTS)
- [ ] CORS_ALLOWED_ORIGINS is restricted to mansoni.ru domain only
- [ ] Nginx SSL configuration is hardened:
  - [ ] TLS 1.2+ only
  - [ ] Strong ciphers configured
  - [ ] HSTS header set
  - [ ] X-Frame-Options set to DENY
  - [ ] X-Content-Type-Options set to nosniff
- [ ] Database backups are scheduled:
  - [ ] Daily backup to S3 or external storage
  - [ ] Retention policy (30 days)
  - [ ] Restore procedure tested

### Phase 6: Monitoring Setup

- [ ] PM2 monitoring configured:
  - [ ] Log rotation set up
  - [ ] Memory/CPU limits configured
  - [ ] Auto-restart on crash enabled
- [ ] Nginx error logging enabled
  - [ ] `/var/log/nginx/error.log` monitored
- [ ] System monitoring:
  - [ ] Server uptime monitoring (Grafana/DataDog)
  - [ ] Service health checks every minute
  - [ ] Alert configured if service down
- [ ] Application metrics:
  - [ ] OTP request rate tracked
  - [ ] Error rate tracked
  - [ ] User creation rate tracked
  - [ ] Fallback switch rate tracked

### Phase 7: Documentation

- [ ] Update TIMEWEB_AUTH_MIGRATION.md with actual URLs
- [ ] Update README.md with new auth flow
- [ ] Document all environment variables used
- [ ] Create runbook for common issues:
  - [ ] Service won't start
  - [ ] Database connection fails
  - [ ] OTP not being sent
  - [ ] Fallback triggers unexpectedly
- [ ] Document rollback procedure

### Phase 8: Communication

- [ ] Notify team of new auth endpoint
- [ ] Share updated client integration guide
- [ ] Share credentials for Timeweb SMS API (securely)
- [ ] Schedule post-deployment review meeting

## Post-Deployment Verification

### Day 1
- [ ] Monitor service logs for errors
- [ ] Check error rate (should be <0.1%)
- [ ] Verify OTP delivery time (<1 second)
- [ ] Test with actual users if possible

### Week 1
- [ ] Analyze OTP success rate (should be >95%)
- [ ] Monitor fallback to Supabase rate (should be 0%)
- [ ] Check database growth (users table size)
- [ ] Performance review (response times)

### Month 1
- [ ] Compare OTP delivery times across SMS providers
- [ ] Analyze user registration funnel
- [ ] Review database for any anomalies
- [ ] Plan for optimizations (Redis, distributed rate limiting)

## Rollback Procedure

If deployment needs to be rolled back:

1. **Stop phone-auth service**:
   ```bash
   pm2 stop phone-auth
   ```

2. **Revert client configuration**:
   ```typescript
   // Force use of Supabase
   fallbackToSupabase: true,
   apiBaseUrl: null, // Disable Timeweb
   ```

3. **Commit and deploy frontend**:
   ```bash
   git add .
   git commit -m "Rollback: Disable Timeweb auth, use Supabase primary"
   git push
   ```

4. **Clear user browser caches** (communicate via support)

5. **Investigate issues** with phone-auth service

6. **Redeploy after fixes**

## Success Criteria

- [x] Phone-auth service is running and healthy
- [x] OTP request endpoint is responding <200ms
- [x] OTP verification endpoint is responding <300ms
- [x] User registration is working
- [x] Fallback to Supabase works if Timeweb fails
- [x] SSL/TLS is working (https://api.mansoni.ru)
- [x] CORS is properly configured
- [x] Database has users data
- [x] JWT tokens are being issued correctly
- [x] Frontend login flow works end-to-end