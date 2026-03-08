# Media Server Infrastructure — `media.mansoni.ru`

> **Production-grade** S3-compatible media storage and CDN for the mansoni.ru platform.  
> Replaces Supabase Storage with a self-hosted stack on AdminVPS.

---

## Architecture

```
                        ┌──────────────────────────────────────────┐
                        │              AdminVPS                      │
                        │                                            │
  Client (browser /     │  ┌──────────────────────────────────────┐ │
  mobile app)           │  │  Nginx  :443 (TLS, Let's Encrypt)    │ │
  ──────────────────►   │  │                                      │ │
                        │  │  GET  /       → MinIO :9000 (CDN)    │ │
                        │  │  POST /api/upload → media-api :3100  │ │
                        │  │  cache: 1y immutable (hot objects)   │ │
                        │  └────────┬───────────────┬─────────────┘ │
                        │           │               │               │
                        │  ┌────────▼──────┐  ┌────▼────────────┐ │
                        │  │  MinIO :9000  │  │  media-api      │ │
                        │  │  (object      │  │  :3100 Node.js  │ │
                        │  │   storage)    │◄─│  JWT auth       │ │
                        │  │               │  │  image/video    │ │
                        │  │  Console:9001 │  │  processing     │ │
                        │  │  (SSH tunnel  │  └─────────────────┘ │
                        │  │   only)       │                       │
                        │  └───────────────┘                       │
                        └──────────────────────────────────────────┘

Upload flow:
  1. Client sends POST /api/upload  + Authorization: Bearer <JWT>
  2. Nginx rate-limits (10 req/min/IP) and forwards to media-api
  3. media-api verifies JWT against Supabase JWT_SECRET
  4. media-api processes file (resize, thumbnail, transcode)
  5. media-api stores object in MinIO with content-addressed UUID key
  6. media-api returns { url: "https://media.mansoni.ru/<bucket>/<uuid>.<ext>" }

Read flow (CDN):
  1. Client requests GET https://media.mansoni.ru/<bucket>/<uuid>.<ext>
  2. Nginx checks proxy_cache (hit → serve immediately, miss → fetch MinIO)
  3. Response headers include Cache-Control: public, max-age=31536000, immutable
```

---

## Bucket Map

| Bucket | Contents | Max size |
|---|---|---|
| `media` | Posts, Stories, Reels (general) | 500 MB video / 20 MB image |
| `chat-media` | Photos and videos in chats | 500 MB / 20 MB |
| `voice-messages` | Voice messages `.webm` | 50 MB audio |
| `reels-media` | Short-form video (Reels) | 500 MB video |
| `avatars` | User avatars, shop logos | 5 MB |
| `stories-media` | Stories media | 500 MB / 20 MB |

All buckets have **anonymous GET** (read-only) enabled; object names are UUIDs (unpredictable). Bucket listing is explicitly **denied** for anonymous principals.

---

## Requirements

