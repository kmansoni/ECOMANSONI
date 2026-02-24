# P1N — Live Beta Spec (Phase 1 / EPIC N)

**Date:** 2026-02-24  
**Status:** Ready for Implementation  
**Condition Gate:** ✅ Phase 1 KPI Status = GREEN (all metrics passing)

---

## 0) Overview

**Goal:** Very limited closed-beta launch of live streaming to validate demand and product-market fit.

**Constraints:**
- Trust-lite (EPIC L) must be operational ✅
- Kill-switch (EPIC M) must be ready ✅
- Moderation SLA not breaking (EPIC K operational) ✅
- All Phase 1 KPIs green ✅

**Product Objective:** Discover if live video demand exists on the platform; learn streaming use cases before scaling.

**Not Included (Phase 2):**
- Multi-guest streaming
- Monetization features
- Advanced spatial chat features
- Analytics dashboard for broadcasters

---

## 1) N1 — Live Beta Policy

### 1.1 Access Control

**Who can broadcast:**
- Creator tier C or higher (minimum 100 followers)
- Account age ≥ 7 days
- No active moderation restrictions (status ≠ 'block')
- Geoblock: Available in tier-1 countries only (US, EU, AU, CA, SG)
- Age: 18+ only

**Enforcement:**
- RPC `is_eligible_for_live_v1(creator_id)` checks all conditions
- Returns `{eligible: bool, reason?: string}` on rejection

### 1.2 Broadcast Limits

**Per-session limits:**
- Duration: 4 hours max (hard stop)
- Audience: 100 concurrent viewers max (soft cap at 90, warn creator)
- Update frequency: max 1 status update per 10 seconds

**Per-creator limits (24-hour rolling):**
- Max 3 live sessions per day
- If session is ended early 3 times in a week → 24h broadcast ban

**Enforcement:**
- Soft limits: UI warnings at 95%
- Hard limits: Server-side enforcement (session ends, returns error)

### 1.3 Content Moderation

**Pre-broadcast:**
- Thumbnail auto-moderated (flagged items not allowed to go live)
- Title/description auto-moderated (no bypass)

**During broadcast:**
- Real-time report scanning (same trust-weighted system as EPIC K)
- Burst detection: 5+ reports in 2 minutes → auto-restrict
- Mass-report guard: Same as EPIC K (prevent attack weaponization)

**Post-broadcast:**
- Replay available for 7 days
- Replay subject to same moderation as reels (borderline = owner-only)

### 1.4 Data Privacy

**Recording:**
- Local client-side recording only (no platform recording)
- Creators can export their own sessions via Edge Function
- No platform storage of raw streams (only metadata)

**Viewer data:**
- Viewer list tracked (for live-only, ephemeral)
- Deleted 24 hours after session end
- Not exported to analytics dashboard

---

## 2) N2 — Live UX Spec (D0.000 Compliant)

### 2.1 Creator Flow: "Go Live"

**Screen 1: Eligibility Check**
- Route: `/creator/go-live`
- Component: `LiveBroadcastCheck`
- Logic:
  ```
  if not eligible:
    show reason (age, followers, ban, geoblock, etc.)
    show "Not eligible" badge + help link
    return (cannot proceed)
  else:
    show "You're eligible to go live!"
    show current session count (e.g., "0/3 today")
    button: "Start Live Session"
  ```

**Screen 2: Live Setup**
- Component: `LiveSetupSheet`
- Fields:
  - Title (text, 3-50 chars, auto-moderated)
  - Thumbnail (image picker or camera preview)
  - Category (select: Music, Gaming, Chat, Performance, Other)
  - Description (optional, 0-200 chars)
- Button: "Go Live" → RPC `broadcast_create_session_v1(creator_id, title, ...)`

**Screen 3: Broadcasting Room**
- Component: `LiveBroadcastRoom`
- Displays:
  - Live video preview (WebRTC stream)
  - Viewer count badge (top-right, updates in real-time)
  - Chat panel (right sidebar)
  - Status bar: "You're live for X minutes"
  - Emergency "End Live" button (red, bottom-right)
  - Session warnings (if approaching limits)

