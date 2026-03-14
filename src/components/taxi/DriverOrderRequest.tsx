/**
 * DriverOrderRequest — всплывающее уведомление для водителя о новом заказе.
 *
 * Из amitshekhariitbhu/ridesharing-uber-lyft-app:
 *   - Показывается поверх всего UI при входящем заказе
 *   - Таймер обратного отсчёта (DRIVER_ACCEPTANCE_TIMEOUT_SECONDS = 15 сек)
 *   - Принять / Отклонить
 *   - Автоматическое отклонение по истечению таймера
 *   - Показывает: пассажир, маршрут, расстояние до подачи, цену, метод оплаты
 *
 * Props:
 *   request — IncomingOrderRequest
 *   driverId — string
 *   onAccept — callback после принятия
 *   onReject — callback после отклонения
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Car, ChevronRight, Clock, CreditCard, Loader2, MapPin, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IncomingOrderRequest } from "@/types/taxi";
import { acceptOrder, rejectOrder } from "@/lib/taxi/driverService";

const PAYMENT_ICONS: Record<string, string> = {
  card: "💳",
  cash: "💵",
  apple_pay: "",
  google_pay: "G",
  corporate: "🏢",
};

interface DriverOrderRequestProps {
  request: IncomingOrderRequest;
  driverId: string;
  onAccept: (orderId: string) => void;
  onReject: (orderId: string) => void;
}

export function DriverOrderRequest({
  request,
  driverId,
  onAccept,
  onReject,
}: DriverOrderRequestProps) {
  const [secondsLeft, setSecondsLeft] = useState(request.timeoutSeconds);
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isExpired = secondsLeft <= 0;

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Auto-reject on timeout
  useEffect(() => {
    if (isExpired && loading === null) {
      onReject(request.orderId);
    }
  }, [isExpired, loading, onReject, request.orderId]);

  const handleAccept = useCallback(async () => {
    if (loading) return;
    clearInterval(timerRef.current!);
    setLoading("accept");
    setError(null);
    try {
      await acceptOrder(driverId, request.orderId);
      onAccept(request.orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка принятия заказа");
      setLoading(null);
    }
  }, [loading, driverId, request.orderId, onAccept]);

  const handleReject = useCallback(async () => {
    if (loading) return;
    clearInterval(timerRef.current!);
    setLoading("reject");
    try {
      await rejectOrder(driverId, request.orderId);
    } finally {
      onReject(request.orderId);
    }
  }, [loading, driverId, request.orderId, onReject]);

  const timerPercent = (secondsLeft / request.timeoutSeconds) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Входящий заказ"
      >
        {/* Timer bar */}
        <div className="h-1 bg-zinc-800 relative">
          <div
            className={cn(
              "absolute inset-y-0 left-0 transition-all ease-linear",
              secondsLeft > 5 ? "bg-green-500" : "bg-red-500"
            )}
            style={{ width: `${timerPercent}%`, transitionDuration: "1s" }}
          />
        </div>

        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-green-400" />
            <span className="text-white font-bold text-base">Новый заказ</span>
          </div>
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-bold",
              secondsLeft > 5 ? "text-green-400" : "text-red-400 animate-pulse"
            )}
          >
            <Clock className="w-4 h-4" />
            {secondsLeft} с
          </div>
        </div>

        {/* Passenger info */}
        <div className="px-4 py-2 flex items-center gap-3 border-b border-zinc-800">
          <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold">
            {request.passengerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-white text-sm font-medium">{request.passengerName}</p>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-400" />
              <span className="text-zinc-400 text-xs">{request.passengerRating.toFixed(1)}</span>
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-green-400 font-bold text-lg">{request.estimatedPrice} ₽</p>
            <p className="text-zinc-500 text-xs">
              {PAYMENT_ICONS[request.paymentMethod]} {request.paymentMethod === "cash" ? "Наличные" : "Карта"}
            </p>
          </div>
        </div>

        {/* Route */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-green-600 flex items-center justify-center shrink-0">
              <MapPin className="w-3 h-3 text-white" />
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Подача</p>
              <p className="text-white text-sm leading-tight">{request.pickup.address}</p>
              <p className="text-zinc-500 text-xs">{request.distanceToPickup.toFixed(1)} км от вас</p>
            </div>
          </div>
          <div className="ml-2.5 w-px h-4 bg-zinc-700" />
          <div className="flex items-start gap-2">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center shrink-0">
              <ChevronRight className="w-3 h-3 text-white" />
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Назначение</p>
              <p className="text-white text-sm leading-tight">{request.destination.address}</p>
            </div>
          </div>
        </div>

        {/* Trip info */}
        <div className="px-4 pb-2 flex gap-4 text-xs text-zinc-400">
          <span>~{request.estimatedDuration} мин</span>
          <span>{request.estimatedDistance.toFixed(1)} км</span>
          {request.paymentMethod !== "cash" && (
            <span className="flex items-center gap-1">
              <CreditCard className="w-3 h-3" />
              Безналичный
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 px-2 py-1.5 bg-red-900/40 border border-red-700 rounded text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="p-4 pt-2 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={loading !== null || isExpired}
            className="border-red-700 text-red-400 hover:bg-red-950 font-semibold"
          >
            {loading === "reject" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><X className="w-4 h-4 mr-1" />Отклонить</>
            )}
          </Button>
          <Button
            onClick={handleAccept}
            disabled={loading !== null || isExpired}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            {loading === "accept" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>Принять ✓</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
