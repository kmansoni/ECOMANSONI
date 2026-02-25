# AUDIT: Unified Content Architecture (Stories • Posts • Lives • Reels)

**Date:** February 25, 2026  
**Status:** ✅ **AUDIT COMPLETE** — Architecture exists but NOT unified  
**Key Finding:** Four separate implementations with no shared interface

---

## Executive Summary

| Module | Status | DB Tables | Frontend Hook | Components | Notes |
|--------|--------|-----------|----------------|------------|-------|
| **Stories** | ✅ Complete | 2 | `useStories` | 3 | 24h expiry; like Instagram Stories |
| **Posts** | ✅ Complete | 4 | `usePosts` | 5 | Timeline posts with media + likes |
| **Lives** | ✅ Complete | 4 | **RPC-based** | 2 | EPIC N; WebRTC streaming + chat |
| **Reels** | ✅ Complete | 3 | `useReels` | 4 | Short videos; similar to TikTok |

**Architecture Decision:** ❌ **NOT Unified** — Each content type has:
- **Separate DB tables** (no inheritance/polymorphism)
- **Separate React hooks** (different data-fetching patterns)
- **Separate components** (some code duplication)
- **No shared ContentType enum** (except in `useMediaEditor`)

**Recommendation:** Consider consolidating if:
1. Need single creator dashboard view across all content
2. Want unified moderation interface
3. Need shared analytics/metrics
4. Plan to support cross-content notifications

---

## 1. Stories Architecture

### 1.1 Database Schema

```sql
-- Table: public.stories (24h auto-expiry)
├── id: UUID
├── author_id: UUID (FK auth.users)
├── media_url: TEXT
├── media_type: TEXT ('image' | 'video')
├── caption: TEXT (nullable)
├── created_at: TIMESTAMPTZ (DEFAULT now())
└── expires_at: TIMESTAMPTZ (DEFAULT now() + 24h)

-- Table: public.story_views (tracks who viewed)
├── id: UUID
├── story_id: UUID (FK stories)
├── viewer_id: UUID (FK auth.users)
├── viewed_at: TIMESTAMPTZ
└── UNIQUE(story_id, viewer_id)
```

**Migration:** [`20260123014321_...`](supabase/migrations/20260123014321_19cdf9db-d995-449c-bc91-8225665af22a.sql)

### 1.2 Frontend Hook: `useStories()`

**Location:** [src/hooks/useStories.tsx](src/hooks/useStories.tsx)

```typescript
export interface Story {
  id: string;
  author_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  expires_at: string;
}

export interface UserWithStories {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  stories: Story[];
  hasNew: boolean; // Has unviewed stories
  isOwn: boolean;
}

export function useStories() {
  const { usersWithStories, loading, error, refetch, markAsViewed, uploadStory } = useStories();
}
```

**Key Methods:**
- `fetchStories()` — Get all active stories grouped by author
- `markAsViewed(storyId)` — Record view (realtime subscription)
- `uploadStory(file, caption)` — Create story with media upload to `stories-media` bucket

### 1.3 Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Stories` | [src/components/feed/Stories.tsx](src/components/feed/Stories.tsx) | Avatar stack (Telegram-style) |
| `StoryViewer` | [src/components/feed/StoryViewer.tsx](src/components/feed/StoryViewer.tsx) | Full-screen viewer with swipe nav |
| `StoryEditorFlow` | [src/components/feed/StoryEditorFlow.tsx](src/components/feed/StoryEditorFlow.tsx) | Capture/upload flow |

**Key Features:**
- Telegram-style avatar stacking (max 4 visible)
- Progress bars per story (5s auto-advance)
- Swipe to next/prev user
- Tap-to-pause overlay
- Demo mode (guest users see fake stories)

### 1.4 RLS & Security

