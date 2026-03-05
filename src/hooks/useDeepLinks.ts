/**
 * useDeepLinks — listens for deep link events and navigates accordingly.
 *
 * Sources:
 * 1. Capacitor App.appUrlOpen event (native deep links)
 * 2. Window custom event "mansoni:deeplink" (from push notification handler)
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { parseDeepLink, deepLinkToRoute } from "@/lib/deeplinks";

export function useDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle custom deep link events (from push notifications, native bridge)
    const handler = (event: Event) => {
      const url = (event as CustomEvent<{ url: string }>).detail?.url;
      if (!url) return;

      const action = parseDeepLink(url);
      const route = deepLinkToRoute(action);
      if (route) {
        navigate(route);
      }
    };

    window.addEventListener("mansoni:deeplink", handler);

    // Try Capacitor App plugin for native deep links
    (async () => {
      try {
        const capacitorAppModule = "@capacitor/app";
        const { App } = await import(/* @vite-ignore */ capacitorAppModule);
        App.addListener("appUrlOpen", (data: { url: string }) => {
          const action = parseDeepLink(data.url);
          const route = deepLinkToRoute(action);
          if (route) navigate(route);
        });
      } catch {
        // Not in Capacitor — ignore
      }
    })();

    return () => {
      window.removeEventListener("mansoni:deeplink", handler);
    };
  }, [navigate]);
}
