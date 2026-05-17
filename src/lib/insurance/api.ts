import { dbLoose, supabase } from "@/lib/supabase";
import type {
  InsuranceCategory,
  InsuranceCompanyFull,
  InsuranceProductFull,
  InsuranceApplication,
  InsurancePolicyFull,
  InsuranceClaim,
  CalculationResponse,
  InsuranceReview,
  InsuranceRegion,
  InsuranceFaqItem,
  InsuranceFilters,
  InsuranceApiError,
  OsagoCalculationRequest,
  KaskoCalculationRequest,
  DmsCalculationRequest,
  TravelCalculationRequest,
  PropertyCalculationRequest,
  MortgageCalculationRequest,
  LifeCalculationRequest,
  ComparisonData,
} from "@/types/insurance";
import type {
  ProviderCode,
  AggregatedQuoteResponse,
  VehicleLookupResult,
  PurchaseRequest,
  PurchaseResult,
} from "@/types/insurance-providers";
import { createSoglasieClient as createSoglasieEosagoClient, SoglasieError } from "@/integrations/soglasie-eosago/client";
import type { KbmRequest } from "@/integrations/soglasie-eosago/types";
import { KBM_TABLE } from "./constants";
import { getDefaultSoglasieConfig } from "./soglasie-config";

const db = dbLoose;

type AnyCalculationRequest =
  | OsagoCalculationRequest
  | KaskoCalculationRequest
  | DmsCalculationRequest
  | TravelCalculationRequest
  | PropertyCalculationRequest
  | MortgageCalculationRequest
  | LifeCalculationRequest;

/**
 * Клиент API страховых услуг — обёртка над Supabase Edge Functions
 */
class InsuranceApiClient {
  /**
   * Вызывает Edge Function с обработкой ошибок
   */
  private async callFunction<T>(
    name: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await supabase.functions.invoke<T>(name, {
      body,
    });

    if (error) {
      const apiError: InsuranceApiError = {
        code: "FUNCTION_ERROR",
        message: error.message ?? "Неизвестная ошибка",
        details: { originalError: error },
      };
      throw apiError;
    }

    if (data === null || data === undefined) {
      const apiError: InsuranceApiError = {
        code: "EMPTY_RESPONSE",
        message: "Пустой ответ от сервера",
      };
      throw apiError;
    }

    return data;
  }

