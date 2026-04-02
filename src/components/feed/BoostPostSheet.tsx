/**
 * BoostPostSheet — Sheet для продвижения поста.
 *
 * Функциональность:
 * - Выбор бюджета (слайдер: 100₽ — 10000₽)
 * - Выбор длительности (24ч, 3 дня, 7 дней, 30 дней)
 * - Прогноз охвата
 * - Кнопка "Продвинуть"
 */
import { useState, useMemo, useCallback } from "react";
import {
  TrendingUp,
  Rocket,
  Users,
  Clock,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useBoostedPosts } from "@/hooks/useBoostedPosts";

interface BoostPostSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
}

const DURATIONS = [
  { hours: 24, label: "24 часа" },
  { hours: 72, label: "3 дня" },
  { hours: 168, label: "7 дней" },
  { hours: 720, label: "30 дней" },
] as const;

export function BoostPostSheet({ open, onOpenChange, postId }: BoostPostSheetProps) {
  const { boostPost } = useBoostedPosts();
  const [budgetCents, setBudgetCents] = useState(10000); // 100₽
  const [durationHours, setDurationHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  const estimatedReach = useMemo(() => {
    // Упрощённая формула: ~0.8 показа на копейку
    return Math.round(budgetCents * 0.8);
  }, [budgetCents]);

  const handleBoost = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await boostPost(postId, budgetCents, durationHours);
      if (result) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [postId, budgetCents, durationHours, boostPost, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Продвинуть пост
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 mt-4 pb-4">
          {/* Бюджет */}
          <div>
            <Label className="flex items-center gap-1 mb-2">
              <TrendingUp className="w-4 h-4" />
              Бюджет: {(budgetCents / 100).toFixed(0)} ₽
            </Label>
            <Slider
              value={[budgetCents]}
              onValueChange={([v]) => setBudgetCents(v)}
              min={100}
              max={1000000}
              step={100}
              aria-label="Бюджет продвижения"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1 ₽</span>
              <span>10 000 ₽</span>
            </div>
          </div>

          {/* Длительность */}
          <div>
            <Label className="flex items-center gap-1 mb-2">
              <Clock className="w-4 h-4" />
              Длительность
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map((d) => (
                <Button
                  key={d.hours}
                  variant={durationHours === d.hours ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDurationHours(d.hours)}
                  className="min-h-[44px]"
                  aria-pressed={durationHours === d.hours}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Прогноз */}
          <div className="bg-muted/50 dark:bg-muted/20 rounded-xl p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">Прогноз охвата</p>
              <p className="text-xl font-bold">
                ~{estimatedReach.toLocaleString("ru-RU")}
              </p>
              <p className="text-xs text-muted-foreground">уникальных просмотров</p>
            </div>
          </div>

          {/* Кнопка */}
          <Button
            onClick={handleBoost}
            disabled={submitting}
            className="min-h-[48px] text-base"
            aria-label="Продвинуть пост"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Создание...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                Продвинуть за {(budgetCents / 100).toFixed(0)} ₽
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