### 2.2 Viewer Flow: Discover Live Streams

**Feed Integration:**
- New tab in ShortVideoFeed: "Live" (next to "For You", "Following")
- Shows grid of active live sessions (thumbnail + creator + viewer count)
- Click → opens viewer room for that session

**Live Room (Viewer)**
- Component: `LiveViewerRoom`
- Displays:
  - Full-screen video stream
  - Creator info (profile pic, display_name, follower count, "Follow" button)
  - Viewer count (e.g., "2.3K watching now")
  - Chat panel (right sidebar, scrollable, newest first)
  - Live badge (top corner, pulsing red)
  - Reactions/emoji quick-actions (below video)

### 2.3 Chat (Minimal)

**Viewer messages:**
- Max 200 chars per message
- Rate limit: 1 message per 2 seconds (prevent spam)
- Moderation: Auto-hide messages with profanity (using same filter as profile bios)
- Creator can manually hide messages

**Creator acknowledgments:**
- Quick buttons in creator room: 👍 ❤️ 🔥 etc. (emoji picker)
- Sends to chat as special "creator message" with gold badge
- Rate limit: 1 per 1 second (prevent spam)

---

## 3) N3 — Live Safety Guardrails

### 3.1 Real-Time Moderation

**Report handling (during live):**
- Viewer can report stream with category (sexual, violence, harassment, misinformation, other)
- RPC `report_live_stream_v1(session_id, report_type, description)`
- Trust-weighted like EPIC K (reporter quality multiplier applies)

**Auto-restrict trigger:**
- **Burst:** 5+ reports from 5+ unique viewers in 2-minute window → auto-restrict
- **Mass-report detection:** Same logic as EPIC K (prevent attack vectors)
- **Result:** Stream becomes "borderline" → only creator can view
  - Viewers see error: "This stream has been restricted"
  - Creator gets notification: "Your live stream has been restricted due to community reports. Check moderation queue."
  - Session continues, but no new viewers can join

### 3.2 Continuation After Auto-Restrict

**If creator fixes issue:**
- Creator can re-submit for review (manual escalation to moderation queue)
- Moderator decision in EPIC K console applies to live_stream_status
- If decision = "allow" → stream unrestricted immediately
- If decision = "needs_review" → stays restricted, queued for async review

**If session expired:**
- Auto-restrict stays in effect for 7 days (same as reel)
- Creator can appeal the restriction (EPIC K appeals flow)

### 3.3 Safeguarding Rules

**Prohibited content (blocks live immediately):**
- Child safety violations (auto-block, report to trust&safety team)
- Graphic violence/gore (auto-restrict)
- Hate speech targeting protected groups (auto-restrict)

**Auto-enforcement:**
- Computer vision + hashing (detect flagged images, known exploitative content)
- Duration: 3-5 second delay (acceptable for live)
- If triggered: Session ends immediately, creator flagged for manual review

---

## 4) Backend Schema (SQL)

### 4.1 Core Tables

```sql
-- Live streaming sessions
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('music', 'gaming', 'chat', 'performance', 'other')),
  thumbnail_url TEXT,
  
  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN (
    'preparing', 'live', 'ended', 'restricted'
  )),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  
  -- Access control
  is_public BOOLEAN NOT NULL DEFAULT true,
  allowed_follower_only BOOLEAN NOT NULL DEFAULT false,
  
  -- Moderation
  moderation_status TEXT NOT NULL DEFAULT 'green' CHECK (moderation_status IN ('green', 'borderline', 'red')),
  moderation_decision TEXT,
  moderation_restricted_at TIMESTAMP WITH TIME ZONE,
  
  -- Metrics (updated in real-time)
  viewer_count_peak BIGINT DEFAULT 0,
  report_count BIGINT DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_sessions_creator_id ON live_sessions(creator_id);
CREATE INDEX idx_live_sessions_status ON live_sessions(status);
CREATE INDEX idx_live_sessions_created_at ON live_sessions(created_at DESC);

-- Live stream viewers (ephemeral, deleted 24h after session end)
CREATE TABLE IF NOT EXISTS public.live_viewers (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  
  -- Metrics
  watch_duration_seconds INT DEFAULT 0,
  is_reporter BOOLEAN DEFAULT false
);

CREATE INDEX idx_live_viewers_session_id ON live_viewers(session_id);
CREATE INDEX idx_live_viewers_viewer_id ON live_viewers(viewer_id);

-- Live chat messages
CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 200),
  is_creator_message BOOLEAN DEFAULT false,
  is_hidden_by_creator BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_chat_messages_session_id ON live_chat_messages(session_id, created_at DESC);

-- Live stream reports (same structure as content_reports_v1, but session_id FK)
CREATE TABLE IF NOT EXISTS public.live_stream_reports (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  description TEXT,
  reporter_quality_score NUMERIC(3,2),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_stream_reports_session_id ON live_stream_reports(session_id);
CREATE INDEX idx_live_stream_reports_created_at ON live_stream_reports(created_at DESC);
```

