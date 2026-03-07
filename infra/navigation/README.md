# ECOMANSONI Navigation Platform — Infrastructure

Production-grade Docker stack for the navigation sub-system.
Designed for 10M+ concurrent users, zero-trust, stateless API nodes.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     ecomansoni-nav (Docker network)             │
│                                                                 │
│  Navigation API ──► Valhalla :8002   (OSM routing engine)       │
│                ──► Martin   :3000   (PostGIS → MVT tiles)       │
│                ──► Photon   :2322   (geocoder / autocomplete)   │
│                                                                 │
│  Location Pipeline:                                             │
│  GPS events ──► Redpanda :9092  ──► ClickHouse :8123            │
│                                                                 │
│  State layer:                                                   │
│  Redis :6380  (driver presence, rate-limit, geo-state cache)    │
│                                                                 │
│  Observability:                                                 │
│  Prometheus :9090 ──► Grafana :3001                             │
│  Redpanda Console :8080                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Services

| Service | Image | Port(s) | Purpose |
|---|---|---|---|
| `valhalla` | `ghcr.io/gis-ops/valhalla:latest` | 8002 | OSM turn-by-turn routing, map matching, isochrones |
| `martin` | `ghcr.io/maplibre/martin:v0.13.0` | 3000 | PostGIS → Mapbox Vector Tiles |
| `photon` | `komoot/photon:latest` | 2322 | Forward/reverse geocoding for CIS region |
| `db` | `postgis/postgis:16-3.4-alpine` | 5433 | PostGIS backend for Martin (dev/self-hosted) |
| `redis-nav` | `redis:7-alpine` | 6380 | Driver presence, geo-state cache, rate limiting |
| `redpanda` | `redpanda:v24.1.1` | 9092/8081/8082/9644 | Kafka-compatible event streaming |
| `redpanda-console` | `console:v2.4.5` | 8080 | Redpanda topic browser UI |
| `clickhouse` | `clickhouse-server:24.1` | 8123/9000 | Columnar analytics (GPS, trips, traffic, surge) |
| `prometheus` | `prom/prometheus:v2.51.0` | 9090 | Metrics scraping & alerting |
| `grafana` | `grafana/grafana:10.4.0` | 3001 | Dashboards (ops + analytics) |

---

## Quick Start

### Prerequisites
- Docker Desktop ≥ 4.25 (Windows 11)
- WSL2 backend enabled
- At least 16GB RAM allocated to Docker
- Ports 8002, 3000, 3001, 2322, 5433, 6380, 8080, 8081, 8082, 9090, 9092, 9644, 8123, 9000 free

### 1. Configure environment

```bash
cd infra/navigation
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD and GRAFANA_PASSWORD
```

### 2. Download OSM data (required for Valhalla routing)

```bash
# Download Central Federal District (~600MB, faster to tile)
./scripts/download-osm.sh moscow

# Or full Russia (~3GB, 30-60 min tile build)
./scripts/download-osm.sh russia
```

### 3. Start all services

```bash
docker-compose up -d
```

Watch startup (Valhalla tile build takes time on first run):
```bash
docker-compose logs -f valhalla
```

### 4. Initialize Redpanda topics

```bash
# Wait for Redpanda to be healthy, then:
./scripts/init-topics.sh
```

Or run inside the container:
```bash
docker-compose exec redpanda bash -c "$(cat scripts/init-topics.sh)"
```

### 5. Verify all services are healthy

```bash
docker-compose ps

# Individual health checks:
curl http://localhost:8002/status          # Valhalla
curl http://localhost:3000/health          # Martin
curl "http://localhost:2322/api?q=Москва"  # Photon
redis-cli -p 6380 ping                     # Redis
curl http://localhost:9090/-/healthy       # Prometheus
curl http://localhost:3001/api/health      # Grafana
```

---

## Port Reference

| Port | Service | Protocol |
|------|---------|----------|
| 8002 | Valhalla | HTTP REST |
| 3000 | Martin | HTTP (MVT tiles) |
| 2322 | Photon | HTTP REST |
| 5433 | PostGIS | PostgreSQL |
| 6380 | Redis Nav | Redis protocol |
| 8080 | Redpanda Console | HTTP UI |
| 8081 | Redpanda Schema Registry | HTTP |
| 8082 | Redpanda HTTP Proxy | HTTP |
| 9092 | Redpanda Kafka API | Kafka |
| 9644 | Redpanda Admin | HTTP |
| 8123 | ClickHouse HTTP | HTTP |
| 9000 | ClickHouse Native | TCP |
| 9090 | Prometheus | HTTP |
| 3001 | Grafana | HTTP |

---

## Loading OSM Data into Valhalla

Valhalla auto-downloads and builds tiles from `tile_urls` env var on first boot.
For manual control or offline environments:

```bash
# 1. Download PBF to data/osm/region.osm.pbf
./scripts/download-osm.sh moscow

# 2. Mount the file into Valhalla container:
#    (edit docker-compose.yml to add volume mount for PBF)
#    OR place in valhalla-data volume directory

# 3. Trigger tile build manually:
docker-compose exec valhalla valhalla_build_tiles \
  -c /custom_files/valhalla.json \
  /data/osm/region.osm.pbf

# Monitor progress:
docker-compose logs -f valhalla
```

