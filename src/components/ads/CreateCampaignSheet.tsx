/**
 * CreateCampaignSheet — многошаговый Sheet для создания рекламной кампании.
 *
 * Шаги:
 * 1. Название + Цель
 * 2. Бюджет + Даты
 * 3. Таргетинг (возраст, пол, интересы, локации)
 * 4. Обзор + отправка на модерацию
 */
import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  ArrowRight,
  Megaphone,
  Target,
  DollarSign,
  Send,
} from "lucide-react";
import { useAdCampaigns } from "@/hooks/useAdCampaigns";
import type { Targeting } from "@/hooks/useAdCampaigns";
import { toast } from "sonner";

interface CreateCampaignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OBJECTIVES = [
  { value: "reach", label: "Охват", desc: "Максимум уникальных просмотров" },
  { value: "engagement", label: "Вовлечённость", desc: "Лайки, комментарии, репосты" },
  { value: "traffic", label: "Трафик", desc: "Переходы на сайт" },
  { value: "conversions", label: "Конверсии", desc: "Целевые действия" },
] as const;

const GENDERS = [
  { value: "all" as const, label: "Все" },
  { value: "male" as const, label: "Мужчины" },
  { value: "female" as const, label: "Женщины" },
];

const MAX_STEPS = 4;

export function CreateCampaignSheet({ open, onOpenChange }: CreateCampaignSheetProps) {
  const { createCampaign, submitForReview } = useAdCampaigns();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("reach");
  const [budgetCents, setBudgetCents] = useState(5000);
  const [dailyBudgetCents, setDailyBudgetCents] = useState(1000);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState("");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [interests, setInterests] = useState("");
  const [locations, setLocations] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canNext = useCallback((): boolean => {
    if (step === 1) return name.trim().length >= 2;
    if (step === 2) return budgetCents >= 100 && !!startDate;
    if (step === 3) return true;
    return true;
  }, [step, name, budgetCents, startDate]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const targeting: Targeting = {
        age_min: ageMin,
        age_max: ageMax,
        gender,
        interests: interests.split(",").map((s) => s.trim()).filter(Boolean),
        locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
      };

      const campaign = await createCampaign({
        name: name.trim(),
        objective,
        budget_cents: budgetCents,
        daily_budget_cents: dailyBudgetCents > 0 ? dailyBudgetCents : undefined,
        start_date: startDate,
        end_date: endDate || undefined,
        targeting,
      });

      if (campaign) {
        await submitForReview(campaign.id);
        onOpenChange(false);
        resetForm();
      }
    } finally {
      setSubmitting(false);
    }
  }, [name, objective, budgetCents, dailyBudgetCents, startDate, endDate, ageMin, ageMax, gender, interests, locations, createCampaign, submitForReview, onOpenChange]);

  const resetForm = useCallback(() => {
    setStep(1);
    setName("");
    setObjective("reach");
    setBudgetCents(5000);
    setDailyBudgetCents(1000);
    setInterests("");
    setLocations("");
  }, []);

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            Новая кампания — шаг {step}/{MAX_STEPS}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4 overflow-y-auto max-h-[calc(85vh-140px)]">
          {/* Шаг 1: название + цель */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="camp-name">Название кампании</Label>
                <Input
                  id="camp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  placeholder="Летняя распродажа"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Цель</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {OBJECTIVES.map((obj) => (
                    <button
                      key={obj.value}
                      type="button"
                      onClick={() => setObjective(obj.value)}
                      className={`p-3 rounded-xl border text-left transition-all min-h-[44px] ${
                        objective === obj.value
                          ? "border-primary bg-primary/10 dark:bg-primary/20"
                          : "border-border hover:border-primary/50"
                      }`}
                      aria-pressed={objective === obj.value}
                    >
                      <p className="text-sm font-medium">{obj.label}</p>
                      <p className="text-xs text-muted-foreground">{obj.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Шаг 2: бюджет + даты */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <Label>Общий бюджет: {(budgetCents / 100).toFixed(0)} ₽</Label>
                <Slider
                  value={[budgetCents]}
                  onValueChange={([v]) => setBudgetCents(v)}
                  min={100}
                  max={1000000}
                  step={100}
                  className="mt-2"
                  aria-label="Общий бюджет"
                />
              </div>
              <div>
                <Label>Дневной бюджет: {(dailyBudgetCents / 100).toFixed(0)} ₽</Label>
                <Slider
                  value={[dailyBudgetCents]}
                  onValueChange={([v]) => setDailyBudgetCents(v)}
                  min={100}
                  max={100000}
                  step={100}
                  className="mt-2"
                  aria-label="Дневной бюджет"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="start-date">Дата начала</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">Дата окончания</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Шаг 3: таргетинг */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div>
                <Label>Возраст: {ageMin}–{ageMax}</Label>
                <div className="flex gap-2 mt-2 items-center">
                  <Input
                    type="number"
                    min={13}
                    max={ageMax}
                    value={ageMin}
                    onChange={(e) => setAgeMin(Number(e.target.value))}
                    className="w-20"
                    aria-label="Минимальный возраст"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="number"
                    min={ageMin}
                    max={100}
                    value={ageMax}
                    onChange={(e) => setAgeMax(Number(e.target.value))}
                    className="w-20"
                    aria-label="Максимальный возраст"
                  />
                </div>
              </div>
              <div>
                <Label>Пол</Label>
                <div className="flex gap-2 mt-2">
                  {GENDERS.map((g) => (
                    <Button
                      key={g.value}
                      variant={gender === g.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setGender(g.value)}
                      className="min-h-[44px]"
                      aria-pressed={gender === g.value}
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="interests">Интересы (через запятую)</Label>
                <Input
                  id="interests"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="технологии, мода, спорт"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="locations">Локации (через запятую)</Label>
                <Input
                  id="locations"
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                  placeholder="Москва, Санкт-Петербург"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Шаг 4: обзор */}
          {step === 4 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-medium flex items-center gap-2">
                <Target className="w-4 h-4" />
                Обзор кампании
              </h3>
              <div className="bg-muted/50 dark:bg-muted/20 rounded-xl p-4 space-y-2 text-sm">
                <p><span className="text-muted-foreground">Название:</span> {name}</p>
                <p><span className="text-muted-foreground">Цель:</span> {OBJECTIVES.find((o) => o.value === objective)?.label}</p>
                <p><span className="text-muted-foreground">Бюджет:</span> {(budgetCents / 100).toFixed(0)} ₽</p>
                <p><span className="text-muted-foreground">Дневной:</span> {(dailyBudgetCents / 100).toFixed(0)} ₽</p>
                <p><span className="text-muted-foreground">Период:</span> {startDate} — {endDate || "бессрочно"}</p>
                <p><span className="text-muted-foreground">Возраст:</span> {ageMin}–{ageMax}</p>
                <p><span className="text-muted-foreground">Пол:</span> {GENDERS.find((g) => g.value === gender)?.label}</p>
                {interests && <p><span className="text-muted-foreground">Интересы:</span> {interests}</p>}
                {locations && <p><span className="text-muted-foreground">Локации:</span> {locations}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Навигация */}
        <div className="flex gap-2 mt-4 pt-4 border-t dark:border-gray-700">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              className="min-h-[44px]"
              aria-label="Назад"
            >
              <ArrowLeft className="w-4 h-4" />
              Назад
            </Button>
          )}
          <div className="flex-1" />
          {step < MAX_STEPS ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="min-h-[44px]"
              aria-label="Далее"
            >
              Далее
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="min-h-[44px]"
              aria-label="Отправить на модерацию"
            >
              <Send className="w-4 h-4" />
              На модерацию
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
