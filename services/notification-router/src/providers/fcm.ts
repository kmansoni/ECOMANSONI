import crypto from "node:crypto";
import type { RouterConfig } from "../config";
import { NonRetryableProviderError, RetryableProviderError } from "../contracts/errors";

interface FcmSendOptions {
  token: string;
  payload: Record<string, unknown>;
  collapseKey?: string;
  ttlSeconds?: number;
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function b64url(value: Buffer | string): string {
  const input = typeof value === "string" ? Buffer.from(value) : value;
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function fetchAccessToken(config: RouterConfig): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: config.fcmClientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const privateKey = config.fcmPrivateKey.replaceAll("\\n", "\n");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${signingInput}.${b64url(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new RetryableProviderError("fcm_auth", `Failed oauth token request: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: Date.now() + Math.max(30, data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

export async function sendFcm(config: RouterConfig, options: FcmSendOptions): Promise<string> {
  const accessToken = await fetchAccessToken(config);
  const url = `https://fcm.googleapis.com/v1/projects/${config.fcmProjectId}/messages:send`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: options.token,
        data: Object.fromEntries(
          Object.entries(options.payload).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
        ),
        android: {
          collapse_key: options.collapseKey,
          ttl: `${options.ttlSeconds ?? 60}s`,
          priority: "HIGH",
        },
      },
    }),
  });

  if (response.ok) {
    const data = (await response.json()) as { name?: string };
    return data.name ?? "fcm:sent";
  }

  const text = await response.text();
  if (response.status === 404 || text.includes("UNREGISTERED")) {
    throw new NonRetryableProviderError("UNREGISTERED", "FCM token is invalid/unregistered");
  }
  if (response.status === 429 || response.status >= 500) {
    throw new RetryableProviderError("fcm_retryable", `FCM temporary error: HTTP ${response.status}`);
  }

  throw new NonRetryableProviderError("fcm_permanent", `FCM permanent failure: HTTP ${response.status}`);
}
