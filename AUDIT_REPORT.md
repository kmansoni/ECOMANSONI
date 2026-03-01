# 🔍 Full Project Audit — ECOMANSONI
**Date:** 2026-02-28  
**Auditor:** Kilo Code (automated static audit)  
**Project version:** 0.0.0 (package.json)

---

## 1. Executive Summary

| Area | Status | Notes |
|---|---|---|
| TypeScript compilation | ✅ PASS | 0 errors |
| ESLint | ✅ PASS | 0 errors, 0 active warnings |
| Unit tests | ⚠️ PARTIAL | 185/187 pass, **2 FAIL** |
| Security | ⚠️ ISSUES | See §6 |
| Dependencies | ⚠️ ISSUES | Misplaced dev deps, lockfile conflict |
| Code quality | ⚠️ ISSUES | Several oversized files |
| Documentation | ✅ GOOD | Extensive |

---

## 2. Project Overview

**ECOMANSONI** — Client-heavy React SPA with Supabase backend and bespoke Node.js microservices.

### Architecture Layers

| Layer | Technology |
|---|---|
| Frontend SPA | React 18 + TypeScript + Vite + TanStack Query v5 + shadcn/ui |
| Auth + DB + Storage + Realtime | Supabase (PostgreSQL + Auth + Edge Functions) |
| WebRTC Signalling | `server/calls-ws/` — Node.js WebSocket + Redis pub/sub |
| Media Relay (SFU) | `server/sfu/` — Node.js |
| Video Feed Arbiter | `server/reels-arbiter/` — Node.js |
| Phone Auth | `server/phone-auth/` — Node.js |
| Email Router | `services/email-router/` — Node.js / TypeScript |
| Notification Router | `services/notification-router/` — Node.js / TypeScript |
| Analytics Ingest | `server/analytics-ingest/` + `server/analytics-consumer/` |
| Mobile (Capacitor) | `apps/mobile-shell/` — iOS/Android wrapper |
| Infra | Docker Compose + coturn TURN server + Redis |

### Scale metrics

| Metric | Value |
|---|---|
| SQL migrations | **234** |
| Supabase Edge Functions | **20** |
| Frontend pages | **~40** (incl. admin) |
| Test files | **32** |
| Total tests | **187** |

---

## 3. TypeScript — ✅ PASS

```
npx tsc --noEmit → exit 0, 0 errors
```

All TypeScript source files compile cleanly with no type errors.

---

## 4. ESLint — ✅ PASS (with suppressed warnings)

```
npx eslint src → 0 errors, 0 active warnings
```

### Suppressed warnings (not active, but worth noting)

**File:** `src/pages/CreateCenterPage.tsx` — 2 instances of `react-hooks/exhaustive-deps`

```
Line 215: useEffect has missing deps: 'searchParams', 'setSearchParams'
Line 233: useEffect has missing deps: 'searchParams', 'setActiveTab', 'setSearchParams'
```

Both are suppressed with `// eslint-disable-next-line` directives. These should be reviewed — missing deps can cause stale closure bugs. ESLint's suggested fix is to add the deps to the array, which is likely safe here.

---

## 5. Tests — ⚠️ 2 FAILING

```
Test Files: 1 failed | 31 passed (32)
      Tests: 2 failed | 185 passed (187)
```

### ❌ Failing tests

**File:** `src/test/reels-create-entrypoints.test.tsx`

| # | Test name | Root cause |
|---|---|---|
| 1 | `opens CreateReelSheet from empty ReelsPage CTA` | `getByRole("button", { name: "Создать Reel" })` — button removed from component |
| 2 | `opens CreateReelSheet from ReelsPage sidebar create button when feed has items` | Same — button no longer exists in `ReelsPage` |

**Root cause analysis:**  
`src/pages/ReelsPage.tsx` was refactored. The empty-state previously had a `<button>Создать Reel</button>` CTA. It was replaced with a text paragraph: _"Откройте центр создания, чтобы добавить Reel"_. The header "create" button was also removed in favour of navigation to `/create?tab=reels&auto=1`.

