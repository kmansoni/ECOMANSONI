/**
 * Страница оформления страхового полиса
 * @page InsuranceApplyPage
 */

import React, { useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Check,
  CreditCard,
  Smartphone,
  Landmark,
  Clock,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

import { StepIndicator } from "@/components/insurance/shared/StepIndicator";
import { OfferCard } from "@/components/insurance/shared/OfferCard";
import {
  OsagoApplicationForm,
  KaskoApplicationForm,
  DmsApplicationForm,
  TravelApplicationForm,
  PropertyApplicationForm,
  MortgageApplicationForm,
  LifeApplicationForm,
} from "@/components/insurance/forms";

import { useInsuranceApply, CATEGORY_NAMES, INSURANCE_CATEGORIES } from "@/hooks/insurance/useInsuranceApply";
import type { InsuranceCategory } from "@/types/insurance";
import type { InsuranceFormData } from "@/types/insurance-forms";
import type { ApplyStep } from "@/hooks/insurance/useInsuranceApply";

// ============================================================================
// Компоненты шагов
// ============================================================================

/**
 * Шаг 0: Выбор категории
 */
const CategoryStep: React.FC<{
  category: InsuranceCategory | null;
  productId?: string;
  onSelect: (cat: InsuranceCategory) => void;
}> = ({ category, productId, onSelect }) => (
  <div className="space-y-4">
    {!category ? (
      <>
        <p className="text-sm text-muted-foreground">Выберите вид страхования</p>
        <div className="grid grid-cols-1 gap-3">
          {INSURANCE_CATEGORIES.map((cat) => (
            <Card
              key={cat.id}
              className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => onSelect(cat.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(cat.id);
                }
              }}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <span className="text-2xl" aria-hidden="true">{cat.icon}</span>
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
              <span className="text-3xl" aria-hidden="true">
                {INSURANCE_CATEGORIES.find((c) => c.id === category)?.icon}
              </span>
              <div>
                <p className="font-semibold text-lg">{CATEGORY_NAMES[category]}</p>
                <p className="text-sm text-muted-foreground">
                  {INSURANCE_CATEGORIES.find((c) => c.id === category)?.desc}
                </p>
              </div>
            </div>
            {productId && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">Продукт: #{productId}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Button
          variant="outline"
          onClick={() => onSelect(null as unknown as InsuranceCategory)}
          className="w-full"
        >
          Выбрать другой вид страхования
        </Button>
      </>
    )}
  </div>
);

/**
 * Шаг 1: Заполнение анкеты
 */
const FormStep: React.FC<{
  category: InsuranceCategory;
  formData: InsuranceFormData | null;
  onChange: (data: InsuranceFormData) => void;
  onSaveDraft: () => void;
}> = ({ category, formData, onChange, onSaveDraft }) => {
  const handleFormChange = useCallback((newData: unknown) => {
    onChange(newData as InsuranceFormData);
  }, [onChange]);

  const renderForm = () => {
    if (!formData) return null;
    
    switch (category) {
      case "osago":
        return <OsagoApplicationForm data={formData as unknown as import("@/components/insurance/forms/osagoFormModel").OsagoFormData} onChange={handleFormChange as any} />;
      case "kasko":
        return <KaskoApplicationForm data={formData as unknown as import("@/components/insurance/forms/kaskoFormModel").KaskoFormData} onChange={handleFormChange as any} />;
      case "dms":
        return <DmsApplicationForm data={formData as unknown as import("@/components/insurance/forms/dmsFormModel").DmsFormData} onChange={handleFormChange as any} />;
      case "travel":
        return <TravelApplicationForm data={formData as unknown as import("@/components/insurance/forms/travelFormModel").TravelFormData} onChange={handleFormChange as any} />;
      case "property":
        return <PropertyApplicationForm data={formData as unknown as import("@/components/insurance/forms/propertyFormModel").PropertyFormData} onChange={handleFormChange as any} />;
      case "mortgage":
        return <MortgageApplicationForm data={formData as unknown as import("@/components/insurance/forms/mortgageFormModel").MortgageFormData} onChange={handleFormChange as any} />;
      case "life":
        return <LifeApplicationForm data={formData as unknown as import("@/components/insurance/forms/lifeFormModel").LifeFormData} onChange={handleFormChange as any} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {renderForm()}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onSaveDraft} className="flex-1">
          <Save className="w-4 h-4 mr-2" />
          Сохранить черновик
        </Button>
      </div>
    </div>
  );
};

/**
 * Шаг 2: Выбор предложения
 */
const OffersStep: React.FC<{
  offers: ReturnType<typeof useInsuranceApply>["offers"];
  selectedOffer: ReturnType<typeof useInsuranceApply>["selectedOffer"];
  onSelect: (offer: ReturnType<typeof useInsuranceApply>["selectedOffer"]) => void;
}> = ({ offers, selectedOffer, onSelect }) => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Найдено {offers.length} предложений для вас
    </p>
    {offers.map((offer) => (
      <OfferCard
        key={offer.id}
        offer={offer}
        company={offer.company}
        selected={selectedOffer?.id === offer.id}
        onSelect={() => onSelect(offer)}
      />
    ))}
  </div>
);

/**
 * Шаг 3: Подтверждение
 */
const ConfirmationStep: React.FC<{
  category: InsuranceCategory | null;
  selectedOffer: ReturnType<typeof useInsuranceApply>["selectedOffer"];
  agreed: boolean;
  insuredName: string | null;
  onAgree: (value: boolean) => void;
  onSelectOther: () => void;
  onEdit: () => void;
  onCancel: () => void;
}> = ({
  category,
  selectedOffer,
  agreed,
  insuredName,
  onAgree,
  onSelectOther,
  onEdit,
  onCancel,
}) => {
  if (!selectedOffer) return null;

  return (
    <div className="space-y-4">
      {/* Выбранное предложение */}
      <Card className="ring-2 ring-primary">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">
              {selectedOffer.company.name.charAt(0)}
            </span>
            <div>
              <p>{selectedOffer.company.name}</p>
              <p className="text-2xl font-bold text-primary">
                {selectedOffer.price.toLocaleString("ru-RU")} ₽
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5">
            {selectedOffer.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500 shrink-0" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Резюме данных */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Данные анкеты
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {category && CATEGORY_NAMES[category]}
            {insuredName && ` · ${insuredName}`}
          </p>
        </CardContent>
      </Card>

      {/* Согласие */}
      <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
        <Checkbox
          id="agree"
          checked={agreed}
          onCheckedChange={(value) => onAgree(!!value)}
          className="mt-0.5"
        />
        <Label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
          Я ознакомлен с правилами страхования и даю согласие на обработку персональных данных
        </Label>
      </div>

      {/* Кнопки действий */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onSelectOther}>
          Другие предложения
        </Button>
        <Button variant="outline" onClick={onEdit}>
          Редактировать
        </Button>
      </div>

      <Button
        onClick={() => {
          if (!agreed) {
            toast.error("Необходимо согласие");
            return;
          }
        }}
        className="w-full"
        size="lg"
        disabled={!agreed}
      >
        Купить полис
      </Button>

      <Button variant="destructive" onClick={onCancel} className="w-full">
        Отменить
      </Button>
    </div>
  );
};

/**
 * Шаг 4: Оплата
 */
const PaymentStep: React.FC<{
  selectedOffer: ReturnType<typeof useInsuranceApply>["selectedOffer"];
  paymentMethod: ReturnType<typeof useInsuranceApply>["paymentMethod"];
  setPaymentMethod: ReturnType<typeof useInsuranceApply>["setPaymentMethod"];
  onPay: () => void;
  isProcessing: boolean;
}> = ({
  selectedOffer,
  paymentMethod,
  setPaymentMethod,
  onPay,
  isProcessing,
}) => {
  const [cardNumber, setCardNumber] = React.useState("");
  const [cardExpiry, setCardExpiry] = React.useState("");
  const [cardCvc, setCardCvc] = React.useState("");

  const paymentMethods = [
    { id: "card" as const, icon: CreditCard, label: "Банковская карта" },
    { id: "sbp" as const, icon: Smartphone, label: "СБП (Система быстрых платежей)" },
    { id: "installment" as const, icon: Clock, label: "Рассрочка" },
    { id: "bank" as const, icon: Landmark, label: "Банковский счёт (для юр. лиц)" },
  ];

  if (!selectedOffer) return null;

  return (
    <div className="space-y-4">
      {/* Сумма */}
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">Сумма к оплате</p>
        <p className="text-4xl font-bold text-primary mt-1">
          {selectedOffer.price.toLocaleString("ru-RU")} ₽
        </p>
      </div>

      {/* Способы оплаты */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Способ оплаты</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {paymentMethods.map(({ id, icon: Icon, label }) => (
            <div
              key={id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                paymentMethod === id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => setPaymentMethod(id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setPaymentMethod(id);
                }
              }}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-sm font-medium">{label}</span>
              {paymentMethod === id && (
                <Check className="w-4 h-4 text-primary ml-auto" aria-hidden="true" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Форма карты */}
      {paymentMethod === "card" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cardNumber">Номер карты</Label>
              <Input
                id="cardNumber"
                value={cardNumber}
                onChange={(e) =>
                  setCardNumber(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 16)
                      .replace(/(\d{4})/g, "$1 ")
                      .trim()
                  )
                }
                placeholder="0000 0000 0000 0000"
                maxLength={19}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cardExpiry">Срок действия</Label>
                <Input
                  id="cardExpiry"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="MM/YY"
                  maxLength={5}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cardCvc">CVC</Label>
                <Input
                  id="cardCvc"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder="123"
                  maxLength={3}
                  type="password"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Кнопка оплаты */}
      <Button
        onClick={onPay}
        className="w-full"
        size="lg"
        disabled={isProcessing}
      >
        {isProcessing ? "Обработка..." : `Оплатить ${selectedOffer.price.toLocaleString("ru-RU")} ₽`}
      </Button>
    </div>
  );
};

// ============================================================================
// Главный компонент
// ============================================================================

/**
 * Страница оформления страхового полиса
 * 
 * @page
 */
export default function InsuranceApplyPage() {
  const { productId } = useParams<{ productId?: string }>();
  
  const {
    step,
    category,
    formData,
    offers,
    selectedOffer,
    agreed,
    paymentMethod,
    isProcessing,
    stepTitle,
    setCategory,
    setFormData,
    setSelectedOffer,
    setAgreed,
    setPaymentMethod,
    setStep,
    saveDraft,
    next,
    back,
    pay,
    insuredName,
  } = useInsuranceApply();

  // Устанавливаем заголовок документа
  useEffect(() => {
    document.title = `${category ? CATEGORY_NAMES[category] : "Оформление"} — Страхование`;
  }, [category]);

  // Обработчик следующего шага
  const handleNext = useCallback(() => {
    if (step === 3 && !agreed) {
      toast.error("Необходимо согласие с правилами");
      return;
    }
    if (step === 2 && !selectedOffer) {
      toast.error("Выберите предложение");
      return;
    }
    next();
  }, [step, agreed, selectedOffer, next]);

  // Обработчик оплаты
  const handlePay = useCallback(() => {
    if (!agreed) {
      toast.error("Необходимо согласие с правилами");
      return;
    }
    pay();
  }, [agreed, pay]);

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={back} aria-label="Назад">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {category ? CATEGORY_NAMES[category] : "Оформление полиса"}
              {productId && ` · #${productId}`}
            </p>
            <h1 className="text-base font-semibold">{stepTitle}</h1>
          </div>
          {step === 1 && (
            <Button variant="ghost" size="sm" onClick={saveDraft}>
              <Save className="w-4 h-4 mr-1.5" />
              Черновик
            </Button>
          )}
        </div>
        <StepIndicator currentStep={step} />
      </div>

      {/* Контент */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Шаг 0: Выбор продукта */}
            {step === 0 && (
              <CategoryStep
                category={category}
                productId={productId}
                onSelect={setCategory}
              />
            )}

            {/* Шаг 1: Заполнение анкеты */}
            {step === 1 && category && formData && (
              <FormStep
                category={category}
                formData={formData}
                onChange={setFormData}
                onSaveDraft={saveDraft}
              />
            )}

            {/* Шаг 2: Предложения */}
            {step === 2 && (
              <OffersStep
                offers={offers}
                selectedOffer={selectedOffer}
                onSelect={setSelectedOffer}
              />
            )}

            {/* Шаг 3: Подтверждение */}
            {step === 3 && selectedOffer && (
              <ConfirmationStep
                category={category}
                selectedOffer={selectedOffer}
                agreed={agreed}
                insuredName={insuredName}
                onAgree={setAgreed}
                onSelectOther={() => setStep(2)}
                onEdit={() => setStep(1)}
                onCancel={() => window.location.href = "/insurance"}
              />
            )}

            {/* Шаг 4: Оплата */}
            {step === 4 && (
              <PaymentStep
                selectedOffer={selectedOffer}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                onPay={handlePay}
                isProcessing={isProcessing}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Кнопка "Далее" для шагов 0-2 */}
        {step < 3 && step !== 1 && (
          <Button
            onClick={handleNext}
            className="w-full mt-4"
            size="lg"
            disabled={
              (step === 0 && !category) ||
              (step === 2 && !selectedOffer)
            }
          >
            Далее
          </Button>
        )}
      </div>
    </div>
  );
}