- **Docker** ≥ 24.0
- **Docker Compose** ≥ 2.20
- **SSL certificate** for `media.mansoni.ru` (Let's Encrypt recommended)
- Open ports: **80**, **443** on AdminVPS

---

## Installation & First Run

### 1. Clone / pull the infrastructure

```bash
git pull origin main
cd infra/media
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in all CHANGE_ME and YOUR_* values
nano .env
```

**Critical values to set:**

| Variable | Description |
|---|---|
| `MINIO_ROOT_PASSWORD` | Minimum 32 random characters |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase project Settings → API |
| `JWT_SECRET` | From Supabase project Settings → API → JWT Secret |

### 3. Obtain SSL certificate

```bash
# On the host (not inside Docker):
certbot certonly --standalone \
  -d media.mansoni.ru \
  --email admin@mansoni.ru \
  --agree-tos --no-eff-email

# Verify:
ls /etc/letsencrypt/live/media.mansoni.ru/
```

### 4. Configure Nginx http{} context

The rate limit zones and proxy cache must be declared in the main `nginx.conf` `http{}` block. Add to `/etc/nginx/nginx.conf` (or a file included in `http{}`):

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=read_limit:20m   rate=300r/m;

# Proxy cache (20 GB disk)
proxy_cache_path /var/cache/nginx
    levels=1:2
    keys_zone=media_cache:100m
    max_size=20g
    inactive=7d
    use_temp_path=off;
```

### 5. Start the stack

```bash
docker compose up -d
# Watch init:
docker compose logs -f minio-init
```

### 6. Verify

```bash
# All services healthy:
docker compose ps

# MinIO API:
curl -f http://localhost:9000/minio/health/live  # from host (internal port)

# media-api:
curl https://media.mansoni.ru/api/health

# Nginx:
curl -I https://media.mansoni.ru/
```

---

## MinIO Console (admin UI)

The console is **NOT exposed to the internet** (port 9001 is internal only). Access via SSH tunnel:

```bash
ssh -L 9001:localhost:9001 user@<adminvps-ip>
# Then open: http://localhost:9001
# Login: $MINIO_ROOT_USER / $MINIO_ROOT_PASSWORD
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `MINIO_ROOT_USER` | — | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | — | MinIO admin password (≥32 chars) |
| `MINIO_ENDPOINT` | `http://minio:9000` | Internal MinIO URL for media-api |
| `MEDIA_API_PORT` | `3100` | media-api listen port |
| `MEDIA_DOMAIN` | `media.mansoni.ru` | Public domain for URL generation |
| `SUPABASE_URL` | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role key |
| `JWT_SECRET` | — | Supabase JWT secret for token verification |
| `MAX_IMAGE_SIZE_MB` | `20` | Max image upload size |
| `MAX_VIDEO_SIZE_MB` | `500` | Max video upload size |
| `MAX_AUDIO_SIZE_MB` | `50` | Max audio upload size |
| `MAX_AVATAR_SIZE_MB` | `5` | Max avatar upload size |
| `IMAGE_MAX_WIDTH` | `2048` | Max image width after resize |
| `IMAGE_QUALITY` | `85` | JPEG/WebP quality (1–100) |
| `VIDEO_MAX_BITRATE` | `4000k` | Max video bitrate |
| `THUMBNAIL_WIDTH` | `480` | Video thumbnail width |
| `THUMBNAIL_HEIGHT` | `480` | Video thumbnail height |

---

## Monitoring & Healthchecks

| Service | Endpoint | Check interval |
|---|---|---|
| MinIO | `http://minio:9000/minio/health/live` | 30s |
| media-api | `http://media-api:3100/api/health` | 15s |
| Nginx | `http://nginx/nginx-health` | 30s |

### View logs

```bash
docker compose logs -f minio
docker compose logs -f media-api
docker compose logs -f nginx
```

### Resource usage

```bash
docker stats mansoni-minio mansoni-media-api mansoni-media-nginx
```

---

## Backup Strategy

### MinIO data backup

MinIO data is stored in the Docker volume `minio-data`. Recommended backup approaches:

**Option A — MinIO mirror (replicate to another S3)**

```bash
# Mirror to a remote S3-compatible backup
mc mirror local/ s3-backup/mansoni-media-backup/ --watch
```

**Option B — Restic (incremental, encrypted)**

```bash
# Install restic on host, then:
restic -r s3:s3.amazonaws.com/my-backup-bucket backup \
  $(docker volume inspect infra_minio-data --format '{{ .Mountpoint }}')
```

**Frequency:**
- Full backup: weekly
- Incremental: daily
- Retention: 30 days minimum

### Critical: test restores monthly

```bash
# Restore test to a staging MinIO instance
restic -r s3:... restore latest --target /tmp/minio-restore-test
mc alias set test http://staging-minio:9000 admin password
mc mirror /tmp/minio-restore-test test/
```

---

## Security Notes

1. **MinIO console is never exposed** — 9001 not bound to host interface
2. **MinIO API not exposed** — 9000 only reachable via Nginx proxy in `media-net`
3. **JWT required for writes** — Nginx rejects uploads without `Authorization` header before proxying
4. **Rate limiting** — 10 uploads/min per IP, 429 for excess
5. **Content-type validation** — media-api enforces MIME type allowlist server-side
6. **Object names are UUIDs** — content-addressed, not guessable
7. **No bucket listing** — anonymous `s3:ListBucket` is denied in bucket policies
8. **TLS 1.2+ only** — SSLv3, TLS 1.0, TLS 1.1 disabled

---

## Upgrade / Rollback

```bash
# Pull new images, rebuild, rolling restart with zero downtime:
docker compose pull
docker compose up -d --build --no-deps media-api
docker compose up -d --no-deps nginx

# Rollback to previous image:
docker compose down media-api
docker tag mansoni-media-api:latest mansoni-media-api:rollback-$(date +%Y%m%d)
# Edit docker-compose.yml image tag to pinned version
docker compose up -d media-api
```