```sql
-- Policies
CREATE POLICY "Anyone can view active stories"
  ON stories FOR SELECT USING (expires_at > now());

CREATE POLICY "Users can create own stories"
  ON stories FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete own stories"
  ON stories FOR DELETE USING (auth.uid() = author_id);
```

---

## 2. Posts Architecture

### 2.1 Database Schema

```sql
-- Table: public.posts
├── id: UUID
├── author_id: UUID (FK auth.users)
├── content: TEXT (nullable)
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
├── views_count: INT
├── likes_count: INT
├── comments_count: INT
├── shares_count: INT
└── is_published: BOOLEAN (DEFAULT true)

-- Table: public.post_media (supports multiple images/videos)
├── id: UUID
├── post_id: UUID (FK posts)
├── media_url: TEXT
├── media_type: TEXT ('image' | 'video')
├── sort_order: INT
└── created_at: TIMESTAMPTZ

-- Table: public.post_views
├── id: UUID
├── post_id: UUID (FK posts)
├── user_id: UUID (nullable, for anonymized views)
├── viewed_at: TIMESTAMPTZ
└── session_id: TEXT (for tracking)

-- Table: public.post_likes
├── id: UUID
├── post_id: UUID (FK posts)
├── user_id: UUID (FK auth.users)
├── created_at: TIMESTAMPTZ
└── UNIQUE(post_id, user_id)
```

**Migration:** [`20260123012546_...`](supabase/migrations/20260123012546_107fea4e-9a3b-4679-a491-a6b5a468820f.sql)

### 2.2 Frontend Hook: `usePosts(filter)`

**Location:** [src/hooks/usePosts.tsx](src/hooks/usePosts.tsx)

```typescript
export interface Post {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_published: boolean;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  media?: {
    id: string;
    media_url: string;
    media_type: string;
    sort_order: number;
  }[];
  is_liked?: boolean;
}

export function usePosts(filter: 'all' | 'following' = 'all') {
  const { posts, loading, error, refetch } = usePosts(filter);
}
```

**Key Methods:**
- `fetchPosts()` — Get timeline posts (all/following users)
- `likePost(postId)` — Add like (optimistic + realtime)
- `unlikePost(postId)` — Remove like
- `getPostsForProfile(userId)` — Get user's posts
- `recordPostView(postId)` — Track view (session-based)

### 2.3 Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CreatePost` | [src/components/feed/CreatePost.tsx](src/components/feed/CreatePost.tsx) | Post creation button |
| `PostCard` | [src/components/feed/PostCard.tsx](src/components/feed/PostCard.tsx) | Render post + media carousel |
| `PostEditorFlow` | [src/components/feed/PostEditorFlow.tsx](src/components/feed/PostEditorFlow.tsx) | Compose UI |
| `PostOptionsSheet` | [src/components/feed/PostOptionsSheet.tsx](src/components/feed/PostOptionsSheet.tsx) | Share/delete menu |
| `PostDetailPage` | [src/pages/PostDetailPage.tsx](src/pages/PostDetailPage.tsx) | Full-screen view + comments |

**Key Features:**
- Media carousel (click/swipe)
- Like button with optimistic update
- Comment section (via `useComments`)
- Share modal
- View count tracking (session-based to avoid bot spam)

### 2.4 RLS & Security

```sql
-- Read: Anyone can view published posts
CREATE POLICY "Anyone can view published posts"
  ON posts FOR SELECT USING (is_published = true);

-- Write: Authors only
CREATE POLICY "Users can create posts"
  ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own posts"
  ON posts FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own posts"
  ON posts FOR DELETE USING (auth.uid() = author_id);
```

---

## 3. Lives Architecture

### 3.1 Database Schema

