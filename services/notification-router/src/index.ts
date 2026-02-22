import { readConfig } from "./config";
import { NotificationDb } from "./db";
import type { DeliveryAttempt, DeviceToken, NotificationEvent } from "./contracts/events";
import { NonRetryableProviderError, RetryableProviderError } from "./contracts/errors";
import { logError, logInfo } from "./observability/logger";
import { createQueues, createWorker, enqueueEvent } from "./queue";
import { sendApns } from "./providers/apns";
import { sendFcm } from "./providers/fcm";
import { selectAudience } from "./routing/audience";
import { computeCollapseKey } from "./routing/collapse";
import { computeDedupKey } from "./routing/dedup";
import { computeRetryDelayMs, isExpired } from "./routing/policy";
import { createRedis } from "./db-redis";

const dedupSeen = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000;

function dedupHit(key: string): boolean {
  const now = Date.now();
  const existing = dedupSeen.get(key);
  if (existing && now - existing < DEDUP_WINDOW_MS) {
    return true;
  }
  dedupSeen.set(key, now);
  return false;
}

function gcDedupWindow(): void {
  const min = Date.now() - DEDUP_WINDOW_MS;
  for (const [k, ts] of dedupSeen.entries()) {
    if (ts < min) dedupSeen.delete(k);
  }
}

function buildApnsSend(event: NotificationEvent, collapseKey?: string, useVoipPush = false): {
  payload: Record<string, unknown>;
  pushType: "alert" | "voip" | "background";
} {
  if (event.type === "incoming_call") {
    return {
      pushType: useVoipPush ? "voip" : "alert",
      payload: {
        aps: useVoipPush
          ? { "content-available": 1, sound: "default" }
          : { alert: { title: "Incoming call", body: "Tap to answer" }, sound: "default" },
        kind: "incoming_call",
        data: event.payload,
      },
    };
  }

  if (event.type === "message") {
    const p = event.payload as { preview?: { title?: string; body?: string } };
    return {
      pushType: "alert",
      payload: {
        aps: {
          alert: { title: p.preview?.title ?? "New message", body: p.preview?.body ?? "Open chat" },
          sound: "default",
          "mutable-content": 1,
        },
        collapseKey,
        kind: "message",
        data: event.payload,
      },
    };
  }

  return {
    pushType: "alert",
    payload: {
      aps: { alert: { title: "Security alert", body: "Open security center" }, sound: "default" },
      kind: "security",
      data: event.payload,
    },
  };
}

