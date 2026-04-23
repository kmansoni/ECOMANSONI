import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Send, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type BizLegalKind,
  type BizLegalApplication,
  type BizLegalDocument,
  KIND_TITLES,
  REQUIRED_DOCS_BY_KIND,
  OKVED_CATALOG,
  createApplication,
  updateApplicationDraft,
  submitApplication,
  getApplication,
  mockCreatePayment,
} from "@/lib/bizRegistrationApi";
import { DocumentUploader } from "./DocumentUploader";

interface Props {
  kind: BizLegalKind;
  existingId?: string;
}

interface FormData {
  full_name: string;           // ФИО
  birth_date: string;
  inn: string;
  phone: string;
  email: string;
  passport_series: string;
  passport_number: string;
  passport_issue_date: string;
  passport_issuer: string;
  registration_address: string;
  // ИП / ЮЛ
  business_address: string;
  // ЮЛ
  company_name: string;
  authorized_capital: string;  // числом, ₽
  director_name: string;
  founder_name: string;
}

const EMPTY_FORM: FormData = {
  full_name: "",
  birth_date: "",
  inn: "",
  phone: "",
  email: "",
  passport_series: "",
  passport_number: "",
  passport_issue_date: "",
  passport_issuer: "",
  registration_address: "",
  business_address: "",
  company_name: "",
  authorized_capital: "",
  director_name: "",
  founder_name: "",
};

const STATE_FEE: Record<BizLegalKind, number> = {
  self_employed: 0,
  entrepreneur: 800,
  legal_entity: 4000,
};

function validateINN(inn: string, kind: BizLegalKind): boolean {
  const digits = inn.replace(/\D/g, "");
  if (kind === "legal_entity") return digits.length === 10;
  return digits.length === 12 || digits.length === 0; // ИНН физлица/ИП — 12, пустой допустим (получим позже)
}

