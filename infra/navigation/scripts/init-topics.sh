#!/usr/bin/env bash
# =============================================================================
# ECOMANSONI Navigation Platform — Redpanda Topic Initializer
# Run after `docker-compose up -d redpanda` and its healthcheck passes.
#
# Usage:
#   ./scripts/init-topics.sh [BROKER_ADDRESS]
#   Default broker: localhost:9092
#
# Topic format: "name:partitions:retention_hours"
# Partitions: sized for ~10M concurrent users with 1 Hz location updates.
#   nav.location.raw   → 24 partitions → ~416k events/s per partition ceiling
#   Trip/dispatch topics → 12 partitions (lower velocity, structured events)
#   Presence/geofence   → 12 partitions (high fan-out, short retention)
# Replication factor: 1 for single-broker dev; set to 3 in multi-broker prod.
# =============================================================================

set -euo pipefail

BROKER="${1:-localhost:9092}"
REPLICATION_FACTOR="${REPLICATION_FACTOR:-1}"

echo "============================================================"
echo " ECOMANSONI Navigation — Redpanda Topic Initialization"
echo " Broker:      $BROKER"
echo " Replication: $REPLICATION_FACTOR"
echo "============================================================"
echo ""

# Format: "topic_name:partitions:retention_hours"
TOPICS=(
  "nav.location.raw:24:168"          # Raw GPS events, 7 days
  "nav.location.processed:12:72"     # Filtered/enriched GPS, 3 days
  "nav.trip.events:12:720"           # Trip lifecycle events, 30 days
  "nav.dispatch.events:12:720"       # Dispatch decisions, 30 days
  "nav.traffic.segments:12:168"      # Per-segment speed updates, 7 days
  "nav.surge.events:6:720"           # Surge multiplier changes, 30 days
  "nav.risk.signals:6:720"           # Risk model signals, 30 days
  "nav.risk.actions:6:2160"          # Risk actions (bans/flags), 90 days
  "nav.crowdsource.reports:6:720"    # User reports (potholes, accidents), 30 days
  "nav.search.events:6:168"          # Search/geocode query events, 7 days
  "nav.poi.updates:6:720"            # POI CRUD events, 30 days
  "nav.presence.changes:12:24"       # Driver online/offline, 1 day
  "nav.geofence.events:6:168"        # Geofence enter/exit, 7 days
  "nav.market.state:6:168"           # Zone market state snapshots, 7 days
)

CREATED=0
SKIPPED=0
FAILED=0

for topic_config in "${TOPICS[@]}"; do
  IFS=':' read -r name partitions retention_hours <<< "$topic_config"

  # Convert hours to milliseconds (rpk uses ms for retention)
  retention_ms=$(( retention_hours * 3600 * 1000 ))

  echo -n "  Creating topic: $name (partitions=$partitions, retention=${retention_hours}h) ... "

  if rpk topic create "$name" \
      --brokers "$BROKER" \
      -p "$partitions" \
      -r "$REPLICATION_FACTOR" \
      -c "retention.ms=${retention_ms}" \
      -c "cleanup.policy=delete" \
      -c "compression.type=lz4" \
      2>/dev/null; then
    echo "OK"
    CREATED=$(( CREATED + 1 ))
  else
    # Check if already exists (idempotent run)
    if rpk topic describe "$name" --brokers "$BROKER" > /dev/null 2>&1; then
      echo "EXISTS (skipped)"
      SKIPPED=$(( SKIPPED + 1 ))
    else
      echo "FAILED"
      FAILED=$(( FAILED + 1 ))
    fi
  fi
done

echo ""
echo "============================================================"
echo " Done. Created: $CREATED | Existing: $SKIPPED | Failed: $FAILED"
echo "============================================================"

# List all topics for verification
echo ""
echo "Current topic list:"
rpk topic list --brokers "$BROKER"

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "ERROR: $FAILED topic(s) failed to create. Check Redpanda logs." >&2
  exit 1
fi