Tile build times (approximate, 4 CPU cores):
| Region | PBF Size | Build Time |
|--------|----------|-----------|
| Moscow/Central | 600 MB | ~15 min |
| Russia | 3 GB | ~60 min |
| Europe | 30 GB | ~8 hours |

---

## Importing Data into Photon (Geocoder)

Photon requires an Elasticsearch index built from OSM/Nominatim data.

### Option A: Download pre-built index (recommended for CIS)

```bash
# Check available country extracts at:
# https://download1.graphhopper.com/public/extracts/by-country-code/

# Download Russia index (~8GB):
docker-compose exec photon wget \
  "https://download1.graphhopper.com/public/extracts/by-country-code/ru/photon-db-ru-latest.tar.bz2" \
  -O /photon/photon_data/photon-db.tar.bz2

tar -xjf /photon/photon_data/photon-db.tar.bz2 -C /photon/photon_data/
docker-compose restart photon
```

### Option B: Build from Nominatim (self-hosted, full control)

```bash
# Requires running Nominatim with PostGIS and your PBF data.
# See: https://github.com/komoot/photon#installation
```

---

## Redpanda Topic Management

```bash
# List all topics
docker-compose exec redpanda rpk topic list

# View topic details
docker-compose exec redpanda rpk topic describe nav.location.raw

# Consume messages for debugging (last 10)
docker-compose exec redpanda rpk topic consume nav.location.raw --num 10

# Produce a test message
echo '{"driver_id":"test","lat":55.7558,"lon":37.6173}' | \
  docker-compose exec -T redpanda rpk topic produce nav.location.raw
```

---

## ClickHouse Analytics

```bash
# Connect to ClickHouse
docker-compose exec clickhouse clickhouse-client --database nav

# Query trip counts by city (last 7 days)
SELECT
    city_id,
    event_type,
    countMerge(trip_count) AS trips
FROM nav.nav_trip_daily_funnel
WHERE day >= today() - 7
GROUP BY city_id, event_type
ORDER BY trips DESC;

# Raw GPS event count
SELECT count() FROM nav.nav_location_events WHERE event_time >= now() - INTERVAL 1 HOUR;
```

---

## Grafana Dashboards

Access at: http://localhost:3001 (default: admin / changeme_in_production)

To add a navigation dashboard:
1. Place a JSON dashboard file in `grafana/dashboards/`
2. It will be auto-loaded within 30 seconds (or restart Grafana)

Key metrics to visualize:
- **Driver density heatmap**: query `nav.nav_location_hourly_agg` by h3_r7
- **Trip funnel**: `nav.nav_trip_daily_funnel` by event_type
- **Surge multiplier**: `nav.nav_surge_hourly_agg` city + time series
- **Dispatch acceptance rate**: `nav.nav_dispatch_analytics` outcome breakdown
- **Geocoder latency**: `nav.nav_search_analytics` avg latency by provider

---

## Troubleshooting

### Valhalla not serving routes

```bash
# Check tile build status
docker-compose logs valhalla | grep -E "(building|tiles|error|complete)"

# Verify tiles directory is populated
docker-compose exec valhalla ls /custom_files/valhalla_tiles/

# Test routing directly
curl "http://localhost:8002/route?json={\"locations\":[{\"lat\":55.7558,\"lon\":37.6173},{\"lat\":55.7517,\"lon\":37.6178}],\"costing\":\"auto\"}"
```

### Martin returns no tiles

```bash
# Verify DB connection
docker-compose exec martin curl -f "http://localhost:3000/health"

# Check if PostGIS tables exist
docker-compose exec db psql -U postgres -c "\dt public.nav_*"

# Martin catalog (lists all configured sources)
curl http://localhost:3000/catalog
```

### Redpanda consumer group lag

```bash
docker-compose exec redpanda rpk group list
docker-compose exec redpanda rpk group describe <group-id>
```

### Redis memory pressure

```bash
redis-cli -p 6380 info memory
redis-cli -p 6380 info stats | grep evicted
# If eviction is high, increase maxmemory in docker-compose.yml
```

### ClickHouse disk space

```bash
docker-compose exec clickhouse clickhouse-client --query \
  "SELECT table, formatReadableSize(sum(bytes)) AS size FROM system.parts WHERE database='nav' GROUP BY table ORDER BY sum(bytes) DESC"
```

---

## Production Migration Notes

1. **Replace local PostGIS** with managed Supabase/RDS (update `DATABASE_URL` in `.env`)
2. **Redpanda single-broker** → scale to 3-node cluster; set `REPLICATION_FACTOR=3` in `init-topics.sh`
3. **Redis** → Redis Cluster or Elasticache; update connection string in navigation API
4. **Valhalla** → run 2+ replicas behind L4 load balancer (tiles are read-only after build)
5. **Martin** → stateless, scale horizontally; add `replicas: N` in compose or K8s Deployment
6. **ClickHouse** → ClickHouse Cloud or on-prem cluster with sharding by `city_id`
7. **Secrets** → use Docker secrets or Vault; never commit `.env`
