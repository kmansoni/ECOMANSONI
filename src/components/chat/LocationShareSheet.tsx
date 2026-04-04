import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";

interface LocationShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  onSent?: () => void;
}

interface Location {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

export function LocationShareSheet({ isOpen, onClose, conversationId, onSent }: LocationShareSheetProps) {
  const [loading, setLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Геолокация не поддерживается");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setCurrentLocation({
          lat: latitude,
          lng: longitude,
          name: "Моё местоположение",
          address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        });
        setGettingLocation(false);
      },
      () => {
        toast.error("Не удалось получить местоположение");
        setGettingLocation(false);
      },
      { timeout: 10000 }
    );
  }, []);

  const sendLocation = async (location: Location) => {
    setLoading(true);
    try {
      const clientMsgId = crypto.randomUUID();
      const envelope = buildChatBodyEnvelope({
        kind: "location",
        text: `📍 ${location.name}\n${location.address}`,
        metadata: { lat: location.lat, lng: location.lng },
      });
      await sendMessageV1({ conversationId, clientMsgId, body: envelope });

      toast.success("Геолокация отправлена");
      onSent?.();
      onClose();
    } catch (error) {
      logger.error("location-share: failed to send location", {
        conversationId,
        location,
        error,
      });
      toast.error("Ошибка отправки");
    } finally {
      setLoading(false);
    }
  };

  const PRESET_LOCATIONS: Location[] = [
    { lat: 55.7558, lng: 37.6173, name: "Москва, центр", address: "Красная площадь, Москва" },
    { lat: 59.9311, lng: 30.3609, name: "Санкт-Петербург, центр", address: "Невский проспект, СПб" },
  ];

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
            className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl pb-safe"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Отправить местоположение</h2>
              <button onClick={onClose} className="text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Current location button */}
              <div
                role="button"
                tabIndex={0}
                onClick={getCurrentLocation}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') getCurrentLocation(); }}
                className={`w-full flex items-center gap-3 bg-zinc-800 rounded-2xl px-4 py-3 text-left${gettingLocation ? ' opacity-70 pointer-events-none' : ' cursor-pointer'}`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  {gettingLocation ? (
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  ) : (
                    <Navigation className="w-5 h-5 text-blue-400" />
                  )}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">
                    {gettingLocation ? "Получаю местоположение..." : "Текущее местоположение"}
                  </p>
                  {currentLocation && (
                    <p className="text-zinc-400 text-xs mt-0.5">{currentLocation.address}</p>
                  )}
                </div>
                {currentLocation && !gettingLocation && (
                  <button
                    onClick={e => { e.stopPropagation(); sendLocation(currentLocation); }}
                    disabled={loading}
                    className="ml-auto px-3 py-1.5 bg-blue-600 rounded-lg text-white text-xs font-semibold"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Отправить"}
                  </button>
                )}
              </div>

              {/* Static map preview */}
              {currentLocation && (
                <div className="bg-zinc-800 rounded-2xl overflow-hidden h-32 flex items-center justify-center">
                  <a
                    href={`https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-2 text-zinc-400"
                  >
                    <MapPin className="w-8 h-8 text-blue-400" />
                    <span className="text-xs">Открыть в Google Maps</span>
                    <span className="text-xs text-zinc-500">{currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}</span>
                  </a>
                </div>
              )}

              {/* Preset locations */}
              <p className="text-zinc-500 text-xs px-1">Популярные места</p>
              {PRESET_LOCATIONS.map((loc, i) => (
                <button
                  key={i}
                  onClick={() => sendLocation(loc)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 bg-zinc-800 rounded-2xl px-4 py-3 text-left"
                >
                  <MapPin className="w-5 h-5 text-pink-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{loc.name}</p>
                    <p className="text-zinc-400 text-xs truncate">{loc.address}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