The tests still look for the old button via accessible name. The tests are **not wrong** — they describe intended accessibility behaviour. The fix requires one of:
- **Option A (recommended):** Restore the `aria-label="Создать Reel"` button in the empty state and in the header toolbar, wiring it to `navigate("/create?tab=reels&auto=1")`.
- **Option B:** Update tests to match the new navigation pattern, but add actual accessible labels to whatever element navigates users to create a reel.

### Test coverage gaps

- No E2E tests run in CI (Playwright tests exist in `e2e/` but are not included in `npm test`).  
- No tests for `services/email-router`, `services/notification-router`, `server/calls-ws`, `server/trust-enforcement`.

---

## 6. Security — ⚠️ ISSUES FOUND

### 6.1 Committed build artifact and temp files

| File | Risk |
|---|---|
| `dist.zip` | Build artifact committed to git (1.28 MB). May contain bundled env vars or source maps. **Remove from repo and add to `.gitignore`**. |
| `.tmp_env_local_snapshot.txt` | Snapshot of `.env.local` committed to git. Could expose secrets. **Delete immediately and run `git filter-repo` if it was ever pushed.** |

### 6.2 Dependency confusion — `@playwright/test` in `dependencies`

`@playwright/test` is listed under `dependencies` (not `devDependencies`). This means it is shipped to production bundles and inflates the install size for deployment environments. Move to `devDependencies`.

### 6.3 `ioredis` in frontend `dependencies`

`ioredis` (Redis client) is in the root `package.json` `dependencies`. Redis clients have no use in the browser SPA. It is presumably used by `server/calls-ws/` and `server/trust-enforcement/`. It should either be moved to `devDependencies` (if only used by server scripts run in dev) or extracted to the server packages' own `package.json`.

### 6.4 JWT tokens stored in `localStorage`

From `ARCHITECTURE.md`: _"refresh tokens stored in localStorage / Supabase cookie"_. `localStorage` is accessible to any injected script (XSS). Prefer `httpOnly` cookie storage for refresh tokens. This is a Supabase default — verify `supabase.createClient` is configured with `auth: { storage: cookieStorage }` for production.

### 6.5 Positive security findings

| Finding | Status |
|---|---|
| RLS on all Postgres tables | ✅ Confirmed |
| JWT-based short-lived access tokens | ✅ Confirmed |
| Admin JIT role escalation, approvals required | ✅ Confirmed |
| Backend safety check (`npm run check:backend`) | ✅ In CI |
| Rate limiting via Redis token bucket | ✅ Confirmed |
| CORS_ALLOWED_ORIGINS configurable | ✅ In `.env.example` |
| `SUPABASE_SERVICE_ROLE_KEY` marked as server-only | ✅ In `.env.example` |
| TURN credentials API key protected | ✅ `TURN_CREDENTIALS_API_KEY` server-only |

---

## 7. Dependencies — ⚠️ ISSUES

### 7.1 Dependency placement problems

| Package | Current place | Should be |
|---|---|---|
| `@playwright/test` | `dependencies` | `devDependencies` |
| `ioredis` | `dependencies` (root) | server package's own deps |
| `ws` | `dependencies` (root) | server package's own deps |
| `sip.js` | `dependencies` | Used only in `src/lib/sip-config.ts` — verify still needed |

### 7.2 Dual lockfile conflict

Both `package-lock.json` (npm) and `bun.lockb` (Bun) exist at the root. This means the repo has been installed with two different package managers. Using mixed lockfiles causes divergence in resolved package versions. **Choose one package manager and delete the other lockfile.**

### 7.3 Notable dependencies (version check)

