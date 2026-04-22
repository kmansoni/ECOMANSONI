# 🚀 Deployment Guide — Music Module

## Quick Deploy (Production)

### 1. Environment Setup

Create `.env` in project root:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Music Module CDN URL (set after first deploy)
VITE_MUSIC_MODULE_URL=https://cdn.mansoni.com/modules/music/music-module.js

# Mansoni JWT (shared with backend)
MANSONI_JWT_SECRET=your_jwt_secret_here

# Music API
SUPABASE_URL=$VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Build and Deploy

```bash
# Install music module dependencies
cd services/music && npm install && cd ../..

# Build all modules
npm run build:modules

# Output:
# - public/modules/music/music-module.js (2 MB)
# - dist/modules/music/manifest.json
```

### 3. Deploy to CDN (S3/CloudFront)

```bash
# Sync to S3
aws s3 sync public/modules/ s3://cdn.mansoni.com/modules/ --acl public-read

# Invalidate CloudFront cache (if using)
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/modules/music/*"
```

### 4. Update Main App Environment

Set in production `.env`:

```env
VITE_MUSIC_MODULE_URL=https://cdn.mansoni.com/modules/music/music-module.js
```

Rebuild main app:
```bash
npm run build
```

### 5. Deploy Main App

Deploy to your hosting (Vercel/Netlify/your VPS):

```bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod

# Or your own server
npm run build
# Copy dist/ to /var/www/mansoni/
```

---

## 🔄 Continuous Deployment (GitHub Actions)

### Automatic (recommended)

The repo includes `.github/workflows/deploy-music.yml` which:

1. Triggers on push to `main` in `services/music/`
2. Runs typecheck & build
3. Uploads to S3 CDN
4. Notifies admin VPS via webhook

**Setup:**

1. Go to **GitHub Settings → Secrets and variables → Actions**
2. Add:
   - `AWS_ACCOUNT_ID` — your AWS account ID
   - `AWS_ACCESS_KEY_ID` — IAM user with S3 access
   - `AWS_SECRET_ACCESS_KEY` — secret key
   - `ADMIN_VPS_WEBHOOK_URL` — `https://your-vps.com/api/deploy`
   - `ADMIN_VPS_TOKEN` — secret token for VPS webhook
   - `SLACK_WEBHOOK_URL` — optional, for notifications

3. Ensure IAM policy allows:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::cdn.mansoni.com/modules/music/*"
    }
  ]
}
```

---

## 🐳 Docker Development

### Using Docker Compose

For local development with all services:

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f music-api
docker-compose logs -f music-frontend

# Stop
docker-compose down

# Rebuild after changes
docker-compose build --no-cache music-api
docker-compose up -d music-api
```

Access:
- Main app: http://localhost:5173
- Music frontend dev: http://localhost:3001
- Music API: http://localhost:3080/health

---

## 📱 Capacitor (Mobile) Build

### Android APK with Dynamic Modules

1. Build main app:
```bash
npm run build
npx cap sync android
```

2. Music module will be **NOT** in APK. It downloads on first use.

3. To test:
```bash
npm run mobile:android
# Open Android Studio → Run
```

### iOS

Same process:
```bash
npm run mobile:ios
```

---

## 🔐 Security Checklist

- [x) RLS enabled on all Supabase tables
- [x] JWT verification in `music-api`
- [x] Rate limiting on API (100 req/15min)
- [x] Helmet security headers
- [x] CORS restricted to allowed origins
- [x] Storage bucket private, signed URLs
- [ ] Module signature verification (HMAC) — TODO
- [ ] HTTPS in production (required for Service Worker)

---

## 📊 Monitoring

### Health checks

```bash
# API health
curl http://localhost:3080/health

# Module manifest
curl https://cdn.mansoni.com/modules/music/manifest.json
```

### Logs

```bash
# Docker
docker-compose logs -f music-api

# VPS (systemd)
sudo journalctl -u mansoni-music-api -f
```

---

## 🛠️ Troubleshooting

### "Module not found" error

1. Check CDN URL:
```bash
curl -I https://cdn.mansoni.com/modules/music/music-module.js
```

2. If 404, re-run `npm run build:modules` and re-deploy.

### CORS errors

Ensure `VITE_MUSIC_MODULE_URL` in main app matches `CORS` origin in `music-api` server.

### Supabase RLS blocking

Check policies in Supabase Dashboard → Authentication → Policies.

### ModuleLoader fails to install

Check browser console for:
- CORS
- Network connectivity
- Free space (rare)

---

## 🔄 Rollback

### To previous version:

```bash
# List versions (keep git tags)
git tag music-v1.0.0 music-v1.0.1

# Rollback (checkout previous commit)
git checkout music-v1.0.0
npm run build:modules
aws s3 sync public/modules/ s3://cdn.mansoni.com/modules/
```

---

## 📦 Module Size Optimization

To reduce module size:

1. **Tree-shake unused dependencies** — already configured in Vite
2. **Compress** — gzip already enabled in nginx
3. **Split chunks** — modify `vite.config.ts` if needed:
```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor': ['react', 'react-dom'],
        'supabase': ['@supabase/supabase-js'],
      }
    }
  }
}
```

---

## 🎯 Production Checklist

- [x] Supabase migrations applied
- [x] `.env` configured with production URLs
- [x] CDN (S3/CloudFront) set up
- [x] HTTPS enabled (SLL certificate)
- [x] Domain points to server (music.mansoni.com)
- [x] VITE_MUSIC_MODULE_URL updated to production CDN
- [x] Service Worker registered (for offline) — optional
- [x] Monitoring (Sentry, logs) — optional
