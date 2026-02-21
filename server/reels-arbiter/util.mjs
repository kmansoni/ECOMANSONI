import crypto from "node:crypto";

export function nowMs() {
  return Date.now();
}

export function isoNow() {
  return new Date().toISOString();
}

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function minutesAgoDate(minutes) {
  return new Date(Date.now() - minutes * 60_000);
}

export function stableIdempotencyKey(parts) {
  // Keep keys short-ish but collision-resistant.
  return sha256(parts.join("|"));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