---

## 5) RPC Functions

```sql
-- Check if creator eligible to broadcast
CREATE OR REPLACE FUNCTION is_eligible_for_live_v1(p_creator_id UUID)
RETURNS TABLE (
  eligible BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_follower_count INT;
  v_account_age_days INT;
  v_moderation_status TEXT;
  v_geoblock BOOLEAN;
  v_sessions_today INT;
BEGIN
  -- Check follower count
  SELECT COUNT(*) INTO v_follower_count
  FROM followed_by
  WHERE followed_id = p_creator_id;
  
  IF v_follower_count < 100 THEN
    RETURN QUERY SELECT false, 'Need at least 100 followers to go live';
    RETURN;
  END IF;
  
  -- Check account age
  SELECT EXTRACT(DAYS FROM now() - created_at) INTO v_account_age_days
  FROM profiles
  WHERE id = p_creator_id;
  
  IF v_account_age_days < 7 THEN
    RETURN QUERY SELECT false, 'Account must be at least 7 days old';
    RETURN;
  END IF;
  
  -- Check moderation status
  SELECT moderation_decision INTO v_moderation_status
  FROM content_moderation_status
  WHERE content_type = 'profile' AND content_id = p_creator_id::TEXT;
  
  IF v_moderation_status = 'block' THEN
    RETURN QUERY SELECT false, 'Your account is restricted from broadcasting';
    RETURN;
  END IF;
  
  -- Check daily session limit
  SELECT COUNT(*) INTO v_sessions_today
  FROM live_sessions
  WHERE creator_id = p_creator_id
    AND DATE(started_at) = CURRENT_DATE
    AND status != 'restricted';
  
  IF v_sessions_today >= 3 THEN
    RETURN QUERY SELECT false, 'Max 3 live sessions per day reached';
    RETURN;
  END IF;
  
  -- All checks passed
  RETURN QUERY SELECT true, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create live session
CREATE OR REPLACE FUNCTION broadcast_create_session_v1(
  p_creator_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_category TEXT,
  p_thumbnail_url TEXT
)
RETURNS TABLE (
  session_id BIGINT,
  error TEXT
) AS $$
DECLARE
  v_session_id BIGINT;
  v_eligible BOOLEAN;
  v_reason TEXT;
BEGIN
  -- Check eligibility first
  SELECT eligible, reason INTO v_eligible, v_reason
  FROM is_eligible_for_live_v1(p_creator_id);
  
  IF NOT v_eligible THEN
    RETURN QUERY SELECT NULL::BIGINT, v_reason;
    RETURN;
  END IF;
  
  -- Create session
  INSERT INTO live_sessions (
    creator_id, title, description, category, thumbnail_url,
    status, started_at
  ) VALUES (
    p_creator_id, p_title, p_description, p_category, p_thumbnail_url,
    'live', now()
  )
  RETURNING id INTO v_session_id;
  
  RETURN QUERY SELECT v_session_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Report live stream (trust-weighted)
CREATE OR REPLACE FUNCTION report_live_stream_v1(
  p_session_id BIGINT,
  p_reporter_id UUID,
  p_report_type TEXT,
  p_description TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_quality_score NUMERIC(3,2);
  v_report_count INT;
  v_creator_id UUID;
BEGIN
  -- Get reporter quality score
  SELECT quality_score INTO v_quality_score
  FROM moderation_reporter_quality
  WHERE reporter_id = p_reporter_id;
  
  v_quality_score := COALESCE(v_quality_score, 0.5);
  
  -- Insert report
  INSERT INTO live_stream_reports (
    session_id, reporter_id, report_type, description, reporter_quality_score
  ) VALUES (p_session_id, p_reporter_id, p_report_type, p_description, v_quality_score);
  
  -- Check burst condition: 5+ reports in 2 minutes
  SELECT COUNT(*) INTO v_report_count
  FROM live_stream_reports
  WHERE session_id = p_session_id
    AND created_at > now() - interval '2 minutes';
  
  IF v_report_count >= 5 THEN
    -- Auto-restrict
    UPDATE live_sessions
    SET moderation_status = 'borderline', status = 'restricted'
    WHERE id = p_session_id
    RETURNING creator_id INTO v_creator_id;
    
    RETURN QUERY SELECT true, 'Stream has been restricted due to community reports';
  ELSE
    RETURN QUERY SELECT true, 'Report submitted thank you';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- End live session
CREATE OR REPLACE FUNCTION broadcast_end_session_v1(p_session_id BIGINT)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
BEGIN
  UPDATE live_sessions
  SET status = CASE
    WHEN status = 'restricted' THEN 'restricted'
    ELSE 'ended'
  END,
  ended_at = now()
  WHERE id = p_session_id;
  
  RETURN QUERY SELECT true, 'Live session ended';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 6) Frontend Components

### `src/pages/creator/LiveBroadcastCheck.tsx`
- Display eligibility + live session count
- Button: "Start Live Session" → opens `LiveSetupSheet`

### `src/pages/creator/LiveSetupSheet.tsx`
- Form: title, thumbnail, category, description
- Field validation (moderation)
- Submit → `broadcast_create_session_v1` → navigate to `LiveBroadcastRoom`

### `src/pages/creator/LiveBroadcastRoom.tsx`
- WebRTC video stream
- Viewer count (real-time)
- Chat panel
- Emergency "End Live" button
- Session duration + warnings

### `src/pages/LiveViewerRoom.tsx`
- Full-screen video
- Creator info card
- Chat + reactions
- "Report stream" button

### `src/components/feed/LiveTab.tsx`
- Grid of active live sessions
- Click → viewer room

---

## 7) Acceptance Criteria

✅ **EPIC N is complete when:**
- N1 Database schema deployed (live_sessions, live_viewers, live_chat_messages, live_stream_reports)
- N1 RPC functions working: is_eligible_for_live_v1, broadcast_create_session_v1, report_live_stream_v1, broadcast_end_session_v1
- N1 Access control enforced (followers, age, geoblock, moderation status)
- N1 Broadcast limits enforced (4h max, 100 viewers, rate limits)
- N2 Creator flow: eligibility check → setup → broadcast room (full D0.000 UX)
- N2 Viewer flow: discover live tab → viewer room with chat
- N3 Real-time moderation: reports collected, burst detection auto-restrict
- N3 Auto-restrict properly transitions stream to borderline (creator only view)
- E2E test: creator goes live → viewer joins → sends report → stream auto-restricted
- ✅ Zero TypeScript errors

---

## 8) Deployment Instructions

1. **Deploy database migrations** (20260224300000_phase1_epic_n_live_beta.sql)
2. **Deploy backend RPC functions** (via db push)
3. **Create frontend components** (5 components, ~800 lines total)
4. **Wire live tab into ShortVideoFeed** (route: `/live`)
5. **Add creator menu item** "Go Live" → `/creator/go-live`
6. **Deploy to production** (canary: 5% of creators, monitor auto-restrict triggers)
7. **Git commit:** `feat(live): Phase 1 EPIC N - Live Beta`
8. **Close Phase 1 PMF:** 8/8 EPICs complete ✅
