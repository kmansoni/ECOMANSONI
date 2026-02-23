# Phase 1 Core Rollout Playbook (L+K+M)

**Date:** 2026-02-24  
**Status:** Technical Design Complete → Implementation Ready  
**Approach:** Contract-First + Backward Compatible + Zero-Downtime

---

## Rollout Strategy

### Principle: "One Atomic Contract → Three Layers"

**Rule:** DB + Backend + Frontend изменения в **одном PR**, но **rollout послойный**.

```
PR #123 (Phase 1 EPIC L)
├── DB Migrations (additive only)
├── Backend (dual-path: new + fallback)
├── Frontend (graceful degradation)
└── Contracts (types, errors, payloads)

Deploy sequence:
1. DB migrations (additive) ✅
2. Backend (with fallback) ✅
3. Frontend (with graceful UI) ✅
4. Feature flag rollout (1% → 10% → 50% → 100%)
```

---

## Phase 1 File Structure

```
your-ai-companion-main/
├── supabase/
│   └── migrations/
│       ├── 20260224020001_phase1_trust_schema.sql
│       ├── 20260224020002_phase1_trust_triggers.sql
│       ├── 20260224020003_phase1_trust_rpc.sql
│       ├── 20260224020004_phase1_trust_seed.sql
│       ├── 20260224020005_phase1_moderation_schema.sql
│       ├── 20260224020006_phase1_moderation_rpc.sql
│       ├── 20260224020007_phase1_observability_schema.sql
│       └── 20260224020008_phase1_observability_rpc.sql
│
├── server/
│   └── trust-enforcement/
│       ├── trust.service.ts
│       ├── rate-limit.service.ts
│       ├── redis-lua.service.ts
│       ├── enforcement.middleware.ts
│       └── fallback.policy.ts
│
├── src/
│   ├── lib/
│   │   ├── trust/
│   │   │   ├── types.ts
│   │   │   ├── api.ts
│   │   │   └── hooks.ts
│   │   └── moderation/
│   │       ├── types.ts
│   │       └── api.ts
│   └── components/
│       └── RateLimitNotice.tsx
│
├── schemas/
│   └── phase1/
│       ├── trust-types.ts
│       ├── moderation-types.ts
│       └── observability-types.ts
│
└── docs/
    └── specs/
        └── phase1/
            ├── PHASE1_CORE_ROLLOUT_PLAYBOOK.md (this file)
            ├── PHASE1_L_TRUST_IMPLEMENTATION.md
            ├── PHASE1_K_MODERATION_IMPLEMENTATION.md
            └── PHASE1_M_OBSERVABILITY_IMPLEMENTATION.md
```

---

## EPIC L: Trust-lite Implementation Plan

### Database Layer

**Migration 1: Schema** (`20260224020001_phase1_trust_schema.sql`)

```sql
-- trust_profiles (source of truth for tier/enforcement)
CREATE TABLE IF NOT EXISTS public.trust_profiles (
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'device', 'ip', 'org')),
  actor_id TEXT NOT NULL,
  trust_score INT NOT NULL DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
  risk_tier TEXT NOT NULL DEFAULT 'B' CHECK (risk_tier IN ('A', 'B', 'C', 'D')),
  enforcement_level INT NOT NULL DEFAULT 0 CHECK (enforcement_level >= 0 AND enforcement_level <= 5),
  signals JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (actor_type, actor_id)
);

CREATE INDEX idx_trust_profiles_tier_enforcement ON trust_profiles(risk_tier, enforcement_level);
CREATE INDEX idx_trust_profiles_updated ON trust_profiles(updated_at DESC);

-- risk_events (append-only signal log)
CREATE TABLE IF NOT EXISTS public.risk_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  weight INT NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}',
  request_id UUID,
  source TEXT NOT NULL DEFAULT 'server',
  UNIQUE(request_id)
);

CREATE INDEX idx_risk_events_actor ON risk_events(actor_type, actor_id, ts DESC);
CREATE INDEX idx_risk_events_type ON risk_events(event_type, ts DESC);
CREATE INDEX idx_risk_events_ts ON risk_events(ts DESC);

-- rate_limit_configs (versioned limit matrix)
CREATE TABLE IF NOT EXISTS public.rate_limit_configs (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'tier', 'actor_override')),
  tier TEXT CHECK (tier IS NULL OR tier IN ('A', 'B', 'C', 'D')),
  actor_type TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  algo TEXT NOT NULL DEFAULT 'token_bucket' CHECK (algo IN ('token_bucket', 'fixed_window', 'leaky_bucket')),
  limit_value INT NOT NULL CHECK (limit_value > 0),
  window_seconds INT NOT NULL CHECK (window_seconds > 0),
  burst INT,
  cost_per_action INT NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_action_tier ON rate_limit_configs(action, tier, enabled);
CREATE INDEX idx_rate_limit_actor ON rate_limit_configs(actor_type, actor_id, action);

ALTER TABLE trust_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_configs ENABLE ROW LEVEL SECURITY;
```

