import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, ChevronLeft, ChevronRight, Calculator, Loader2 } from "lucide-react";
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
import { OSAGO_REGIONS } from "@/lib/insurance/constants";
import type { CalculationResponse } from "@/types/insurance";

const STEPS = [
  { id: "object", title: "Объект", description: "Тип и характеристики объекта" },
  { id: "details", title: "Характеристики", description: "Дополнительные параметры" },
  { id: "coverage", title: "Покрытие", description: "Условия страхования" },
];

const PROPERTY_TYPES = [
  { value: "apartment", label: "Квартира" },
  { value: "house", label: "Частный дом" },
  { value: "townhouse", label: "Таунхаус" },
  { value: "commercial", label: "Коммерческое" },
];

const MATERIALS = [
  { value: "brick", label: "Кирпич" },
  { value: "panel", label: "Панель" },
  { value: "wood", label: "Дерево" },
  { value: "monolith", label: "Монолит" },
  { value: "other", label: "Другое" },
];

const MATERIAL_COEFS: Record<string, number> = {
  brick: 1.0,
  panel: 1.1,
  wood: 1.5,
  monolith: 0.95,
  other: 1.2,
};

function generatePropertyResults(basePrice: number): CalculationResponse {
  const providers = [
    { name: "Росгосстрах", rating: 4.4, mult: 1.0 },
    { name: "ВСК", rating: 4.5, mult: 0.94 },
    { name: "СОГАЗ", rating: 4.8, mult: 1.1 },
  ];
  const validUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const results = providers.map((p, i) => {
    const premium = Math.round(basePrice * p.mult);
    return {
      id: `property-${i}`,
      category: "property" as const,
      provider_id: p.name.toLowerCase().replace(/\s/g, "_"),
      provider_name: p.name,
      provider_logo: "",
      provider_rating: p.rating,
      premium_amount: premium,
      premium_monthly: Math.round(premium / 12),
      coverage_amount: basePrice * 20,
      currency: "RUB" as const,
      valid_until: validUntil,
      features: ["Пожар", "Затопление", "Противоправные действия", "Стихийные бедствия"],
      exclusions: ["Умышленное повреждение", "Военные действия"],
      documents_required: ["Паспорт", "Документы на собственность"],
      details: {},
    };
  });
  return {
    request_id: `property-req-${Date.now()}`,
    category: "property",
    results,
    total_providers_queried: 3,
    successful_providers: 3,
    failed_providers: [],
    calculation_time_ms: 700,
    cached: false,
  };
}

export function PropertyCalculator() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CalculationResponse | null>(null);

  const [propType, setPropType] = useState("apartment");
  const [area, setArea] = useState("");
  const [propValue, setPropValue] = useState("");
  const [region, setRegion] = useState("");

  const [buildYear, setBuildYear] = useState("");
  const [material, setMaterial] = useState("brick");
  const [floor, setFloor] = useState("");
  const [totalFloors, setTotalFloors] = useState("");

  const [coverageAmount, setCoverageAmount] = useState("");
  const [interior, setInterior] = useState(false);
  const [liability, setLiability] = useState(false);
  const [movables, setMovables] = useState(false);

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      setIsLoading(true);
      setTimeout(() => {
        const value = parseFloat(propValue) || 5000000;
        const matCoef = MATERIAL_COEFS[material] ?? 1.0;
        const yr = parseInt(buildYear) || 2000;
        const age = new Date().getFullYear() - yr;
        const ageMult = age > 50 ? 1.4 : age > 30 ? 1.2 : age > 15 ? 1.1 : 1.0;
        const typeMult = propType === "wood" ? 1.5 : propType === "house" ? 1.2 : 1.0;
        const interiorMult = interior ? 1.2 : 1.0;
        const liabilityMult = liability ? 1.1 : 1.0;
        const movablesMult = movables ? 1.15 : 1.0;
        const baseRate = 0.004;
        const base = value * baseRate * matCoef * ageMult * typeMult * interiorMult * liabilityMult * movablesMult;
        setResults(generatePropertyResults(base));
        setIsLoading(false);
      }, 1000);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
          <Home className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Страхование имущества</h2>
          <p className="text-sm text-white/60 mt-0.5">Расчёт стоимости страхования недвижимости</p>
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
              className={`h-1.5 flex-1 rounded-full transition-all ${idx < step ? "bg-amber-500 cursor-pointer" : idx === step ? "bg-amber-400" : "bg-white/10 cursor-default"}`} />
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
                    <Label className="text-white/70 text-sm mb-2 block">Тип объекта</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PROPERTY_TYPES.map(t => (
                        <button key={t.value} type="button" onClick={() => setPropType(t.value)}
                          className={`py-2 px-3 rounded-lg border text-sm transition-all ${propType === t.value ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/[0.07]"}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Площадь (м²)</Label>
                    <Input type="number" value={area} onChange={e => setArea(e.target.value)} placeholder="60" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Стоимость объекта (₽)</Label>
                    <Input type="number" value={propValue} onChange={e => setPropValue(e.target.value)} placeholder="5 000 000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Регион</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Выберите регион" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {OSAGO_REGIONS.map(r => <SelectItem key={r.code + r.name} value={r.code}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/70 text-sm">Год постройки</Label>
                    <Input type="number" value={buildYear} onChange={e => setBuildYear(e.target.value)} placeholder="2000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Материал стен</Label>
                    <Select value={material} onValueChange={setMaterial}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MATERIALS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-white/70 text-sm">Этаж</Label>
                      <Input type="number" value={floor} onChange={e => setFloor(e.target.value)} placeholder="5" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Всего этажей</Label>
                      <Input type="number" value={totalFloors} onChange={e => setTotalFloors(e.target.value)} placeholder="16" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/70 text-sm">Страховая сумма (₽)</Label>
                    <Input type="number" value={coverageAmount} onChange={e => setCoverageAmount(e.target.value)} placeholder="3 000 000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={interior} onCheckedChange={v => setInterior(!!v)} />
                    <span className="text-sm text-white/70">Отделка интерьера</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={liability} onCheckedChange={v => setLiability(!!v)} />
                    <span className="text-sm text-white/70">Гражданская ответственность</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={movables} onCheckedChange={v => setMovables(!!v)} />
                    <span className="text-sm text-white/70">Движимое имущество</span>
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
        <Button onClick={handleNext} disabled={isLoading} className={`flex-1 bg-amber-600 hover:bg-amber-500 text-white ${step === 0 ? "w-full" : ""}`}>
          {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Расчёт...</>
            : step < STEPS.length - 1 ? <>Далее<ChevronRight className="w-4 h-4 ml-1" /></>
            : <><Calculator className="w-4 h-4 mr-2" />Рассчитать</>}
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
