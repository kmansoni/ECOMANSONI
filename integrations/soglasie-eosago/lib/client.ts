/**
 * SK Soglasie E-OSAGO API Client
 * 
 * Интеграция с Страховой Компанией "Согласие" для оформления электронного полиса ОСАГО
 * 
 * Documentation: https://wiki.soglasie.ru/partners/integration/products/eosago
 * 
 * Production: https://b2b.soglasie.ru
 * Test: https://b2b.soglasie.ru/daily
 * Test (new partners): https://b2b.soglasie.ru/upload-test
 */

import type {
  KbmRequest,
  KbmResponse,
  EosagoApplication,
  ApplicationResponse,
  EosagoStatusResponse,
  PayLinkResponse,
  AcquiringRequest,
  VehicleInfo,
  Person,
  Driver,
  Document,
  Address,
  VehicleDocument,
  PhisicalPerson,
  JuridicalPerson,
  PersonFace,
  CatalogResponse,
  ModelInfo,
  ModelTypesResponse,
} from '../types';

/** Environment для API */
export type Environment = 'production' | 'test' | 'upload-test';

/** Конфигурация клиента */
export interface SoglasieConfig {
  login: string;
  password: string;
  subUser?: string;
  subUserPassword?: string;
  environment: Environment;
}

/** Опции для запроса статуса */
export interface StatusOptions {
  akv?: boolean;
  overlimit?: boolean;
}

/** Опции для ожидания статуса */
export interface WaitOptions {
  maxAttempts?: number;
  intervalMs?: number;
}

/**
 * Custom ошибка API
 */
export class SoglasieError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SoglasieError';
  }
}

/**
 * E-OSAGO API Client
 */
export class SoglasieClient {
  private baseUrl: string;
  private authHeader: string;
  private authHeaderWithSubUser: string;

  constructor(private config: SoglasieConfig) {
    this.baseUrl = this.getBaseUrl();
    this.authHeader = this.createAuth(config.login, config.password);
    this.authHeaderWithSubUser = this.createAuth(
      config.login,
      config.subUser || config.password,
      config.subUserPassword || config.password
    );
  }

  private getBaseUrl(): string {
    const urls: Record<Environment, string> = {
      production: 'https://b2b.soglasie.ru',
      test: 'https://b2b.soglasie.ru/daily',
      'upload-test': 'https://b2b.soglasie.ru/upload-test',
    };
    return urls[this.config.environment];
  }

  private createAuth(login: string, password: string): string {
    return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { auth?: string }
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': options.auth || this.authHeader,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new SoglasieError(
        error.error || `Request failed: ${response.status}`,
        response.status,
        error
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }

    return response.blob() as unknown as T;
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 1: Проверка КБМ 2.0
  // ═══════════════════════════════════════════════════════════