**Migration 2: Triggers** (`20260224020002_phase1_trust_triggers.sql`)

```sql
-- Auto-update trust_profiles.updated_at
CREATE OR REPLACE FUNCTION trust_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trust_profiles_update_timestamp
BEFORE UPDATE ON trust_profiles
FOR EACH ROW
EXECUTE FUNCTION trust_profiles_updated_at();

-- Prevent risk_events mutation (append-only)
CREATE OR REPLACE FUNCTION risk_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'risk_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_events_no_update
BEFORE UPDATE ON risk_events
FOR EACH ROW
EXECUTE FUNCTION risk_events_immutable();

CREATE TRIGGER risk_events_no_delete
BEFORE DELETE ON risk_events
FOR EACH ROW
EXECUTE FUNCTION risk_events_immutable();
```

**Migration 3: RPC** (`20260224020003_phase1_trust_rpc.sql`)

```sql
-- Calculate trust score from recent risk events
CREATE OR REPLACE FUNCTION calculate_trust_score_v1(
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_lookback_hours INT DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_score INT := 50;
  v_event_score INT := 0;
  v_final_score INT;
  v_tier TEXT;
BEGIN
  -- Simple scoring: count weighted events in lookback window
  SELECT COALESCE(SUM(weight), 0) INTO v_event_score
  FROM risk_events
  WHERE actor_type = p_actor_type
    AND actor_id = p_actor_id
    AND ts > now() - (p_lookback_hours || ' hours')::INTERVAL;

  v_final_score := GREATEST(0, LEAST(100, v_base_score + v_event_score));
  
  -- Classify tier
  v_tier := CASE
    WHEN v_final_score >= 80 THEN 'A'
    WHEN v_final_score >= 60 THEN 'B'
    WHEN v_final_score >= 40 THEN 'C'
    ELSE 'D'
  END;

  -- Upsert trust_profiles
  INSERT INTO trust_profiles (actor_type, actor_id, trust_score, risk_tier, updated_at, version)
  VALUES (p_actor_type, p_actor_id, v_final_score, v_tier, now(), 1)
  ON CONFLICT (actor_type, actor_id)
  DO UPDATE SET
    trust_score = v_final_score,
    risk_tier = v_tier,
    updated_at = now(),
    version = trust_profiles.version + 1;

  RETURN jsonb_build_object(
    'score', v_final_score,
    'tier', v_tier,
    'updated_at', now()
  );
END;
$$;

-- Get rate limit config for actor+action
CREATE OR REPLACE FUNCTION get_rate_limit_config_v1(
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
  v_config JSONB;
BEGIN
  -- Get tier from trust_profiles
  SELECT risk_tier INTO v_tier
  FROM trust_profiles
  WHERE actor_type = p_actor_type AND actor_id = p_actor_id;

  IF v_tier IS NULL THEN
    v_tier := 'B'; -- Default tier
  END IF;

  -- Get config (priority: actor_override > tier > global)
  SELECT jsonb_build_object(
    'action', action,
    'tier', tier,
    'limit', limit_value,
    'window_seconds', window_seconds,
    'burst', burst,
    'cost_per_action', cost_per_action
  ) INTO v_config
  FROM rate_limit_configs
  WHERE action = p_action
    AND enabled = true
    AND (
      (scope = 'actor_override' AND actor_type = p_actor_type AND actor_id = p_actor_id)
      OR (scope = 'tier' AND tier = v_tier)
      OR scope = 'global'
    )
  ORDER BY
    CASE scope
      WHEN 'actor_override' THEN 1
      WHEN 'tier' THEN 2
      WHEN 'global' THEN 3
    END
  LIMIT 1;

  RETURN COALESCE(v_config, '{"error": "no_config_found"}'::JSONB);
END;
$$;

-- Record risk event (idempotent)
CREATE OR REPLACE FUNCTION record_risk_event_v1(
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_event_type TEXT,
  p_weight INT DEFAULT 0,
  p_meta JSONB DEFAULT '{}',
  p_request_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'server'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  -- Insert or ignore if duplicate request_id
  INSERT INTO risk_events (actor_type, actor_id, event_type, weight, meta, request_id, source)
  VALUES (p_actor_type, p_actor_id, p_event_type, p_weight, p_meta, p_request_id, p_source)
  ON CONFLICT (request_id) DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'recorded', v_event_id IS NOT NULL
  );
END;
$$;
```

