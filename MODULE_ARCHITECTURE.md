# 🎵 Music Module — Architecture Deep-Dive

## 1. System Overview

Dynamic module loading system for Spotify-like music streaming without bloating main APK.

```
┌─────────────────┐
│   mansoni.apk   │ 100 MB (core app)
│   └── ModuleLoader.ts
└────────┬────────┘
         │ on-demand
         ▼
┌─────────────────────────────────────────────┐
│     CDN: cdn.mansoni.com/modules/           │
│     └── music/music-module.js (2 MB)        │
└────────┬────────────────────────────────────┘
         │ download & cache
         ▼
┌─────────────────┐
│  Device FS      │ /data/data/com.mansoni/files/modules/music/
│  └── index.js   │ ← stored locally
└────────┬────────┘
         │ dynamic import()
         ▼
┌─────────────────┐
│  React render   │ <MusicHomePage /> (native)
└─────────────────┘
```

---

## 2. Module Structure (Isolated Bundle)

**Music module** (`services/music/`) is a **self-contained React application**:

```
music-module.js (2 MB) contains:
├── React components (all pages)
├── Zustand store
├── React Router (6.30)
├── Lucide icons (subset)
├── CSS-in-JS (Tailwind via CDN in dev, inline in prod)
└── No Duplicate deps:
    └── React 18 — PROVIDED BY MAIN APP (external)
```

**Key:** `vite.config.ts` marks `react`, `react-dom` as `external` → they are NOT bundled.

---

## 3. Loading Strategies

### 3.1 Native (Capacitor — Android/iOS)

**Flow:**

```
1. User opens /services/music
   ↓
2. MusicPage.tsx renders
   ↓
3. moduleLoader.isInstalled('music')
   ↓
   ├─ YES → loadModule() from filesystem
   └─ NO  → install() from CDN
         ↓
         a) Download music-module.js (XHR with progress)
         b) Save to FileSystem (Capacitor Filesystem API)
         c) Write manifest.json (version tracking)
         ↓
         loadModule():
           1. Read file from FS (base64)
           2. Convert to Blob
           3. Create blob URL
           4. import(blobUrl) → ESM module
           5. Extract default export (React component)
           6. Render
```

**Storage locations:**

| Platform | Path |
|----------|------|
| Android | `/data/data/com.mansoni/files/modules/music/index.js` |
| iOS | `Library/Application Support/modules/music/index.js` |
| Web (if saved) | `IndexedDB` or `CacheStorage` (future) |

### 3.2 Web (Browser)

```
1. Try: import('/modules/music/music-module.js')  ← from public/
2. Fallback: import(VITE_MUSIC_MODULE_URL)        ← CDN
3. Render component
```

**No filesystem** — uses standard ES module import + browser cache.

---

## 4. Communication Between Core & Module

### 4.1 Token Passing

**Core → Module:**
```tsx
// MusicPage.tsx
<iframe src={`${MUSIC_URL}?token=${jwt}`} />
// OR
window.__MANSONI_TOKEN__ = jwt;  // before loading
```

**Module reads token:**
```tsx
// services/music/src/lib/supabase.ts
const token = window.__MANSONI_TOKEN__ || localStorage.getItem('mansoni_token');
```

### 4.2 PostMessage (iframe fallback)

If using iframe instead of dynamic import:
```js
// Core
iframe.contentWindow.postMessage({ type: 'AUTH', token }, '*');

// Module
window.addEventListener('message', (e) => {
  if (e.data.type === 'AUTH') {
    // set token
  }
});
```

---

## 5. Security Model

### 5.1 Module Integrity

**Current (development):** No signature verification  
**Production (planned):** HMAC-SHA256 signature in manifest

```json
{
  "id": "music",
  "version": "1.0.0",
  "checksum": "sha256:abc123...",
  "url": "https://cdn.../music-module.js"
}
```

Installation:
```
download file → compute SHA256 → compare with manifest.checksum
if mismatch → reject installation
```

### 5.2 JWT Authentication

```
┌──────────┐  JWT signed with MANSONI_JWT_SECRET   ┌──────────┐
│  Mansoni │ ────────────────┬─────────────────────▶│  music   │
│   Core   │                 │                     │   API    │
└──────────┘                 │                     └──────────┘
      │                       │ token               │ verify
      │ localStorage          │                     │
      ▼                       ▼                     ▼
  window.__MANSONI_TOKEN__  ─▶  Authorization: Bearer <token>
                                   │
                                   ▼
                          jwt.verify(secret)
                                   │
                                   ▼
                          req.user = { id, ... }
                                   │
                                   ▼
                          RLS: auth.uid() = user_id
```

