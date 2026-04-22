/**
 * API-клиент для СК "Согласие" (Е-ОСАГО)
 * 
 * Поддерживаемые операции:
 * - Расчёт премии (SOAP)
 * - Загрузка заявления
 * - Проверка статуса
 * - Оплата
 * - Скачивание полиса/заявления
 * - Пролонгация (GraphQL)
 * 
 * Авторизация:
 * - Basic Auth (base64(Login:SubUser:Password)) — основные операции
 * - Basic Auth (base64(Login:Password)) — для статуса
 * - GraphQL Token — для пролонгации
 */

import {
  SoglasieConfig,
  getDefaultSoglasieConfig,
  getSoglasieAuthHeader,
  getSoglasieStatusAuthHeader,
  isSoglasieConfigured,
} from "./soglasie-config";

// ============================================================================
// ТИПЫ ДАННЫХ
// ============================================================================

/** Ошибка API Согласия */
export interface SoglasieApiError {
  code: string;
  message: string;
  details?: unknown;
}

/** Статус заявки в СК Согласие */
export type SoglasieApplicationStatus =
  | "NEW"           // Новая заявка
  | "CALCULATED"   // Рассчитана
  | "SENT"         // Отправлена
  | "CHECKING"     // Проверяется
  | "APPROVED"     // Одобрена
  | "REJECTED"     // Отклонена
  | "PAID"         // Оплачена
  | "ISSUED"       // Выдан полис
  | "ERROR";       // Ошибка

/** Данные транспортного средства */
export interface SoglasieVehicle {
  brand: string;           // Марка
  model: string;           // Модель
  year: number;           // Год выпуска
  vin?: string;            // VIN (опционально)
  registrationPlate?: string; // Регистрационный номер
  category: string;       // Категория ТС (B, BE, C, CE и т.д.)
  power?: number;          // Мощность двигателя (л.с.)
  purpose?: string;       // Цель использования
  hasTrailer?: boolean;   // Наличие прицепа
}

/** Данные страхователя */
export interface SoglasieInsurer {
  lastName: string;
  firstName: string;
  middleName?: string;
  birthDate: string;       // ДД.ММ.ГГГГ
  passportSeries: string;
  passportNumber: string;
  passportIssueDate: string;
  passportIssueOrg?: string;
  address: string;
  phone: string;
  email: string;
  inn?: string;            // Для юрлиц
}

/** Данные собственника */
export interface SoglasieOwner {
  isSameAsInsurer: boolean;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  birthDate?: string;
  passportSeries?: string;
  passportNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  companyName?: string;    // Для юрлиц
  inn?: string;
}

/** Данные водителей */
export interface SoglasieDriver {
  lastName: string;
  firstName: string;
  middleName?: string;
  birthDate: string;
  licenseSeries: string;
  licenseNumber: string;
  licenseIssueDate: string;
  experienceStartDate: string;  // Дата начала стажа
  isMainDriver: boolean;
}

/** Параметры расчёта премии */
export interface SoglasieCalculateRequest {
  vehicle: SoglasieVehicle;
  insurer: SoglasieInsurer;
  owner: SoglasieOwner;
  drivers?: SoglasieDriver[];
  startDate: string;       // Дата начала действия ДД.ММ.ГГГГ
  period: number;         // Срок страхования (мес)
  type: "NEW" | "RENEWAL" | "TRANSFER";
  previousPolicyNumber?: string;   // Для продления
  previousCompany?: string;         // Предыдущая страховая
  useLimit?: boolean;       // Использовать лимиты
  forcedKbm?: number;       // Принудительный КБМ
}

/** Результат расчёта премии */
export interface SoglasieCalculateResponse {
  premium: number;                 // Итоговая премия
  basePremium: number;             // Базовая премия
  KBM: number;                     // КБМ
  KVS: number;                     // КВС
  KO: number;                      // КО
  KT: number;                      // КТ
  KS: number;                      // КС
  KM: number;                      // КМ
  KP: number;                      // КП
  KBMDriver?: number;              // КБМ водителя
  calculationId: string;           // ID расчёта
  expiresAt: string;                // Срок действия расчёта
}

/** Загрузка заявления - запрос */
export interface SoglasieApplicationRequest {
  calculationId: string;
  vehicle: SoglasieVehicle;
  insurer: SoglasieInsurer;
  owner: SoglasieOwner;
  drivers?: SoglasieDriver[];
  startDate: string;
  period: number;
  type: "NEW" | "RENEWAL" | "TRANSFER";
  previousPolicyNumber?: string;
  previousCompany?: string;
  callbackUrl?: string;      // URL для webhook
}