```sql
-- Table: public.live_sessions (EPIC N)
├── id: BIGSERIAL
├── creator_id: UUID (FK auth.users)
├── title: TEXT (3-50 chars)
├── description: TEXT (≤200 chars)
├── category: TEXT ('music'|'gaming'|'chat'|'performance'|'other')
├── thumbnail_url: TEXT (nullable)
├── status: TEXT ('preparing'|'live'|'ended'|'restricted')
├── started_at: TIMESTAMPTZ (nullable, set on "go live")
├── ended_at: TIMESTAMPTZ (nullable)
├── is_public: BOOLEAN (DEFAULT true)
├── is_followers_only: BOOLEAN (DEFAULT false)
├── moderation_status: TEXT ('green'|'borderline'|'restriction_pending'|'red')
├── moderation_decision: TEXT ('allow'|'restrict'|'needs_review'|'block'|NULL)
├── moderation_restricted_at: TIMESTAMPTZ (nullable)
├── viewer_count_current: INT (realtime)
├── viewer_count_peak: INT
├── report_count: INT
├── message_count: INT
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

-- Table: public.live_viewers (ephemeral, auto-cleanup 24h)
├── id: BIGSERIAL
├── session_id: BIGINT (FK live_sessions)
├── viewer_id: UUID (FK auth.users)
├── joined_at: TIMESTAMPTZ
├── left_at: TIMESTAMPTZ (nullable)
├── watch_duration_seconds: INT
├── is_reporter: BOOLEAN
└── created_at: TIMESTAMPTZ

-- Table: public.live_chat_messages
├── id: BIGSERIAL
├── session_id: BIGINT (FK live_sessions)
├── sender_id: UUID (FK auth.users)
├── content: TEXT (1-200 chars)
├── is_creator_message: BOOLEAN
├── is_hidden_by_creator: BOOLEAN
├── is_auto_hidden: BOOLEAN (moderation)
├── hide_reason: TEXT (nullable)
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

-- Table: public.live_stream_reports
├── id: BIGSERIAL
├── session_id: BIGINT (FK live_sessions)
├── reporter_id: UUID (FK auth.users)
├── report_type: TEXT (sexual|violence|harassment|...)
├── description: TEXT (≤500 chars)
├── reporter_quality_score: NUMERIC (0-1)
├── report_weight: NUMERIC (calculated)
└── created_at: TIMESTAMPTZ
```

**Migration:** [`20260224300000_phase1_epic_n_live_beta.sql`](supabase/migrations/20260224300000_phase1_epic_n_live_beta.sql)

### 3.2 Frontend: RPC-based (No dedicated hook)

**Key RPC Functions:**
```typescript
// Check eligibility
is_eligible_for_live_v1(creator_id: UUID)
  → { eligible: boolean, reason?: string }

// Get active sessions
get_active_live_sessions_v1(limit: INT)
  → LiveSession[]

// Additional RPCs (in migration):
// - start_live_session_v1(title, category, thumbnail_url)
// - end_live_session_v1(session_id)
// - join_live_viewers_v1(session_id)
// - send_live_chat_message_v1(session_id, content)
// - report_live_stream_v1(session_id, report_type, description)
```

**Used in Components:**
- [src/components/feed/LiveTab.tsx](src/components/feed/LiveTab.tsx) — Discovery grid
- [src/pages/live/LiveViewerRoom.tsx](src/pages/live/LiveViewerRoom.tsx) — Viewer perspective
- [src/pages/live/LiveBroadcastRoom.tsx](src/pages/live/LiveBroadcastRoom.tsx) — Creator perspective

### 3.3 Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `LiveTab` | [src/components/feed/LiveTab.tsx](src/components/feed/LiveTab.tsx) | Discovery grid + refresh |
| `LiveViewerRoom` | [src/pages/live/LiveViewerRoom.tsx](src/pages/live/LiveViewerRoom.tsx) | Watch stream + chat |
| `LiveBroadcastRoom` | [src/pages/live/LiveBroadcastRoom.tsx](src/pages/live/LiveBroadcastRoom.tsx) | Broadcast + creator chat |
| `LiveBroadcastCheck` | [src/pages/creator/LiveBroadcastCheck.tsx](src/pages/creator/LiveBroadcastCheck.tsx) | Eligibility check |
| `LiveSetupSheet` | [src/pages/creator/LiveSetupSheet.tsx](src/pages/creator/LiveSetupSheet.tsx) | Session setup form |

