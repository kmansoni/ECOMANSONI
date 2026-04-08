import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { getOrCreateDeviceId } from "@/lib/multiAccount/vault";
import { pingScreenTime } from "@/lib/user-settings";

const APP_OBJECT_ID = "mansoni-app";
const SCREEN_FLUSH_MS = 60_000;

type ScreenSnapshot = {
  id: string;
  moduleId: string;
  startedAt: number;
};

function getActorId(userId?: string) {
  return userId ?? `anon:${getOrCreateDeviceId()}`;
}

function getModuleId(pathname: string) {
  if (pathname === "/") return "messenger";
  if (pathname.startsWith("/reels")) return "reels";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/shop") || pathname.startsWith("/checkout")) return "marketplace";
  if (pathname.startsWith("/live")) return "streaming";
  if (pathname.startsWith("/people") || pathname.startsWith("/dating")) return "dating";
  if (pathname.startsWith("/crm")) return "crm";
  if (pathname.startsWith("/insurance")) return "insurance";
  if (pathname.startsWith("/taxi")) return "taxi";
  if (pathname.startsWith("/real-estate")) return "real-estate";
  if (pathname.startsWith("/chats") || pathname.startsWith("/chat")) return "messenger";

  const [segment] = pathname.split("/").filter(Boolean);
  return segment || "app";
}

function getScreenId(pathname: string, search: string) {
  const raw = `${pathname}${search}`;
  return raw === "/" ? "home" : raw;
}

export function useAppActivity() {
  const location = useLocation();
  const { user } = useAuth();
  const screenRef = useRef<ScreenSnapshot | null>(null);
  const screenTimeAnchorRef = useRef<number | null>(null);

  useEffect(() => {
    const actorId = getActorId(user?.id);

    trackAnalyticsEvent({
      actorId,
      objectType: "app",
      objectId: APP_OBJECT_ID,
      ownerId: actorId,
      eventType: "session_start",
      props: { entry_path: window.location.pathname + window.location.search },
    });

    return () => {
      const current = screenRef.current;
      if (current) {
        trackAnalyticsEvent({
          actorId,
          objectType: "screen",
          objectId: current.id,
          ownerId: actorId,
          eventType: "screen_leave",
          durationMs: Math.max(0, Date.now() - current.startedAt),
          props: { module_id: current.moduleId, reason: "app_unmount" },
        });
      }

      trackAnalyticsEvent({
        actorId,
        objectType: "app",
        objectId: APP_OBJECT_ID,
        ownerId: actorId,
        eventType: "session_end",
        props: {
          last_screen_id: current?.id ?? null,
          last_module_id: current?.moduleId ?? null,
        },
      });
    };
  }, [user?.id]);

  useEffect(() => {
    const actorId = getActorId(user?.id);
    const nextScreenId = getScreenId(location.pathname, location.search);
    const nextModuleId = getModuleId(location.pathname);
    const prev = screenRef.current;
    const now = Date.now();

    if (prev?.id === nextScreenId) return;

    if (prev) {
      trackAnalyticsEvent({
        actorId,
        objectType: "screen",
        objectId: prev.id,
        ownerId: actorId,
        eventType: "screen_leave",
        durationMs: Math.max(0, now - prev.startedAt),
        props: {
          module_id: prev.moduleId,
          to_screen_id: nextScreenId,
          to_module_id: nextModuleId,
        },
      });
    }

    screenRef.current = {
      id: nextScreenId,
      moduleId: nextModuleId,
      startedAt: now,
    };

    trackAnalyticsEvent({
      actorId,
      objectType: "screen",
      objectId: nextScreenId,
      ownerId: actorId,
      eventType: "screen_view",
      props: {
        module_id: nextModuleId,
        pathname: location.pathname,
        search: location.search || null,
      },
    });

    if (!prev || prev.moduleId !== nextModuleId) {
      trackAnalyticsEvent({
        actorId,
        objectType: "module",
        objectId: nextModuleId,
        ownerId: actorId,
        eventType: "navigation",
        props: {
          from_module_id: prev?.moduleId ?? null,
          screen_id: nextScreenId,
        },
      });
    }
  }, [location.pathname, location.search, user?.id]);

  useEffect(() => {
    if (!user?.id || typeof document === "undefined") {
      screenTimeAnchorRef.current = null;
      return;
    }

    const flushScreenTime = () => {
      const startedAt = screenTimeAnchorRef.current;
      if (!startedAt) return;

      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsedSeconds <= 0) return;

      screenTimeAnchorRef.current = Date.now();
      void pingScreenTime(elapsedSeconds).catch((error) => {
        logger.error("[useAppActivity] Не удалось сохранить screen time", {
          error,
          elapsedSeconds,
          userId: user.id,
        });
      });
    };

    const onVisible = () => {
      screenTimeAnchorRef.current = Date.now();
    };

    const onHidden = () => {
      flushScreenTime();
      screenTimeAnchorRef.current = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        onHidden();
        return;
      }

      onVisible();
    };

    const onPageHide = () => {
      onHidden();
    };

    if (!document.hidden) {
      onVisible();
    }

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        flushScreenTime();
      }
    }, SCREEN_FLUSH_MS);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      onHidden();
    };
  }, [user?.id]);
}