export function RegistrationWizard({ kind, existingId }: Props) {
  const navigate = useNavigate();
  const [applicationId, setApplicationId] = useState<string | null>(existingId ?? null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [okved, setOkved] = useState<string[]>([]);
  const [documents, setDocuments] = useState<BizLegalDocument[]>([]);
  const [application, setApplication] = useState<BizLegalApplication | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingStep, setSavingStep] = useState(false);

  const needsOkved = kind !== "self_employed";
  const needsPayment = STATE_FEE[kind] > 0;
  const needsCharter = kind === "legal_entity";
  const requiredDocs = REQUIRED_DOCS_BY_KIND[kind];

  const steps = useMemo(() => {
    const base = [
      { key: "personal", title: "Личные данные" },
      { key: "passport", title: "Паспорт" },
    ];
    if (kind === "legal_entity") base.push({ key: "company", title: "Данные ООО" });
    if (needsOkved) base.push({ key: "okved", title: "ОКВЭД" });
    base.push({ key: "docs", title: "Документы" });
    if (needsPayment) base.push({ key: "payment", title: "Оплата госпошлины" });
    base.push({ key: "review", title: "Проверка и отправка" });
    return base;
  }, [kind, needsOkved, needsPayment]);

  // load existing draft
  useEffect(() => {
    if (!existingId) return;
    let cancelled = false;
    setLoading(true);
    getApplication(existingId)
      .then(({ application, documents }) => {
        if (cancelled) return;
        setApplication(application);
        setDocuments(documents);
        const fd = (application.form_data ?? {}) as Partial<FormData>;
        setForm({ ...EMPTY_FORM, ...fd });
        setOkved(application.okved_codes ?? []);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Не удалось загрузить"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [existingId]);

  async function ensureApplication(): Promise<string> {
    if (applicationId) return applicationId;
    const created = await createApplication(kind, form as unknown as Record<string, unknown>);
    setApplicationId(created.id);
    setApplication(created);
    return created.id;
  }

  async function saveDraft(): Promise<void> {
    setSavingStep(true);
    try {
      const id = await ensureApplication();
      const updated = await updateApplicationDraft(id, {
        form_data: form as unknown as Record<string, unknown>,
        okved_codes: okved,
      });
      setApplication(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
      throw e;
    } finally {
      setSavingStep(false);
    }
  }

  const currentKey = steps[step]?.key;

  // ── валидации по шагам
  function validateStep(key: string): string | null {
    if (key === "personal") {
      if (!form.full_name.trim()) return "Введите ФИО";
      if (!form.birth_date) return "Укажите дату рождения";
      if (!/^\+?\d{10,15}$/.test(form.phone.replace(/\s|-|\(|\)/g, ""))) return "Некорректный телефон";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Некорректный email";
      if (!validateINN(form.inn, kind)) return "Некорректный ИНН";
      return null;
    }
    if (key === "passport") {
      if (!/^\d{4}$/.test(form.passport_series.replace(/\s/g, ""))) return "Серия: 4 цифры";
      if (!/^\d{6}$/.test(form.passport_number.replace(/\s/g, ""))) return "Номер: 6 цифр";
      if (!form.passport_issue_date) return "Дата выдачи обязательна";
      if (!form.passport_issuer.trim()) return "Кем выдан — обязательно";
      if (!form.registration_address.trim()) return "Адрес регистрации обязателен";
      return null;
    }
    if (key === "company") {
      if (!form.company_name.trim()) return "Название ООО обязательно";
      const cap = Number(form.authorized_capital);
      if (!Number.isFinite(cap) || cap < 10000) return "Минимальный уставный капитал — 10 000 ₽";
      if (!form.director_name.trim()) return "Директор обязателен";
      if (!form.founder_name.trim()) return "Учредитель обязателен";
      if (!form.business_address.trim()) return "Юр. адрес обязателен";
      return null;
    }
    if (key === "okved") {
      if (okved.length === 0) return "Выберите хотя бы один код ОКВЭД";
      return null;
    }
    if (key === "docs") {
      for (const t of requiredDocs) {
        if (t === "payment_receipt" && !needsPayment) continue;
        if (!documents.some((d) => d.doc_type === t)) {
          return "Загрузите все обязательные документы";
        }
      }
      return null;
    }
    if (key === "payment") {
      if (application?.payment_status !== "paid") return "Оплатите госпошлину";
      return null;
    }
    return null;
  }

  async function goNext() {
    const err = validateStep(currentKey!);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await saveDraft();
      setStep((s) => Math.min(s + 1, steps.length - 1));
    } catch {
      /* toast shown in saveDraft */
    }
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    const err = validateStep("review");
    if (err) {
      toast.error(err);
      return;
    }
    if (!applicationId) return;
    try {
      await saveDraft();
      await submitApplication(applicationId);
      toast.success("Заявка отправлена на проверку");
      navigate("/business-registration");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить");
    }
  }

  async function handleMockPayment() {
    if (!applicationId) return;
    try {
      await mockCreatePayment(applicationId, STATE_FEE[kind]);
      toast.success("Платёж инициирован (демо). Загрузите квитанцию ниже.");
      // обновим состояние
      const { application: a } = await getApplication(applicationId);
      setApplication(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка платежа");
    }
  }

  const disabled = savingStep || loading || application?.status === "submitted" || application?.status === "under_review" || application?.status === "approved";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Регистрация</div>
          <h2 className="text-2xl font-semibold">{KIND_TITLES[kind]}</h2>
        </div>
        <Badge variant="outline">Шаг {step + 1} из {steps.length}</Badge>
      </div>

      <Progress value={((step + 1) / steps.length) * 100} />

      <nav className="flex flex-wrap gap-2 text-xs">
        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(i)}
            className={`px-3 py-1.5 rounded-full border ${i === step ? "bg-primary text-primary-foreground" : "bg-muted/30"}`}
            type="button"
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </nav>

      <div className="glass-window rounded-3xl border p-5 space-y-4">
        {currentKey === "personal" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="full_name">ФИО *</Label>
              <Input id="full_name" className="glass-input mt-1" value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="birth_date">Дата рождения *</Label>
              <Input id="birth_date" type="date" className="glass-input mt-1" value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="inn">ИНН {kind === "legal_entity" ? "(10 цифр)" : "(12 цифр, если есть)"}</Label>
              <Input id="inn" className="glass-input mt-1" inputMode="numeric" value={form.inn}
                onChange={(e) => setForm({ ...form, inn: e.target.value.replace(/\D/g, "") })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="phone">Телефон *</Label>
              <Input id="phone" className="glass-input mt-1" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" className="glass-input mt-1" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={disabled} />
            </div>
          </div>
        )}

        {currentKey === "passport" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pass_s">Серия *</Label>
              <Input id="pass_s" className="glass-input mt-1" inputMode="numeric" maxLength={4} value={form.passport_series}
                onChange={(e) => setForm({ ...form, passport_series: e.target.value.replace(/\D/g, "") })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="pass_n">Номер *</Label>
              <Input id="pass_n" className="glass-input mt-1" inputMode="numeric" maxLength={6} value={form.passport_number}
                onChange={(e) => setForm({ ...form, passport_number: e.target.value.replace(/\D/g, "") })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="pass_d">Дата выдачи *</Label>
              <Input id="pass_d" type="date" className="glass-input mt-1" value={form.passport_issue_date}
                onChange={(e) => setForm({ ...form, passport_issue_date: e.target.value })} disabled={disabled} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="pass_by">Кем выдан *</Label>
              <Input id="pass_by" className="glass-input mt-1" value={form.passport_issuer}
                onChange={(e) => setForm({ ...form, passport_issuer: e.target.value })} disabled={disabled} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="reg_addr">Адрес регистрации *</Label>
              <Textarea id="reg_addr" className="glass-input mt-1" value={form.registration_address}
                onChange={(e) => setForm({ ...form, registration_address: e.target.value })} disabled={disabled} />
            </div>
          </div>
        )}

        {currentKey === "company" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="co_name">Полное наименование ООО *</Label>
              <Input id="co_name" className="glass-input mt-1" value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="cap">Уставный капитал, ₽ *</Label>
              <Input id="cap" className="glass-input mt-1" inputMode="numeric" value={form.authorized_capital}
                onChange={(e) => setForm({ ...form, authorized_capital: e.target.value.replace(/\D/g, "") })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="dir">ФИО директора *</Label>
              <Input id="dir" className="glass-input mt-1" value={form.director_name}
                onChange={(e) => setForm({ ...form, director_name: e.target.value })} disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="founder">ФИО учредителя *</Label>
              <Input id="founder" className="glass-input mt-1" value={form.founder_name}
                onChange={(e) => setForm({ ...form, founder_name: e.target.value })} disabled={disabled} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="biz_addr">Юридический адрес *</Label>
              <Textarea id="biz_addr" className="glass-input mt-1" value={form.business_address}
                onChange={(e) => setForm({ ...form, business_address: e.target.value })} disabled={disabled} />
            </div>
          </div>
        )}

        {currentKey === "okved" && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Выберите коды ОКВЭД. Первый станет основным.
            </div>
            <Select
              value=""
              onValueChange={(v) => {
                if (v && !okved.includes(v)) setOkved((prev) => [...prev, v]);
              }}
            >
              <SelectTrigger className="glass-input h-14 rounded-2xl">
                <SelectValue placeholder="Добавить ОКВЭД" />
              </SelectTrigger>
              <SelectContent className="glass-popover max-h-96">
                {OKVED_CATALOG.map((row) => (
                  <SelectItem key={row.code} value={row.code} disabled={okved.includes(row.code)}>
                    {row.code} · {row.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ul className="space-y-2">
              {okved.map((code, idx) => {
                const meta = OKVED_CATALOG.find((c) => c.code === code);
                return (
                  <li key={code} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 bg-background/40">
                    <div>
                      <span className="font-mono mr-2">{code}</span>
                      <span className="text-sm">{meta?.title ?? ""}</span>
                      {idx === 0 && <Badge variant="outline" className="ml-2 text-xs">основной</Badge>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setOkved(okved.filter((c) => c !== code))} disabled={disabled}>
                      Убрать
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {currentKey === "docs" && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Форматы: JPG/PNG/WEBP/PDF, до 20 МБ. Заявление Р21001/Р11001 формируется автоматически на финальном шаге (демо).
            </div>
            {requiredDocs
              .filter((t) => !(t === "payment_receipt" && !needsPayment))
              .map((t) => (
                <DocumentUploader
                  key={t}
                  applicationId={applicationId!}
                  docType={t}
                  required
                  documents={documents}
                  disabled={disabled || !applicationId}
                  onUploaded={(d) => setDocuments((prev) => [...prev, d])}
                  onDeleted={(id) => setDocuments((prev) => prev.filter((x) => x.id !== id))}
                  hint={t === "charter" && needsCharter ? "Можно свой файл или пропустить — подставится шаблон." : undefined}
                />
              ))}
          </div>
        )}

        {currentKey === "payment" && (
          <div className="space-y-4">
            <div className="rounded-2xl border p-4 bg-background/40">
              <div className="text-sm text-muted-foreground">Госпошлина</div>
              <div className="text-3xl font-bold">{STATE_FEE[kind].toLocaleString("ru-RU")} ₽</div>
              <div className="text-xs text-muted-foreground mt-1">
                Демонстрационный режим — реальный платёж не списывается.
              </div>
            </div>
            {application?.payment_status !== "paid" ? (
              <Button onClick={handleMockPayment} disabled={disabled} className="gap-2">
                <CreditCard className="w-4 h-4" /> Перейти к оплате (демо)
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" /> Оплата получена
                {application.payment_reference && <span className="text-xs text-muted-foreground">· {application.payment_reference}</span>}
              </div>
            )}
          </div>
        )}

        {currentKey === "review" && (
          <div className="space-y-3">
            <div className="rounded-2xl border p-4 bg-background/40">
              <div className="font-medium">Проверьте данные</div>
              <dl className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">ФИО</dt><dd>{form.full_name}</dd>
                <dt className="text-muted-foreground">Тип</dt><dd>{KIND_TITLES[kind]}</dd>
                <dt className="text-muted-foreground">Email</dt><dd>{form.email}</dd>
                <dt className="text-muted-foreground">Телефон</dt><dd>{form.phone}</dd>
                {kind === "legal_entity" && (
                  <>
                    <dt className="text-muted-foreground">ООО</dt><dd>{form.company_name}</dd>
                    <dt className="text-muted-foreground">Капитал</dt><dd>{Number(form.authorized_capital || 0).toLocaleString("ru-RU")} ₽</dd>
                  </>
                )}
                {okved.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">ОКВЭД</dt>
                    <dd>{okved.join(", ")}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Документов</dt><dd>{documents.length}</dd>
              </dl>
            </div>
            <Button className="gap-2" onClick={handleSubmit} disabled={disabled}>
              <Send className="w-4 h-4" /> Отправить на проверку
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={goBack} disabled={step === 0 || savingStep} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Назад
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={goNext} disabled={disabled} className="gap-1">
            Далее <ArrowRight className="w-4 h-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