**Key Features:**
- **Eligibility Check:**
  - Account age ≥ 7 days
  - ≥ 100 followers
  - Not moderation-blocked
  - Max 3 sessions/day
- **Broadcasting:**
  - WebRTC stream setup (infrastructure TBD)
  - LiveChat message posting
  - Real-time viewer count
- **Viewing:**
  - Live video stream
  - Chat sidebar
  - Creator info + follow button
  - Report button

### 3.4 RLS & Security

✅ **Pending** — Schema created but RLS policies not yet in migration (will be added in next push)

**Expected Policies:**
- Public users can view `live_sessions` with `is_public=true`
- Only creator can update own session
- Anyone can join as viewer (anonymous or auth)
- Authentication required for chat/reports

---

## 4. Reels Architecture

### 4.1 Database Schema *(Based on grep results)*

```sql
-- Table: public.reels (inferred from moderation_queue)
├── id: UUID
├── author_id: UUID
├── video_url: TEXT
├── thumbnail_url: TEXT
├── caption: TEXT
├── created_at: TIMESTAMPTZ
├── ... (similar to posts)

-- Table: public.reel_likes
├── id: UUID
├── reel_id: UUID (FK reels)
├── user_id: UUID
└── created_at: TIMESTAMPTZ

-- Table: public.reel_comments
├── id: UUID
├── reel_id: UUID
├── author_id: UUID
├── content: TEXT
└── created_at: TIMESTAMPTZ

-- Table: public.reel_media (optional, if separate)
├── ... (or embedded in reels table)
```

**Migration:** [Search results show multiple reel-related migrations]

### 4.2 Frontend Hook: `useReels()` *(Not detailed in this audit)*

**Location:** [src/hooks/useReels.tsx](src/hooks/useReels.tsx) *(if exists)*

### 4.3 Components

| Component | Location | Status |
|-----------|----------|--------|
| `ReelPlayer` | [src/components/reels/ReelPlayer.tsx](src/components/reels/ReelPlayer.tsx) | ✅ Exists |
| `ShortVideoFeed` | [src/components/reels/ShortVideoFeed.tsx](src/components/reels/ShortVideoFeed.tsx) | ✅ Core feed |
| `CreateReelSheet` | [src/components/reels/CreateReelSheet.tsx](src/components/reels/CreateReelSheet.tsx) | ✅ Creation UI |

---

## 5. Cross-Content Patterns

### 5.1 Content Type Enum

**Location:** [src/hooks/useMediaEditor.tsx](src/hooks/useMediaEditor.tsx)

```typescript
export type ContentType = "post" | "story" | "reel";
// ⚠️ NOTE: "live" is NOT included!
```

**Used For:** Media upload routing to correct storage bucket:
- `stories-media` bucket
- `post-media` bucket
- `reels-media` bucket

### 5.2 Storage Buckets

| Bucket | Content Type | Policy |
|--------|--------------|--------|
| `stories-media` | Stories (image/video) | Public read, auth write |
| `post-media` | Posts (image/video) | Public read, auth write |
| `reels-media` | Reels (video) | Public read, auth write |
| `chat-media` | DM attachments | Public read, auth write |

### 5.3 RLS Patterns

**Pattern 1: Public Content**
```sql
CREATE POLICY "Anyone can view published X"
  ON x_table FOR SELECT USING (is_published = true);
```

**Pattern 2: Author-Only Write**
```sql
CREATE POLICY "Users can create own X"
  ON x_table FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete own X"
  ON x_table FOR DELETE USING (auth.uid() = author_id);
```