**Migration 4: Seed Data** (`20260224020004_phase1_trust_seed.sql`)

```sql
-- Seed rate limit configs for tier-based limits
INSERT INTO rate_limit_configs (scope, tier, action, limit_value, window_seconds, burst, cost_per_action, enabled)
VALUES
  -- Tier A (trusted)
  ('tier', 'A', 'msg_send', 1000, 3600, 100, 1, true),
  ('tier', 'A', 'media_upload', 100, 3600, 20, 10, true),
  ('tier', 'A', 'call_start', 50, 3600, 10, 50, true),
  ('tier', 'A', 'invite_send', 100, 86400, 20, 5, true),
  
  -- Tier B (normal)
  ('tier', 'B', 'msg_send', 500, 3600, 50, 1, true),
  ('tier', 'B', 'media_upload', 50, 3600, 10, 10, true),
  ('tier', 'B', 'call_start', 20, 3600, 5, 50, true),
  ('tier', 'B', 'invite_send', 30, 86400, 5, 5, true),
  
  -- Tier C (restricted)
  ('tier', 'C', 'msg_send', 100, 3600, 20, 1, true),
  ('tier', 'C', 'media_upload', 10, 3600, 2, 10, true),
  ('tier', 'C', 'call_start', 5, 3600, 1, 50, true),
  ('tier', 'C', 'invite_send', 5, 86400, 1, 5, true),
  
  -- Tier D (high risk)
  ('tier', 'D', 'msg_send', 20, 3600, 5, 1, true),
  ('tier', 'D', 'media_upload', 2, 3600, 1, 10, true),
  ('tier', 'D', 'call_start', 0, 3600, 0, 50, false),
  ('tier', 'D', 'invite_send', 0, 86400, 0, 5, false);
```

---

## Backend Layer (TypeScript)

**File:** `schemas/phase1/trust-types.ts`

```typescript
export enum RiskTier {
  A = 'A', // Trusted
  B = 'B', // Normal
  C = 'C', // Restricted
  D = 'D', // High Risk
}

export enum EnforcementLevel {
  E0 = 0, // No restrictions
  E1 = 1, // Soft friction
  E2 = 2, // Hard rate limits
  E3 = 3, // Temporary suspension
  E4 = 4, // Long suspension
  E5 = 5, // Permanent ban
}

export interface TrustProfile {
  actor_type: 'user' | 'device' | 'ip' | 'org';
  actor_id: string;
  trust_score: number; // 0-100
  risk_tier: RiskTier;
  enforcement_level: EnforcementLevel;
  signals: Record<string, any>;
  updated_at: string;
  version: number;
}

export interface RiskEvent {
  id?: number;
  ts?: string;
  actor_type: string;
  actor_id: string;
  event_type: string;
  weight: number;
  meta?: Record<string, any>;
  request_id?: string;
  source?: string;
}

export interface RateLimitConfig {
  action: string;
  tier: RiskTier | null;
  limit: number;
  window_seconds: number;
  burst?: number;
  cost_per_action: number;
}

export interface RateLimitResponse {
  allowed: boolean;
  retry_after_ms?: number;
  tier: RiskTier;
  enforcement_level: EnforcementLevel;
  limit_snapshot?: RateLimitConfig;
  reason?: string;
}

export const RATE_LIMIT_ACTIONS = [
  'msg_send',
  'msg_send_new_chat',
  'media_upload',
  'media_download',
  'call_start',
  'call_accept',
  'turn_allocate',
  'invite_send',
  'search_query',
  'report_submit',
] as const;

export type RateLimitAction = typeof RATE_LIMIT_ACTIONS[number];
```

