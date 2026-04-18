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
  CcmCalcRequest,
  CcmCalcResponse,
  CcmCalcResult,
  CcmError,
  InvoiceRequest,
  InvoiceResponse,
  InvoiceListFilters,
  InvoiceListResponse,
  InvoiceStatus,
  DocumentType,
  DocumentUploadResponse,
  DocumentInfo,
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
  // Этап 9: Счета для ЮЛ
  // ═══════════════════════════════════════════════════════════

  /**
   * Создание счета для юридического лица
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/invoice
   * 
   * @param policyId - ID заявления
   * @param data - данные счета
   * @returns созданный счет
   */
  async createInvoice(policyId: number, data: InvoiceRequest): Promise<InvoiceResponse> {
    return this.request('/online/api/invoice', {
      method: 'POST',
      auth: this.authHeaderWithSubUser,
      body: JSON.stringify({ ...data, policyId }),
    });
  }

  /**
   * Получение счета по ID
   * 
   * @param invoiceId - ID счета
   * @returns данные счета
   */
  async getInvoice(invoiceId: number): Promise<InvoiceResponse> {
    return this.request(`/online/api/invoice/${invoiceId}`);
  }

  /**
   * Аннулирование счета
   * 
   * @param invoiceId - ID счета
   */
  async cancelInvoice(invoiceId: number): Promise<void> {
    await this.request(`/online/api/invoice/${invoiceId}/cancel`, {
      method: 'PUT',
      auth: this.authHeaderWithSubUser,
    });
  }

  /**
   * Получение списка счетов с фильтрами
   * 
   * @param filters - параметры фильтрации
   * @returns список счетов
   */
  async getInvoiceList(filters?: InvoiceListFilters): Promise<InvoiceListResponse> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.policyId) params.set('policyId', String(filters.policyId));
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));

    const query = params.toString();
    return this.request(`/online/api/invoice${query ? '?' + query : ''}`);
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
  // Этап 11: Загрузка документов
  // ═══════════════════════════════════════════════════════════

  /**
   * Загрузка документа к заявлению
   * 
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/documentupload
   * 
   * @param policyId - ID заявления
   * @param file - файл для загрузки
   * @param docType - тип документа
   * @param fileName - имя файла (опционально)
   * @returns данные загруженного документа
   */
  async uploadDocument(
    policyId: number,
    file: Blob | File,
    docType: DocumentType,
    fileName?: string
  ): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file, fileName || file.name);
    formData.append('docType', docType);

    const response = await fetch(
      `${this.baseUrl}/online/api/eosago/${policyId}/documents`,
      {
        method: 'POST',
        headers: { Authorization: this.authHeader },
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new SoglasieError(
        error.error || `Failed to upload document: ${response.status}`,
        response.status,
        error
      );
    }

    return response.json();
  }

  /**
   * Получение документа по ID
   * 
   * @param documentId - ID документа
   * @returns данные документа
   */
  async getDocument(documentId: number): Promise<DocumentInfo> {
    return this.request(`/online/api/documents/${documentId}`);
  }

  /**
   * Получение списка документов заявления
   * 
   * @param policyId - ID заявления
   * @returns список документов
   */
  async getDocuments(policyId: number): Promise<DocumentInfo[]> {
    return this.request(`/online/api/eosago/${policyId}/documents`);
  }

  /**
   * Удаление документа
   * 
   * @param policyId - ID заявления
   * @param documentId - ID документа
   */
  async deleteDocument(policyId: number, documentId: number): Promise<void> {
    await this.request(`/online/api/documents/${documentId}`, {
      method: 'DELETE',
    });
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

/** Статусы CCM (расчет премии) */
export const CcmStatus = {
  OK: 0,
  ERROR: 1,
  PROCESSING: 2,
} as const;

/**
 * Создание запроса расчета премии CCM
 * 
 * @param options - параметры для создания запроса
 * @returns готовый CcmCalcRequest
 */
export function createCcmRequest(options: {
  subUser: string;
  dateBeg: string;
  dateEnd: string;
  documentType: string;
  driverLimit: 0 | 1;
  kbmRequestId?: string;
  vin?: string;
  modelCode?: number;
  power?: number;
  periodUse?: number;
  stream?: number;
  isTrailer?: 0 | 1;
  prolongation?: 0 | 1;
  termInsurance?: number;
  territory?: string;
  ownerType?: 1001 | 1002 | 1003 | 1004;
  vehicleType?: 1 | 2 | 3 | 4 | 5;
  isForeign?: 0 | 1;
  kbm?: number;
  additionalParams?: { brief: string; val: string }[];
}): CcmCalcRequest {
  return {
    contract: {
      subuser: options.subUser,
      datebeg: options.dateBeg,
      dateend: options.dateEnd,
      ВидДокумента: options.documentType,
      ДопускБезОграничений: options.driverLimit,
      ИДРасчетаКБМ: options.kbmRequestId,
      VIN: options.vin,
      МодельТС: options.modelCode,
      Мощность: options.power,
      ПериодИсп: options.periodUse,
      ПотокВвода: options.stream || 24,
      ПризнСтрахПрицеп: options.isTrailer || 0,
      Пролонгация: options.prolongation,
      СрокСтрах: options.termInsurance,
      ТерриторияИспользования: options.territory,
      ТипСобственникаТС: options.ownerType,
      ТипТСОСАГО: options.vehicleType,
      ТСИностранное: options.isForeign,
      Кбм: options.kbm,
    },
    params: options.additionalParams,
  };
}

/**
 * Фабрика создания клиента
 */
export function createClient(config: SoglasieConfig): SoglasieClient {
  return new SoglasieClient(config);
}