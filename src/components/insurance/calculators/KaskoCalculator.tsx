import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Car, ChevronLeft, ChevronRight, Calculator, Loader2 } from "lucide-react";
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
import { OSAGO_REGIONS, CAR_MAKES, KBM_TABLE } from "@/lib/insurance/constants";
import type { CalculationResponse } from "@/types/insurance";

const STEPS = [
  { id: "vehicle", title: "Автомобиль", description: "Данные о транспортном средстве" },
  { id: "driver", title: "Водитель", description: "Данные водителя" },
  { id: "options", title: "Параметры", description: "Тип покрытия и опции" },
];

const FRANCHISE_OPTIONS = [
  { value: "0", label: "Без франшизы" },
  { value: "10000", label: "10 000 ₽" },
  { value: "15000", label: "15 000 ₽" },
  { value: "20000", label: "20 000 ₽" },
  { value: "30000", label: "30 000 ₽" },
  { value: "50000", label: "50 000 ₽" },
];

const COVERAGE_TYPES = [
  { value: "full", label: "Полное КАСКО", description: "Угон + ущерб" },
  { value: "partial", label: "Частичное КАСКО", description: "Только ущерб" },
  { value: "total_loss_only", label: "Только тотал", description: "Тотальная гибель и угон" },
];

const EXTRA_OPTIONS = [
  { id: "gap", label: "GAP-страхование (защита от амортизации)" },
  { id: "keyless", label: "Бесключевой доступ" },
  { id: "tow", label: "Вызов эвакуатора" },
  { id: "commissioner", label: "Аварийный комиссар" },
  { id: "substitute", label: "Подменный автомобиль" },
];

function generateKaskoResults(basePrice: number): CalculationResponse {
  const providers = [
    { name: "Ингосстрах", rating: 4.7, mult: 1.0 },
    { name: "РЕСО-Гарантия", rating: 4.5, mult: 1.08 },
    { name: "АльфаСтрахование", rating: 4.6, mult: 0.93 },
  ];

  const now = new Date();
  const validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const results = providers.map((p, i) => {
    const premium = Math.round(basePrice * p.mult);
    return {
      id: `kasko-${i}`,
      category: "kasko" as const,
      provider_id: p.name.toLowerCase().replace(/\s/g, "_"),
      provider_name: p.name,
      provider_logo: "",
      provider_rating: p.rating,
      premium_amount: premium,
      premium_monthly: Math.round(premium / 12),
      coverage_amount: basePrice * 10,
      deductible_amount: 0,
      currency: "RUB" as const,
      valid_until: validUntil,
      features: ["Ущерб от ДТП", "Угон", "Стихийные бедствия", "Пожар", "Противоправные действия третьих лиц"],
      exclusions: ["Умышленное повреждение", "Управление в нетрезвом виде"],
      documents_required: ["Паспорт", "ПТС", "СТС", "Водительское удостоверение"],
      purchase_url: undefined,
      details: {},
    };
  });

  return {
    request_id: `kasko-req-${Date.now()}`,
    category: "kasko",
    results,
    total_providers_queried: 3,
    successful_providers: 3,
    failed_providers: [],
    calculation_time_ms: 800,
    cached: false,
  };
}

