import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ChevronLeft, ChevronRight, Calculator, Loader2 } from "lucide-react";
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
import { useInsuranceQuote } from "@/hooks/insurance/useInsuranceQuote";
import { toCalcResponse } from "@/lib/insurance/mappers";
import type { CalculationResult } from "@/types/insurance";

const STEPS = [
  { id: "personal", title: "Личные данные", description: "Возраст, пол и образ жизни" },
  { id: "program", title: "Программа", description: "Тип и параметры страхования" },
  { id: "options", title: "Опции", description: "Дополнительные условия" },
];

const LIFE_PROGRAMS = [
  { value: "risk", label: "Рисковое", description: "Страховая выплата при наступлении страхового случая", mult: 1.0 },
  { value: "endowment", label: "Накопительное", description: "Накопление + страховая защита", mult: 2.5 },
  { value: "investment", label: "Инвестиционное", description: "Участие в инвестиционном доходе", mult: 3.0 },
  { value: "pension", label: "Пенсионное", description: "Формирование пенсионных накоплений", mult: 2.0 },
];

const TERM_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i + 1 === 1 ? "год" : i + 1 < 5 ? "года" : "лет"}`,
}));

export function LifeCalculator() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const quote = useInsuranceQuote("life");

  const [age, setAge] = useState("");
  const [gender, setGender] = useState("male");
  const [smoker, setSmoker] = useState(false);

  const [program, setProgram] = useState("risk");
  const [coverage, setCoverage] = useState("");
  const [term, setTerm] = useState("10");

  const [dangerousOccupation, setDangerousOccupation] = useState(false);
  const [dangerousHobbies, setDangerousHobbies] = useState(false);
  const [includeAccident, setIncludeAccident] = useState(false);
  const [includeCritical, setIncludeCritical] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState("1");

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      quote.requestQuotes({
        age: Number(age) || 35,
        gender,
        coverage_amount: Number(coverage) || 1_000_000,
        term_years: Number(term),
        program_type: program,
        smoker,
        dangerous_occupation: dangerousOccupation,
        dangerous_hobbies: dangerousHobbies,
        include_accident: includeAccident,
        include_critical_illness: includeCritical,
        beneficiary_count: Number(beneficiaries),
      });
    }
  };

  const calcResponse = useMemo(() => {
    if (!quote.offers.length) return null;
    return toCalcResponse(quote.data!, "life");
  }, [quote.offers, quote.data]);

  const handleSelect = (result: CalculationResult) => {
    const sid = (result.details as Record<string, unknown>)?.session_id;
    navigate(`/insurance/apply?category=life&session_id=${sid}&offer_id=${result.id}`);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 flex-shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Страхование жизни</h2>
          <p className="text-sm text-white/60 mt-0.5">Расчёт стоимости полиса страхования жизни</p>
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
              className={`h-1.5 flex-1 rounded-full transition-all ${idx < step ? "bg-rose-500 cursor-pointer" : idx === step ? "bg-rose-400" : "bg-white/10 cursor-default"}`} />
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
                    <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="35" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm mb-2 block">Пол</Label>
                    <div className="flex gap-3">
                      {[{ v: "male", l: "Мужской" }, { v: "female", l: "Женский" }].map(g => (
                        <button key={g.v} type="button" onClick={() => setGender(g.v)}
                          className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${gender === g.v ? "border-rose-500/60 bg-rose-500/10 text-rose-300" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/[0.07]"}`}>
                          {g.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={smoker} onCheckedChange={v => setSmoker(!!v)} />
                    <span className="text-sm text-white/70">Курение</span>
                  </label>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {LIFE_PROGRAMS.map(p => (
                      <button key={p.value} type="button" onClick={() => setProgram(p.value)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${program === p.value ? "border-rose-500/60 bg-rose-500/10" : "border-white/10 bg-white/5 hover:bg-white/[0.07]"}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${program === p.value ? "border-rose-400 bg-rose-400" : "border-white/30"}`} />
                        <div>
                          <div className="text-sm font-medium text-white">{p.label}</div>
                          <div className="text-xs text-white/50">{p.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Страховая сумма (₽)</Label>
                    <Input type="number" value={coverage} onChange={e => setCoverage(e.target.value)} placeholder="1 000 000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Срок страхования</Label>
                    <Select value={term} onValueChange={setTerm}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TERM_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={dangerousOccupation} onCheckedChange={v => setDangerousOccupation(!!v)} />
                    <span className="text-sm text-white/70">Опасная профессия</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={dangerousHobbies} onCheckedChange={v => setDangerousHobbies(!!v)} />
                    <span className="text-sm text-white/70">Экстремальные хобби</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeAccident} onCheckedChange={v => setIncludeAccident(!!v)} />
                    <span className="text-sm text-white/70">Страхование от несчастного случая</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeCritical} onCheckedChange={v => setIncludeCritical(!!v)} />
                    <span className="text-sm text-white/70">Критические заболевания</span>
                  </label>
                  <div>
                    <Label className="text-white/70 text-sm">Количество выгодоприобретателей</Label>
                    <Select value={beneficiaries} onValueChange={setBeneficiaries}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n} чел.</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
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
        <Button onClick={handleNext} disabled={quote.isLoading} className={`flex-1 bg-rose-600 hover:bg-rose-500 text-white ${step === 0 ? "w-full" : ""}`}>
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