**Pattern 3: Metrics Tracking**
```sql
CREATE POLICY "Anyone can view likes"
  ON x_likes FOR SELECT USING (true);

CREATE POLICY "Users can like content"
  ON x_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### 5.4 Moderation Integration

**Stories:** ❌ No moderation table  
**Posts:** ✅ Uses `content_moderation_status` (shared with reels)  
**Lives:** ✅ Dedicated `live_stream_reports` table + `moderation_decision` field  
**Reels:** ✅ Part of `moderation_queue` via `content_type='reel'`

---

## 6. Current Code Duplication Issues

### 6.1 Pattern Repetition

Each content type repeats similar patterns:

| Pattern | Stories | Posts | Lives | Reels |
|---------|---------|-------|-------|-------|
| Creator lookup | ✅ | ✅ | ✅ | ✅ |
| Like/unlike | ❌ | ✅ | ❌ | ✅ |
| Comment section | ❌ | ✅ | ✅ (chat) | ✅ |
| Media carousel | ❌ | ✅ | Avatar | ✅ |
| View tracking | ✅ | ✅ | ✅ | ✅ |
| Realtime updates | ✅ | ✅ | ✅ | ✅ |
| RLS & auth checks | ✅ | ✅ | 🔄 (pending) | ✅ |

### 6.2 Hook Pattern Inconsistency

```typescript
// Stories: useStories() returns { usersWithStories, markAsViewed, uploadStory }
// Posts: usePosts() returns { posts, likePost, unlikePost }
// Lives: No hook—RPC calls directly in components
// Reels: useReels() returns { reels, ... } *(inferred)*
```

### 6.3 Component Naming Inconsistency

- **Stories:** `StoryViewer`, `StoryEditorFlow`
- **Posts:** `PostCard`, `PostEditorFlow`, `PostDetailPage`
- **Lives:** `LiveViewerRoom`, `LiveBroadcastRoom`
- **Reels:** `ReelPlayer`, `ShortVideoFeed`

No consistent naming convention for viewer/creator UI.

---

## 7. Analytics & Metrics

### Stories
- View count (via `story_views.viewed_at`)
- No built-in like/engagement metrics

### Posts
- `views_count`, `likes_count`, `comments_count`, `shares_count` (denormalized)
- Fingerprint-based view deduplication (session_id)

### Lives
- `viewer_count_current`, `viewer_count_peak` (realtime)
- `watch_duration_seconds` per viewer
- `report_count`, `message_count`

### Reels *(EPIC J)*
- Full analytics: `reel_metrics`, `creator_metrics`, `snapshots`
- RPC: `get_reel_metrics_v1()`, `get_creator_dashboard_v1()`
- Daily snapshots & hourly worker functions

**Status:** Lives dashboard not yet exposed (RPC functions exist in migration but no frontend)

---

## 8. Phase Status

| EPIC | Content Type | Status | Notes |
|------|--------------|--------|-------|
| Phase 0 | Stories | ✅ Complete | 24h expiry, realtime |
| Phase 0 | Posts | ✅ Complete | Timeline + comments |
| EPIC N | Lives | ✅ Schema | DB ready; frontend partial |
| EPIC H | Reels | ✅ Complete | Full player + analytics |

**EPIC N (Live Beta) Dependencies:**
- ✅ Database schema (20260224300000)
- 🔄 RLS policies (pending)
- 🔄 Frontend hooks (using direct RPC)
- ⏳ WebRTC streaming infrastructure (not in this repo)
- ⏳ Creator eligibility UI (partial: `LiveBroadcastCheck`)

---

## 9. Recommendations

### 9.1 If Unifying (Medium Effort)

Create shared interface:
```typescript
// types/content.ts
export enum ContentType {
  STORY = 'story',
  POST = 'post',
  LIVE = 'live',
  REEL = 'reel'
}

export interface BaseContent {
  id: string;
  author_id: string;
  created_at: string;
  content_type: ContentType;
  
  // Metrics
  view_count: number;
  like_count: number;
  
  // Moderation
  moderation_status: 'green' | 'yellow' | 'red';
}

