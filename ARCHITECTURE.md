# Architecture

This document describes the high-level architecture of ECOMANSONI, the data flows between components, and the infrastructure services it depends on.

---

## Table of Contents

1. [Overview](#overview)
2. [Frontend Architecture](#frontend-architecture)
3. [Backend Services](#backend-services)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Infrastructure Services](#infrastructure-services)
6. [Deployment Architecture](#deployment-architecture)
7. [Security Model](#security-model)

---

## Overview

ECOMANSONI is a **client-heavy** application. Most business logic runs in the browser (React SPA), with Supabase handling data persistence, auth, and real-time subscriptions. Bespoke Node.js micro-services handle media-relay (SFU) and WebSocket signalling for video calls.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                           │
│   React 18 + TypeScript + Vite + TanStack Query + shadcn/ui     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WSS
         ┌─────────────────┼─────────────────────────┐
         │                 │                         │
         ▼                 ▼                         ▼
  ┌────────────┐   ┌───────────────┐       ┌─────────────────┐
  │  Supabase  │   │  calls-ws     │       │     SFU         │
  │  (PaaS)    │   │  (Node.js WS) │       │  (Node.js)      │
  │            │   └───────┬───────┘       └────────┬────────┘
  │ • Postgres │           │                        │
  │ • Auth     │           └──── Redis pub/sub ──────┘
  │ • Storage  │                  (ioredis)
  │ • Realtime │
  │ • Edge Fn  │
  └────────────┘
```

---

## Frontend Architecture

### Directory Layout

```
src/
├── App.tsx               – Root component; defines all routes
├── main.tsx              – Vite entry point
├── components/           – Reusable UI components
│   ├── admin/            – Admin console shell & guards
│   ├── auth/             – Login / registration forms
│   ├── chat/             – Messaging UI, video call overlay
│   ├── insurance/        – InsuranceAssistant, OsagoCalculator
│   ├── layout/           – AppLayout, navigation bar
│   ├── reels/            – Short-video player & feed
│   └── ui/               – shadcn/ui primitives
├── contexts/             – React context providers
│   ├── MultiAccountContext.tsx
│   ├── VideoCallContext.tsx
│   └── ...
├── hooks/                – Custom React hooks (data fetching + logic)
├── integrations/
│   └── supabase/         – Generated Supabase client & types
├── lib/                  – Utility helpers (cn, sentry, adminApi)
├── pages/                – Route-level page components
│   ├── ARPage.tsx
│   ├── InsurancePage.tsx
│   └── admin/
└── test/                 – Vitest unit test suites
```

### State Management

| Concern | Solution |
|---|---|
| Server state / caching | TanStack Query v5 |
| Auth state | `useAuth` hook (Supabase session) |
| Multi-account switching | `MultiAccountContext` (per-account QueryClient) |
| UI-only state | `useState` / `useReducer` |
| Theme / appearance | `AppearanceRuntimeContext` + `next-themes` |

### Routing

React Router 6 with lazy-loaded page components. Routes are split into:
- **Public** – `/auth`, `/admin/login`
- **Admin-protected** – `/admin/**` (`AdminProtectedRoute`)
- **User-protected** – all other routes (`ProtectedRoute` → Supabase session)

---

## Backend Services

### Supabase Edge Functions

| Function | Purpose |
|---|---|
| `insurance-assistant` | Streams AI responses for the Insurance Chat (SSE) |
| `phone-auth` | Phone-number authentication (no SMS) |

### calls-ws (`server/calls-ws/`)

Node.js WebSocket server that handles call signalling:
- Join / leave room events
- Offer / answer / ICE candidate relay
- Backed by Redis for state and pub/sub across instances

### SFU (`server/sfu/`)

Selective Forwarding Unit for multi-party video calls. Receives media from one participant and forwards to others without transcoding.

### Reels Arbiter (`server/reels-arbiter/`)

Control-plane service for short-video distribution:
- Manages upload policies
- Triggers transcoding jobs
- Exposes RPC endpoints consumed by the frontend

---

## Data Flow Diagrams

### Authentication Flow

```
User → AuthPage → Supabase phone-auth Edge Function
                        │
                        ▼
                   Supabase Auth
                        │
              session token (JWT)
                        │
            ProtectedRoute checks session
                        │
                        ▼
                    App pages
```

### Insurance AI Chat Flow

```
User types message
       │
InsuranceAssistant.streamChat()
       │
       ▼
POST /functions/v1/insurance-assistant  (SSE)
       │
  Supabase Edge Function
       │ calls OpenAI / LLM
       │ streams delta tokens
       ▼
Browser reads SSE stream
       │ appends tokens to message state
       ▼
UI re-renders incrementally
```

### Real-Time Chat Flow

```
User sends message
       │
supabase.from('messages').insert()
       │
Supabase Realtime (Postgres changes)
       │
Other user's subscription fires
       │
UI updates via TanStack Query invalidation
```

### Video Call Flow

```
Caller                      Callee
  │── join(roomId) ────────────▶ calls-ws
  │                                │
  │◀─── peer joined ───────────────│
  │                                │
  │── offer(SDP) ─────────────────▶│
  │◀─── answer(SDP) ───────────────│
  │── ICE candidates ─────────────▶│
  │◀─── ICE candidates ────────────│
  │                                │
  └──── direct WebRTC media ───────┘
           (or via SFU)
```

---

## Infrastructure Services

| Service | Role | Where |
|---|---|---|
| **Supabase** | DB, Auth, Storage, Realtime, Edge Functions | Managed PaaS |
| **Redis** | Call state, rate-limiting, pub/sub | Docker or managed (Upstash) |
| **coturn** | TURN/STUN relay for WebRTC NAT traversal | VPS (see `scripts/turn/`) |
| **calls-ws** | WebSocket signalling | VPS / container |
| **SFU** | Multi-party media relay | VPS / container |

---

## Deployment Architecture

```
Internet
   │
   ├── Static SPA ──────────────────▶ Vercel / Netlify / GitHub Pages
   │                                   (Vite build → `dist/`)
   │
   ├── calls-ws  ────────────────────▶ VPS / Docker container
   │
   ├── SFU       ────────────────────▶ VPS / Docker container
   │
   ├── coturn    ────────────────────▶ Ubuntu VPS (ports 3478, 5349)
   │
   └── Supabase  ────────────────────▶ Managed PaaS (supabase.com)
```

GitHub Actions CI runs on every push/PR:
1. `npm run lint`
2. `npm run check:backend`
3. `npm run calls:validate`
4. `npm test`
5. `npm run build`

See `.github/workflows/ci.yml`.

---

## Security Model

- **Row-Level Security (RLS)** on all Postgres tables via Supabase policies
- **JWT-based auth** — short-lived access tokens, refresh tokens stored in `localStorage` / Supabase cookie
- **Admin Console** uses a separate `admin_users` table with JIT (Just-In-Time) role escalation — approvals required for sensitive roles
- **Backend safety check** (`npm run check:backend`) prevents unsafe SQL migrations from being deployed
- **Rate limiting** via Redis token bucket on the WebSocket server

Full details: [`docs/SECURE_AUTH_ARCHITECTURE_SUPABASE.md`](./docs/SECURE_AUTH_ARCHITECTURE_SUPABASE.md)