**Shared secret:** `MANSONI_JWT_SECRET` (in `.env` of both apps)

### 5.3 Supabase RLS

All tables have **row-level security**:

```sql
-- Users can only see their own playlists
CREATE POLICY "Users can manage own playlists" ON music_playlists
  FOR ALL USING (auth.uid() = user_id);

-- Public read for tracks
CREATE POLICY "Public read access for tracks" ON music_tracks
  FOR SELECT USING (true);
```

`music-api` uses **service_role key** for admin operations (bypass RLS), but regular user queries use JWT with RLS.

---

## 6. Database Schema

### Core Tables

| Table | Purpose | Rows (est.) |
|-------|---------|-------------|
| `music_artists` | Artist metadata | 10K |
| `music_albums` | Album metadata | 100K |
| `music_tracks` | Audio tracks | 1M |
| `music_playlists` | User playlists | 100K |
| `music_playlist_tracks` | Playlist contents | 10M |
| `music_play_history` | Listening history | 100M |
| `music_likes` | Liked tracks | 10M |
| `music_subscriptions` | Stripe subs | 10K |
| `music_downloads` | Offline downloads | 1M |

### Indexes

```sql
-- Fast lookups
CREATE INDEX idx_music_tracks_artist ON music_tracks(artist_id);
CREATE INDEX idx_music_tracks_album ON music_tracks(album_id);
CREATE INDEX idx_music_play_history_user ON music_play_history(user_id);
CREATE INDEX idx_music_play_history_played ON music_play_history(played_at DESC);
CREATE INDEX idx_music_likes_user ON music_likes(user_id);

-- Popularity queries
CREATE INDEX idx_music_tracks_popularity ON music_tracks(popularity DESC);
```

### Storage Bucket

```
supabase/
└── storage/
    └── buckets/music/
        ├── audio/original/track-123.mp3   (50 MB max)
        ├── audio/preview/track-123-30s.mp3
        └── covers/artist-456.jpg
```

**Policies:**
- Authenticated users: read audio
- Service role: write (upload)
- Public: no direct access (signed URLs only)

---

## 7. API Endpoints

### Public (no auth)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/tracks` | List tracks (paginated) |
| GET | `/api/tracks/:id` | Get track details |
| GET | `/api/artists` | List artists |
| GET | `/api/albums` | List albums |
| GET | `/api/search?q=...` | Search |
| GET | `/health` | Health check |

### Authenticated (require JWT)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/playlists` | User's playlists |
| POST | `/api/playlists` | Create playlist |
| PUT | `/api/playlists/:id` | Update playlist |
| DELETE | `/api/playlists/:id` | Delete playlist |
| POST | `/api/playlists/:id/tracks` | Add track |
| DELETE | `/api/playlists/:id/tracks/:trackId` | Remove track |
| GET | `/api/likes` | Liked tracks |
| POST | `/api/likes` | Like track |
| DELETE | `/api/likes/:trackId` | Unlike |
| GET | `/api/recommendations` | Personalised recs |
| GET | `/api/stream/:id` | Get signed audio URL |

---

## 8. Build Pipeline

### 8.1 Module Build

```
services/music/
├── src/ → Vite builds → dist/index.js (ESM)
   ↓
scripts/build-modules.mjs
   ↓
Copy → public/modules/music/music-module.js  (for dev)
   ↓
Copy → dist/modules/music/music-module.js    (for prod/CDN)
   ↓
Generate manifest.json with checksum
```

**Vite config:**
```js
build: {
  lib: {
    entry: 'src/index.ts',
    name: 'MusicModule',
    formats: ['es'],
    fileName: 'index',
  },
  rollupOptions: {
    external: ['react', 'react-dom', 'react-router-dom'],
    output: {
      exports: 'named',
      entryFileNames: 'index.js',
    },
  },
}
```

### 8.2 CDN Deployment

```
Git push → GitHub Actions
   ↓
npm ci
npm run build:modules
   ↓
aws s3 sync public/modules/ s3://cdn.mansoni.com/modules/
   ↓
[Optional] CloudFront invalidation
   ↓
Live! 🎉
```

---

## 9. Offline-First Design

### Caching Layers

1. **Module code** — stored in filesystem, loads instantly after install
2. **API responses** — TODO: IndexedDB cache (via TanStack Query persistence)
3. **Audio files** — TODO: Service Worker + Cache API (if streaming via HTTP)

### Offline Capabilities

| Feature | Offline? | Implementation |
|---------|----------|----------------|
| Read module UI | ✅ | Filesystem |
| View playlists (cached) | ⚠️ | Not implemented |
| Play downloaded tracks | ⚠️ | Storage download feature |
| Stream new tracks | ❌ | Requires internet |