async function deliverToDevice(
  event: NotificationEvent,
  device: DeviceToken,
  config: ReturnType<typeof readConfig>,
  db: NotificationDb,
): Promise<DeliveryAttempt> {
  const collapseKey = computeCollapseKey(event);
  const dedupKey = computeDedupKey(event, device.deviceId);
  if (dedupHit(dedupKey)) {
    return {
      eventId: event.eventId,
      deviceId: device.deviceId,
      provider: device.provider,
      status: "dropped",
      attempt: event.attempts,
      errorCode: "dedup",
      errorMessage: "duplicate delivery suppressed",
    };
  }

  try {
    if (device.provider === "apns") {
      const apns = buildApnsSend(event, collapseKey, Boolean(config.apnsVoipTopic));
      const providerMessageId = await sendApns(config, {
        token: device.token,
        payload: apns.payload,
        pushType: apns.pushType,
        collapseId: collapseKey,
        expiration: Math.floor((Date.now() + event.ttlSeconds * 1000) / 1000),
      });
      return {
        eventId: event.eventId,
        deviceId: device.deviceId,
        provider: "apns",
        status: "sent",
        attempt: event.attempts,
        providerMessageId,
      };
    }

    const providerMessageId = await sendFcm(config, {
      token: device.token,
      payload: event.payload as Record<string, unknown>,
      collapseKey,
      ttlSeconds: event.ttlSeconds,
    });
    return {
      eventId: event.eventId,
      deviceId: device.deviceId,
      provider: "fcm",
      status: "sent",
      attempt: event.attempts,
      providerMessageId,
    };
  } catch (error) {
    if (error instanceof NonRetryableProviderError) {
      if (["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic", "UNREGISTERED"].includes(error.code)) {
        await db.markTokenInvalid(device.provider, device.token);
        return {
          eventId: event.eventId,
          deviceId: device.deviceId,
          provider: device.provider,
          status: "invalid_token",
          attempt: event.attempts,
          errorCode: error.code,
          errorMessage: error.message,
        };
      }
      return {
        eventId: event.eventId,
        deviceId: device.deviceId,
        provider: device.provider,
        status: "failed",
        attempt: event.attempts,
        errorCode: error.code,
        errorMessage: error.message,
      };
    }
    if (error instanceof RetryableProviderError) {
      return {
        eventId: event.eventId,
        deviceId: device.deviceId,
        provider: device.provider,
        status: "failed",
        attempt: event.attempts,
        errorCode: error.code,
        errorMessage: error.message,
      };
    }
    return {
      eventId: event.eventId,
      deviceId: device.deviceId,
      provider: device.provider,
      status: "failed",
      attempt: event.attempts,
      errorCode: "unknown_provider_error",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function processEvent(
  event: NotificationEvent,
  config: ReturnType<typeof readConfig>,
  db: NotificationDb,
): Promise<void> {
  if (isExpired(event)) {
    await db.finalizeEvent(event.eventId, "failed", "expired_before_dispatch");
    return;
  }

  const devices = await db.getDeviceTokens(event.userId);
  const audience = selectAudience(event, devices);

  if (audience.length === 0) {
    await db.insertDeliveries([
      {
        eventId: event.eventId,
        deviceId: "none",
        provider: "fcm",
        status: "dropped",
        attempt: event.attempts,
        errorCode: "no_target_device",
        errorMessage: "No valid target device found",
      },
    ]);
    await db.finalizeEvent(event.eventId, "delivered");
    return;
  }

  const deliveries: DeliveryAttempt[] = [];
  let retryableFailures = 0;
  let success = 0;

  for (const device of audience) {
    const attempt = await deliverToDevice(event, device, config, db);
    deliveries.push(attempt);
    if (attempt.status === "sent") success += 1;
    if (attempt.status === "failed") retryableFailures += 1;
  }

  await db.insertDeliveries(deliveries);

  if (success > 0 && retryableFailures === 0) {
    await db.finalizeEvent(event.eventId, "delivered");
    return;
  }

  if (event.attempts < event.maxAttempts && retryableFailures > 0) {
    await db.finalizeEvent(
      event.eventId,
      "pending",
      "retryable_delivery_errors",
      computeRetryDelayMs(event.attempts),
    );
    return;
  }

  await db.finalizeEvent(event.eventId, success > 0 ? "delivered" : "failed", "delivery_failed");
}

async function main(): Promise<void> {
  const config = readConfig();
  const db = new NotificationDb(config);
  const redis = createRedis(config.redisUrl);
  await redis.connect();
  const queues = createQueues(redis, config.queuePrefix);

  const processor = (event: NotificationEvent) => processEvent(event, config, db);
  createWorker("notif:high", redis, config.queuePrefix, processor).on("failed", (job, err) => {
    logError("worker_failed", { queue: "high", jobId: job?.id, error: err.message });
  });
  createWorker("notif:normal", redis, config.queuePrefix, processor).on("failed", (job, err) => {
    logError("worker_failed", { queue: "normal", jobId: job?.id, error: err.message });
  });
  createWorker("notif:low", redis, config.queuePrefix, processor).on("failed", (job, err) => {
    logError("worker_failed", { queue: "low", jobId: job?.id, error: err.message });
  });

  setInterval(gcDedupWindow, 30_000).unref();

  setInterval(async () => {
    try {
      const events = await db.claimEvents(config.claimBatchSize);
      for (const event of events) {
        try {
          await enqueueEvent(queues, event);
        } catch (error) {
          await db.finalizeEvent(event.eventId, "pending", "enqueue_failed", 1500);
          logError("enqueue_failed", {
            eventId: event.eventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (events.length > 0) {
        logInfo("events_claimed", { count: events.length });
      }
    } catch (error) {
      logError("claim_loop_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, config.pollIntervalMs).unref();

  logInfo("notification_router_started", {
    env: config.nodeEnv,
    queuePrefix: config.queuePrefix,
    pollIntervalMs: config.pollIntervalMs,
  });
}

main().catch((error) => {
  logError("notification_router_fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
