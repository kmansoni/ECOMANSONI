/**
 * Хук для управления состоянием оформления страховки
 * @module useInsuranceApply
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  DEFAULT_FORM_DATA_FACTORIES,
  type InsuranceFormData,
} from "@/types/insurance-forms";
import type { InsuranceCategory, InsuranceCompanyFull } from "@/types/insurance";
import { INSURANCE_COMPANIES } from "@/lib/insurance/companies-dictionary";

// ============================================================================
// Типы
// ============================================================================

/**
 * Шаг оформления
 */
export type ApplyStep = 0 | 1 | 2 | 3 | 4;

/**
 * Способ оплаты
 */
export type PaymentMethod = "card" | "sbp" | "installment" | "bank";

/**
 * Предложение от страховой компании
 */
export interface InsuranceOffer {
  id: string;
  companyId: string;
  company: InsuranceCompanyFull;
  price: number;
  coverage: string;
  badge?: "best_price" | "recommended" | "popular";
  features: string[];
}

/**
 * Состояние оформления страховки
 */
export interface InsuranceApplyState {
  /** Текущий шаг */
  step: ApplyStep;
  /** Выбранная категория */
  category: InsuranceCategory | null;
  /** Данные формы */
  formData: InsuranceFormData | null;
  /** Список предложений */
  offers: InsuranceOffer[];
  /** Выбранное предложение */
  selectedOffer: InsuranceOffer | null;
  /** Флаг согласия с правилами */
  agreed: boolean;
  /** Способ оплаты */
  paymentMethod: PaymentMethod;
  /** Флаг обработки платежа */
  isProcessing: boolean;
}

// ============================================================================
// Константы
// ============================================================================

/**
 * Названия категорий
 */
export const CATEGORY_NAMES: Record<InsuranceCategory, string> = {
  osago: "ОСАГО",
  kasko: "КАСКО",
  dms: "ДМС",
  travel: "Путешествия",
  property: "Имущество",
  mortgage: "Ипотека",
  life: "Жизнь",
  mini_kasko: "Мини-КАСКО",
  health: "Здоровье",
  auto: "Авто",
  osgop: "ОСГОП",
};

/**
 * Категории с иконками
 */
export const INSURANCE_CATEGORIES: Array<{
  id: InsuranceCategory;
  icon: string;
  desc: string;
}> = [
  { id: "osago", icon: "🚗", desc: "Обязательное страхование авто" },
  { id: "kasko", icon: "🛡️", desc: "Добровольное страхование авто" },
  { id: "dms", icon: "🏥", desc: "Добровольное медицинское" },
  { id: "travel", icon: "✈️", desc: "Страхование путешествий" },
  { id: "property", icon: "🏠", desc: "Страхование имущества" },
  { id: "mortgage", icon: "🏦", desc: "Ипотечное страхование" },
  { id: "life", icon: "❤️", desc: "Страхование жизни" },
];

// ============================================================================
// Хук
// ============================================================================

/**
 * Хук для управления процессом оформления страховки
 * 
 * @example
 * ```tsx
 * const {
 *   step,
 *   category,
 *   formData,
 *   offers,
 *   selectedOffer,
 *   setCategory,
 *   setFormData,
 *   handleNext,
 *   handleBack,
 * } = useInsuranceApply();
 * ```
 */