---

## 10. Error Handling

### Module Installation Failures

```ts
try {
  await moduleLoader.install('music', manifest);
} catch (err) {
  if (err instanceof NetworkError) {
    showUI('No internet');
  } else if (err.code === 'INSUFFICIENT_SPACE') {
    showUI('Not enough storage');
  } else {
    showUI('Installation failed');
  }
}
```

### API Errors

```ts
const { data, error } = await supabase
  .from('music_tracks')
  .select('*');

if (error) {
  if (error.code === '42501') { // RLS violation
    toast.error('Access denied');
  } else if (error.code === 'PGRST116') { // NotFound
    toast.error('Track not found');
  }
}
```

---

## 11. Testing Strategy

### Unit Tests

```bash
# ModuleLoader logic
npm run test -- src/lib/ModuleLoader.test.ts

# Music store
npm run test -- services/music/src/store/useMusicStore.test.ts
```

### Integration Tests

```bash
# Mock CDN, test install → load → render
npm run test:module:music
```

### E2E (Playwright)

```bash
# Test full flow:
# 1. Install module
# 2. Open /services/music
# 3. Verify UI renders
npx playwright test e2e/music-module.spec.ts
```

---

## 12. Monitoring & Observability

### Metrics to Track

| Metric | Tool |
|--------|------|
| Module download success rate | Custom event (GA4) |
| Installation time | Performance API |
| Module version active | Feature flag |
| API error rate | Sentry |
| Play count | Supabase `music_play_history` |

### Logs

```js
// ModuleLoader
console.log('[ModuleLoader] Installing music...');
console.log('[ModuleLoader] Download progress: 45%');

// Music API (Express)
app.use((err, req, res, next) => {
  console.error('[MusicAPI]', err);
});
```

---

## 13. Scaling Considerations

### Database

- **Read replicas** for track queries (high read:write ratio)
- **Connection pooling** (PgBouncer)
- **Partition** `music_play_history` by `played_at` (monthly)

### CDN

- **Edge caching**: CloudFront / Cloudflare
- **Cache headers**: `Cache-Control: public, max-age=31536000, immutable`
- **Versioned URLs**: `music-module.v1.0.0.js` (cache bust on update)

### API

- **Rate limiting** per user (not just IP)
- **Response caching**: Redis for `/api/tracks` (1 min TTL)
- **Query optimization**: Add covering indexes for common queries

---

## 14. Migration Path from Demo → Full mrwebwork Code

### Current State

We have **minimal demo** components:
- `MusicHomePage.tsx` — hardcoded demo tracks
- `useMusicStore.ts` — mock data

### Target State

Full mrwebwork/spotify integration:
- Real Supabase queries
- Spotify Web API integration (optional)
- User authentication via JWT
- Realtime updates (presence, listening)
- Audio streaming with waveform

### Migration Steps

1. **Replace store with API calls**
```tsx
// Before
const tracks = useMusicStore(s => s.playlists[0].tracks);

// After
const { data } = useSupabaseQuery('music_tracks', { limit: 20 });
```

2. **Add audio player** (Web Audio API / Howler.js)

3. **Implement offline downloads** (Supabase Storage → FileSystem)

4. **Add real-time** (Supabase Realtime subscriptions for likes/follows)

---

## 15. Known Limitations

| Limitation | Workaround |
|------------|------------|
| Web version requires internet on first load | Cache with Service Worker |
| iOS WKWebView size limit (~50 MB) | Module is 2 MB, so OK |
| No delta updates | Full re-download on version change |
| No rollback on corrupted install | Uninstall → reinstall |
| Module code visible (obfuscation possible) | Minify + source maps hidden |
| Single module per domain (CORS) | Use subdomain per module |

---

## 16. FAQ

**Q: Can module update without user action?**  
A: Yes, on next load. Silent in background if Service Worker used.

**Q: What if user denies filesystem access?**  
A: Fallback to in-memory (lost on refresh) — show warning.

**Q: How to test module updates?**  
A: Increment `manifest.version`, rebuild, deploy. First load after update triggers re-download.

**Q: Can multiple modules share dependencies?**  
A: Yes, all expect React/ReactDOM from core. Other deps (zustand) are bundled per module.

**Q: Why not use Webpack Module Federation?**  
A: Too complex for mobile, requires same build setup. Our blob import is simpler and works everywhere.

---

## 17. References

- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem)
- [Dynamic Import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Vite Library Mode](https://vitejs.dev/guide/build.html#library-mode)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