  /**
   * Проверка КБМ водителей через сервис РСА 2.0
   * 
   * @see https://wiki.soglasie.ru/partners/integration/services/kbmservice2.0/start
   * 
   * @param request - данные для проверки КБМ
   * @returns КБМ и связанные данные
   */
  async checkKbm(request: KbmRequest): Promise<KbmResponse> {
    return this.request('/rsaproxy/api/osago/v1/kbm', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 3: Загрузка заявления
  // ═══════════════════════════════════════════════════════════

  /**
   * Загрузка заявления Е-ОСАГО
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/load
   * 
   * @param application - полные данные заявления
   * @returns policyId - идентификатор заявления
   */
  async loadApplication(application: EosagoApplication): Promise<ApplicationResponse> {
    return this.request('/online/api/eosago', {
      method: 'POST',
      auth: this.authHeaderWithSubUser,
      body: JSON.stringify(application),
    });
  }

  /**
   * Загрузка черновика (без проверки РСА)
   * Используется для тестирования
   * 
   * @param application - данные заявления
   * @returns policyId
   */
  async loadApplicationDraft(application: EosagoApplication): Promise<ApplicationResponse> {
    return this.request('/online/api/eosago?test=true', {
      method: 'POST',
      auth: this.authHeaderWithSubUser,
      body: JSON.stringify(application),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 4: Проверка статуса заявления
  // ═══════════════════════════════════════════════════════════

  /**
   * Получение статуса загруженного заявления
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/status
   * 
   * @param policyId - идентификатор заявления
   * @param options - дополнительные параметры
   * @returns статус и данные заявления
   */
  async getStatus(policyId: number, options?: StatusOptions): Promise<EosagoStatusResponse> {
    const params = new URLSearchParams();
    if (options?.akv) params.set('akv', 'true');
    if (options?.overlimit) params.set('overlimit', 'true');

    const query = params.toString();
    return this.request(`/online/api/eosago/${policyId}/status${query ? '?' + query : ''}`);
  }

  /**
   * Ожидание достижения целевого статуса
   * 
   * @param policyId - идентификатор заявления
   * @param targetStatuses - целевые статусы
   * @param options - опции
   * @returns финальный статус
   */
  async waitForStatus(
    policyId: number,
    targetStatuses: string[],
    options: WaitOptions = {}
  ): Promise<EosagoStatusResponse> {
    const { maxAttempts = 30, intervalMs = 3000 } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getStatus(policyId);
      const currentStatus = status.policy?.status || status.status;

      if (targetStatuses.includes(currentStatus)) {
        return status;
      }

      if (status.status === 'ERROR') {
        throw new SoglasieError(
          status.lastError || 'Processing failed',
          500,
          status
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new SoglasieError(
      `Timeout waiting for status: ${targetStatuses.join(', ')}`,
      408
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 5: Скачивание ПФ заявления
  // ═══════════════════════════════════════════════════════════

  /**
   * Скачивание ПФ заявления
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/docdownload
   * 
   * @param policyId - идентификатор заявления
   * @returns PDF файл
   */
  async downloadApplicationPdf(policyId: number): Promise<Blob> {
    const response = await fetch(
      `${this.baseUrl}/online/api/eosago/${policyId}/notice`,
      {
        headers: { Authorization: this.authHeader },
      }
    );

    if (!response.ok) {
      throw new SoglasieError(
        `Failed to download application PDF: ${response.status}`,
        response.status
      );
    }

    return response.blob();
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 6: Перевод в статус "Оформление прекращено"
  // ═══════════════════════════════════════════════════════════

  /**
   * Перевод заявления в статус "Оформление прекращено"
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/stop
   * 
   * @param policyId - идентификатор заявления
   */
  async suspendApplication(policyId: number): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/online/api/eosago/${policyId}/suspend`,
      {
        method: 'PUT',
        headers: { Authorization: this.authHeader },
      }
    );

    if (!response.ok) {
      throw new SoglasieError(
        `Failed to suspend application: ${response.status}`,
        response.status
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 7: Получение ссылки на оплату
  // ═══════════════════════════════════════════════════════════

  /**
   * Получение ссылки на оплату полиса
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/linktopay
   * 
   * @param policyId - идентификатор заявления
   * @returns ссылка на оплату
   */
  async getPayLink(policyId: number): Promise<PayLinkResponse> {
    return this.request(`/online/api/eosago/${policyId}/paylink`);
  }

  // ═════════════════���═���═══════════════════════════════════════
  // ЭТАП 8: Запись данных об успешной оплате
  // ═══════════════════════════════════════════════════════════

  /**
   * Запись данных об успешной оплате (внешний эквайринг)
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/success
   * 
   * @param policyId - идентификатор заявления
   * @param acquiring - данные транзакции
   */
  async confirmPayment(policyId: number, acquiring: AcquiringRequest): Promise<void> {
    await this.request(`/online/api/eosago/${policyId}/acquiring`, {
      method: 'POST',
      auth: this.authHeaderWithSubUser,
      body: JSON.stringify(acquiring),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 10: Скачивание ПФ полиса
  // ═══════════════════════════════════════════════════════════

  /**
   * Скачивание ПФ полиса
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/docpolisdownload
   * 
   * @param policyId - идентификатор заявления
   * @returns PDF файл
   */
  async downloadPolicyPdf(policyId: number): Promise<Blob> {
    const response = await fetch(
      `${this.baseUrl}/online/api/eosago/${policyId}/policy`,
      {
        headers: { Authorization: this.authHeader },
      }
    );

    if (!response.ok) {
      throw new SoglasieError(
        `Failed to download policy PDF: ${response.status}`,
        response.status
      );
    }

    return response.blob();
  }

  // ═══════════════════════════════════════════════════════════
  // Справочники
  // ═══════════════════════════════════════════════════════════

  /**
   * Получение справочника марок ТС
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/catalogue
   * 
   * @returns список марок
   */
  async getCarMarks(): Promise<ModelInfo[]> {
    const response = await this.request<CatalogResponse>('/online/api/refs/model');
    return response as unknown as ModelInfo[];
  }

  /**
   * Получение справочника моделей для марки
   * 
   * @param markId - код марки
   * @returns список моделей
   */
  async getCarModels(markId: number): Promise<ModelInfo[]> {
    const response = await this.request<CatalogResponse>(
      `/online/api/refs/model/${markId}`
    );
    return response as unknown as ModelInfo[];
  }

  /**
   * Получение справочника типов ТС
   * 
   * @returns типы ТС
   */
  async getVehicleTypes(): Promise<ModelInfo[]> {
    const response = await this.request<ModelTypesResponse>('/online/api/refs/model/types');
    return response as unknown as ModelInfo[];
  }
}

/**
 * Константы статусов
 */
export const ApplicationStatus = {
  DRAFT: 'DRAFT',
  RSA_CHECK: 'RSA_CHECK',
  RSA_CHECK_OK: 'RSA_CHECK_OK',
  RSA_CHECK_FAIL: 'RSA_CHECK_FAIL',
  SK_CHECK: 'SK_CHECK',
  SK_CHECK_START: 'SK_CHECK_START',
  SK_CHECK_OK: 'SK_CHECK_OK',
  SK_CHECK_FAIL: 'SK_CHECK_FAIL',
  PAY_COMPLETE: 'PAY_COMPLETE',
  RSA_SIGN: 'RSA_SIGN',
  RSA_SIGNED: 'RSA_SIGNED',
  RSA_SIGN_FAIL: 'RSA_SIGN_FAIL',
  SIGNED: 'SIGNED',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
  OTHER_SK: 'OTHER_SK',
} as const;

/** Статусы завершения */
export const FINAL_STATUSES = [
  ApplicationStatus.SIGNED,
  ApplicationStatus.SUSPENDED,
  ApplicationStatus.CANCELED,
  ApplicationStatus.OTHER_SK,
] as const;

/** Статусы готовности к оплате */
export const PAYABLE_STATUSES = [
  ApplicationStatus.RSA_CHECK_OK,
  ApplicationStatus.SK_CHECK_OK,
] as const;

/** Ожидаемые статусы */
export const PENDING_STATUSES = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.RSA_CHECK,
  ApplicationStatus.SK_CHECK,
  ApplicationStatus.SK_CHECK_START,
  ApplicationStatus.PAY_COMPLETE,
  ApplicationStatus.RSA_SIGN,
  ApplicationStatus.RSA_SIGNED,
] as const;

/**
 * Фабрика создания клиента
 */
export function createClient(config: SoglasieConfig): SoglasieClient {
  return new SoglasieClient(config);
}