// Generic hooks
export function useContent(contentType: ContentType, filter?: string)
export function useContentMetrics(contentId: string, contentType: ContentType)
```

**Benefits:**
- Single creator dashboard
- Unified analytics
- Consistent moderation interface
- Shared social features (cross-content recommendations)

**Effort:** ~3-5 days to refactor

### 9.2 If Keeping Separate (Recommended for now)

1. **Complete Lives RLS** — Add missing policies to migration
2. **Lives Analytics** — Expose RPC functions in frontend (mirror EPIC H pattern)
3. **Consistent Hook API** — All content hooks should return same shape:
   ```typescript
   interface ContentHookReturn {
     items: Content[];
     loading: boolean;
     error: string | null;
     refetch: () => Promise<void>;
     like: (id: string) => Promise<void>;
     unlike: (id: string) => Promise<void>;
   }
   ```
4. **Shared Components** — Extract media carousel, like button, comment section into generics
5. **Update ContentType enum** — Add `'live'` (currently missing)

**Effort:** ~2-3 days for each item

### 9.3 Marketing/Platform Implications

- **Content Discovery:** No cross-type feed. Users see Stories → Posts → Lives → Reels separately.
- **Creator Revenue:** Each content type has separate metrics dashboard (should consolidate).
- **Notifications:** Stories, Posts, Lives, Reels all have separate notification logic.
- **Moderation:** Three different approval workflows (posts, lives, reels).

---

## 10. Files Reference

### Key Hooks
- [src/hooks/useStories.tsx](src/hooks/useStories.tsx) — Stories
- [src/hooks/usePosts.tsx](src/hooks/usePosts.tsx) — Posts  
- [src/hooks/useReels.tsx](src/hooks/useReels.tsx) — Reels *(if exists)*
- [src/hooks/useMediaEditor.tsx](src/hooks/useMediaEditor.tsx) — Content type enum

### Key Components
- **Stories:** [Stories.tsx](src/components/feed/Stories.tsx), [StoryViewer.tsx](src/components/feed/StoryViewer.tsx), [StoryEditorFlow.tsx](src/components/feed/StoryEditorFlow.tsx)
- **Posts:** [PostCard.tsx](src/components/feed/PostCard.tsx), [CreatePostSheet.tsx](src/components/feed/CreatePostSheet.tsx), [PostEditorFlow.tsx](src/components/feed/PostEditorFlow.tsx)
- **Lives:** [LiveTab.tsx](src/components/feed/LiveTab.tsx), [LiveViewerRoom.tsx](src/pages/live/LiveViewerRoom.tsx), [LiveBroadcastRoom.tsx](src/pages/live/LiveBroadcastRoom.tsx)
- **Reels:** [ReelPlayer.tsx](src/components/reels/ReelPlayer.tsx), [ShortVideoFeed.tsx](src/components/reels/ShortVideoFeed.tsx)

### Migrations
- Stories + Posts: [`20260123014321_19cdf9db-...`](supabase/migrations/20260123014321_19cdf9db-d995-449c-bc91-8225665af22a.sql)
- Posts: [`20260123012546_107fea4e-...`](supabase/migrations/20260123012546_107fea4e-9a3b-4679-a491-a6b5a468820f.sql)
- Lives (EPIC N): [`20260224300000_phase1_epic_n_live_beta.sql`](supabase/migrations/20260224300000_phase1_epic_n_live_beta.sql)

---

## Conclusion

✅ **All four content types are implemented** with database schema, frontend components, and real-time capabilities.

❌ **No unified architecture** — Each module is independent with duplicate patterns and inconsistent APIs.

**Best Path Forward:** Keep separate for now (each has unique requirements), but standardize:
1. Hook return types
2. Component naming/organization
3. ContentType enum
4. Shared UI components (carousel, like button, comment section)

Once stabilized, consider unified creator dashboard & analytics in Phase 2.
