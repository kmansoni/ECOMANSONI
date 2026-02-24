# ECOMANSONI

A full-featured social and marketplace platform built with React, TypeScript, Vite, and Supabase. It combines social networking (posts, reels, chats, stories), real-estate listings, insurance services, AR previews, and a secured admin console into a single mobile-first application.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [Testing](#testing)
- [Linting](#linting)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## Features

| Area | Description |
|---|---|
| **Social Feed** | Posts, likes, comments, stories, reels |
| **Real-Time Chat** | WebSocket-based messaging, video calls (SFU + coturn) |
| **Real Estate** | Property listings with map integration (Leaflet) |
| **Insurance** | Product catalogue, OSAGO calculator, AI chat assistant |
| **AR Preview** | Augmented-reality view scaffolding (WebAR-ready) |
| **Admin Console** | User management, role assignment (JIT), audit log, approvals |
| **Multi-Account** | Switch between multiple authenticated profiles |
| **Notifications** | Push-style in-app notification system |
| **Trust & Rate Limiting** | DB-backed fixed-window rate limiting with canary rollout (Phase 1 EPIC L) |

---

## Technology Stack

### Frontend
- **React 18** + **TypeScript 5**
- **Vite 5** (build tool)
- **Tailwind CSS 3** + **shadcn/ui** (Radix primitives)
- **React Router 6**
- **TanStack Query 5**
- **Framer Motion 12**

### Backend / Infrastructure
- **Supabase** — Postgres database, Auth, Edge Functions, Realtime, Storage
- **Redis** (ioredis) — presence, rate-limiting, pub/sub for calls
- **WebSocket server** (`server/calls-ws`) — signalling for video calls
- **SFU** (`server/sfu`) — selective forwarding unit for multi-party calls
- **coturn** — TURN/STUN relay (see `scripts/turn/`)

### CI / Deployment
- **GitHub Actions** — lint, tests, build on every PR
- **Vercel / Netlify / GitHub Pages** — static hosting (see `DEPLOY.md`)
- **Capacitor** — Android / iOS native wrapper

---

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for a full description of the system architecture, data flows, and infrastructure diagrams.

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- A Supabase project (free tier is fine for local dev)

### Installation

```bash
git clone https://github.com/kmansoni/ECOMANSONI.git
cd ECOMANSONI
npm install
```

### Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon / publishable key |
| `VITE_SENTRY_DSN` | optional | Sentry DSN for error tracking |
| `VITE_IMGLY_LICENSE_KEY` | optional | CE.SDK license for the media editor |

### Running Locally

```bash
# Start the Vite dev server
npm run dev

# (Optional) Start the WebSocket call server
npm run calls:ws:dev

# (Optional) Start Redis (Docker)
docker run -p 6379:6379 redis:7-alpine
```

The app is served at `http://localhost:5173` by default.

---

## Testing

```bash
# Run all unit tests (Vitest)
npm test

# Watch mode
npm run test:watch

# End-to-end tests (Playwright)
npx playwright test
```

See [`TESTING.md`](./TESTING.md) for detailed test scenarios.

---

## Linting

```bash
npm run lint
```

ESLint is configured in `eslint.config.js` with TypeScript-ESLint, react-hooks, and react-refresh rules.

---

## Deployment

See [`DEPLOY.md`](./DEPLOY.md) for deployment instructions covering Vercel, Netlify, GitHub Pages, and manual hosting.

---

## Contributing

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before submitting a pull request.

---

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for a list of notable changes.

---

## Calls (next-gen / spec)

- Contract pack: `docs/calls/WS_CONTRACT_PACK.md`
- Schemas: `docs/calls/schemas/*.schema.json`
- State machines: `docs/calls/machines/*.yaml`
- Validate contracts: `npm run calls:validate`
- Local dev infra (Redis + coturn): `infra/calls/README.md`
- Multi-region deployment notes: `docs/calls/deploy/MULTIREGION_RU_TR_AE.md`

---

## License

See [`LICENSE`](./LICENSE).