export function useInsuranceApply() {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId?: string }>();
  const [searchParams] = useSearchParams();

  // Состояние
  const [step, setStep] = useState<ApplyStep>(0);
  const [category, setCategory] = useState<InsuranceCategory | null>(null);
  const [formData, setFormData] = useState<InsuranceFormData | null>(null);
  const [offers, setOffers] = useState<InsuranceOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<InsuranceOffer | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [isProcessing, setIsProcessing] = useState(false);

  // Определяем категорию из URL
  const categoryFromQuery = searchParams.get("category") as InsuranceCategory | null;

  // Инициализация категории из URL
  useEffect(() => {
    if (categoryFromQuery) {
      setCategory(categoryFromQuery);
    } else if (productId) {
      const categoryFromProductId = productId.split("-")[0] as InsuranceCategory;
      if (categoryFromProductId) {
        setCategory(categoryFromProductId);
      }
    }
  }, [categoryFromQuery, productId]);

  // Инициализация данных формы
  useEffect(() => {
    if (category && !formData) {
      const storageKey = `insurance_draft_${category}`;
      const saved = localStorage.getItem(storageKey);
      
      if (saved) {
        try {
          setFormData(JSON.parse(saved));
          return;
        } catch (parseError) {
          logger.warn(
            "[useInsuranceApply] Failed to parse draft, clearing corrupted storage",
            { error: parseError }
          );
          localStorage.removeItem(storageKey);
        }
      }
      
      const factory = DEFAULT_FORM_DATA_FACTORIES[category];
      if (factory) {
        setFormData(factory());
      }
    }
  }, [category, formData]);

  // Переход на шаг анкеты при наличии productId
  useEffect(() => {
    if (productId && category && step === 0) {
      setStep(1);
    }
  }, [productId, category, step]);

  // ---------------------------------------------------------------------------
  //Callbacks
  // ---------------------------------------------------------------------------

  /**
   * Выбор категории
   */
  const handleSelectCategory = useCallback((newCategory: InsuranceCategory) => {
    setCategory(newCategory);
    const factory = DEFAULT_FORM_DATA_FACTORIES[newCategory];
    if (factory) {
      setFormData(factory());
    }
    setSelectedOffer(null);
  }, []);

  /**
   * Обновление данных формы
   */
  const handleFormChange = useCallback((newData: InsuranceFormData) => {
    setFormData(newData);
  }, []);

  /**
   * Сохранение черновика
   */
  const handleSaveDraft = useCallback(() => {
    if (category && formData) {
      localStorage.setItem(
        `insurance_draft_${category}`,
        JSON.stringify(formData)
      );
      toast.success("Черновик сохранён");
    }
  }, [category, formData]);

  /**
   * Переход к следующему шагу
   */
  const handleNext = useCallback(() => {
    if (step === 1 && category) {
      // Генерируем предложения
      const generatedOffers = generateOffers(category);
      setOffers(generatedOffers);
    }
    setStep((prev) => Math.min(prev + 1, 4) as ApplyStep);
  }, [step, category]);

  /**
   * Переход к предыдущему шагу
   */
  const handleBack = useCallback(() => {
    if (step === 0) {
      navigate(-1);
    } else {
      setStep((prev) => Math.max(prev - 1, 0) as ApplyStep);
    }
  }, [step, navigate]);

  /**
   * Выбор предложения
   */
  const handleSelectOffer = useCallback((offer: InsuranceOffer) => {
    setSelectedOffer(offer);
  }, []);

  /**
   * Обработка согласия
   */
  const handleAgree = useCallback((value: boolean) => {
    setAgreed(value);
  }, []);

  /**
   * Обработка оплаты
   */
  const handlePay = useCallback(async () => {
    if (!agreed) {
      toast.error("Необходимо согласие с правилами");
      return;
    }

    setIsProcessing(true);
    
    try {
      // Имитация обработки платежа
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const policyId = `POL-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()}`;
      
      // Очищаем черновик
      if (category) {
        localStorage.removeItem(`insurance_draft_${category}`);
      }
      
      navigate(`/insurance/success/${policyId}`);
    } catch (error) {
      logger.error("[useInsuranceApply] Payment failed", { error });
      toast.error("Ошибка при оплате. Попробуйте снова.");
    } finally {
      setIsProcessing(false);
    }
  }, [agreed, category, navigate]);

  // ---------------------------------------------------------------------------
  // Вычисляемые значения
  // ---------------------------------------------------------------------------

  /** Название текущего шага */
  const stepTitle = useMemo(() => {
    const titles: Record<ApplyStep, string> = {
      0: "Выбор продукта",
      1: "Анкета",
      2: "Предложения",
      3: "Подтверждение",
      4: "Оплата",
    };
    return titles[step];
  }, [step]);

  /** Можно ли перейти к следующему шагу */
  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return category !== null;
      case 1:
        return formData !== null;
      case 2:
        return selectedOffer !== null;
      case 3:
        return agreed;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, category, formData, selectedOffer, agreed]);

  /** Имя страхователя из формы */
  const insuredName = useMemo(() => {
    if (!formData || typeof formData !== "object") return null;
    const data = formData as unknown as Record<string, unknown>;
    const lastName = data.lastName as string | undefined;
    const firstName = data.firstName as string | undefined;
    if (lastName || firstName) {
      return `${lastName || ""} ${firstName || ""}`.trim();
    }
    return null;
  }, [formData]);

  // ---------------------------------------------------------------------------
  // Возвращаемое значение
  // ---------------------------------------------------------------------------

  return {
    // Состояние
    step,
    category,
    formData,
    offers,
    selectedOffer,
    agreed,
    paymentMethod,
    isProcessing,
    
    // Computed
    stepTitle,
    canProceed,
    insuredName,
    
    // Setters
    setCategory: handleSelectCategory,
    setFormData: handleFormChange,
    setSelectedOffer: handleSelectOffer,
    setAgreed: handleAgree,
    setPaymentMethod,
    setStep,
    
    // Actions
    saveDraft: handleSaveDraft,
    next: handleNext,
    back: handleBack,
    pay: handlePay,
  };
}

// ============================================================================
// Вспомогательные функции
// ============================================================================

/**
 * Базовые цены по категориям
 */
const BASE_PRICES: Record<InsuranceCategory, number> = {
  osago: 8500,
  kasko: 45000,
  dms: 28000,
  travel: 2500,
  property: 6500,
  mortgage: 15000,
  life: 12000,
  mini_kasko: 25000,
  health: 20000,
  auto: 35000,
  osgop: 5000,
};

/**
 * Генерирует список предложений для категории
 */
function generateOffers(category: InsuranceCategory): InsuranceOffer[] {
  const companies = INSURANCE_COMPANIES.filter((c) =>
    c.categories.includes(category)
  ).slice(0, 6);
  
  const basePrice = BASE_PRICES[category] || 10000;
  
  return companies.map((company, idx) => {
    const multiplier = 0.85 + idx * 0.08;
    const price = Math.round((basePrice * multiplier) / 100) * 100;
    
    let badge: InsuranceOffer["badge"];
    if (idx === 0) badge = "best_price";
    else if (idx === 1) badge = "recommended";
    else if (idx === 2) badge = "popular";
    
    return {
      id: company.id,
      companyId: company.id,
      company: company as unknown as InsuranceCompanyFull,
      price,
      coverage: `${(price * 10).toLocaleString("ru-RU")} ₽`,
      badge,
      features: company.pros.slice(0, 3),
    };
  }).sort((a, b) => a.price - b.price);
}

export default useInsuranceApply;