| Package | Version | Notes |
|---|---|---|
| `react` | `^18.3.1` | React 19 is GA — not urgent, but plan migration |
| `@supabase/supabase-js` | `^2.90.1` | Recent |
| `framer-motion` | `^12.30.0` | v12 — latest major |
| `react-router-dom` | `^6.30.1` | v7 is available |
| `vite` | `^5.4.19` | v6 is available |
| `tailwindcss` | `^3.4.17` | v4 is available |
| `@cesdk/cesdk-js` | `^1.67.0` | Heavy SDK (~MB) — verify tree-shaking |

---

## 8. Code Quality — ⚠️ OVERSIZED FILES

Several files are critically oversized and should be split into smaller components/modules:

| File | Size | Issue |
|---|---|---|
| `src/pages/SettingsPage.tsx` | **163,819 chars** | Monolithic settings page. Split into feature sections. |
| `src/components/chat/ChannelConversation.tsx` | **83,246 chars** | Giant component with mixed concerns |
| `src/components/chat/ChatConversation.tsx` | **68,446 chars** | Same issue |
| `src/pages/ChatsPage.tsx` | **46,992 chars** | Should extract conversation list logic |
| `src/pages/ReelsPage.tsx` | **38,330 chars** | Should extract player, feed, actions |
| `src/pages/SettingsPage.tsx` | **163,819 chars** | Largest file in project |
| `server/calls-ws/index.mjs` | **26,481 chars** | WebSocket server has room for extraction |
| `src/components/chat/VideoCallScreen.tsx` | **23,307 chars** | Reasonable for video UI |

**Recommendation:** aim for < 500 lines / file. Files over 1,000 lines are a maintenance liability.

### Suppressed hooks warnings (CreateCenterPage)

Two `useEffect` hooks have suppressed `exhaustive-deps` warnings. These could lead to stale closure bugs if `searchParams` changes. Review and fix the dependency arrays.

---

## 9. Architecture Observations

### 9.1 Positive patterns

- **TanStack Query v5** for all server state — good separation of concerns.
- **Multi-account context** with per-account `QueryClient` — well-designed.
- **Schema probe** in prebuild (`chat:schema-probe`) — catches DB contract drift before prod.
- **Registry / governance system** (`schemas/registry/`, `scripts/governance/`) — strong.
- **Phase-gated rollout system** with canary + auto-revert playbook.
- **Observability** instrumented with SLO/killswitch framework.
- **Anti-abuse rate limiting** in both frontend (`src/lib/anti-abuse/`) and backend (`server/trust-enforcement/`).

### 9.2 Areas for improvement

| Issue | Recommendation |
|---|---|
| No lazy-loading evidence in `App.tsx` routing | Add `React.lazy()` + `Suspense` for all page-level imports to reduce initial bundle |
| `src/lib/supabase.ts` and `src/integrations/supabase/client.ts` — two Supabase client files | Consolidate to single source of truth |
| Reserve directory (`reserve/`) committed with baseline snapshots | Fine as archival, but ensure it's excluded from build |
| `TIMEWEB_PASTE_TO_CONSOLE.txt` (20K chars) committed | This is a runbook artifact; move to docs or delete |

---

## 10. CI/CD

### `.github/workflows/` — confirmed steps (from ARCHITECTURE.md)

1. `npm run lint`
2. `npm run check:backend`
3. `npm run calls:validate`
4. `npm test`
5. `npm run build`

### Gaps

- `npm run sql:lint` not in CI (runs `scripts/sql/lint-rpc-aliases.mjs`)
- `npm run encoding:check-bom` not in CI — could catch encoding issues before merge
- No automated `npm audit` step for security vulnerability scanning
- E2E Playwright tests (`e2e/`) not in CI matrix

---

## 11. Action Items (Priority Order)

### 🚨 Critical

