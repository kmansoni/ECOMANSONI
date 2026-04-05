import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, ChevronLeft, ChevronRight, Calculator, Loader2 } from "lucide-react";
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
import { OSAGO_REGIONS, MORTGAGE_BANKS } from "@/lib/insurance/constants";
import { useInsuranceQuote } from "@/hooks/insurance/useInsuranceQuote";
import { toCalcResponse } from "@/lib/insurance/mappers";
import type { CalculationResult } from "@/types/insurance";

const STEPS = [
  { id: "credit", title: "Кредит", description: "Параметры ипотечного кредита" },
  { id: "borrower", title: "Заёмщик", description: "Данные заёмщика" },
  { id: "coverage", title: "Покрытие", description: "Виды страхования" },
];

const LOAN_TERMS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i + 1 === 1 ? "год" : i + 1 < 5 ? "года" : "лет"}` }));

export function MortgageCalculator() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const quote = useInsuranceQuote("mortgage");

  const [propValue, setPropValue] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanTerm, setLoanTerm] = useState("20");
  const [bank, setBank] = useState("");

  const [borrowerAge, setBorrowerAge] = useState("");
  const [borrowerGender, setBorrowerGender] = useState("male");
  const [region, setRegion] = useState("");

  const [includeLife, setIncludeLife] = useState(true);
  const [includeTitle, setIncludeTitle] = useState(false);
  const [includeProperty, setIncludeProperty] = useState(true);

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      quote.requestQuotes({
        property_value: Number(propValue) || 5_000_000,
        loan_amount: Number(loanAmount) || 3_000_000,
        loan_term_years: Number(loanTerm),
        borrower_age: Number(borrowerAge) || 35,
        borrower_gender: borrowerGender,
        bank_name: bank,
        include_life: includeLife,
        include_title: includeTitle,
        include_property: includeProperty,
        region_code: region,
      });
    }
  };

  const calcResponse = useMemo(() => {
    if (!quote.offers.length) return null;
    return toCalcResponse(quote.data!, "mortgage");
  }, [quote.offers, quote.data]);

  const handleSelect = (result: CalculationResult) => {
    const sid = (result.details as Record<string, unknown>)?.session_id;
    navigate(`/insurance/apply?category=mortgage&session_id=${sid}&offer_id=${result.id}`);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Ипотечное страхование</h2>
          <p className="text-sm text-white/60 mt-0.5">Обязательное и добровольное страхование при ипотеке</p>
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
              className={`h-1.5 flex-1 rounded-full transition-all ${idx < step ? "bg-blue-500 cursor-pointer" : idx === step ? "bg-blue-400" : "bg-white/10 cursor-default"}`} />
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
                    <Label className="text-white/70 text-sm">Стоимость объекта (₽)</Label>
                    <Input type="number" value={propValue} onChange={e => setPropValue(e.target.value)} placeholder="5 000 000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Сумма кредита (₽)</Label>
                    <Input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} placeholder="3 000 000" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Срок кредита</Label>
                    <Select value={loanTerm} onValueChange={setLoanTerm}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {LOAN_TERMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Банк-кредитор</Label>
                    <Select value={bank} onValueChange={setBank}>
                      <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Выберите банк" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {MORTGAGE_BANKS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/70 text-sm">Возраст заёмщика</Label>
                    <Input type="number" value={borrowerAge} onChange={e => setBorrowerAge(e.target.value)} placeholder="35" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm mb-2 block">Пол</Label>
                    <div className="flex gap-3">
                      {[{ v: "male", l: "Мужской" }, { v: "female", l: "Женский" }].map(g => (
                        <button key={g.v} type="button" onClick={() => setBorrowerGender(g.v)}
                          className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${borrowerGender === g.v ? "border-blue-500/60 bg-blue-500/10 text-blue-300" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/[0.07]"}`}>
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

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-white/50">Выберите хотя бы один вид страхования</p>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-white/10 hover:bg-white/5">
                    <Checkbox checked={includeLife} onCheckedChange={v => setIncludeLife(!!v)} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-white">Страхование жизни заёмщика</div>
                      <div className="text-xs text-white/50 mt-0.5">Обязательно для большинства банков. Покрывает смерть и инвалидность</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-white/10 hover:bg-white/5">
                    <Checkbox checked={includeTitle} onCheckedChange={v => setIncludeTitle(!!v)} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-white">Титульное страхование</div>
                      <div className="text-xs text-white/50 mt-0.5">Защита права собственности от утраты по юридическим причинам</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-white/10 hover:bg-white/5">
                    <Checkbox checked={includeProperty} onCheckedChange={v => setIncludeProperty(!!v)} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-white">Страхование имущества</div>
                      <div className="text-xs text-white/50 mt-0.5">Обязательно по закону. Покрывает повреждение и уничтожение объекта</div>
                    </div>
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
        <Button onClick={handleNext} disabled={quote.isLoading || (step === 2 && !includeLife && !includeTitle && !includeProperty)}
          className={`flex-1 bg-blue-600 hover:bg-blue-500 text-white ${step === 0 ? "w-full" : ""}`}>
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
