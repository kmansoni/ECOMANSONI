import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Check, ChevronDown, ChevronUp, Star, CreditCard, Smartphone, Landmark, Clock, Shield, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { INSURANCE_COMPANIES } from "@/lib/insurance/companies-dictionary";
import {
  OsagoApplicationForm, KaskoApplicationForm, DmsApplicationForm,
  TravelApplicationForm, PropertyApplicationForm, MortgageApplicationForm, LifeApplicationForm,
  createDefaultOsagoFormData, createDefaultKaskoFormData, createDefaultDmsFormData,
  createDefaultTravelFormData, createDefaultPropertyFormData, createDefaultMortgageFormData,
  createDefaultLifeFormData,
} from "@/components/insurance/forms";

// ── Types ──────────────────────────────────────────────────────────────────────

type InsuranceCategory = "osago" | "kasko" | "dms" | "travel" | "property" | "mortgage" | "life";

interface MockOffer {
  id: string;
  companyId: string;
  price: number;
  coverage: string;
  badge?: "best_price" | "recommended" | "popular";
  features: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CATEGORY_NAMES: Record<InsuranceCategory, string> = {
  osago: "ОСАГО", kasko: "КАСКО", dms: "ДМС",
  travel: "Путешествия", property: "Имущество", mortgage: "Ипотека", life: "Жизнь",
};

const CATEGORIES: { id: InsuranceCategory; icon: string; desc: string }[] = [
  { id: "osago", icon: "🚗", desc: "Обязательное страхование авто" },
  { id: "kasko", icon: "🛡️", desc: "Добровольное страхование авто" },
  { id: "dms", icon: "🏥", desc: "Добровольное медицинское" },
  { id: "travel", icon: "✈️", desc: "Страхование путешествий" },
  { id: "property", icon: "🏠", desc: "Страхование имущества" },
  { id: "mortgage", icon: "🏦", desc: "Ипотечное страхование" },
  { id: "life", icon: "❤️", desc: "Страхование жизни" },
];

const STEPS = ["Выбор продукта", "Анкета", "Предложения", "Подтверждение", "Оплата"];

function generateOffers(category: InsuranceCategory): MockOffer[] {
  const companies = INSURANCE_COMPANIES.filter((c) => c.categories.includes(category)).slice(0, 6);
  const basePrices: Record<InsuranceCategory, number> = {
    osago: 8500, kasko: 45000, dms: 28000, travel: 2500, property: 6500, mortgage: 15000, life: 12000,
  };
  const base = basePrices[category] || 10000;
  return companies.map((company, idx) => {
    const multiplier = 0.85 + idx * 0.08;
    const price = Math.round(base * multiplier / 100) * 100;
    return {
      id: company.id,
      companyId: company.id,
      price,
      coverage: `${(price * 10).toLocaleString("ru-RU")} ₽`,
      badge: (idx === 0 ? "best_price" : idx === 1 ? "recommended" : idx === 2 ? "popular" : undefined) as MockOffer["badge"],
      features: company.pros.slice(0, 3),
    };
  }).sort((a, b) => a.price - b.price);
}

const defaultFormData: Record<InsuranceCategory, () => unknown> = {
  osago: createDefaultOsagoFormData,
  kasko: createDefaultKaskoFormData,
  dms: createDefaultDmsFormData,
  travel: createDefaultTravelFormData,
  property: createDefaultPropertyFormData,
  mortgage: createDefaultMortgageFormData,
  life: createDefaultLifeFormData,
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-1 py-3 overflow-x-auto">
      {STEPS.map((step, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-all",
            idx < currentStep ? "bg-primary text-primary-foreground" :
            idx === currentStep ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
            "bg-muted text-muted-foreground"
          )}>
            {idx < currentStep ? <Check className="w-3.5 h-3.5" /> : idx + 1}
          </div>
          {idx < STEPS.length - 1 && (
            <div className={cn("w-6 h-0.5 shrink-0", idx < currentStep ? "bg-primary" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}

function OfferCard({ offer, onSelect, selected }: { offer: MockOffer; onSelect: () => void; selected: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const company = INSURANCE_COMPANIES.find((c) => c.id === offer.companyId);
  if (!company) return null;

  const badgeLabels = { best_price: "Лучшая цена", recommended: "Рекомендуем", popular: "Популярный" };

  return (
    <Card className={cn("transition-all cursor-pointer", selected && "ring-2 ring-primary")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{company.logoPlaceholder}</div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{company.shortName}</p>
                {offer.badge && (
                  <Badge variant={offer.badge === "best_price" ? "default" : "secondary"} className="text-xs">
                    {badgeLabels[offer.badge]}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                <span className="text-xs text-muted-foreground">{company.rating}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{offer.price.toLocaleString("ru-RU")} ₽</p>
            <p className="text-xs text-muted-foreground">в год</p>
          </div>
        </div>

        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 space-y-2">
            <Separator />
            <p className="text-xs text-muted-foreground">Покрытие: {offer.coverage}</p>
            <ul className="space-y-1">
              {offer.features.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs">
                  <Check className="w-3 h-3 text-green-500 shrink-0" />{f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Среднее время выплаты: {company.avgClaimDays} дней</p>
          </motion.div>
        )}

        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={onSelect} className="flex-1">{selected ? "Выбрано" : "Выбрать"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function InsuranceApplyPage() {
  const { productId } = useParams<{ productId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const categoryFromQuery = searchParams.get("category") as InsuranceCategory | null;
  const [currentStep, setCurrentStep] = useState(0);
  const [category, setCategory] = useState<InsuranceCategory | null>(
    categoryFromQuery || (productId ? (productId.split("-")[0] as InsuranceCategory) : null)
  );
  const [formData, setFormData] = useState<unknown>(null);
  const [offers, setOffers] = useState<MockOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<MockOffer | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "sbp" | "installment" | "bank">("card");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Инициализация данных формы при выборе категории
  useEffect(() => {
    if (category && !formData) {
      const saved = localStorage.getItem(`insurance_draft_${category}`);
      if (saved) {
        try {
          setFormData(JSON.parse(saved));
          return;
        } catch (parseError) {
          console.warn("[InsuranceApplyPage] Failed to parse draft, clearing corrupted storage", parseError);
          localStorage.removeItem(`insurance_draft_${category}`);
        }
      }
      setFormData(defaultFormData[category]?.() ?? null);
    }
  }, [category, formData]);

  // Если есть productId и категория, сразу переходим на шаг 2
  useEffect(() => {
    if (productId && category && currentStep === 0) {
      setCurrentStep(1);
    }
  }, [productId, category, currentStep]);

  const saveDraft = useCallback(() => {
    if (category && formData) {
      localStorage.setItem(`insurance_draft_${category}`, JSON.stringify(formData));
      toast.success("Черновик сохранён");
    }
  }, [category, formData]);

  const handleNext = () => {
    if (currentStep === 1) {
      // Генерируем предложения
      setOffers(generateOffers(category!));
    }
    setCurrentStep((s) => s + 1);
  };

  const handleBack = () => {
    if (currentStep === 0) navigate(-1);
    else setCurrentStep((s) => s - 1);
  };

  const handlePay = async () => {
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 2000));
    const policyId = `POL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    // Очищаем черновик
    if (category) localStorage.removeItem(`insurance_draft_${category}`);
    navigate(`/insurance/success/${policyId}`);
  };

  const renderForm = () => {
    if (!category || !formData) return null;
    const props = { data: formData as never, onChange: (d: unknown) => setFormData(d) };
    switch (category) {
      case "osago": return <OsagoApplicationForm {...props} />;
      case "kasko": return <KaskoApplicationForm {...props} />;
      case "dms": return <DmsApplicationForm {...props} />;
      case "travel": return <TravelApplicationForm {...props} />;
      case "property": return <PropertyApplicationForm {...props} />;
      case "mortgage": return <MortgageApplicationForm {...props} />;
      case "life": return <LifeApplicationForm {...props} />;
      default: return null;
    }
  };

  const stepTitle = STEPS[currentStep];

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {category ? CATEGORY_NAMES[category] : "Оформление полиса"}
              {productId ? ` · #${productId}` : ""}
            </p>
            <h1 className="text-base font-semibold">{stepTitle}</h1>
          </div>
          {currentStep === 1 && (
            <Button variant="ghost" size="sm" onClick={saveDraft}>
              <Save className="w-4 h-4 mr-1.5" />Черновик
            </Button>
          )}
        </div>
        <StepIndicator currentStep={currentStep} />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Шаг 1: Выбор продукта / категории */}
            {currentStep === 0 && (
              <div className="space-y-4">
                {!category ? (
                  <>
                    <p className="text-sm text-muted-foreground">Выберите вид страхования</p>
                    <div className="grid grid-cols-1 gap-3">
                      {CATEGORIES.map((cat) => (
                        <Card
                          key={cat.id}
                          className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                          onClick={() => { setCategory(cat.id); setFormData(defaultFormData[cat.id]()); }}
                        >
                          <CardContent className="flex items-center gap-4 p-4">
                            <span className="text-2xl">{cat.icon}</span>
                            <div>
                              <p className="font-medium">{CATEGORY_NAMES[cat.id]}</p>
                              <p className="text-sm text-muted-foreground">{cat.desc}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{CATEGORIES.find((c) => c.id === category)?.icon}</span>
                          <div>
                            <p className="font-semibold text-lg">{CATEGORY_NAMES[category]}</p>
                            <p className="text-sm text-muted-foreground">{CATEGORIES.find((c) => c.id === category)?.desc}</p>
                          </div>
                        </div>
                        {productId && (
                          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm font-medium">Продукт: #{productId}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Button variant="outline" onClick={() => { setCategory(null); setFormData(null); }} className="w-full">
                      Выбрать другой вид страхования
                    </Button>
                  </>
                )}

                {category && (
                  <Button onClick={() => setCurrentStep(1)} className="w-full" size="lg">Далее</Button>
                )}
              </div>
            )}

            {/* Шаг 2: Заполнение анкеты */}
            {currentStep === 1 && (
              <div className="space-y-4">
                {renderForm()}
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={saveDraft} className="flex-1">
                    <Save className="w-4 h-4 mr-2" />Сохранить черновик
                  </Button>
                  <Button onClick={handleNext} className="flex-1" size="lg">Получить предложения</Button>
                </div>
              </div>
            )}

            {/* Шаг 3: Предложения */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Найдено {offers.length} предложений для вас</p>
                {offers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    selected={selectedOffer?.id === offer.id}
                    onSelect={() => setSelectedOffer(offer)}
                  />
                ))}
                <Button
                  onClick={() => { if (!selectedOffer) { toast.error("Выберите предложение"); return; } setCurrentStep(3); }}
                  className="w-full" size="lg" disabled={!selectedOffer}
                >
                  Продолжить с выбранным
                </Button>
              </div>
            )}

            {/* Шаг 4: Подтверждение */}
            {currentStep === 3 && selectedOffer && (
              <div className="space-y-4">
                {/* Выбранное предложение */}
                {(() => {
                  const company = INSURANCE_COMPANIES.find((c) => c.id === selectedOffer.companyId);
                  return company ? (
                    <Card className="ring-2 ring-primary">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-3">
                          <span className="text-2xl">{company.logoPlaceholder}</span>
                          <div>
                            <p>{company.name}</p>
                            <p className="text-2xl font-bold text-primary">{selectedOffer.price.toLocaleString("ru-RU")} ₽</p>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-1.5">
                          {selectedOffer.features.map((f, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                              <Check className="w-4 h-4 text-green-500 shrink-0" />{f}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ) : null;
                })()}

                {/* Резюме данных */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Данные анкеты</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {category && CATEGORY_NAMES[category]} · {formData && typeof formData === "object" && "lastName" in (formData as Record<string, unknown>)
                        ? `${(formData as Record<string, string>).lastName || ""} ${(formData as Record<string, string>).firstName || ""}`.trim()
                        : "Данные заполнены"}
                    </p>
                  </CardContent>
                </Card>

                {/* Согласие */}
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Checkbox id="agree" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
                  <Label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
                    Я ознакомлен с правилами страхования и даю согласие на обработку персональных данных
                  </Label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => setCurrentStep(2)}>Другие предложения</Button>
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>Редактировать</Button>
                </div>
                <Button
                  onClick={() => { if (!agreed) { toast.error("Необходимо согласие"); return; } setCurrentStep(4); }}
                  className="w-full" size="lg" disabled={!agreed}
                >
                  Купить полис
                </Button>
                <Button variant="destructive" onClick={() => navigate("/insurance")} className="w-full">Отменить</Button>
              </div>
            )}

            {/* Шаг 5: Оплата */}
            {currentStep === 4 && selectedOffer && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Сумма к оплате</p>
                  <p className="text-4xl font-bold text-primary mt-1">{selectedOffer.price.toLocaleString("ru-RU")} ₽</p>
                </div>

                {/* Способы оплаты */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Способ оплаты</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { id: "card" as const, icon: <CreditCard className="w-5 h-5" />, label: "Банковская карта" },
                      { id: "sbp" as const, icon: <Smartphone className="w-5 h-5" />, label: "СБП (Система быстрых платежей)" },
                      { id: "installment" as const, icon: <Clock className="w-5 h-5" />, label: "Рассрочка" },
                      { id: "bank" as const, icon: <Landmark className="w-5 h-5" />, label: "Банковский счёт (для юр. лиц)" },
                    ].map(({ id, icon, label }) => (
                      <div
                        key={id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                          paymentMethod === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                        )}
                        onClick={() => setPaymentMethod(id)}
                      >
                        {icon}
                        <span className="text-sm font-medium">{label}</span>
                        {paymentMethod === id && <Check className="w-4 h-4 text-primary ml-auto" />}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Форма карты */}
                {paymentMethod === "card" && (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label>Номер карты</Label>
                        <Input
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})/g, "$1 ").trim())}
                          placeholder="0000 0000 0000 0000"
                          maxLength={19}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Срок действия</Label>
                          <Input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" maxLength={5} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>CVC/CVV</Label>
                          <Input value={cardCvc} onChange={(e) => setCardCvc(e.target.value.slice(0, 3))} placeholder="•••" type="password" maxLength={3} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {paymentMethod === "sbp" && (
                  <Card>
                    <CardContent className="p-6 flex flex-col items-center gap-3">
                      <div className="w-32 h-32 bg-muted border-2 border-dashed border-border rounded-lg flex items-center justify-center">
                        <p className="text-xs text-center text-muted-foreground">QR-код для оплаты</p>
                      </div>
                      <p className="text-sm text-muted-foreground text-center">Отсканируйте QR-код в приложении банка</p>
                    </CardContent>
                  </Card>
                )}

                {paymentMethod === "installment" && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <p className="text-sm font-medium">Условия рассрочки</p>
                      <p className="text-sm text-muted-foreground">• 3 платежа без процентов</p>
                      <p className="text-sm text-muted-foreground">• Первый платёж: {Math.round(selectedOffer.price / 3).toLocaleString("ru-RU")} ₽</p>
                      <p className="text-sm text-muted-foreground">• Автоплатёж каждые 4 месяца</p>
                    </CardContent>
                  </Card>
                )}

                <Button
                  className="w-full" size="lg"
                  onClick={handlePay}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4 animate-pulse" />Обрабатываем платёж...
                    </span>
                  ) : (
                    `Оплатить ${selectedOffer.price.toLocaleString("ru-RU")} ₽`
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Оплата защищена шифрованием TLS. Данные карты не сохраняются.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