| # | Action |
|---|---|
| C-1 | Delete `.tmp_env_local_snapshot.txt` from repo. If ever pushed, run `git filter-repo` to purge from history. |
| C-2 | Add `dist.zip` and `.tmp_env_local_snapshot.txt` to `.gitignore`. |
| C-3 | Fix 2 failing tests in `reels-create-entrypoints.test.tsx` — restore or rewrite accessible "Создать Reel" button. |

### ⚠️ High

| # | Action |
|---|---|
| H-1 | Move `@playwright/test`, `ioredis`, `ws` to `devDependencies` or dedicated server packages. |
| H-2 | Choose one package manager (npm or bun) — delete the other lockfile. |
| H-3 | Review `.env.local` (present in workspace) — ensure it's in `.gitignore` and never pushed. |
| H-4 | Fix suppressed `react-hooks/exhaustive-deps` in `CreateCenterPage.tsx` (lines 215, 233). |
| H-5 | Supabase: настроить дублирование данных (Dual DB) с контролем целостности и планом отката. |

### 📋 Medium

| # | Action |
|---|---|
| M-1 | Split `SettingsPage.tsx` (163K chars) into per-section components. |
| M-2 | Split `ChannelConversation.tsx` and `ChatConversation.tsx`. |
| M-3 | Add `npm audit` to CI pipeline. |
| M-4 | Add Playwright E2E tests to CI (at least smoke suite). |
| M-5 | Consolidate duplicate Supabase client (`src/lib/supabase.ts` vs `src/integrations/supabase/client.ts`). |
| M-6 | Add `React.lazy()` code-splitting for page-level routes to reduce initial bundle size. |

### 💡 Low / Nice-to-have

| # | Action |
|---|---|
| L-1 | Plan migration to React 19, Vite 6, Tailwind v4, React Router v7. |
| L-2 | Add `npm run sql:lint` and `npm run encoding:check-bom` to CI. |
| L-3 | Evaluate whether `sip.js` dependency is still actively used. |
| L-4 | Verify `@cesdk/cesdk-js` is tree-shaken — it's a large SDK. |

---

## 12. План дублирования с Supabase (Dual DB)

**Цель:** синхронизировать данные между основной БД и Supabase без потери данных и без остановки продукта.

### 12.1 Предпосылки

- Supabase использует PostgreSQL и поддерживает логическую репликацию.
- Исходная БД совместима по версиям Postgres.
- Есть доступ к настройкам репликации и сетевым правилам.

### 12.2 Этапы

**Этап A — Инвентаризация**
- Список таблиц, объемов и чувствительных данных.
- Проверка расширений и типов данных, которые могут не совпасть.

**Этап B — Базовая загрузка**
- Снимок данных из источника и загрузка в Supabase.
- Фиксация контрольных сумм по ключевым таблицам.

**Этап C — Непрерывная синхронизация**
- Настройка CDC или логической репликации.
- Мониторинг лага и ошибок применения.

**Этап D — Верификация**
- Сравнение счетчиков строк, выборочные проверки, контрольные суммы.
- Автоматические алерты на рассинхронизацию.

**Этап E — Готовность к переключению**
- Документированные условия переключения и отката.
- Тестовый cutover в низком трафике.

### 12.3 Стоп-условия

- Любая рассинхронизация, которую нельзя исправить без потери данных.
- Рост лага репликации выше допустимого порога.

---

## 13. Summary Score

| Category | Score | Notes |
|---|---|---|
| TypeScript safety | 10/10 | Zero type errors |
| Lint quality | 9/10 | 2 suppressed hooks warnings |
| Test health | 7/10 | 2 failing tests, some coverage gaps |
| Security posture | 6/10 | Temp file committed, misplaced deps, localStorage JWT |
| Code organisation | 6/10 | Several massively oversized files |
| Architecture | 8/10 | Well-designed, good separation, solid observability |
| Documentation | 9/10 | Extensive docs and specs |
| CI/CD | 7/10 | Good gates, missing audit/e2e/encoding steps |
| **Overall** | **7.5/10** | Solid foundation, several important issues to address |