export function KaskoCalculator() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CalculationResponse | null>(null);

  // Step 1: Vehicle
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehiclePrice, setVehiclePrice] = useState("");
  const [enginePower, setEnginePower] = useState("");

  // Step 2: Driver
  const [region, setRegion] = useState("");
  const [driverAge, setDriverAge] = useState("");
  const [driverExp, setDriverExp] = useState("");
  const [kbmClass, setKbmClass] = useState("3");

  // Step 3: Options
  const [coverageType, setCoverageType] = useState("full");
  const [franchise, setFranchise] = useState("0");
  const [antiTheft, setAntiTheft] = useState(false);
  const [garagePark, setGaragePark] = useState(false);
  const [extraOptions, setExtraOptions] = useState<string[]>([]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 27 }, (_, i) => currentYear - i);

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleCalculate();
    }
  };

  const handleCalculate = () => {
    setIsLoading(true);
    setTimeout(() => {
      const price = parseFloat(vehiclePrice) || 1000000;
      const kbm = KBM_TABLE[parseInt(kbmClass)] ?? 1.0;
      const coverageMult = coverageType === "full" ? 1.0 : coverageType === "partial" ? 0.75 : 0.5;
      const franchMult = 1 - parseInt(franchise) / price * 3;
      const antiTheftDiscount = antiTheft ? 0.95 : 1.0;
      const garageDiscount = garagePark ? 0.97 : 1.0;
      const baseRate = 0.055;
      const base = price * baseRate * kbm * coverageMult * Math.max(0.7, franchMult) * antiTheftDiscount * garageDiscount;
      setResults(generateKaskoResults(base));
      setIsLoading(false);
    }, 1200);
  };

  const toggleExtra = (id: string) => {
    setExtraOptions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 flex-shrink-0">
          <Car className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Калькулятор КАСКО</h2>
          <p className="text-sm text-white/60 mt-0.5">Расчёт стоимости добровольного автострахования</p>
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
              className={`h-1.5 flex-1 rounded-full transition-all ${idx < step ? "bg-violet-500 cursor-pointer" : idx === step ? "bg-violet-400" : "bg-white/10 cursor-default"}`}
            />
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
                    <Label className="text-white/70 text-sm">Марка автомобиля</Label>
                    <Select value={vehicleMake} onValueChange={setVehicleMake}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Выберите марку" />
                      </SelectTrigger>
                      <SelectContent>
                        {CAR_MAKES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Модель</Label>
                    <Input value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} placeholder="Например: Granta" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Год выпуска</Label>
                    <Select value={vehicleYear} onValueChange={setVehicleYear}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Выберите год" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Стоимость автомобиля (₽)</Label>
                    <Input type="number" value={vehiclePrice} onChange={e => setVehiclePrice(e.target.value)} placeholder="1 500 000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Мощность двигателя (л.с.)</Label>
                    <Input type="number" value={enginePower} onChange={e => setEnginePower(e.target.value)} placeholder="150" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/70 text-sm">Регион регистрации</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Выберите регион" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {OSAGO_REGIONS.map(r => <SelectItem key={r.code + r.name} value={r.code}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Возраст водителя</Label>
                    <Input type="number" value={driverAge} onChange={e => setDriverAge(e.target.value)} placeholder="30" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Стаж вождения (лет)</Label>
                    <Input type="number" value={driverExp} onChange={e => setDriverExp(e.target.value)} placeholder="5" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Класс КБМ (1–13)</Label>
                    <Select value={kbmClass} onValueChange={setKbmClass}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(KBM_TABLE).map(([cls, coef]) => (
                          <SelectItem key={cls} value={cls}>Класс {cls} (коэф. {coef})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-white/70 text-sm mb-2 block">Тип покрытия</Label>
                    <div className="space-y-2">
                      {COVERAGE_TYPES.map(ct => (
                        <button key={ct.value} type="button" onClick={() => setCoverageType(ct.value)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${coverageType === ct.value ? "border-violet-500/60 bg-violet-500/10" : "border-white/10 bg-white/5 hover:bg-white/[0.07]"}`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${coverageType === ct.value ? "border-violet-400 bg-violet-400" : "border-white/30"}`} />
                          <div>
                            <div className="text-sm font-medium text-white">{ct.label}</div>
                            <div className="text-xs text-white/50">{ct.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Франшиза</Label>
                    <Select value={franchise} onValueChange={setFranchise}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FRANCHISE_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={antiTheft} onCheckedChange={v => setAntiTheft(!!v)} />
                      <span className="text-sm text-white/70">Противоугонная система</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={garagePark} onCheckedChange={v => setGaragePark(!!v)} />
                      <span className="text-sm text-white/70">Гаражное хранение</span>
                    </label>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm mb-2 block">Дополнительные опции</Label>
                    <div className="space-y-2">
                      {EXTRA_OPTIONS.map(opt => (
                        <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={extraOptions.includes(opt.id)} onCheckedChange={() => toggleExtra(opt.id)} />
                          <span className="text-sm text-white/70">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isLoading}
            className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
            <ChevronLeft className="w-4 h-4 mr-1" />Назад
          </Button>
        )}
        <Button onClick={handleNext} disabled={isLoading}
          className={`flex-1 bg-violet-600 hover:bg-violet-500 text-white ${step === 0 ? "w-full" : ""}`}>
          {isLoading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Расчёт...</>
          ) : step < STEPS.length - 1 ? (
            <>Далее<ChevronRight className="w-4 h-4 ml-1" /></>
          ) : (
            <><Calculator className="w-4 h-4 mr-2" />Рассчитать</>
          )}
        </Button>
      </div>

      <AnimatePresence>
        {results && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <CalculationResults response={results} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