**File:** `server/trust-enforcement/trust.service.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import type { TrustProfile, RiskEvent, RiskTier } from '@/schemas/phase1/trust-types';

export class TrustService {
  private supabase;
  private cache = new Map<string, { tier: RiskTier; expires: number }>();
  private CACHE_TTL_MS = 30000; // 30s cache

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async getTier(actorType: string, actorId: string): Promise<RiskTier> {
    const cacheKey = `${actorType}:${actorId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.tier;
    }

    // Fallback: Query DB
    const { data, error } = await this.supabase
      .from('trust_profiles')
      .select('risk_tier')
      .eq('actor_type', actorType)
      .eq('actor_id', actorId)
      .single();

    if (error || !data) {
      // Default tier on error
      return RiskTier.B;
    }

    const tier = data.risk_tier as RiskTier;
    this.cache.set(cacheKey, { tier, expires: Date.now() + this.CACHE_TTL_MS });
    return tier;
  }

  async recordEvent(event: RiskEvent): Promise<void> {
    await this.supabase.rpc('record_risk_event_v1', {
      p_actor_type: event.actor_type,
      p_actor_id: event.actor_id,
      p_event_type: event.event_type,
      p_weight: event.weight,
      p_meta: event.meta || {},
      p_request_id: event.request_id,
      p_source: event.source || 'server',
    });
  }

  async recalculateScore(actorType: string, actorId: string): Promise<number> {
    const { data } = await this.supabase.rpc('calculate_trust_score_v1', {
      p_actor_type: actorType,
      p_actor_id: actorId,
    });
    
    return data?.score || 50;
  }
}
```

**File:** `server/trust-enforcement/rate-limit.service.ts`

```typescript
import type { RateLimitAction, RateLimitResponse, RiskTier } from '@/schemas/phase1/trust-types';
import { TrustService } from './trust.service';
import { RedisLuaService } from './redis-lua.service';

export class RateLimitService {
  constructor(
    private trust: TrustService,
    private redis: RedisLuaService
  ) {}

  async enforce(
    action: RateLimitAction,
    actorType: string,
    actorId: string,
    costUnits: number = 1,
    requestId?: string
  ): Promise<RateLimitResponse> {
    const tier = await this.trust.getTier(actorType, actorId);
    
    // Get config from Supabase (cached)
    const config = await this.getConfig(actorType, actorId, action);
    
    if (!config) {
      return {
        allowed: false,
        tier,
        enforcement_level: 0,
        reason: 'no_config_found',
      };
    }

    // Enforce via Redis
    const result = await this.redis.enforceTokenBucket(
      action,
      tier,
      actorType,
      actorId,
      config.limit,
      config.window_seconds,
      costUnits
    );

    return {
      allowed: result.allowed,
      retry_after_ms: result.retry_after_ms,
      tier,
      enforcement_level: 0, // TODO: Link to enforcement
      limit_snapshot: config,
      reason: result.reason,
    };
  }

  private async getConfig(actorType: string, actorId: string, action: string) {
    // Implementation: call get_rate_limit_config_v1 RPC
    // Cache configs for 60s
    return null; // TODO
  }
}
```

---

## Frontend Layer (React/TypeScript)

**File:** `src/lib/trust/types.ts`

```typescript
export { RiskTier, EnforcementLevel, type RateLimitResponse } from '@/schemas/phase1/trust-types';
```

**File:** `src/lib/trust/hooks.ts`

```typescript
import { useState, useEffect } from 'react';
import type { RateLimitResponse } from './types';

