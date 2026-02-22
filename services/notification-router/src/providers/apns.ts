import http2 from "node:http2";
import crypto from "node:crypto";
import type { RouterConfig } from "../config";
import { NonRetryableProviderError, RetryableProviderError } from "../contracts/errors";

interface ApnsSendOptions {
  token: string;
  payload: Record<string, unknown>;
  pushType: "alert" | "voip" | "background";
  collapseId?: string;
  expiration?: number;
  priority?: "5" | "10";
}

const APNS_HOST_PROD = "https://api.push.apple.com";
const APNS_HOST_SANDBOX = "https://api.sandbox.push.apple.com";
const APNS_TOKEN_TTL_SECONDS = 50 * 60;

let cachedJwt: { token: string; expiresAt: number } | null = null;

function b64url(value: Buffer | string): string {
  const input = typeof value === "string" ? Buffer.from(value) : value;
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function getApnsJwt(config: RouterConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 5) {
    return cachedJwt.token;
  }

  const header = { alg: "ES256", kid: config.apnsKeyId };
  const claims = { iss: config.apnsTeamId, iat: now };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign("sha256");
  signer.update(signingInput);
  signer.end();

  const privateKey = config.apnsPrivateKey.replaceAll("\\n", "\n");
  const signature = signer.sign(privateKey);
  const token = `${signingInput}.${b64url(signature)}`;
  cachedJwt = { token, expiresAt: now + APNS_TOKEN_TTL_SECONDS };
  return token;
}

function requestViaHttp2(
  authority: string,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; responseBody: string }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(authority);
    client.on("error", reject);

    const req = client.request({
      ":method": "POST",
      ":path": path,
      ...headers,
    });

    let status = 0;
    let responseBody = "";
    req.setEncoding("utf8");
    req.on("response", (h) => {
      status = Number(h[":status"] ?? 0);
    });
    req.on("data", (chunk: string) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      resolve({ status, responseBody });
    });
    req.on("error", (err) => {
      client.close();
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

export async function sendApns(config: RouterConfig, options: ApnsSendOptions): Promise<string> {
  const authority = config.apnsUseSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PROD;
  const path = `/3/device/${options.token}`;
  const jwt = getApnsJwt(config);
  const headers: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    "content-type": "application/json",
    "apns-topic": options.pushType === "voip" && config.apnsVoipTopic ? config.apnsVoipTopic : config.apnsTopic,
    "apns-push-type": options.pushType,
    "apns-priority": options.priority ?? (options.pushType === "background" ? "5" : "10"),
  };
  if (options.collapseId) headers["apns-collapse-id"] = options.collapseId;
  if (options.expiration != null) headers["apns-expiration"] = String(options.expiration);

  let result;
  try {
    result = await requestViaHttp2(authority, path, headers, JSON.stringify(options.payload));
  } catch (error) {
    throw new RetryableProviderError("apns_network", error instanceof Error ? error.message : String(error));
  }

  if (result.status >= 200 && result.status < 300) {
    return "apns:sent";
  }

  let reason = "unknown";
  try {
    const parsed = JSON.parse(result.responseBody) as { reason?: string };
    reason = parsed.reason ?? reason;
  } catch {
    // keep unknown
  }

  if (["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reason)) {
    throw new NonRetryableProviderError(reason, `APNs rejected token: ${reason}`);
  }

  if (result.status === 429 || result.status >= 500) {
    throw new RetryableProviderError(reason, `APNs temporary failure: ${reason}`);
  }

  throw new NonRetryableProviderError(reason, `APNs permanent failure: ${reason}`);
}
