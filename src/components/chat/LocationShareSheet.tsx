import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, Loader2, Navigation, Radio, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  getCurrentPosition,
  sendStaticLocation,
  sendLiveLocation,
  startLiveLocationWatcher,
  geoErrorToKey,
  type GeoCoords,
} from "@/lib/chat/sendLocation";
import { getStyleUrl } from "@/lib/map/vectorTileProvider";
import "maplibre-gl/dist/maplibre-gl.css";

interface LocationShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  onSent?: () => void;
}

type Mode = "pick" | "live";

const LIVE_DURATIONS = [
  { label: "15 минут", seconds: 900 },
  { label: "1 час", seconds: 3600 },
  { label: "8 часов", seconds: 28800 },
] as const;

// Default center (Moscow) when GPS is unavailable
const DEFAULT_CENTER: [number, number] = [37.6173, 55.7558];

export function LocationShareSheet({ isOpen, onClose, conversationId, onSent }: LocationShareSheetProps) {
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mode, setMode] = useState<Mode>("pick");
  const [selectedDuration, setSelectedDuration] = useState(900);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Request user position when sheet opens
  useEffect(() => {
    if (!isOpen) return;
    setGettingLocation(true);
    setMode("pick");

    getCurrentPosition()
      .then((c) => {
        setCoords(c);
        setMapCenter([c.lng, c.lat]);
      })
      .catch((err) => {
        if (err && typeof err === "object" && "code" in err) {
          const key = geoErrorToKey(err as GeolocationPositionError);
          if (key === "geo_permission_denied") {
            toast.error("Доступ к геолокации запрещён. Разрешите в настройках браузера.");
          }
        }
        // Use default center
      })
      .finally(() => setGettingLocation(false));
  }, [isOpen]);

  // Init / update MapLibre map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;
    // Lazy import to avoid SSR issues
    let cancelled = false;

    import("maplibre-gl").then((ml) => {
      if (cancelled || !mapContainerRef.current) return;

      // Destroy previous instance
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = new ml.default.Map({
        container: mapContainerRef.current,
        style: getStyleUrl("dark"),
        center: mapCenter,
        zoom: 15,
        attributionControl: false,
      });

      map.addControl(new ml.default.NavigationControl({ showCompass: false }), "top-right");

      // User marker
      const markerEl = document.createElement("div");
      markerEl.innerHTML = `<div style="width:16px;height:16px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.6);"></div>`;
      const marker = new ml.default.Marker({ element: markerEl })
        .setLngLat(mapCenter)
        .addTo(map);

      markerRef.current = marker;
      mapRef.current = map;

      // Update marker when map is dragged
      map.on("moveend", () => {
        const center = map.getCenter();
        setMapCenter([center.lng, center.lat]);
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fly to user position once acquired
  useEffect(() => {
    if (!coords || !mapRef.current) return;
    mapRef.current.flyTo({ center: [coords.lng, coords.lat], zoom: 16, duration: 1000 });
    markerRef.current?.setLngLat([coords.lng, coords.lat]);
  }, [coords]);

  // Re-center on user location
  const handleRecenter = useCallback(() => {
    if (!coords || !mapRef.current) return;
    mapRef.current.flyTo({ center: [coords.lng, coords.lat], zoom: 16, duration: 600 });
    markerRef.current?.setLngLat([coords.lng, coords.lat]);
    setMapCenter([coords.lng, coords.lat]);
  }, [coords]);

  // Send static location
  const handleSendStatic = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const c = coords ?? { lat: mapCenter[1], lng: mapCenter[0], accuracy_m: 100 };
      const clientMsgId = crypto.randomUUID();
      await sendStaticLocation({ conversationId, clientMsgId, coords: c });
      toast.success("Геолокация отправлена");
      onSent?.();
      onClose();
    } catch (err) {
      logger.error("location-share: static send failed", { conversationId, error: err });
      toast.error("Ошибка отправки геолокации");
    } finally {
      setLoading(false);
    }
  }, [loading, coords, mapCenter, conversationId, onSent, onClose]);

  // Send live location
  const handleSendLive = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      let c = coords;
      if (!c) {
        c = await getCurrentPosition();
        setCoords(c);
      }
      const clientMsgId = crypto.randomUUID();
      const handle = await sendLiveLocation({
        conversationId,
        clientMsgId,
        coords: c,
        liveDurationSeconds: selectedDuration,
      });

      // Start background watcher that pushes updates until stopped/expired
      startLiveLocationWatcher(handle, {
        onError: (err) =>
          logger.warn("location-share: live watcher error", { error: err }),
      });

      const label = LIVE_DURATIONS.find((d) => d.seconds === selectedDuration)?.label ?? "";
      toast.success(`Трансляция геолокации (${label})`);
      onSent?.();
      onClose();
    } catch (err) {
      logger.error("location-share: live send failed", { conversationId, error: err });
      toast.error("Ошибка запуска трансляции");
    } finally {
      setLoading(false);
    }
  }, [loading, coords, conversationId, selectedDuration, onSent, onClose]);

  // Cleanup map on close
  useEffect(() => {
    if (!isOpen && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl pb-safe max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
              <h2 className="text-white font-semibold text-base">Отправить местоположение</h2>
              <button onClick={onClose} className="text-zinc-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Map */}
            <div className="relative flex-shrink-0" style={{ height: "40vh" }}>
              <div ref={mapContainerRef} className="absolute inset-0" />

              {/* Center pin overlay (stays in center when map is dragged) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <MapPin className="w-8 h-8 text-red-500 -mt-4" fill="currentColor" />
              </div>

              {/* Loading overlay */}
              {gettingLocation && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                  <div className="flex items-center gap-2 bg-zinc-900/90 px-4 py-2 rounded-full">
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    <span className="text-white text-sm">Определяю местоположение…</span>
                  </div>
                </div>
              )}

              {/* Recenter button */}
              {coords && (
                <button
                  onClick={handleRecenter}
                  className="absolute bottom-3 right-3 z-10 w-10 h-10 bg-zinc-900/90 rounded-full flex items-center justify-center shadow-lg border border-zinc-700"
                >
                  <Navigation className="w-5 h-5 text-blue-400" />
                </button>
              )}

              {/* Coordinates badge */}
              <div className="absolute bottom-3 left-3 z-10 bg-zinc-900/80 px-2 py-1 rounded-lg">
                <span className="text-[10px] text-zinc-400 font-mono">
                  {mapCenter[1].toFixed(5)}, {mapCenter[0].toFixed(5)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1">
              {/* Send current position */}
              <button
                onClick={handleSendStatic}
                disabled={loading || gettingLocation}
                className="w-full flex items-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-2xl px-4 py-3 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  {loading && mode === "pick" ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Navigation className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="text-left flex-1">
                  <p className="text-white font-medium text-sm">Отправить местоположение</p>
                  <p className="text-blue-200 text-xs">Текущая позиция на карте</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/60" />
              </button>

              {/* Live location section */}
              <div className="bg-zinc-800 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setMode(mode === "live" ? "pick" : "live")}
                  className="w-full flex items-center gap-3 px-4 py-3"
                >
                  <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
                    <Radio className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-white font-medium text-sm">Трансляция геолокации</p>
                    <p className="text-zinc-400 text-xs">Делитесь местоположением в реальном времени</p>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-zinc-500 transition-transform ${mode === "live" ? "rotate-90" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {mode === "live" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3 space-y-2">
                        <p className="text-zinc-500 text-xs">Выберите время трансляции</p>
                        <div className="flex gap-2">
                          {LIVE_DURATIONS.map((d) => (
                            <button
                              key={d.seconds}
                              onClick={() => setSelectedDuration(d.seconds)}
                              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                                selectedDuration === d.seconds
                                  ? "bg-green-600 text-white"
                                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={handleSendLive}
                          disabled={loading || gettingLocation}
                          className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                          {loading && mode === "live" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Radio className="w-4 h-4" />
                          )}
                          Начать трансляцию
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