export function useRateLimitCooldown(action: string) {
  const [cooldownMs, setCooldownMs] = useState(0);
  const [isLimited, setIsLimited] = useState(false);

  useEffect(() => {
    if (cooldownMs <= 0) {
      setIsLimited(false);
      return;
    }

    setIsLimited(true);
    const timer = setInterval(() => {
      setCooldownMs((prev) => Math.max(0, prev - 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownMs]);

  const handleRateLimitResponse = (response: RateLimitResponse) => {
    if (!response.allowed && response.retry_after_ms) {
      setCooldownMs(response.retry_after_ms);
    }
  };

  return {
    isLimited,
    cooldownSeconds: Math.ceil(cooldownMs / 1000),
    handleRateLimitResponse,
  };
}
```

**File:** `src/components/RateLimitNotice.tsx`

```typescript
import React from 'react';
import { AlertCircle, Clock } from 'lucide-react';

interface Props {
  action: string;
  cooldownSeconds: number;
  tier?: string;
}

export function RateLimitNotice({ action, cooldownSeconds, tier }: Props) {
  if (cooldownSeconds <= 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
      <Clock className="h-4 w-4" />
      <p>
        Подожди {cooldownSeconds} сек. Слишком часто: {action}
      </p>
    </div>
  );
}
```

---

## Deployment Checklist

### Pre-Deploy

- [ ] All migrations validated via `supabase db push --dry-run`
- [ ] Backend tests pass (rate limit enforcement, fallback)
- [ ] Frontend graceful degradation tested
- [ ] Redis Lua scripts validated
- [ ] Rollback plan documented

### Deploy Sequence

1. **DB Migrations** (0 downtime, additive only)
   ```bash
   supabase db push --include-all --yes
   ```

2. **Backend Deploy** (with fallback enabled)
   - Deploy with `TRUST_ENFORCEMENT_ENABLED=false` flag
   - Monitor error rates
   - Enable enforcement gradually via feature flag

3. **Frontend Deploy**
   - Deploy with rate limit UI components
   - Monitor user feedback

4. **Feature Flag Rollout**
   - 1% users for 1 hour
   - Monitor: error rate, latency, false positives
   - 10% → 50% → 100% over 24-48 hours

### Post-Deploy Monitoring

- [ ] Trust score calculation latency < 50ms (p95)
- [ ] Rate limit enforcement latency < 10ms (p95)
- [ ] False positive rate < 0.1%
- [ ] Redis availability > 99.9%
- [ ] No unexpected enforcement at E3+

---

## Rollback Plan

### If Critical Issue Detected

1. **Kill Switch** (instant)
   ```sql
   UPDATE rate_limit_configs SET enabled = false WHERE scope = 'tier';
   ```

2. **Backend Rollback**
   - Set `TRUST_ENFORCEMENT_ENABLED=false`
   - Redeploy previous version

3. **DB Rollback** (if necessary, DESTRUCTIVE)
   ```sql
   -- Only if schema broken
   DROP TABLE trust_profiles CASCADE;
   DROP TABLE risk_events CASCADE;
   DROP TABLE rate_limit_configs CASCADE;
   ```

---

## Integration with Phase 2

Phase 1 **depends on** Phase 2 for:
- User authentication (`auth.users`)
- Event idempotency (`core_outcomes`)
- Audit trail (`core_events`)

Phase 2 **benefits from** Phase 1:
- Rate limiting on `core_append_event_v1`
- Trust tiers for DM scope creation
- Enforcement levels for abuse prevention

**Integration points:**
- `msg_send` → calls `core_append_event_v1` after rate check
- `media_upload` → logs to `risk_events` after success
- `call_start` → enforced before ICE allocation

---

## Success Metrics

**Week 1 (L only):**
- [ ] Trust score calculation operational
- [ ] Rate limits enforced (10% traffic)
- [ ] Zero false E3+ enforcement

**Week 2 (L+K):**
- [ ] Moderation queue integration
- [ ] Trust tiers affect moderation priority
- [ ] Appeals flow operational

**Week 3 (L+K+M):**
- [ ] Guardrails monitoring active
- [ ] Auto-rollback tested in staging
- [ ] Kill-switch coverage verified

---

**Next:** Create migrations + implement Trust Service
