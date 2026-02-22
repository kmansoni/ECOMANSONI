import { getOrCreateDeviceId } from "@/lib/multiAccount/vault";
import { upsertDeviceToken } from "./deviceTokens";

export type NativePushTokenDetail = {
  token: string;
  provider: "apns" | "fcm";
  platform?: "ios" | "android" | "web";
  appBuild?: number;
  appVersion?: string;
};

const PUSH_TOKEN_EVENT = "mansoni:native-push-token";
const PUSH_TOKEN_CACHE_KEY = "mansoni:last_push_token";

function normalizePlatform(platform?: string): "ios" | "android" | "web" {
  if (platform === "ios" || platform === "android" || platform === "web") return platform;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
  if (ua.includes("android")) return "android";
  return "web";
}

export function startAutoPushTokenRegistration(): () => void {
  let disposed = false;
  let lastRegisteredKey = "";
  const deviceId = getOrCreateDeviceId();

  const registerToken = async (detail: NativePushTokenDetail): Promise<void> => {
    if (disposed) return;
    if (!detail?.token || !detail?.provider) return;

    const platform = normalizePlatform(detail.platform);
    const dedupeKey = `${detail.provider}:${detail.token}:${platform}:${deviceId}`;
    if (dedupeKey === lastRegisteredKey) return;

    try {
      await upsertDeviceToken({
        deviceId,
        platform,
        provider: detail.provider,
        token: detail.token,
        appBuild: detail.appBuild,
        appVersion: detail.appVersion,
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      lastRegisteredKey = dedupeKey;
      localStorage.setItem(PUSH_TOKEN_CACHE_KEY, JSON.stringify(detail));
    } catch (error) {
      console.warn("[Push] upsertDeviceToken failed:", error);
    }
  };

  const onTokenEvent = (event: Event) => {
    const custom = event as CustomEvent<NativePushTokenDetail>;
    if (!custom.detail) return;
    void registerToken(custom.detail);
  };

  window.addEventListener(PUSH_TOKEN_EVENT, onTokenEvent as EventListener);

  const cachedRaw = localStorage.getItem(PUSH_TOKEN_CACHE_KEY);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as NativePushTokenDetail;
      void registerToken(cached);
    } catch {
      // ignore malformed cache
    }
  }

  // Capacitor bridge support if native plugin is available at runtime.
  const cap = (window as any)?.Capacitor;
  const push = cap?.Plugins?.PushNotifications;
  if (push?.addListener) {
    push.addListener("registration", (token: { value?: string }) => {
      if (!token?.value) return;
      const os = cap?.getPlatform?.() ?? undefined;
      const provider: "apns" | "fcm" = os === "ios" ? "apns" : "fcm";
      void registerToken({
        token: token.value,
        provider,
        platform: os,
      });
    });
    push.addListener("registrationError", (err: unknown) => {
      console.warn("[Push] native registration error:", err);
    });
    void (async () => {
      try {
        const perms = await push.requestPermissions();
        if (perms?.receive === "granted") {
          await push.register();
        }
      } catch (error) {
        console.warn("[Push] request/register failed:", error);
      }
    })();
  }

  return () => {
    disposed = true;
    window.removeEventListener(PUSH_TOKEN_EVENT, onTokenEvent as EventListener);
  };
}