  /**
   * Запрашивает данные из таблицы Supabase с обработкой ошибок
   */
  private async queryTable<T>(
    table: string,
    options?: {
      select?: string;
      filters?: Record<string, unknown>;
      eq?: [string, unknown][];
      order?: [string, { ascending: boolean }];
      limit?: number;
      single?: boolean;
    },
  ): Promise<T> {
    let query = db
      .from(table)
      .select(options?.select ?? "*");

    if (options?.eq) {
      for (const [col, val] of options.eq) {
        query = query.eq(col, val);
      }
    }

    if (options?.order) {
      query = query.order(options.order[0], options.order[1]);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = options?.single
      ? await query.single()
      : await query;

    if (error) {
      const apiError: InsuranceApiError = {
        code: error.code ?? "DB_ERROR",
        message: error.message,
        details: { hint: error.hint, details: error.details },
      };
      throw apiError;
    }

    return data as T;
  }

  // ===== Расчёт стоимости =====

  /**
   * Рассчитывает стоимость страховки через Edge Function
   */
  async calculateQuote(
    category: InsuranceCategory,
    data: AnyCalculationRequest,
  ): Promise<CalculationResponse> {
    return this.callFunction<CalculationResponse>("insurance-calculate", {
      category,
      data,
    });
  }

  // ===== Компании =====

  /**
   * Возвращает список страховых компаний
   */
  async getCompanies(filters?: InsuranceFilters): Promise<InsuranceCompanyFull[]> {
    return this.queryTable<InsuranceCompanyFull[]>("insurance_companies", {
      select: "*",
      order: ["rating", { ascending: false }],
    });
  }

  /**
   * Возвращает данные конкретной страховой компании
   */
  async getCompany(id: string): Promise<InsuranceCompanyFull> {
    return this.queryTable<InsuranceCompanyFull>("insurance_companies", {
      eq: [["id", id]],
      single: true,
    });
  }

  async getCompanyBySlug(slug: string): Promise<InsuranceCompanyFull> {
    return this.queryTable<InsuranceCompanyFull>("insurance_companies", {
      eq: [["slug", slug]],
      single: true,
    });
  }

  // ===== Продукты =====

  /**
   * Возвращает список страховых продуктов
   */
  async getProducts(filters?: InsuranceFilters): Promise<InsuranceProductFull[]> {
    const eq: [string, unknown][] = [["is_active", true]];
    if (filters?.category) eq.push(["category", filters.category]);
    if (filters?.company_id) eq.push(["company_id", filters.company_id]);

    return this.queryTable<InsuranceProductFull[]>("insurance_products", {
      select: "*, company:insurance_companies(*)",
      eq,
      order: ["is_popular", { ascending: false }],
    });
  }

  /**
   * Возвращает данные конкретного продукта
   */
  async getProduct(id: string): Promise<InsuranceProductFull> {
    return this.queryTable<InsuranceProductFull>("insurance_products", {
      select: "*, company:insurance_companies(*)",
      eq: [["id", id]],
      single: true,
    });
  }

  // ===== Заявки =====

  /**
   * Создаёт заявку на оформление страховки
   */
  async createApplication(
    data: Partial<InsuranceApplication>,
  ): Promise<InsuranceApplication> {
    const { data: result, error } = await db
      .from("insurance_applications")
      .insert(data as Record<string, unknown>)
      .select()
      .single();

    if (error) {
      throw {
        code: error.code,
        message: error.message,
      } as InsuranceApiError;
    }

    return result as InsuranceApplication;
  }

  /**
   * Возвращает список заявок текущего пользователя
   */
  async getApplications(): Promise<InsuranceApplication[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw { code: "AUTH_ERROR", message: "Не авторизован" } as InsuranceApiError;

    return this.queryTable<InsuranceApplication[]>("insurance_applications", {
      eq: [["user_id", user.id]],
      order: ["created_at", { ascending: false }],
    });
  }

  /**
   * Возвращает данные конкретной заявки
   */
  async getApplication(id: string): Promise<InsuranceApplication> {
    return this.queryTable<InsuranceApplication>("insurance_applications", {
      eq: [["id", id]],
      single: true,
    });
  }

  /**
   * Обновляет данные заявки
   */
  async updateApplication(
    id: string,
    updates: Partial<InsuranceApplication>,
  ): Promise<InsuranceApplication> {
    const { data, error } = await db
      .from("insurance_applications")
      .update(updates as Record<string, unknown>)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw { code: error.code, message: error.message } as InsuranceApiError;
    }

    return data as InsuranceApplication;
  }

  // ===== Полисы =====

  /**
   * Возвращает список полисов пользователя
   */
  async getPolicies(filters?: InsuranceFilters): Promise<InsurancePolicyFull[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw { code: "AUTH_ERROR", message: "Не авторизован" } as InsuranceApiError;

    const eq: [string, unknown][] = [["user_id", user.id]];
    if (filters?.category) eq.push(["category", filters.category]);

    return this.queryTable<InsurancePolicyFull[]>("insurance_policies", {
      select: "*, company:insurance_companies(*), product:insurance_products(*)",
      eq,
      order: ["end_date", { ascending: true }],
    });
  }

  /**
   * Возвращает данные конкретного полиса
   */
  async getPolicy(id: string): Promise<InsurancePolicyFull> {
    return this.queryTable<InsurancePolicyFull>("insurance_policies", {
      select: "*, company:insurance_companies(*), product:insurance_products(*)",
      eq: [["id", id]],
      single: true,
    });
  }

  // ===== Страховые случаи =====