/** Загрузка заявления - ответ */
export interface SoglasieApplicationResponse {
  applicationId: string;     // ID заявления
  status: SoglasieApplicationStatus;
  createdAt: string;
  expiresAt: string;
}

/** Статус заявления - ответ */
export interface SoglasieStatusResponse {
  applicationId: string;
  status: SoglasieApplicationStatus;
  statusDescription?: string;
  paymentLink?: string;      // Ссылка на оплату
  policyNumber?: string;     // Номер полиса (если выдан)
  policyLink?: string;       // Ссылка на скачивание полиса
  applicationLink?: string;  // Ссылка на заявление
  errorCode?: string;
  errorMessage?: string;
}

/** Ссылка на оплату - ответ */
export interface SoglasiePayLinkResponse {
  paymentLink: string;
  expiresAt: string;
  amount: number;
}

/** Подтверждение оплаты - ответ */
export interface SoglasiePaymentConfirmResponse {
  success: boolean;
  policyNumber?: string;
  policyLink?: string;
  applicationLink?: string;
  status: SoglasieApplicationStatus;
  errorCode?: string;
  errorMessage?: string;
}

/** Токен пролонгации */
export interface SoglasieTokenResponse {
  token: string;
  expiresAt: string;
}

/** Данные для пролонгации */
export interface SoglasieProlongationResponse {
  vehicle: SoglasieVehicle;
  previousPolicy: {
    number: string;
    company: string;
    expireDate: string;
  };
  insurer: SoglasieInsurer;
  owner: SoglasieOwner;
  drivers?: SoglasieDriver[];
  calculatedPremium?: number;
  calculationId?: string;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/** Форматирование даты в формат ДД.ММ.ГГГГ */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** Создание заголовков для запроса */
function createHeaders(config: SoglasieConfig, useStatusAuth: boolean = false): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": useStatusAuth
      ? getSoglasieStatusAuthHeader(config)
      : getSoglasieAuthHeader(config),
  });
  return headers;
}

/** Обработка ответа API */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorDetails: unknown = null;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
      errorDetails = errorData;
    } catch {
      // Игнорируем ошибки парсинга
    }
    
    throw {
      code: `HTTP_${response.status}`,
      message: errorMessage,
      details: errorDetails,
    } as SoglasieApiError;
  }
  
  return response.json();
}

// ============================================================================
// SOAP ЗАПРОСЫ ДЛЯ РАСЧЁТА
// ============================================================================

