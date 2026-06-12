# Ads Module — Production-Grade Implementation

> **Вдохновлено:** Instagram Ads Manager + TikTok Ads Manager
> **Дата:** 2026-05-05
> **Статус:** ✅ Готов к миграции

---

## 📋 Содержание

1. [Обзор](#обзор)
2. [Архитектура](#архитектура)
3. [База данных (миграция)](#база-данных)
4. [Edge Functions](#edge-functions)
5. [Frontend](#frontend)
6. [Безопасность](#безопасность)
7. [Миграция и деплой](#миграция-и-деплой)
8. [Тестирование](#тестирование)
9. [TODO / Future Work](#todo)

---

## Обзор

Рекламный модуль `mansoni` переработан до production-grade уровня с полным жизненным циклом креативов, модерацией, аудитом и безопасностью.

**Ключевые фичи:**

| Фича | Instagram/TikTok analog | mansoni implementation |
|------|------------------------|-----------------------|
| Жизненный цикл креатива | draft → pending_review → approved → active → archived | ✅ status enum + state machine |
| Модерация | Auto + manual review | ✅ pending_review → approve/reject |
| Статистика | Server-side aggregated | ✅ Batch aggregation, no N+1 |
| Статистика импрессий | Pixel / CAPI (сервер) | ✅ Edge Function с rate limiting |
| Дубликаты | Hash + unique constraint | ✅ creative_hash, unique index |
| Аудит | Full history | ✅ ad_creative_history table |
| Soft delete | Archived (restorable) | ✅ deleted_at + restore policy |
| Валидация | URL, media, text constraints | ✅ Frontend + CHECK constraints |
| Пагинация | Cursor-based | ✅ Cursor pagination (created_at + id) |
| Частотный лимит | Frequency capping | ✅ frequency_cap field |

---

## Архитектура

```
mansoni/
├── supabase/
│   ├── migrations/20260505_00_ideal_ad_creatives.sql   # DB schema
│   └── functions/
│       └── record-ad-impression/                        # Server-side tracking
│           ├── index.ts
│           └── deno.json
├── src/
│   ├── lib/
│   │   ├── ads/
│   │   │   └── types.ts                                 # Hand-written extended types
│   │   ├── validators.ts                                # Validation utils
│   │   └── supabase.ts                                  # Supabase client
│   ├── hooks/
│   │   ├── useAdCreatives.ts                            # CRUD + pagination + validation
│   │   └── useAdCampaigns.ts                            # Campaigns + batch stats
│   ├── components/
│   │   └── ads/
│   │       ├── CreativeCard.tsx                         # Card with actions
│   │       ├── CreativeEditor.tsx                       # Form with live preview
│   │       ├── CreativePreview.tsx                      # Feed/story/reels preview
│   │       ├── CreativeStatusBadge.tsx                  # Status badge
│   │       └── ModerationQueue.tsx                      # Moderation UI
│   └── pages/
│       └── ads/
│           └── AdCampaignDetailPage.tsx                 # Campaign detail + creatives list
└── docs/
    └── ADS_MODULE_IMPLEMENTATION.md                     # This file
```

**Слои:**

```
[UI Components] <-- React state/hooks --> [Business Logic Hooks] <-- supabase client --> [Edge Functions] <-- service_role --> [RLS] --> [Tables]
```

---

## База данных

### Миграция

**Файл:** `supabase/migrations/20260505_00_ideal_ad_creatives.sql`

**Изменения таблицы `ad_creatives`:**

| Column / Constraint | Type / Value | Description |
|---------------------|--------------|-------------|
| `status` | `TEXT NOT NULL DEFAULT 'draft'` | Lifecycle: draft, pending_review, approved, rejected, archived |
| `moderation_reason` | `TEXT` | Why rejected |
| `moderated_at` | `TIMESTAMPTZ` | When moderated |
| `moderated_by` | `UUID → auth.users` | Who moderated |
| `moderation_metadata` | `JSONB DEFAULT '{}'` | Extra moderation data |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Auto-updated on change |
| `updated_by` | `UUID → auth.users` | Who updated |
| `deleted_at` | `TIMESTAMPTZ` | Soft delete |
| `creative_hash` | `TEXT NOT NULL` | MD5 hash for duplicate detection |
| `frequency_cap` | `INTEGER DEFAULT 3` | Max impressions per user per day |
| `priority_order` | `INTEGER DEFAULT 0` | Manual ordering |
| `thumbnail_url` | `TEXT` | Auto-generated thumbnail |
| `media_duration_sec` | `INTEGER` | Video duration in seconds |
| `media_width` | `INTEGER` | Media width |
| `media_height` | `INTEGER` | Media height |
| `file_size_bytes` | `BIGINT` | File size |
| `aspect_ratio` | `TEXT` | "16:9", "9:16", etc. |

**CHECK constraints:**

- `valid_media_url`: `media_url ~* '^https://'`
- `valid_destination_url`: same
- `valid_headline_length`: `1–100` chars
- `valid_description_length`: `≤300` chars
- `valid_cta`: enum of 7 values
- `valid_type`: `image|video|carousel|story`
- `valid_creative_hash`: non-empty
- `valid_frequency_cap`: `1–100`

**Indexes:**

```sql
CREATE INDEX idx_ad_creatives_campaign_created ON ad_creatives(campaign_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ad_creatives_campaign_status ON ad_creatives(campaign_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_ad_creatives_unique_hash_active ON ad_creatives(campaign_id, creative_hash) WHERE deleted_at IS NULL AND status IN ('approved','active');
CREATE INDEX idx_ad_creatives_hash ON ad_creatives(creative_hash);
CREATE INDEX idx_ad_creatives_type_status ON ad_creatives(type, status);
CREATE INDEX idx_ad_creatives_updated ON ad_creatives(updated_at DESC);
CREATE INDEX idx_ad_creatives_moderated ON ad_creatives(moderated_at DESC) WHERE moderated_at IS NOT NULL;
```

**Triggers:**

- `update_ad_creatives_updated_at` — auto-update `updated_at`
- `set_ad_creative_hash` — auto-generate `creative_hash` if not provided
- `log_ad_creative_change` — audit log to `ad_creative_history`

**Audit table `ad_creative_history`:**

| Column | Description |
|--------|-------------|
| `id` | PK |
| `creative_id` | FK to ad_creatives |
| `changed_by` | User ID (auth.uid()) |
| `change_type` | `create` \| `update` \| `delete` \| `restore` \| `status_change` |
| `old_values` | JSONB snapshot before change |
| `new_values` | JSONB snapshot after change |
| `changed_at` | Timestamp |
| `change_reason` | Optional text |

**RLS Policies (`ad_creatives`):**

| Policy | Operations | Conditions |
|--------|-----------|------------|
| `ad_creatives_select_own` | SELECT | EXISTS campaign with same advertiser_id AND deleted_at IS NULL |
| `ad_creatives_insert_own` | INSERT | EXISTS campaign AND status IN ('draft','pending_review') AND deleted_at IS NULL |
| `ad_creatives_update_own` | UPDATE | EXISTS campaign AND deleted_at IS NULL AND state-machine transitions allowed AND type/cta immutable after approval |
| `ad_creatives_delete_own` | DELETE | status IN ('draft','rejected') AND deleted_at IS NULL (soft delete) |
| `ad_creatives_restore_own` | UPDATE (undelete) | OLD.deleted_at NOT NULL AND NEW.deleted_at IS NULL |

**State Machine (status transitions):**

```
draft → pending_review → approved → active → archived
   ↓        ↓               ↓          ↓
rejected ←───────────────┘          │
   ↓                                │
draft/pending_review (resubmit) -----┘
```

**RLS for `ad_impressions`:**

- **SELECT** — advertiser can see impressions for their creatives (via join)
- **INSERT** — **DENIED** for `authenticated` role. Only Edge Function with `service_role` can insert.

**新增 `ad_impressions.metadata` JSONB** для Edge Function.

---

## Edge Functions

### `record-ad-impression`

**Location:** `supabase/functions/record-ad-impression/index.ts`

**Env vars:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Flow:**

```
Client POST /functions/v1/record-ad-impression
  ↓
CORS preflight (OPTIONS)
  ↓
Validate: creative_id (UUID), action (enum), viewer_id (optional), client_ts (optional)
  ↓
Rate limit: 30 req/min per (viewer_id + creative_id) — in-memory (replace with Redis in prod)
  ↓
Deduplication: check if same (viewer_id, creative_id, action) within last 10 min
  ↓
Check creative exists AND status = 'approved' AND deleted_at IS NULL
  ↓
INSERT INTO ad_impressions (creative_id, viewer_id, action, created_at, metadata)
  ↓
Return { success: true } or { success: true, duplicate: true }
```

**Rate limiting:** In-memory `Map<string, number[]>` per key. For production, use Redis or DB table.

**Deduplication:** `created_at >= now() - interval '10 minutes'`.

**Errors:**
- `400` — invalid input
- `404` — creative not found/not approved
- `429` — rate limited
- `500` — internal error

**Client integration (frontend):**

```typescript
async function trackImpression(creativeId: string, action: 'impression'|'click'|'conversion') {
  await fetch(`${SUPABASE_FUNCTIONS_URL}/record-ad-impression`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creative_id: creativeId,
      viewer_id: user.id, // optional
      action,
      client_ts: Date.now().toString(),
      metadata: { page: location.pathname }
    }),
  });
}
```

---

## Frontend

### Types (hand-written)

**File:** `src/lib/ads/types.ts`

**Exports:**
- Unions: `AdCreativeStatus`, `AdCreativeType`, `AdAction`, `CallToAction`, `ChangeType`
- Interfaces: `AdCreative`, `AdCreativeInsert`, `AdCreativeUpdate`, `AdImpression`, `AdCreativeHistory`, `CampaignStats`, `CreativeStats`
- Constants: `VALID_CTA_VALUES`, `VALID_STATUS_VALUES`, `CreativeStatusLabels`, `CreativeStatusColors`, `CTALabels`
- Validators imported from `@/lib/validators`

### Hooks

#### `useAdCreatives(campaignId: string)`

**Returns:**
```typescript
{
  creatives: AdCreative[];
  addCreative: (input: AdCreativeInsert) => Promise<AdCreative | null>;
  updateCreative: (id: string, updates: AdCreativeUpdate) => Promise<boolean>;
  deleteCreative: (id: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}
```

**Features:**
- Cursor-based pagination (`PAGE_SIZE = 25`)
- Validation with `validators.ts`
- Ownership verification (`verifyCreativeOwnership`)
- RLS respected (server-side filtering)
- Toast notifications for all mutations
- Error logging with `logger`

#### `useAdCampaigns()`

**Returns:**
```typescript
{
  campaigns: AdCampaign[];
  createCampaign: (input) => Promise<AdCampaign | null>;
  updateCampaign: (id, updates) => Promise<void>;
  submitForReview: (id) => Promise<void>;
  pauseCampaign: (id) => Promise<void>;
  resumeCampaign: (id) => Promise<void>;
  getCampaignStats: (campaignId) => CampaignStats | null;
  refreshCampaignStats: (campaignId) => Promise<void>; // manual refresh after creative changes
  loading: boolean;
}
```

**Stats loading:** Batch aggregation on campaigns load:
1. Get all `ad_creatives` for user's campaigns (`IN` query)
2. Get all `ad_impressions` for those creatives (`IN` query)
3. Aggregate in memory → `statsMap` state
4. `getCampaignStats` reads from `statsMap`

**No N+1:** Only 2 queries regardless of number of campaigns.

### Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `CreativeStatusBadge` | Badge with icon | 5 statuses, color-coded |
| `CreativePreview` | Live preview | Formats: feed, story, reels |
| `CreativeCard` | List item | Actions: edit, delete, preview, submit |
| `CreativeEditor` | Form | Zod validation, live preview, multi-tab UI |
| `ModerationQueue` | Admin queue | Table view, approve/reject, reason |

### Pages

**`/ads`** → `AdManagerPage` (already existed, shows list of campaigns)

**`/ads/:id`** → `AdCampaignDetailPage` (new):
- Campaign info card (budget, objective, dates, stats)
- Stats overview (impressions, clicks, conversions, CTR, CPC)
- ModerationQueue (pending_review creatives)
- Grid of CreativeCards with pagination
- "Add Creative" button → opens CreativeEditor

---

## Безопасность

### RLS (Row Level Security)

**ad_creatives:**
- `SELECT` — only own campaigns, non-deleted
- `INSERT` — only to own campaigns, status must be `draft` or `pending_review`
- `UPDATE` — strict state-machine transitions enforced in policy (CHECK in SQL)
  - `campaign_id` immutable (cannot move between campaigns)
  - `type` & `call_to_action` immutable after first approval
- `DELETE` — soft delete via `deleted_at`; only `draft`/`rejected` can be deleted

**ad_impressions:**
- `SELECT` — advertiser can see their campaigns' impressions
- `INSERT` — **blocked** for all roles except service_role (Edge Function only)

**ad_campaigns:**
- `updated_by` auto-set via trigger (`auth.uid()`)

### Validation Layers

1. **Frontend:** Zod schema + `validators.ts` (URL HTTPS, lengths)
2. **Database:** CHECK constraints (URL pattern, length, enum)
3. **RLS:** Ownership verification via subqueries
4. **Edge Function:** Creative must be `approved` before recording impressions

### Duplicate Detection

- `creative_hash` = MD5(`media_url` + `|` + `headline` + `|` + `call_to_action` + `|` + `type` [+ `|` + `description` if present)
- Unique index on `(campaign_id, creative_hash)` where `deleted_at IS NULL AND status IN ('approved','active')`
- Prevents uploading identical creatives multiple times

### Rate Limiting & Dedup (Edge)

- Rate limit: 30 requests per minute per `(viewer_id, creative_id)` key
- Dedup: identical `(viewer_id, creative_id, action)` within 10 minutes ignored
- Implementation: in-memory map (swap to Redis in prod)

---

## Миграция и деплой

### Шаг 1: Применить миграцию

```bash
# Via Supabase CLI
supabase db push

# Or copy migration to Supabase Dashboard → SQL Editor and run
```

**Verify:**
- New columns appear in `ad_creatives`
- Indexes exist: `idx_ad_creatives_campaign_created`, `idx_ad_creatives_unique_hash_active`
- Triggers active: `trg_ad_creatives_updated_at`, `trg_ad_creative_hash`, `trg_ad_creative_audit`
- RLS policies updated

### Шаг 2: Deploy Edge Function

```bash
cd supabase/functions/record-ad-impression
supabase functions deploy record-ad-impression --project-ref <your-project-id>
```

Set env vars in Supabase Dashboard → Functions → `record-ad-impression`:
- `SUPABASE_URL` (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-set in Supabase)

**Test locally:**

```bash
deno run --allow-net --allow-env --watch index.ts
curl -X POST http://localhost:8000 \
  -H "Content-Type: application/json" \
  -d '{"creative_id":"...","action":"impression","viewer_id":"..."}'
```

### Шаг 3: Update frontend types

The hand-written `src/lib/ads/types.ts` and `src/lib/validators.ts` are already in repo.

Run typecheck:

```bash
npm run typecheck  # or pnpm tsc --noEmit
```

Fix any mismatches if DB schema changed after migration.

### Шаг 4: Prepare UI components

All components created:
- `src/components/ads/*`

If any shadcn/ui components missing, install:

```bash
npx shadcn@latest add card badge button skeleton dialog form input textarea select slider table
```

### Шаг 5: Verify routes

Routes added in `App.tsx`:
- `GET /ads` → `AdManagerPage`
- `GET /ads/:id` → `AdCampaignDetailPage`

Restart dev server:

```bash
npm run dev
```

Visit `http://localhost:8080/ads` — should see campaign list.
Click campaign → detail page with creatives.

### Шаг 6: Smoke test

1. Create a new campaign (status = draft)
2. Go to campaign detail (`/ads/{id}`)
3. Click "Add Creative" → fill form → submit
   - Should appear in list with status `draft`
4. Click "На проверку" → status changes to `pending_review`
5. (Moderator) Open ModerationQueue → approve → status `approved`
6. (Optional) Activate campaign — creative now eligible for impressions
7. Client app: call Edge Function to record impressions
8. Refresh page — stats should increment

### Шаг 7: Roll out

If all tests pass:
- Merge to `main`
- Deploy frontend (Vercel/Netlify/your platform)
- Migrate DB on production
- Deploy Edge Function on production
- Monitor logs for errors

---

## Тестирование

### Unit Tests (planned)

**`tests/hooks/useAdCreatives.test.ts`**
- Mock supabase client
- Test: validation errors (URL, lengths)
- Test: addCreative success/error
- Test: updateCreative (ownership check, immutable fields)
- Test: deleteCreative (soft delete only for draft/rejected)
- Test: pagination (loadMore)

**`tests/hooks/useAdCampaigns.test.ts`**
- Mock supabase
- Test: campaigns load
- Test: batch stats aggregation (no N+1)
- Test: createCampaign adds zero stats to map
- Test: getCampaignStats returns from map

**`tests/integration/ad-impression-edge.test.ts`**
- Spin up local Supabase (or mock)
- Deno test: POST valid → 200
- POST invalid UUID → 400
- POST duplicate within 10min → 200 duplicate:true
- POST rate-limited → 429

### E2E Tests (Playwright)

- User creates campaign → adds creative → submits for review
- Moderator approves → creative status becomes approved
- Client app: visits page with creative → impression recorded via Edge Function
- Stats update on refresh

---

## TODO / Future Work

| Priority | Feature | Why |
|----------|---------|-----|
| 🔴 High | **Pixel / Conversion API** | Track conversions server-side, not just impressions |
| 🔴 High | **Soft delete restoration UI** | Button "Restore" for archived creatives |
| 🟡 Medium | **Carousel media upload** | Multiple images for carousel type |
| 🟡 Medium | **Video transcoding** | Accept various formats, convert to web-optimized |
| 🟡 Medium | **A/B Testing framework** | Split traffic between variants |
| 🟢 Low | **Creative rotation** | Auto-disable low CTR creatives |
| 🟢 Low | **Automated rules** | IF CTR < 1% after 1000 impressions → PAUSE |
| 🟢 Low | **Asset library** | Reuse media across creatives |
| 🢧 Future | **Lookalike audiences** | ML-based audience expansion |
| 🢧 Future | **Team roles & permissions** | Multiple advertisers per account |

---

## Known Issues & Gotchas

1. **In-memory rate limiter** — not production-ready. Replace with Redis or DB table.
2. **Stats cache invalidation** — `refreshCampaignStats` must be called after creative changes (manual). Consider Supabase Realtime subscriptions.
3. **Lack of real file upload** — `media_url` expects HTTPS URL; file upload UI not included.
4. **No moderation UI for superadmin** — `ModerationQueue` filters by `campaignId` prop; need global admin view.
5. **Hard limit 100 campaigns** — pagination TODO.
6. **Supabase types not updated** — hand-written types in `lib/ads/types.ts` diverge from generated `supabase/types.ts`. Keep in sync after schema changes.

---

## Контакты

Questions? → @mansoni-dev / GitHub Issues