  /**
   * Подаёт заявление о страховом случае
   */
  async createClaim(data: Partial<InsuranceClaim>): Promise<InsuranceClaim> {
    const { data: result, error } = await db
      .from("insurance_claims")
      .insert(data as Record<string, unknown>)
      .select()
      .single();

    if (error) {
      throw { code: error.code, message: error.message } as InsuranceApiError;
    }

    return result as unknown as InsuranceClaim;
  }

  /**
   * Возвращает список страховых случаев пользователя
   */
  async getClaims(): Promise<InsuranceClaim[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw { code: "AUTH_ERROR", message: "Не авторизован" } as InsuranceApiError;

    const { data, error } = await db
      .from("insurance_claims")
      .select(`
        *,
        policy:insurance_policies(
          *,
          company:insurance_companies(*),
          product:insurance_products(*)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw { code: error.code, message: error.message } as InsuranceApiError;
  return data as unknown as InsuranceClaim[];
  }

  /**
   * Возвращает данные конкретного страхового случая
   */
  async getClaim(id: string): Promise<InsuranceClaim> {
    const { data, error } = await db
      .from("insurance_claims")
      .select(`
        *,
        policy:insurance_policies(
          *,
          company:insurance_companies(*),
          product:insurance_products(*)
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw { code: error.code, message: error.message } as InsuranceApiError;
  return data as unknown as InsuranceClaim;
  }

  // ===== Сравнение =====

  /**
   * Сравнивает несколько продуктов по ID
   */
  async compareProducts(ids: string[]): Promise<ComparisonData> {
    return this.callFunction<ComparisonData>("insurance-compare", { product_ids: ids });
  }

  // ===== Мультиоффер =====

  async requestQuotes(
    category: InsuranceCategory,
    params: Record<string, unknown>,
    preferredProviders?: ProviderCode[],
  ): Promise<AggregatedQuoteResponse> {
    return this.callFunction<AggregatedQuoteResponse>('insurance-quote', {
      category,
      params,
      preferred_providers: preferredProviders,
    });
  }

  async lookupVehicle(plate: string): Promise<VehicleLookupResult> {
    return this.callFunction<VehicleLookupResult>('insurance-vehicle-lookup', { plate });
  }

  async purchasePolicy(request: PurchaseRequest): Promise<PurchaseResult> {
    return this.callFunction<PurchaseResult>('insurance-purchase', { ...request });
  }

   // ===== КБМ =====

  /**
   * Преобразует коэффициент КБМ в ближайший класс согласно таблице КБМ
   */
  private kbmCoefficientToClass(coefficient: number): number {
    // Таблица КБМ из constants.ts
    const KBM_TABLE: Record<number, number> = {
      0: 2.45,
      1: 2.3,
      2: 1.55,
      3: 1.0,
      4: 0.95,
      5: 0.9,
      6: 0.85,
      7: 0.8,
      8: 0.75,
      9: 0.7,
      10: 0.65,
      11: 0.6,
      12: 0.55,
      13: 0.5,
    };

    // Находим класс с ближайшим коэффициентом
    let closestClass = 0;
    let minDiff = Math.abs(coefficient - KBM_TABLE[0]);

    for (let klass = 1; klass <= 13; klass++) {
      const diff = Math.abs(coefficient - KBM_TABLE[klass]);
      if (diff < minDiff) {
        minDiff = diff;
        closestClass = klass;
      }
    }

    return closestClass;
  }

  /**
   * Проверяет КБМ (бонус-малус) водителя через сервис СК Согласие (ЭТАП 1: Проверка КБМ 2.0)
   * Использует bezpośrednie integrację z web-serwisami СК Согласие
   */
  async checkKbm(data: {
    last_name: string;
    first_name: string;
    middle_name?: string;
    birth_date: string;
    driver_license_series: string;
    driver_license_number: string;
  }): Promise<{ kbm_class: number; kbm_value: number }> {
    try {
      // Преобразуем входные данные в формат KbmRequest СК Согласие
      const kbmRequest: KbmRequest = {
        driverLimitIndicator: false, // По умолчанию нет ограничения ЛДУ
        contractEffectiveDate: new Date().toISOString().split('T')[0], // Текущая дата
        contractClosingDate: new Date().toISOString().split('T')[0], // Текущая дата
        persons: [
          {
            driverLicense: {
              countryCode: "643", // Россия по ОКСМ
              docType: 2, // Водительское удостоверение (предположительно)
              docSeries: data.driver_license_series,
              docNumber: data.driver_license_number,
              lastName: data.last_name,
              firstName: data.first_name,
              middleName: data.middle_name || "",
              birthDate: data.birth_date
            }
          }
        ]
      };

      // Вызываем проверку КБМ через интеграцию СК Согласие
      const config = getDefaultSoglasieConfig();
      const soglasieClient = createSoglasieEosagoClient({
        login: config.login,
        password: config.password,
        subUser: config.subUser,
        subUserPassword: config.password,
        environment: config.environment,
      });

      const response = await soglasieClient.checkKbm(kbmRequest);

      // Проверяем наличие ошибок в ответе
      if (response.processingResult && response.processingResult.calculateKbmResponses &&
          response.processingResult.calculateKbmResponses.length > 0) {

        const kbmResult = response.processingResult.calculateKbmResponses[0];
        const kbmCoefficient = kbmResult.kbm; // Это фактический коэффициент КБМ от СК Согласие

        // Преобразуем коэффициент в ближайший класс для совместимости с существующим кодом
        const kbmClass = this.kbmCoefficientToClass(kbmCoefficient);
        const kbmValue = KBM_TABLE[kbmClass]; // Получаем точный коэффициент из таблицы

        return { kbm_class: kbmClass, kbm_value: kbmValue };
      } else {
        // Если нет результатов бросаем ошибку
        throw {
          code: "KBM_NO_RESULT",
          message: "Сервис КБМ СК Согласие не вернул результат расчёта"
        } as InsuranceApiError;
      }
    } catch (error) {
      // Преобразуем ошибки СК Согласие в наш формат
      if (error instanceof SoglasieError) {
        throw {
          code: `SOGLASIE_KBM_ERROR_${error.statusCode}`,
          message: error.message,
          details: error.details,
        } as InsuranceApiError;
      }

      // Пробрасываем другие ошибки как есть
      throw error;
    }
  }

  // ===== Регионы =====

  /**
   * Возвращает список регионов России с коэффициентами
   */
  async getRegions(): Promise<InsuranceRegion[]> {
    return this.queryTable<InsuranceRegion[]>("insurance_regions", {
      order: ["name", { ascending: true }],
    });
  }

  // ===== FAQ =====

  /**
   * Возвращает список часто задаваемых вопросов
   */
  async getFaq(
    category?: InsuranceCategory | "general",
  ): Promise<InsuranceFaqItem[]> {
    const eq: [string, unknown][] = [];
    if (category) eq.push(["category", category]);

    return this.queryTable<InsuranceFaqItem[]>("insurance_faq", {
      eq: eq.length > 0 ? eq : undefined,
      order: ["order", { ascending: true }],
    });
  }

  // ===== Отзывы =====

  /**
   * Возвращает отзывы о страховой компании
   */
  async getReviews(companyId: string): Promise<InsuranceReview[]> {
    return this.queryTable<InsuranceReview[]>("insurance_reviews", {
      eq: [
        ["company_id", companyId],
        ["verified", true],
      ],
      order: ["created_at", { ascending: false }],
    });
  }

  /**
   * Создаёт отзыв о страховой компании
   */
  async createReview(
    data: Partial<InsuranceReview>,
  ): Promise<InsuranceReview> {
    const { data: result, error } = await db
      .from("insurance_reviews")
      .insert(data as Record<string, unknown>)
      .select()
      .single();

    if (error) {
      throw { code: error.code, message: error.message } as InsuranceApiError;
    }

    return result as InsuranceReview;
  }
}

/** Синглтон-экземпляр клиента API страхования */
export const insuranceApi = new InsuranceApiClient();

export { InsuranceApiClient };