/** Создание SOAP-запроса для расчёта премии */
function createCalculateSoapRequest(data: SoglasieCalculateRequest): string {
  const vehicle = data.vehicle;
  const insurer = data.insurer;
  const owner = data.owner;
  
  const driversXml = data.drivers?.map(driver => `
    <driver>
      <lastName>${driver.lastName}</lastName>
      <firstName>${driver.firstName}</firstName>
      <middleName>${driver.middleName || ""}</middleName>
      <birthDate>${driver.birthDate}</birthDate>
      <licenseSeries>${driver.licenseSeries}</licenseSeries>
      <licenseNumber>${driver.licenseNumber}</licenseNumber>
      <licenseIssueDate>${driver.licenseIssueDate}</licenseIssueDate>
      <experienceStartDate>${driver.experienceStartDate}</experienceStartDate>
      <isMainDriver>${driver.isMainDriver}</isMainDriver>
    </driver>
  `).join("") || "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:calc="http://calc.eosago.soglasie.ru/">
  <soap:Body>
    <calc:Calculate>
      <calc:request>
        <calc:vehicle>
          <calc:brand>${vehicle.brand}</calc:brand>
          <calc:model>${vehicle.model}</calc:model>
          <calc:year>${vehicle.year}</calc:year>
          <calc:vin>${vehicle.vin || ""}</calc:vin>
          <calc:registrationPlate>${vehicle.registrationPlate || ""}</calc:registrationPlate>
          <calc:category>${vehicle.category}</calc:category>
          <calc:power>${vehicle.power || ""}</calc:power>
          <calc:purpose>${vehicle.purpose || ""}</calc:purpose>
          <calc:hasTrailer>${vehicle.hasTrailer ? "true" : "false"}</calc:hasTrailer>
        </calc:vehicle>
        <calc:insurer>
          <calc:lastName>${insurer.lastName}</calc:lastName>
          <calc:firstName>${insurer.firstName}</calc:firstName>
          <calc:middleName>${insurer.middleName || ""}</calc:middleName>
          <calc:birthDate>${insurer.birthDate}</calc:birthDate>
          <calc:passportSeries>${insurer.passportSeries}</calc:passportSeries>
          <calc:passportNumber>${insurer.passportNumber}</calc:passportNumber>
          <calc:passportIssueDate>${insurer.passportIssueDate}</calc:passportIssueDate>
          <calc:passportIssueOrg>${insurer.passportIssueOrg || ""}</calc:passportIssueOrg>
          <calc:address>${insurer.address}</calc:address>
          <calc:phone>${insurer.phone}</calc:phone>
          <calc:email>${insurer.email}</calc:email>
          <calc:inn>${insurer.inn || ""}</calc:inn>
        </calc:insurer>
        <calc:owner>
          <calc:isSameAsInsurer>${owner.isSameAsInsurer}</calc:isSameAsInsurer>
          ${!owner.isSameAsInsurer ? `
          <calc:lastName>${owner.lastName || ""}</calc:lastName>
          <calc:firstName>${owner.firstName || ""}</calc:firstName>
          <calc:middleName>${owner.middleName || ""}</calc:middleName>
          <calc:birthDate>${owner.birthDate || ""}</calc:birthDate>
          <calc:passportSeries>${owner.passportSeries || ""}</calc:passportSeries>
          <calc:passportNumber>${owner.passportNumber || ""}</calc:passportNumber>
          <calc:address>${owner.address || ""}</calc:address>
          <calc:phone>${owner.phone || ""}</calc:phone>
          <calc:email>${owner.email || ""}</calc:email>
          <calc:companyName>${owner.companyName || ""}</calc:companyName>
          <calc:inn>${owner.inn || ""}</calc:inn>
          ` : ""}
        </calc:owner>
        <calc:drivers>${driversXml}</calc:drivers>
        <calc:startDate>${data.startDate}</calc:startDate>
        <calc:period>${data.period}</calc:period>
        <calc:type>${data.type}</calc:type>
        <calc:previousPolicyNumber>${data.previousPolicyNumber || ""}</calc:previousPolicyNumber>
        <calc:previousCompany>${data.previousCompany || ""}</calc:previousCompany>
        <calc:useLimit>${data.useLimit !== false ? "true" : "false"}</calc:useLimit>
        <calc:forcedKbm>${data.forcedKbm || ""}</calc:forcedKbm>
      </calc:request>
    </calc:Calculate>
  </soap:Body>
</soap:Envelope>`;
}

/** Обработка SOAP-ответа расчёта */
function parseCalculateSoapResponse(soapResponse: string): SoglasieCalculateResponse {
  // Парсим XML-ответ
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(soapResponse, "text/xml");
  
  // Ищем элементы с результатами
  const getTextContent = (tagName: string): string => {
    const elements = xmlDoc.getElementsByTagName(tagName);
    return elements.length > 0 ? elements[0].textContent || "" : "";
  };
  
  const getNumberContent = (tagName: string): number => {
    const value = getTextContent(tagName);
    return value ? parseFloat(value) : 0;
  };
  
  // Проверяем наличие ошибки
  const errorNode = xmlDoc.getElementsByTagName("faultstring");
  if (errorNode.length > 0) {
    throw {
      code: "SOAP_ERROR",
      message: errorNode[0].textContent || "Ошибка SOAP",
    } as SoglasieApiError;
  }
  
  return {
    premium: getNumberContent("premium"),
    basePremium: getNumberContent("basePremium"),
    KBM: getNumberContent("KBM"),
    KVS: getNumberContent("KVS"),
    KO: getNumberContent("KO"),
    KT: getNumberContent("KT"),
    KS: getNumberContent("KS"),
    KM: getNumberContent("KM"),
    KP: getNumberContent("KP"),
    KBMDriver: getNumberContent("KBMDriver") || undefined,
    calculationId: getTextContent("calculationId"),
    expiresAt: getTextContent("expiresAt"),
  };
}

// ============================================================================
// API КЛИЕНТ
// ============================================================================

/**
 * API-клиент для СК "Согласие" (Е-ОСАГО)
 */
export class SoglasieApiClient {
  private config: SoglasieConfig;
  
  constructor(config?: Partial<SoglasieConfig>) {
    this.config = {
      ...getDefaultSoglasieConfig(),
      ...config,
    };
  }
  
  /** Проверка конфигурации */
  checkConfigured(): void {
    if (!isSoglasieConfigured(this.config)) {
      throw {
        code: "NOT_CONFIGURED",
        message: "API Согласие не настроен. Укажите логин, субпользователя и пароль.",
      } as SoglasieApiError;
    }
  }
  
  /**
   * Расчёт премии (SOAP-запрос к CCM)
   * 
   * @param data - Параметры расчёта
   * @returns Результат расчёта премии
   */
  async calculatePremium(data: SoglasieCalculateRequest): Promise<SoglasieCalculateResponse> {
    this.checkConfigured();
    
    const soapRequest = createCalculateSoapRequest(data);
    
    const response = await fetch(this.config.calcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "Calculate",
        "Authorization": getSoglasieAuthHeader(this.config),
      },
      body: soapRequest,
    });
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorText = await response.text();
        // Пробуем извлечь сообщение об ошибке из SOAP
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(errorText, "text/xml");
        const faultstring = xmlDoc.getElementsByTagName("faultstring");
        if (faultstring.length > 0) {
          errorMessage = faultstring[0].textContent || errorMessage;
        }
      } catch (e) {
        console.warn('[SoglasieAPI] Failed to parse error XML:', e);
      }
      
      throw {
        code: "CALCULATE_ERROR",
        message: errorMessage,
      } as SoglasieApiError;
    }
    
    const soapResponse = await response.text();
    return parseCalculateSoapResponse(soapResponse);
  }
  
  /**
   * Загрузка заявления
   * 
   * @param data - Данные заявления
   * @returns ID заявления и статус
   */
  async loadApplication(data: SoglasieApplicationRequest): Promise<SoglasieApplicationResponse> {
    this.checkConfigured();
    
    const url = `${this.config.apiUrl}/application`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: createHeaders(this.config),
      body: JSON.stringify({
        calculationId: data.calculationId,
        vehicle: data.vehicle,
        insurer: data.insurer,
        owner: data.owner,
        drivers: data.drivers,
        startDate: data.startDate,
        period: data.period,
        type: data.type,
        previousPolicyNumber: data.previousPolicyNumber,
        previousCompany: data.previousCompany,
        callbackUrl: data.callbackUrl,
      }),
    });
    
    return handleResponse<SoglasieApplicationResponse>(response);
  }
  
  /**
   * Проверка статуса заявления
   * 
   * @param applicationId - ID заявления
   * @returns Статус заявления
   */
  async getStatus(applicationId: string): Promise<SoglasieStatusResponse> {
    this.checkConfigured();
    
    const url = `${this.config.apiUrl}/application/${applicationId}/status`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: createHeaders(this.config, true), // Используем упрощённую авторизацию
    });
    
    return handleResponse<SoglasieStatusResponse>(response);
  }
  
  /**
   * Получение ссылки на оплату
   * 
   * @param applicationId - ID заявления
   * @returns Ссылка на оплату
   */
  async getPayLink(applicationId: string): Promise<SoglasiePayLinkResponse> {
    this.checkConfigured();
    
    const url = `${this.config.apiUrl}/application/${applicationId}/payment/link`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: createHeaders(this.config),
    });
    
    return handleResponse<SoglasiePayLinkResponse>(response);
  }
  
  /**
   * Подтверждение оплаты
   * 
   * @param applicationId - ID заявления
   * @param paymentId - ID платежа (из платёжного провайдера)
   * @returns Результат подтверждения
   */
  async confirmPayment(applicationId: string, paymentId: string): Promise<SoglasiePaymentConfirmResponse> {
    this.checkConfigured();
    
    const url = `${this.config.apiUrl}/application/${applicationId}/payment/confirm`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: createHeaders(this.config),
      body: JSON.stringify({
        paymentId,
      }),
    });
    
    return handleResponse<SoglasiePaymentConfirmResponse>(response);
  }
  
  /**
   * Скачивание полиса (PDF)
   * 
   * @param applicationId - ID заявления
   * @returns Blob с PDF
   */
  async downloadPolicy(applicationId: string): Promise<Blob> {
    this.checkConfigured();
    
    const url = `${this.config.apiUrl}/application/${applicationId}/policy/pdf`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: createHeaders(this.config),
    });
    
    if (!response.ok) {
      throw {
        code: "DOWNLOAD_ERROR",
        message: `Не удалось скачать полис: HTTP ${response.status}`,
      } as SoglasieApiError;
    }
    
    return response.blob();
  }
  
  /**
   * Скачивание заявления (PDF)
   * 
   * @param applicationId - ID заявления
   * @returns Blob с PDF
   */
  async downloadApplication(applicationId: string): Promise<Blob> {
    this.checkConfigured();
    
    const url = `${this.config.apiUrl}/application/${applicationId}/application/pdf`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: createHeaders(this.config),
    });
    
    if (!response.ok) {
      throw {
        code: "DOWNLOAD_ERROR",
        message: `Не удалось скачать заявление: HTTP ${response.status}`,
      } as SoglasieApiError;
    }
    
    return response.blob();
  }
  
  /**
   * Получение токена для пролонгации (GraphQL)
   * 
   * @param login - Логин партнёра
   * @param password - Пароль партнёра
   * @returns Токен (действителен 8 часов)
   */
  async getProlongationToken(login: string, password: string): Promise<SoglasieTokenResponse> {
    const graphqlQuery = {
      query: `
        mutation loginTechAccount($login: String!, $pass: String!) {
          loginTechAccount(login: $login, pass: $pass) {
            token
            expiresAt
          }
        }
      `,
      variables: {
        login,
        pass: password,
      },
    };
    
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(graphqlQuery),
    });
    
    if (!response.ok) {
      throw {
        code: "TOKEN_ERROR",
        message: `Не удалось получить токен пролонгации: HTTP ${response.status}`,
      } as SoglasieApiError;
    }
    
    const result = await response.json();
    
    if (result.errors) {
      throw {
        code: "GRAPHQL_ERROR",
        message: result.errors[0]?.message || "Ошибка GraphQL",
      } as SoglasieApiError;
    }
    
    return result.data.loginTechAccount;
  }
  
  /**
   * Получение данных для пролонгации
   * 
   * @param token - Токен пролонгации
   * @param policyNumber - Номер текущего полиса
   * @returns Данные для пролонгации
   */
  async prolongation(token: string, policyNumber: string): Promise<SoglasieProlongationResponse> {
    const graphqlQuery = {
      query: `
        query getProlongationData($policyNumber: String!) {
          prolongation(policyNumber: $policyNumber) {
            vehicle {
              brand
              model
              year
              vin
              registrationPlate
              category
              power
              purpose
            }
            previousPolicy {
              number
              company
              expireDate
            }
            insurer {
              lastName
              firstName
              middleName
              birthDate
              passportSeries
              passportNumber
              phone
              email
            }
            owner {
              isSameAsInsurer
              lastName
              firstName
              middleName
              birthDate
              phone
              email
              companyName
            }
            drivers {
              lastName
              firstName
              middleName
              birthDate
              licenseSeries
              licenseNumber
              isMainDriver
            }
            calculatedPremium
            calculationId
          }
        }
      `,
      variables: {
        policyNumber,
      },
    };
    
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(graphqlQuery),
    });
    
    if (!response.ok) {
      throw {
        code: "PROLONGATION_ERROR",
        message: `Не удалось получить данные пролонгации: HTTP ${response.status}`,
      } as SoglasieApiError;
    }
    
    const result = await response.json();
    
    if (result.errors) {
      throw {
        code: "GRAPHQL_ERROR",
        message: result.errors[0]?.message || "Ошибка GraphQL",
      } as SoglasieApiError;
    }
    
    return result.data.prolongation;
  }
  
  /**
   * Создание заявки на пролонгацию
   * 
   * @param token - Токен пролонгации
   * @param calculationId - ID расчёта
   * @param startDate - Дата начала
   * @param period - Период страхования
   * @returns Заявка на пролонгацию
   */
  async createProlongationApplication(
    token: string,
    calculationId: string,
    startDate: string,
    period: number
  ): Promise<SoglasieApplicationResponse> {
    const graphqlQuery = {
      query: `
        mutation createProlongationApplication(
          $calculationId: String!
          $startDate: String!
          $period: Int!
        ) {
          createProlongationApplication(
            calculationId: $calculationId
            startDate: $startDate
            period: $period
          ) {
            applicationId
            status
            createdAt
            expiresAt
          }
        }
      `,
      variables: {
        calculationId,
        startDate,
        period,
      },
    };
    
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(graphqlQuery),
    });
    
    if (!response.ok) {
      throw {
        code: "PROLONGATION_APP_ERROR",
        message: `Не удалось создать заявку на пролонгацию: HTTP ${response.status}`,
      } as SoglasieApiError;
    }
    
    const result = await response.json();
    
    if (result.errors) {
      throw {
        code: "GRAPHQL_ERROR",
        message: result.errors[0]?.message || "Ошибка GraphQL",
      } as SoglasieApiError;
    }
    
    return result.data.createProlongationApplication;
  }
}

// ============================================================================
// ЭКСПОРТ ЭКЗЕМПЛЯРА КЛИЕНТА
// ============================================================================

/** Глобальный экземпляр API-клиента */
export const soglasieApi = new SoglasieApiClient();

/** Создание нового клиента с кастомной конфигурацией */
export function createSoglasieClient(config?: Partial<SoglasieConfig>): SoglasieApiClient {
  return new SoglasieApiClient(config);
}
