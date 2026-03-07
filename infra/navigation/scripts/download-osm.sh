#!/usr/bin/env bash
# =============================================================================
# ECOMANSONI Navigation Platform — OSM Data Downloader
# Downloads OpenStreetMap PBF file from Geofabrik for Valhalla tile building.
#
# Usage:
#   ./scripts/download-osm.sh [REGION]
#   Regions: russia (default) | moscow | siberia | central | europe
#
# The downloaded file is placed at ./data/osm/region.osm.pbf
# Valhalla reads this path when building routing tiles on first start.
# =============================================================================

set -euo pipefail

REGION="${1:-russia}"
DOWNLOAD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/osm"
OUTPUT_FILE="$DOWNLOAD_DIR/region.osm.pbf"
GEOFABRIK_BASE="https://download.geofabrik.de"

mkdir -p "$DOWNLOAD_DIR"

echo "============================================================"
echo " ECOMANSONI Navigation — OSM Data Download"
echo " Region:  $REGION"
echo " Target:  $OUTPUT_FILE"
echo "============================================================"
echo ""

case "$REGION" in
  russia)
    URL="$GEOFABRIK_BASE/russia-latest.osm.pbf"
    ;;
  moscow | central)
    URL="$GEOFABRIK_BASE/russia/central-fed-district-latest.osm.pbf"
    ;;
  siberia)
    URL="$GEOFABRIK_BASE/russia/siberian-fed-district-latest.osm.pbf"
    ;;
  ural)
    URL="$GEOFABRIK_BASE/russia/ural-fed-district-latest.osm.pbf"
    ;;
  volga)
    URL="$GEOFABRIK_BASE/russia/volga-fed-district-latest.osm.pbf"
    ;;
  south)
    URL="$GEOFABRIK_BASE/russia/south-fed-district-latest.osm.pbf"
    ;;
  northwest)
    URL="$GEOFABRIK_BASE/russia/northwestern-fed-district-latest.osm.pbf"
    ;;
  fareast)
    URL="$GEOFABRIK_BASE/russia/far-eastern-fed-district-latest.osm.pbf"
    ;;
  kazakhstan)
    URL="$GEOFABRIK_BASE/asia/kazakhstan-latest.osm.pbf"
    ;;
  belarus)
    URL="$GEOFABRIK_BASE/europe/belarus-latest.osm.pbf"
    ;;
  europe)
    URL="$GEOFABRIK_BASE/europe-latest.osm.pbf"
    echo "WARNING: europe-latest.osm.pbf is ~30GB. Valhalla requires ~50GB+ RAM to tile."
    echo "         Use a regional extract unless you have sufficient resources."
    echo ""
    ;;
  *)
    echo "ERROR: Unknown region '$REGION'" >&2
    echo ""
    echo "Available regions:"
    echo "  russia       — Full Russia (~3GB)"
    echo "  moscow       — Central Federal District (~600MB)"
    echo "  siberia      — Siberian Federal District (~1.2GB)"
    echo "  ural         — Ural Federal District (~700MB)"
    echo "  volga        — Volga Federal District (~950MB)"
    echo "  south        — Southern Federal District (~500MB)"
    echo "  northwest    — North-Western Federal District (~700MB)"
    echo "  fareast      — Far Eastern Federal District (~900MB)"
    echo "  kazakhstan   — Kazakhstan (~600MB)"
    echo "  belarus      — Belarus (~200MB)"
    echo "  europe       — Full Europe (~30GB, requires large RAM)"
    echo ""
    echo "Usage: $0 [region]"
    exit 1
    ;;
esac

echo "Source URL: $URL"
echo ""

# Check if wget or curl is available
if command -v wget &>/dev/null; then
  echo "Downloading with wget (resumable)..."
  wget \
    --continue \
    --progress=bar:force \
    --tries=3 \
    --timeout=60 \
    "$URL" \
    -O "$OUTPUT_FILE"
elif command -v curl &>/dev/null; then
  echo "Downloading with curl (resumable)..."
  curl \
    --location \
    --continue-at - \
    --retry 3 \
    --retry-delay 5 \
    --progress-bar \
    "$URL" \
    -o "$OUTPUT_FILE"
else
  echo "ERROR: Neither wget nor curl is available. Install one and retry." >&2
  exit 1
fi

FILE_SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo ""
echo "============================================================"
echo " Download complete!"
echo " File:  $OUTPUT_FILE"
echo " Size:  $FILE_SIZE"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Start Valhalla:  docker-compose up -d valhalla"
echo "  2. Valhalla will automatically build routing tiles on first start."
echo "     This takes 10–60 minutes depending on region size and CPU count."
echo "  3. Monitor tile build progress:"
echo "     docker-compose logs -f valhalla"
echo "  4. Verify routing is ready:"
echo "     curl http://localhost:8002/status"
echo ""
