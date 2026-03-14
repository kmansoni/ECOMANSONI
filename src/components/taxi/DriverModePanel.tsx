/**
 * DriverModePanel — панель водительского режима.
 *
 * Реализует функциональность из amitshekhariitbhu/ridesharing-uber-lyft-app:
 *   - Переключатель онлайн/офлайн
 *   - Статистика текущей смены (заработок, поездки, % принятия)
 *   - Карточка текущего активного заказа
 *   - Счётчик ожидания (waitingMeter.ts)
 *   - Транслирует GPS в Supabase через startDriverLocationWatch()
 *
 * Использование:
 *   <DriverModePanel driverProfile={profile} currentOrderId="..." />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Car,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MapPin,
  Power,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DriverProfile, DriverStatus } from "@/types/taxi";
import {
  goOffline,
  goOnline,
  updateDriverStatus,
} from "@/lib/taxi/driverService";
import { startDriverLocationWatch } from "@/lib/taxi/realtimeTracking";

interface DriverModePanelProps {
  driverProfile: DriverProfile;
  /** Если задан — показываем активный заказ */
  currentOrderSummary?: {
    orderId: string;
    passengerName: string;
    pickup: string;
    destination: string;
    price: number;
    status: DriverStatus;
  } | null;
  onStartTrip?: (orderId: string) => void;
  onCompleteTrip?: (orderId: string) => void;
  onProfileUpdate?: () => void;
}

const STATUS_LABELS: Record<DriverStatus, string> = {
  offline: "Офлайн",
  available: "Онлайн — жду заказа",
  arriving: "Еду к пассажиру",
  busy: "В поездке",
  on_break: "Перерыв",
};

const STATUS_COLORS: Record<DriverStatus, string> = {
  offline:   "bg-zinc-700 text-zinc-300",
  available: "bg-green-700 text-green-100",
  arriving:  "bg-blue-700 text-blue-100",
  busy:      "bg-purple-700 text-purple-100",
  on_break:  "bg-yellow-700 text-yellow-100",
};

export function DriverModePanel({
  driverProfile,
  currentOrderSummary,
  onProfileUpdate,
}: DriverModePanelProps) {
  const [status, setStatus] = useState<DriverStatus>(driverProfile.status);
  const [earnings, setEarnings] = useState(driverProfile.shiftEarnings);
  const [trips, setTrips] = useState(driverProfile.shiftTrips);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // GPS watching ref — clean up on unmount or offline
  const stopWatchRef = useRef<(() => void) | null>(null);

  // Start/stop GPS watch on status change
  useEffect(() => {
    if (status === "offline") {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      return;
    }

    if (!stopWatchRef.current) {
      stopWatchRef.current = startDriverLocationWatch(
        driverProfile.driverId,
        (err) => {
          setLocationError(`GPS: ${err.message}`);
        }
      );
    }

    return () => {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
    };
  }, [status, driverProfile.driverId]);

  const toggleOnline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (status === "offline") {
        await goOnline(driverProfile.driverId);
        setStatus("available");
      } else {
        await goOffline(driverProfile.driverId);
        setStatus("offline");
      }
      onProfileUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка смены статуса");
    } finally {
      setLoading(false);
    }
  }, [status, driverProfile.driverId, onProfileUpdate]);

  const handleTakeBreak = useCallback(async () => {
    if (status !== "available") return;
    setLoading(true);
    try {
      await updateDriverStatus(driverProfile.driverId, "on_break");
      setStatus("on_break");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [status, driverProfile.driverId]);

  const isOnline = status !== "offline";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
              <Car className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{driverProfile.name}</p>
              <p className="text-zinc-500 text-xs">
                {driverProfile.car.make} {driverProfile.car.model} · {driverProfile.car.plateNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-white text-sm font-medium">
              {driverProfile.rating.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Status badge */}
      <div className="px-4 pt-3">
        <Badge className={cn("text-xs font-medium", STATUS_COLORS[status])}>
          {STATUS_LABELS[status]}
        </Badge>
      </div>

      {/* Error */}
      {(error || locationError) && (
        <div className="mx-4 mt-2 px-3 py-1.5 bg-red-900/40 border border-red-700 rounded text-red-300 text-xs flex items-center gap-2">
          <X className="w-3.5 h-3.5 shrink-0" />
          {error ?? locationError}
        </div>
      )}

      {/* Shift stats */}
      {isOnline && (
        <div className="px-4 pt-3 grid grid-cols-3 gap-2">
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Заработок" value={`${earnings} ₽`} />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Поездок" value={String(trips)} />
          <StatCard icon={<Star className="w-4 h-4" />} label="Принятие" value={`${driverProfile.acceptanceRate}%`} />
        </div>
      )}

      {/* Active order */}
      {currentOrderSummary && (
        <div className="mx-4 mt-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white text-sm font-medium">{currentOrderSummary.passengerName}</p>
              <div className="flex items-center gap-1 mt-1 text-zinc-400 text-xs">
                <MapPin className="w-3 h-3" />
                <span className="truncate max-w-[180px]">{currentOrderSummary.pickup}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5 text-zinc-400 text-xs">
                <ChevronRight className="w-3 h-3" />
                <span className="truncate max-w-[180px]">{currentOrderSummary.destination}</span>
              </div>
            </div>
            <span className="text-green-400 font-bold text-sm whitespace-nowrap ml-2">
              {currentOrderSummary.price} ₽
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 flex gap-2">
        <Button
          size="sm"
          onClick={toggleOnline}
          disabled={loading || (status !== "offline" && status !== "available")}
          className={cn(
            "flex-1 font-semibold",
            isOnline
              ? "bg-red-700 hover:bg-red-800 text-white"
              : "bg-green-700 hover:bg-green-800 text-white"
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : (
            <Power className="w-4 h-4 mr-1" />
          )}
          {isOnline ? "Завершить смену" : "Начать смену"}
        </Button>

        {status === "available" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleTakeBreak}
            disabled={loading}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Перерыв
          </Button>
        )}

        {status === "on_break" && (
          <Button
            size="sm"
            onClick={async () => {
              setLoading(true);
              await updateDriverStatus(driverProfile.driverId, "available");
              setStatus("available");
              setLoading(false);
            }}
            disabled={loading}
            className="bg-green-700 hover:bg-green-800 text-white"
          >
            Продолжить
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-zinc-800 rounded-lg p-2.5 flex flex-col gap-1">
      <div className="text-zinc-400 flex items-center gap-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-white font-bold text-sm">{value}</span>
    </div>
  );
}
