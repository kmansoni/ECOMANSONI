import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, ChevronLeft, ChevronRight, Calculator, Loader2, Plus, Minus, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
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
import { TRAVEL_COUNTRIES, TRAVEL_ZONE_RATES } from "@/lib/insurance/constants";
import type { CalculationResponse } from "@/types/insurance";

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

interface DbCompany {
  id: string;
  name: string;
  rating: number;
  logo_url: string | null;
}

function buildTravelResults(basePrice: number, companies: DbCompany[]): CalculationResponse {
  const validUntil = new Date(Date.now() + 86400000).toISOString();
  const results = companies.map((c, i) => {
    const mult = 0.88 + i * 0.1;
    return {
      id: `travel-${c.id}`,
      category: "travel" as const,
      provider_id: c.id,
      provider_name: c.name,
      provider_logo: c.logo_url || "",
      provider_rating: c.rating ?? 4.5,
      premium_amount: Math.round(basePrice * mult),
      coverage_amount: 50000 * 90,
      currency: "RUB" as const,
      valid_until: validUntil,
      features: ["Медицинские расходы", "Репатриация", "Круглосуточная помощь"],
      exclusions: ["Хронические заболевания", "Алкогольное опьянение"],
      documents_required: ["Паспорт"],
      details: {},
    };
  });
  return {
    request_id: `travel-req-${Date.now()}`,
    category: "travel",
    results,
    total_providers_queried: companies.length,
    successful_providers: companies.length,
    failed_providers: [],
    calculation_time_ms: 0,
    cached: false,
  };
}

export function TravelCalculator() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CalculationResponse | null>(null);
  const [companies, setCompanies] = useState<DbCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  useEffect(() => {
    const db = supabase as SupabaseClient<any>;
    db.from('insurance_companies')
      .select('id, name, rating, logo_url')
      .eq('is_verified', true)
      .limit(10)
      .then(({ data, error }) => {
        if (error) toast.error('Не удалось загрузить компании');
        else if (data?.length) setCompanies(data);
        setCompaniesLoading(false);
      });
  }, []);

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
      if (!companies.length) {
        toast.error('Нет доступных компаний для расчёта');
        return;
      }
      setIsLoading(true);
      const countryData = TRAVEL_COUNTRIES.find(c => c.value === country);
      const zoneRate = TRAVEL_ZONE_RATES[countryData?.zone ?? "world"] ?? 1.5;
      const days = parseInt(duration) || 14;
      const ages = travelerAges.map(a => parseInt(a) || 30);
      const ageMult = ages.reduce((sum, a) => sum + (a > 65 ? 2.0 : a > 50 ? 1.5 : 1.0), 0) / ages.length;
      const coverage = parseInt(coverageAmount) || 50000;
      const coverMult = coverage === 100000 ? 1.8 : coverage === 50000 ? 1.0 : 0.7;
      const sportMult = sport ? 1.5 : 1.0;
      const cancelMult = cancellation ? 1.3 : 1.0;
      const luggageMult = luggage ? 1.1 : 1.0;
      const purposeMult = purpose === "work" ? 1.4 : purpose === "business" ? 1.2 : 1.0;
      const multiMult = multiTrip ? 3.5 : 1.0;
      const base = 150 * days * zoneRate * ageMult * ages.length * coverMult * sportMult * cancelMult * luggageMult * purposeMult * multiMult;
      setResults(buildTravelResults(base, companies));
      setIsLoading(false);
    }
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
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isLoading} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
            <ChevronLeft className="w-4 h-4 mr-1" />Назад
          </Button>
        )}
        <Button onClick={handleNext} disabled={isLoading} className={`flex-1 bg-sky-600 hover:bg-sky-500 text-white ${step === 0 ? "w-full" : ""}`}>
          {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Расчёт...</>
            : step < STEPS.length - 1 ? <>Далее<ChevronRight className="w-4 h-4 ml-1" /></>
            : <><Calculator className="w-4 h-4 mr-2" />Рассчитать</>}
        </Button>
      </div>

      <AnimatePresence>
        {!companiesLoading && !companies.length && (
          <div className="text-center py-8">
            <AlertCircle className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/40">Нет доступных страховых компаний</p>
            <p className="text-xs text-white/25 mt-1">Попробуйте позже</p>
          </div>
        )}
        {results && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <CalculationResults response={results} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
