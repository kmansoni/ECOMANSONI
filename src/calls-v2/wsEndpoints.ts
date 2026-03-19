/**
 * Pure utility helpers for normalising and expanding WebSocket endpoint lists.
 * Shared between VideoCallProvider and useCallsWsSession.
 */

import { logger } from "@/lib/logger";

export function normalizeWsEndpoint(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (value.startsWith("ws://") || value.startsWith("wss://")) return value;
  if (value.startsWith("http://")) return `ws://${value.slice("http://".length)}`;
  if (value.startsWith("https://")) return `wss://${value.slice("https://".length)}`;
  if (value.startsWith("/")) {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}${value}`;
  }

  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${value}`;
}

export function canonicalizeSfuHost(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    const host = parsed.hostname.toLowerCase();

    if (/^sfu-[a-z0-9-]+\.mansoni\.com$/.test(host)) {
      const fixed = endpoint.replace(/\.mansoni\.com(?=[:/?]|$)/i, ".mansoni.ru");
      logger.warn("video_call_context.sfu_host_canonicalized", { from: endpoint, to: fixed });
      return fixed;
    }

    return endpoint;
  } catch (error) {
    logger.debug("video_call_context.sfu_host_canonicalize_failed", { endpoint, error });
    return endpoint;
  }
}

export function expandWsEndpoints(rawEndpoints: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (value: string) => {
    const normalized = normalizeWsEndpoint(value);
    if (!normalized) return;
    const canonical = canonicalizeSfuHost(normalized);
    const key = canonical.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  rawEndpoints.forEach(pushUnique);
  return out;
}

export function isLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const h = url.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch (error) {
    logger.warn("video_call_context.endpoint_parse_failed", { error, endpoint });
    return false;
  }
}
