import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HeartPulse, ChevronLeft, ChevronRight, Calculator, Loader2, AlertCircle } from "lucide-react";
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
import { OSAGO_REGIONS } from "@/lib/insurance/constants";
import type { CalculationResponse } from "@/types/insurance";

const STEPS = [
  { id: "personal", title: "Данные", description: "Личные данные застрахованного" },
  { id: "program", title: "Программа", description: "Выбор программы ДМС" },
  { id: "options", title: "Опции", description: "Дополнительные услуги" },
];

const DMS_PROGRAMS = [
  { value: "basic", label: "Базовая", price: 18000, description: "Поликлиника, скорая помощь" },
  { value: "standard", label: "Стандарт", price: 35000, description: "Поликлиника + стационар" },
  { value: "premium", label: "Премиум", price: 65000, description: "Полный спектр медпомощи" },
  { value: "vip", label: "VIP", price: 120000, description: "Лучшие клиники, без очередей" },
];

function buildDmsResults(basePrice: number, companies: Array<{ id: string; name: string; rating: number; logo_url: string | null }>): CalculationResponse {
  const validUntil = new Date(Date.now() + 86400000).toISOString();
  const results = companies.map((c, i) => {
    const premium = Math.round(basePrice * (0.89 + i * 0.11));
    return {
      id: `dms-${c.id}`,
      category: "dms" as const,
      provider_id: c.id,
      provider_name: c.name,
      provider_logo: c.logo_url || "",
      provider_rating: c.rating ?? 4.5,
      premium_amount: premium,
      premium_monthly: Math.round(premium / 12),
      coverage_amount: 3000000,
      currency: "RUB" as const,
      valid_until: validUntil,
      features: ["Консультации специалистов", "Анализы и диагностика", "Госпитализация", "Скорая помощь"],
      exclusions: ["Косметическая хирургия", "Лечение от алкоголизма"],
      documents_required: ["Паспорт"],
      details: {},
    };
  });
  return {
    request_id: `dms-req-${Date.now()}`,
    category: "dms",
    results,
    total_providers_queried: companies.length,
    successful_providers: companies.length,
    failed_providers: [],
    calculation_time_ms: 0,
    cached: false,
  };
}

export function DmsCalculator() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CalculationResponse | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; rating: number; logo_url: string | null }>>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);

  useEffect(() => {
    (supabase as SupabaseClient<any>)
      .from('insurance_companies')
      .select('id, name, rating, logo_url')
      .eq('is_verified', true)
      .limit(10)
      .then(({ data, error }) => {
        if (!error && data) setCompanies(data);
        setCompaniesLoaded(true);
      });
  }, []);

  const [age, setAge] = useState("");
  const [gender, setGender] = useState("male");
  const [region, setRegion] = useState("");
  const [program, setProgram] = useState("standard");
  const [chronic, setChronic] = useState(false);
  const [dental, setDental] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [online, setOnline] = useState(false);
  const [employees, setEmployees] = useState("");
  const [inn, setInn] = useState("");

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      if (!companies.length) {
        toast.error('Нет доступных компаний для расчёта');
        return;
      }
      setIsLoading(true);
      const prog = DMS_PROGRAMS.find(p => p.value === program);
      let base = prog?.price ?? 35000;
      const a = parseInt(age) || 30;
      if (a > 50) base *= 1.4;
      else if (a > 40) base *= 1.2;
      if (chronic) base *= 1.3;
      if (dental) base *= 1.15;
      if (emergency) base *= 1.1;
      if (online) base *= 1.05;
      const emp = parseInt(employees) || 1;
      if (emp > 1) base *= Math.max(0.7, 1 - emp * 0.02);
      setResults(buildDmsResults(base, companies));
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
          <HeartPulse className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Калькулятор ДМС</h2>
          <p className="text-sm text-white/60 mt-0.5">Добровольное медицинское страхование</p>
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
              className={`h-1.5 flex-1 rounded-full transition-all ${idx < step ? "bg-emerald-500 cursor-pointer" : idx === step ? "bg-emerald-400" : "bg-white/10 cursor-default"}`} />
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
                    <Label className="text-white/70 text-sm">Возраст</Label>
                    <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="30" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm mb-2 block">Пол</Label>
                    <div className="flex gap-3">
                      {[{ v: "male", l: "Мужской" }, { v: "female", l: "Женский" }].map(g => (
                        <button key={g.v} type="button" onClick={() => setGender(g.v)}
                          className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${gender === g.v ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/[0.07]"}`}>
                          {g.l}
                        </button>
                      ))}
                    </div>
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
                  <div className="space-y-2">
                    {DMS_PROGRAMS.map(p => (
                      <button key={p.value} type="button" onClick={() => setProgram(p.value)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${program === p.value ? "border-emerald-500/60 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/[0.07]"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${program === p.value ? "border-emerald-400 bg-emerald-400" : "border-white/30"}`} />
                          <div>
                            <div className="text-sm font-medium text-white">{p.label}</div>
                            <div className="text-xs text-white/50">{p.description}</div>
                          </div>
                        </div>
                        <span className="text-sm text-white/60">от {p.price.toLocaleString("ru-RU")} ₽/год</span>
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={chronic} onCheckedChange={v => setChronic(!!v)} />
                    <span className="text-sm text-white/70">Есть хронические заболевания</span>
                  </label>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={dental} onCheckedChange={v => setDental(!!v)} />
                    <span className="text-sm text-white/70">Стоматология</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={emergency} onCheckedChange={v => setEmergency(!!v)} />
                    <span className="text-sm text-white/70">Экстренная помощь за рубежом</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={online} onCheckedChange={v => setOnline(!!v)} />
                    <span className="text-sm text-white/70">Онлайн-консультации</span>
                  </label>
                  <div>
                    <Label className="text-white/70 text-sm">Количество сотрудников (для корпоратива)</Label>
                    <Input type="number" value={employees} onChange={e => setEmployees(e.target.value)} placeholder="1" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">ИНН компании (опционально)</Label>
                    <Input value={inn} onChange={e => setInn(e.target.value)} placeholder="7700000000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
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
        <Button onClick={handleNext} disabled={isLoading} className={`flex-1 bg-emerald-600 hover:bg-emerald-500 text-white ${step === 0 ? "w-full" : ""}`}>
          {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Расчёт...</>
            : step < STEPS.length - 1 ? <>Далее<ChevronRight className="w-4 h-4 ml-1" /></>
            : <><Calculator className="w-4 h-4 mr-2" />Рассчитать</>}
        </Button>
      </div>

      <AnimatePresence>
        {companiesLoaded && !companies.length && (
          <div className="text-center py-8">
            <AlertCircle className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/40">Нет доступных компаний</p>
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
