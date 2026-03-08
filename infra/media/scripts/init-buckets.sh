#!/bin/sh
# ============================================================
# MinIO Bucket Initializer
# Runs once (via minio-init service) after MinIO is healthy.
# Creates all 6 buckets and sets anonymous read policy.
#
# Security model:
#   - GET  (read)  → public (served via Nginx CDN)
#   - PUT/DELETE   → authenticated only (media-api uses root creds)
#   Public read is safe because:
#     1. Object names are cryptographic UUIDs (not guessable)
#     2. No listing is allowed (s3:ListBucket is denied for anon)
# ============================================================

set -eu

MINIO_HOST="minio:9000"
ALIAS="local"

BUCKETS="media chat-media voice-messages reels-media avatars stories-media"

# ----------------------------------------------------------
# Wait for MinIO to be ready (extra safety beyond depends_on)
# ----------------------------------------------------------
echo "[init-buckets] Waiting for MinIO at ${MINIO_HOST}..."
MAX_RETRIES=30
RETRY=0
until mc alias set "${ALIAS}" "http://${MINIO_HOST}" \
        "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" \
        --api S3v4 > /dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ "${RETRY}" -ge "${MAX_RETRIES}" ]; then
        echo "[init-buckets] ERROR: MinIO did not become ready after ${MAX_RETRIES} retries." >&2
        exit 1
    fi
    echo "[init-buckets] Attempt ${RETRY}/${MAX_RETRIES} failed, retrying in 3s..."
    sleep 3
done
echo "[init-buckets] Connected to MinIO."

# ----------------------------------------------------------
# Create buckets and apply public-read policy
# Policy: anonymous GET/HEAD on objects only (no bucket listing)
# ----------------------------------------------------------
for BUCKET in ${BUCKETS}; do
    # Idempotent — mc mb --ignore-existing never fails on re-run
    mc mb --ignore-existing "${ALIAS}/${BUCKET}"
    echo "[init-buckets] Bucket '${BUCKET}' ensured."

    # Apply anonymous read policy (objects only, NOT bucket listing)
    # This JSON denies ListBucket to anonymous and allows GetObject
    POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadObjects",
      "Effect": "Allow",
      "Principal": {"AWS": ["*"]},
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::${BUCKET}/*"]
    }
  ]
}
EOF
)
    echo "${POLICY}" | mc anonymous set-json /dev/stdin "${ALIAS}/${BUCKET}"
    echo "[init-buckets] Public-read policy applied to '${BUCKET}'."
done

# ----------------------------------------------------------
# Verify all buckets exist
# ----------------------------------------------------------
echo "[init-buckets] Final bucket listing:"
mc ls "${ALIAS}"

echo "[init-buckets] All buckets initialized successfully."
