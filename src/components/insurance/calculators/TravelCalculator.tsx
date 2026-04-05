import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, ChevronLeft, ChevronRight, Calculator, Loader2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalculationResults } from "@/components/insurance/shared/CalculationResults";
import { TRAVEL_COUNTRIES } from "@/lib/insurance/constants";
import { useInsuranceQuote } from "@/hooks/insurance/useInsuranceQuote";
import { toCalcResponse } from "@/lib/insurance/mappers";
import type { CalculationResult } from "@/types/insurance";

const STEPS = [
  { id: "trip", title: "Поездка", description: "Параметры путешествия" },
  { id: "travelers", title: "Путешественники", description: "Количество и возраст" },
  { id: "coverage", title: "Покрытие", description: "Страховое покрытие" },
];

const TRIP_PURPOSES = [
  { value: "tourism", label: "Туризм" },
  { value: "business", label: "Бизнес" },
  { value: "study", label: "Учёба" },
  { value: "work", label: "Работа" },
];

const COVERAGE_AMOUNTS = [
  { value: "30000", label: "30 000 EUR" },
  { value: "50000", label: "50 000 EUR" },
  { value: "100000", label: "100 000 EUR" },
];

export function TravelCalculator() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const quote = useInsuranceQuote("travel");

  const [country, setCountry] = useState("");
  const [duration, setDuration] = useState("");
  const [purpose, setPurpose] = useState("tourism");
  const [multiTrip, setMultiTrip] = useState(false);

  const [travelersCount, setTravelersCount] = useState(1);
  const [travelerAges, setTravelerAges] = useState<string[]>(["30"]);

  const [coverageAmount, setCoverageAmount] = useState("50000");
  const [sport, setSport] = useState(false);
  const [cancellation, setCancellation] = useState(false);
  const [luggage, setLuggage] = useState(false);
  const [accident, setAccident] = useState(false);

  const progress = ((step + 1) / STEPS.length) * 100;

  const updateTravelersCount = (count: number) => {
    const c = Math.max(1, Math.min(10, count));
    setTravelersCount(c);
    setTravelerAges(prev => {
      const next = [...prev];
      while (next.length < c) next.push("30");
      return next.slice(0, c);
    });
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      quote.requestQuotes({
        destination_country: country,
        trip_duration_days: Number(duration) || 14,
        travelers_count: travelersCount,
        traveler_ages: travelerAges.map(a => Number(a) || 30),
        coverage_amount: Number(coverageAmount),
        sport_activities: sport,
        include_cancellation: cancellation,
        include_luggage: luggage,
        include_accident: accident,
        trip_purpose: purpose,
        multi_trip: multiTrip,
      });
    }
  };

  const calcResponse = useMemo(() => {
    if (!quote.offers.length) return null;
    return toCalcResponse(quote.data!, "travel");
  }, [quote.offers, quote.data]);

  const handleSelect = (result: CalculationResult) => {
    const sid = (result.details as Record<string, unknown>)?.session_id;
    navigate(`/insurance/apply?category=travel&session_id=${sid}&offer_id=${result.id}`);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 flex-shrink-0">
          <Plane className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Страхование путешествий</h2>
          <p className="text-sm text-white/60 mt-0.5">Расчёт стоимости туристической страховки</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-white/60">
          <span>Шаг {step + 1} из {STEPS.length}</span>
          <span>{STEPS[step].title}</span>
        </div>
        <Progress value={progress} className="h-1.5 bg-white/10" />
        <div className="flex gap-2 pt-1">
          {STEPS.map((s, idx) => (
            <button key={s.id} type="button" onClick={() => idx < step && setStep(idx)}
              className={`h-1.5 flex-1 rounded-full transition-all ${idx < step ? "bg-sky-500 cursor-pointer" : idx === step ? "bg-sky-400" : "bg-white/10 cursor-default"}`} />
          ))}
        </div>
      </div>

      <Card className="bg-white/[0.02] border-white/[0.06]">
        <CardContent className="pt-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
              <div>
                <h3 className="text-base font-medium text-white">{STEPS[step].title}</h3>
                <p className="text-sm text-white/60 mt-1">{STEPS[step].description}</p>
              </div>

              {step === 0 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/70 text-sm">Страна назначения</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Выберите страну" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TRAVEL_COUNTRIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Длительность поездки (дней)</Label>
                    <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="14" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm mb-2 block">Цель поездки</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {TRIP_PURPOSES.map(p => (
                        <button key={p.value} type="button" onClick={() => setPurpose(p.value)}
                          className={`py-2 px-3 rounded-lg border text-sm transition-all ${purpose === p.value ? "border-sky-500/60 bg-sky-500/10 text-sky-300" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/[0.07]"}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={multiTrip} onCheckedChange={v => setMultiTrip(!!v)} />
                    <span className="text-sm text-white/70">Мульти-поездка (несколько поездок в год)</span>
                  </label>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/70 text-sm mb-2 block">Количество путешественников</Label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => updateTravelersCount(travelersCount - 1)}
                        className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-lg font-medium text-white w-8 text-center">{travelersCount}</span>
                      <button type="button" onClick={() => updateTravelersCount(travelersCount + 1)}
                        className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {travelerAges.map((age, idx) => (
                      <div key={idx}>
                        <Label className="text-white/70 text-sm">Возраст путешественника {idx + 1}</Label>
                        <Input type="number" value={age} onChange={e => {
                          const next = [...travelerAges];
                          next[idx] = e.target.value;
                          setTravelerAges(next);
                        }} placeholder="30" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/70 text-sm">Сумма покрытия</Label>
                    <Select value={coverageAmount} onValueChange={setCoverageAmount}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COVERAGE_AMOUNTS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={sport} onCheckedChange={v => setSport(!!v)} />
                    <span className="text-sm text-white/70">Спортивные активности</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={cancellation} onCheckedChange={v => setCancellation(!!v)} />
                    <span className="text-sm text-white/70">Отмена/прерывание поездки</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={luggage} onCheckedChange={v => setLuggage(!!v)} />
                    <span className="text-sm text-white/70">Страхование багажа</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={accident} onCheckedChange={v => setAccident(!!v)} />
                    <span className="text-sm text-white/70">Страхование от несчастного случая</span>
                  </label>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={quote.isLoading} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
            <ChevronLeft className="w-4 h-4 mr-1" />Назад
          </Button>
        )}
        <Button onClick={handleNext} disabled={quote.isLoading} className={`flex-1 bg-sky-600 hover:bg-sky-500 text-white ${step === 0 ? "w-full" : ""}`}>
          {quote.isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Расчёт...</>
            : step < STEPS.length - 1 ? <>Далее<ChevronRight className="w-4 h-4 ml-1" /></>
            : <><Calculator className="w-4 h-4 mr-2" />Рассчитать</>}
        </Button>
      </div>

      {quote.error && (
        <p className="text-sm text-red-400 text-center">{quote.error.message}</p>
      )}

      {quote.localEstimate && quote.isLoading && (
        <p className="text-sm text-white/50 text-center">
          Предварительная оценка: ~{quote.localEstimate.toLocaleString('ru-RU')} ₽
        </p>
      )}

      <AnimatePresence>
        {calcResponse && !quote.isLoading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <CalculationResults response={calcResponse} onSelect={handleSelect} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
