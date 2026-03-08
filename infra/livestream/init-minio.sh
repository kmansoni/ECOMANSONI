#!/bin/sh
# =============================================================================
# MinIO Bucket Initialisation — ECOMANSONI Livestream Platform
# Run by minio-init sidecar container after MinIO is healthy.
# Idempotent: safe to re-run; existing buckets and policies are not modified.
#
# Buckets created:
#   livestream-recordings — MP4 full recordings (private, presigned for access)
#   livestream-thumbnails — JPEG thumbnails (public-read for CDN)
#   livestream-hls        — HLS .ts + .m3u8 segments (public-read, 7-day TTL)
#
# Lifecycle rules:
#   livestream-hls: delete objects older than 7 days (segments expire)
#   livestream-recordings: no auto-deletion (manual curation or 90-day policy)
#
# Security:
#   - HLS and thumbnails have public download policy (CDN pull)
#   - Recordings are private; access via gateway-issued presigned URLs only
# =============================================================================

set -e

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
ALIAS="livestream"

# Wait for MinIO to be reachable (extra safety beyond depends_on: healthy)
echo "[init-minio] Waiting for MinIO at ${MINIO_ENDPOINT}..."
until mc alias set "${ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_USER}" "${MINIO_PASS}" 2>/dev/null; do
  echo "[init-minio] MinIO not ready — retrying in 3s..."
  sleep 3
done
echo "[init-minio] MinIO connected."

# ---------------------------------------------------------------------------
# Create buckets (idempotent with --ignore-existing)
# ---------------------------------------------------------------------------
echo "[init-minio] Creating buckets..."

mc mb "${ALIAS}/livestream-recordings" --ignore-existing
mc mb "${ALIAS}/livestream-thumbnails" --ignore-existing
mc mb "${ALIAS}/livestream-hls" --ignore-existing

echo "[init-minio] Buckets created."

# ---------------------------------------------------------------------------
# Access policies
# ---------------------------------------------------------------------------
echo "[init-minio] Setting access policies..."

# HLS segments and thumbnails: public read (CDN pull zone will cache these).
# Attack consideration: anyone with the URL can download HLS segments.
# Mitigation: gateway uses UUIDs in paths (unguessable segment names).
mc anonymous set download "${ALIAS}/livestream-hls"
mc anonymous set download "${ALIAS}/livestream-thumbnails"

# Recordings: private — access only via gateway-issued presigned URLs.
# Presigned URL TTL should be ≤ 3600s (1h) to limit replay window.
mc anonymous set none "${ALIAS}/livestream-recordings"

echo "[init-minio] Access policies set."

# ---------------------------------------------------------------------------
# Lifecycle rules
# ---------------------------------------------------------------------------
echo "[init-minio] Configuring lifecycle rules..."

# HLS segments: delete after 7 days.
# Prevents unbounded storage growth from abandoned live sessions.
# MinIO lifecycle rules use S3-compatible XML internally.
mc ilm rule add "${ALIAS}/livestream-hls" --expire-days 7 2>/dev/null || \
  echo "[init-minio] WARNING: HLS lifecycle rule may already exist (ignored)."

# Thumbnails: keep forever (small size, referenced from DB/CDN).
# No lifecycle rule needed.

# Recordings: optional — uncomment for 90-day auto-deletion policy.
# mc ilm rule add "${ALIAS}/livestream-recordings" --expire-days 90

echo "[init-minio] Lifecycle rules configured."

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------
echo "[init-minio] Verifying bucket list..."
mc ls "${ALIAS}"

echo "[init-minio] ✅ MinIO initialisation complete."
