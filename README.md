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
| **Observability** | Metrics registry, guardrails with auto-rollback, SLO monitoring (Phase 1 EPIC M) |

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
- **VPS mansoni.ru / GitHub Pages** — static hosting (see `DEPLOY.md`)
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

See [`DEPLOY.md`](./DEPLOY.md) for deployment instructions covering GitHub Actions, GitHub Pages, and manual hosting.

---

## Global Geodata Export

The regional script `scripts/fetch-osm-data.mjs` is designed for bounded Overpass extracts like Moscow or Saint Petersburg. For world-scale country and settlement coverage, use the dedicated export CLI instead:

```bash
# Generate a world manifest from Geofabrik + GeoNames without downloading raw datasets
npm run osm:world -- --manifest-only

# Also download selected GeoNames metadata files
npm run osm:world -- --download-geonames=countryInfo,admin1CodesASCII,admin2Codes

# Download the full GeoNames allCountries dump (large)
npm run osm:world -- --download-geonames=allCountries,countryInfo
```

Outputs are written to `public/data/osm/world/` and include:

- `geofabrik-extracts.json` — full extract catalog with PBF URLs
- `geofabrik-countries.json` — country-level subset
- `geofabrik-download-manifest.json` — machine-readable download plan
- `geofabrik-download.aria2.txt` — batch file for `aria2c`
- `download-geofabrik.ps1` — PowerShell downloader for Geofabrik PBF extracts
- `geonames-manifest.json` — GeoNames dataset manifest

This workflow is intentionally manifest-driven because downloading every PBF for every country and subregion produces a very large dataset that should be stored outside normal source control.

To turn the raw GeoNames dump into usable country and settlement shards:

```bash
# Process all populated places into per-country JSON shards
npm run osm:world:process

# Process one country only
npm run osm:world:process -- --country=RU --min-population=1000
```

The processing stage writes to `public/data/osm/world/processed/`:

- `countries.json` — normalized country metadata
- `admin1.json` / `admin2.json` — administrative divisions
- `settlements-manifest.json` — per-country shard manifest
- `settlements/<ISO2>.json` — settlements for each country
- `country-stats.json` / `world-stats.json` — export summary and counts

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