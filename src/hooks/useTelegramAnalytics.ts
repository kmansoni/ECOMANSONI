import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  userId?: string;
}

export function useTelegramAnalytics() {
  const supabase = createClient();

  const track = useCallback(async (event: AnalyticsEvent) => {
    await supabase.functions.invoke("telegram-analytics/track", {
      body: event,
    });
  }, [supabase]);

  const trackNavigation = useCallback((route: string, params?: Record<string, unknown>) => {
    return track({
      event: "navigation",
      properties: { route, ...params },
    });
  }, [track]);

  const trackMiniAppAction = useCallback((action: string, value?: number) => {
    return track({
      event: "mini_app_action",
      properties: { action, value },
    });
  }, [track]);

  const trackDeepLink = useCallback((source: string, params?: Record<string, unknown>) => {
    return track({
      event: "deep_link",
      properties: { source, ...params },
    });
  }, [track]);

  return {
    track,
    trackNavigation,
    trackMiniAppAction,
    trackDeepLink,
  };
}