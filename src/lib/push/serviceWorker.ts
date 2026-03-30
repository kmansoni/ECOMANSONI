/**
 * Service Worker для Web Push уведомлений
 * Регистрация, подписка, интеграция с Notification API
 */

import { logger } from "@/lib/logger";

const SW_URL = "/sw-push.js";

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    logger.warn("[Push] Push уведомления не поддерживаются");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL);
    logger.debug("[Push] SW зарегистрирован", { scope: registration.scope });
    return registration;
  } catch (err) {
    logger.error("[Push] Ошибка регистрации SW", { error: err });
    return null;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await Notification.requestPermission();
}

export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    });
    return subscription;
  } catch (err) {
    logger.error("[Push] Ошибка подписки на push", { error: err });
    return null;
  }
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration,
): Promise<boolean> {
  try {
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return true;
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function showLocalNotification(
  title: string,
  options?: NotificationOptions,
): Promise<void> {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    ...options,
  });
}

export async function initPushNotifications(vapidPublicKey?: string): Promise<void> {
  const perm = await requestNotificationPermission();
  if (perm !== "granted") return;

  const reg = await registerPushServiceWorker();
  if (!reg || !vapidPublicKey) return;

  const sub = await subscribeToPush(reg, vapidPublicKey);
  if (sub) {
    // Сохранить подписку на сервере (опционально)
    logger.debug("[Push] Push подписка активна", { endpoint: sub.endpoint.slice(0, 50) });
  }
}
