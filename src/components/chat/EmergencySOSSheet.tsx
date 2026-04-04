/**
 * EmergencySOSSheet — Crisis emergency signal broadcaster.
 *
 * Ported from crisis-mesh-messenger SOSScreen + EmergencyAlertsScreen:
 *   - One-tap SOS with signal type selection
 *   - Optional GPS location attachment
 *   - Shows all active signals from network sorted by priority
 *   - Resolve own signal when help arrives
 *
 * Security:
 *   - Location permission is requested explicitly; never background-tracked
 *   - Broadcast rate limited to 1 active unresolved signal per user (DB-enforced)
 *   - Resolve only own signal (RLS-enforced)
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  type EmergencyLevel,
  type EmergencySignal,
  type EmergencySignalType,
  LEVEL_COLORS,
  SIGNAL_DESCRIPTIONS,
  SIGNAL_ICONS,
  computePriorityScore,
} from "@/lib/chat/emergencySignal";
import { useEmergencySignals } from "@/hooks/useEmergencySignals";

// ── Type picker config ────────────────────────────────────────────────────────

const SIGNAL_TYPES: EmergencySignalType[] = [
  "sos",
  "medical",
  "trapped",
  "danger",
  "need_water",
  "need_food",
  "need_shelter",
  "need_medication",
  "found_survivor",
  "safe",
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface EmergencySOSSheetProps {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  initialType?: EmergencySignalType | null;
  prefilledMessage?: string;
  emergencyCallHref?: string;
  emergencyCallLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EmergencySOSSheet({
  open,
  onClose,
  currentUserId,
  currentUserName,
  initialType = null,
  prefilledMessage = "",
  emergencyCallHref,
  emergencyCallLabel,
}: EmergencySOSSheetProps) {
  const { signals, mySignal, loading, error, broadcast, resolve, refresh } =
    useEmergencySignals();

  const [selectedType, setSelectedType] = useState<EmergencySignalType | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"send" | "alerts">("send");

  // Refresh on open
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    setSelectedType(initialType);
    setCustomMessage(prefilledMessage);
    setCoords(null);
    setTab("send");
  }, [open, initialType, prefilledMessage]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocLoading(false);
      },
      () => {
        setLocLoading(false);
        toast.error("Не удалось определить местоположение");
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  const handleSend = useCallback(async () => {
    if (!selectedType || sending) return;
    setSending(true);
    try {
      await broadcast({
        senderName: currentUserName,
        type: selectedType,
        message: customMessage.trim() || undefined,
        latitude: coords?.lat ?? null,
        longitude: coords?.lon ?? null,
      });
      setSelectedType(null);
      setCustomMessage("");
      setCoords(null);
      setTab("alerts");
    } catch (err) {
      logger.error("sos: broadcast failed", err);
      toast.error("Не удалось отправить SOS-сигнал. Проверьте подключение.");
    } finally {
      setSending(false);
    }
  }, [selectedType, sending, broadcast, currentUserName, customMessage, coords]);

  const handleResolve = useCallback(async () => {
    if (!mySignal) return;
    try {
      await resolve(mySignal.id, currentUserId);
    } catch {
      toast.error("Не удалось деактивировать сигнал");
    }
  }, [mySignal, resolve, currentUserId]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[90vh] flex flex-col bg-zinc-950 text-white border-zinc-800"
      >
        <SheetHeader className="flex-shrink-0 px-4 pt-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-red-400 flex items-center gap-2 font-bold text-lg">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              Экстренный SOS
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-2">
            <button
              className={cn(
                "flex-1 py-1.5 text-sm rounded font-medium transition-colors",
                tab === "send"
                  ? "bg-red-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              )}
              onClick={() => setTab("send")}
            >
              Отправить SOS
            </button>
            <button
              className={cn(
                "flex-1 py-1.5 text-sm rounded font-medium transition-colors relative",
                tab === "alerts"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              )}
              onClick={() => setTab("alerts")}
            >
              Сигналы{" "}
              {signals.length > 0 && (
                <span className="ml-1 bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5">
                  {signals.length}
                </span>
              )}
            </button>
          </div>
        </SheetHeader>

        {error && (
          <div className="mx-4 mt-2 px-3 py-2 bg-red-900/40 border border-red-700 rounded text-red-300 text-xs">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* ── Send Tab ─────────────────────────────────────── */}
          {tab === "send" && (
            <div className="mt-4 space-y-4">
              {/* Active signal warning */}
              {mySignal && (
                <div className="p-3 bg-orange-900/30 border border-orange-700 rounded-lg">
                  <p className="text-orange-300 text-sm font-medium">
                    {SIGNAL_ICONS[mySignal.type]} У вас активный сигнал:{" "}
                    {SIGNAL_DESCRIPTIONS[mySignal.type]}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 border-orange-600 text-orange-300 hover:bg-orange-800"
                    onClick={handleResolve}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Помощь пришла — деактивировать
                  </Button>
                </div>
              )}

              {/* Signal type grid */}
              <div>
                <p className="text-zinc-400 text-xs mb-2 uppercase tracking-wider">
                  Тип сигнала
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SIGNAL_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        selectedType === type
                          ? "border-red-500 bg-red-950 text-white"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                      )}
                    >
                      <span className="text-xl">{SIGNAL_ICONS[type]}</span>
                      <p className="text-xs mt-1 leading-tight">
                        {SIGNAL_DESCRIPTIONS[type]}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom message */}
              {selectedType && (
                <div>
                  <p className="text-zinc-400 text-xs mb-1 uppercase tracking-wider">
                    Дополнительная информация (необязательно)
                  </p>
                  <Textarea
                    value={customMessage}
                    onChange={(e) =>
                      setCustomMessage(e.target.value.slice(0, 500))
                    }
                    placeholder="Опишите ситуацию подробнее..."
                    className="bg-zinc-900 border-zinc-700 text-white resize-none text-sm"
                    rows={3}
                  />
                  <p className="text-zinc-600 text-xs mt-1 text-right">
                    {customMessage.length}/500
                  </p>
                </div>
              )}

              {/* Location */}
              <div>
                <button
                  onClick={requestLocation}
                  disabled={locLoading}
                  className={cn(
                    "flex items-center gap-2 text-sm px-3 py-2 rounded border transition-colors",
                    coords
                      ? "border-green-600 bg-green-950 text-green-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white"
                  )}
                >
                  {locLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4" />
                  )}
                  {coords
                    ? `GPS: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`
                    : "Прикрепить местоположение"}
                </button>
              </div>

              {/* Send button */}
              <Button
                size="lg"
                disabled={!selectedType || sending || !!mySignal}
                onClick={handleSend}
                className={cn(
                  "w-full font-bold text-base",
                  selectedType && !mySignal
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                )}
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <AlertTriangle className="w-5 h-5 mr-2" />
                )}
                {mySignal
                  ? "Уже есть активный сигнал"
                  : sending
                  ? "Отправка..."
                  : "ОТПРАВИТЬ ЭКСТРЕННЫЙ СИГНАЛ"}
              </Button>

              {emergencyCallHref && emergencyCallLabel && (
                <a
                  href={emergencyCallHref}
                  className="flex items-center justify-center w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  {emergencyCallLabel}
                </a>
              )}
            </div>
          )}

          {/* ── Alerts Tab ───────────────────────────────────── */}
          {tab === "alerts" && (
            <div className="mt-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              )}

              {!loading && signals.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-700 opacity-50" />
                  <p className="text-sm">Активных экстренных сигналов нет</p>
                </div>
              )}

              <div className="space-y-2">
                {signals.map((signal) => (
                  <SignalCard
                    key={signal.id}
                    signal={signal}
                    isOwn={signal.userId === currentUserId}
                    onResolve={() => resolve(signal.id, currentUserId)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── SignalCard ─────────────────────────────────────────────────────────────────

interface SignalCardProps {
  signal: EmergencySignal;
  isOwn: boolean;
  onResolve: () => void;
}

function SignalCard({ signal, isOwn, onResolve }: SignalCardProps) {
  const priorityScore = computePriorityScore(signal);
  const levelColor = LEVEL_COLORS[signal.level as EmergencyLevel];
  const ageMinutes = Math.floor(
    (Date.now() - new Date(signal.createdAt).getTime()) / 60_000
  );

  return (
    <div
      className="p-3 rounded-lg border bg-zinc-900"
      style={{ borderColor: `${levelColor}44` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl">{SIGNAL_ICONS[signal.type]}</span>
            <span className="font-medium text-sm text-white truncate">
              {signal.senderName}
            </span>
            <LevelBadge level={signal.level as EmergencyLevel} />
            {signal.hopCount > 0 && (
              <span className="text-zinc-500 text-xs">{signal.hopCount} хоп</span>
            )}
          </div>
          <p className="text-zinc-300 text-sm mt-1">{signal.message}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-zinc-500 text-xs">
              {ageMinutes < 1 ? "только что" : `${ageMinutes} мин назад`}
            </span>
            {signal.latitude != null && (
              <span className="text-zinc-500 text-xs flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {signal.latitude.toFixed(4)}, {signal.longitude?.toFixed(4)}
              </span>
            )}
            <span className="text-zinc-600 text-xs">приоритет: {priorityScore}</span>
          </div>
        </div>

        {isOwn && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-green-700 text-green-400 hover:bg-green-900 text-xs px-2"
            onClick={onResolve}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Решено
          </Button>
        )}
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: EmergencyLevel }) {
  const labels: Record<EmergencyLevel, string> = {
    critical: "КРИТ",
    high:     "ВЫСОК",
    medium:   "СРЕДН",
    low:      "НИЗК",
  };
  const classes: Record<EmergencyLevel, string> = {
    critical: "bg-red-800 text-red-200",
    high:     "bg-orange-800 text-orange-200",
    medium:   "bg-yellow-800 text-yellow-200",
    low:      "bg-green-800 text-green-200",
  };
  return (
    <Badge className={cn("text-xs py-0 px-1.5 font-bold", classes[level])}>
      {labels[level]}
    </Badge>
  );
}
