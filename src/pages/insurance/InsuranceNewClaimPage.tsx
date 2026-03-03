import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Check, Upload, X, FileText, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MOCK_POLICIES = [
  { id: "p1", number: "ОСАГО-2025-001234", company: "Тинькофф Страхование", category: "ОСАГО", expiry: "31.12.2026" },
  { id: "p2", number: "КАСКО-2024-005678", company: "Ингосстрах", category: "КАСКО", expiry: "15.06.2026" },
  { id: "p3", number: "ДМС-2025-009012", company: "СОГАЗ", category: "ДМС", expiry: "01.01.2027" },
];

const INCIDENT_TYPES = [
  "ДТП",
  "Затопление",
  "Кража / хищение",
  "Пожар",
  "Стихийное бедствие",
  "Несчастный случай",
  "Другое",
];

const STEPS = [
  { id: 1, label: "Полис" },
  { id: 2, label: "Описание" },
  { id: 3, label: "Документы" },
  { id: 4, label: "Подтверждение" },
];

interface FormData {
  policyId: string;
  incidentDate: string;
  incidentLocation: string;
  incidentType: string;
  description: string;
  files: string[];
  agreed: boolean;
}

export default function InsuranceNewClaimPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    policyId: "",
    incidentDate: "",
    incidentLocation: "",
    incidentType: "",
    description: "",
    files: [],
    agreed: false,
  });

  const selectedPolicy = MOCK_POLICIES.find((p) => p.id === form.policyId);

  const patch = (partial: Partial<FormData>) => setForm((prev) => ({ ...prev, ...partial }));

  const canNext = () => {
    if (step === 1) return !!form.policyId;
    if (step === 2) return !!(form.incidentDate && form.incidentLocation && form.incidentType && form.description);
    if (step === 3) return true;
    if (step === 4) return form.agreed;
    return false;
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleSubmit = () => {
    toast.success("Заявление успешно отправлено!", {
      description: "Мы рассмотрим его в течение 3 рабочих дней",
    });
    navigate("/insurance/claims");
  };

  const handleFileAdd = () => {
    const name = `документ_${form.files.length + 1}.jpg`;
    patch({ files: [...form.files, name] });
  };

  const handleFileRemove = (i: number) => {
    patch({ files: form.files.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => (step > 1 ? setStep(step - 1) : navigate(-1))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-white/40">
              <Link to="/insurance/claims" className="hover:text-white/60">Страховые случаи</Link>
              {" → "}Новое заявление
            </p>
            <h1 className="text-base font-semibold text-white">Заявление о страховом случае</h1>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center px-4 pb-3 gap-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    step > s.id
                      ? "bg-emerald-500 text-white"
                      : step === s.id
                        ? "bg-violet-600 text-white"
                        : "bg-white/10 text-white/30",
                  )}
                >
                  {step > s.id ? <Check className="w-3 h-3" /> : s.id}
                </div>
                <span className={cn("text-[10px] mt-0.5", step === s.id ? "text-violet-400" : "text-white/30")}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-px flex-1 mb-4", step > s.id ? "bg-emerald-500/50" : "bg-white/10")} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        <AnimatePresence mode="wait">
          {/* --- Step 1: Policy --- */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Выберите полис</h2>
                <p className="text-xs text-white/40">Выберите полис, по которому произошёл страховой случай</p>
              </div>
              <div className="space-y-2">
                {MOCK_POLICIES.map((policy) => (
                  <button
                    key={policy.id}
                    type="button"
                    onClick={() => patch({ policyId: policy.id })}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all",
                      form.policyId === policy.id
                        ? "bg-violet-500/10 border-violet-500/40"
                        : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{policy.number}</p>
                        <p className="text-xs text-white/50">{policy.company} · {policy.category}</p>
                        <p className="text-xs text-white/30 mt-0.5">Действует до {policy.expiry}</p>
                      </div>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        form.policyId === policy.id ? "border-violet-500 bg-violet-500" : "border-white/20",
                      )}>
                        {form.policyId === policy.id && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* --- Step 2: Description --- */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Описание случая</h2>
                <p className="text-xs text-white/40">Расскажите об инциденте как можно подробнее</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Дата инцидента *</label>
                  <Input
                    type="date"
                    value={form.incidentDate}
                    onChange={(e) => patch({ incidentDate: e.target.value })}
                    className="bg-white/5 border-white/10 text-white h-10"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Место инцидента *</label>
                  <Input
                    placeholder="Адрес или описание места"
                    value={form.incidentLocation}
                    onChange={(e) => patch({ incidentLocation: e.target.value })}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Тип инцидента *</label>
                  <Select value={form.incidentType} onValueChange={(v) => patch({ incidentType: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      {INCIDENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Описание *</label>
                  <Textarea
                    placeholder="Подробно опишите обстоятельства, что произошло, какой ущерб нанесён..."
                    value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
                    rows={5}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* --- Step 3: Documents --- */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Документы и фото</h2>
                <p className="text-xs text-white/40">Загрузите подтверждающие документы и фотографии</p>
              </div>

              {/* Drop zone */}
              <button
                type="button"
                onClick={handleFileAdd}
                className="w-full border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center gap-3 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all"
              >
                <Upload className="w-8 h-8 text-white/30" />
                <div className="text-center">
                  <p className="text-sm text-white/60 font-medium">Нажмите для загрузки</p>
                  <p className="text-xs text-white/30 mt-0.5">или перетащите файлы сюда</p>
                </div>
                <p className="text-xs text-white/20">PNG, JPG, PDF до 10 МБ</p>
              </button>

              {form.files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40">Загружено файлов: {form.files.length}</p>
                  {form.files.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl"
                    >
                      <FileText className="w-4 h-4 text-violet-400 flex-shrink-0" />
                      <span className="text-sm text-white/70 flex-1">{file}</span>
                      <button type="button" onClick={() => handleFileRemove(i)}>
                        <X className="w-4 h-4 text-white/30 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Card className="bg-amber-500/5 border-amber-500/20">
                <CardContent className="p-3">
                  <p className="text-xs text-amber-400/80">
                    💡 Рекомендуемые документы: справка ГИБДД / МЧС / полиции, фото ущерба, чеки,
                    свидетельство о праве собственности. Документы можно добавить позже в личном кабинете.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* --- Step 4: Confirmation --- */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Подтверждение заявления</h2>
                <p className="text-xs text-white/40">Проверьте данные перед отправкой</p>
              </div>

              <Card className="bg-white/[0.02] border-white/[0.06]">
                <CardContent className="p-4 space-y-3 text-sm">
                  {[
                    { label: "Полис", value: selectedPolicy ? `${selectedPolicy.number} (${selectedPolicy.company})` : "-" },
                    { label: "Дата инцидента", value: form.incidentDate || "-" },
                    { label: "Место", value: form.incidentLocation || "-" },
                    { label: "Тип инцидента", value: form.incidentType || "-" },
                    { label: "Документов", value: `${form.files.length} файлов` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                      <span className="text-white/40">{label}</span>
                      <span className="text-white/80 text-right max-w-[55%]">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {form.description && (
                <Card className="bg-white/[0.02] border-white/[0.06]">
                  <CardContent className="p-4">
                    <p className="text-xs text-white/40 mb-1">Описание</p>
                    <p className="text-sm text-white/70 leading-relaxed">{form.description}</p>
                  </CardContent>
                </Card>
              )}

              <Separator className="bg-white/[0.06]" />

              <div className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <Checkbox
                  id="agree"
                  checked={form.agreed}
                  onCheckedChange={(v) => patch({ agreed: !!v })}
                  className="mt-0.5"
                />
                <label htmlFor="agree" className="text-xs text-white/60 cursor-pointer leading-relaxed">
                  Я подтверждаю, что предоставленные сведения достоверны. Я согласен с условиями
                  обработки персональных данных и правилами рассмотрения страховых случаев.
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="mt-6 flex gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              className="flex-1 border-white/10 text-white/60 hover:bg-white/5"
              onClick={() => setStep(step - 1)}
            >
              Назад
            </Button>
          )}
          {step < 4 ? (
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-500 gap-2"
              disabled={!canNext()}
              onClick={handleNext}
            >
              Далее
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 gap-2"
              disabled={!canNext()}
              onClick={handleSubmit}
            >
              <Shield className="w-4 h-4" />
              Отправить заявление
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
