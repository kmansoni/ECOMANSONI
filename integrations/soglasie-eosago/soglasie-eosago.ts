/**
 * SK Soglasie E-OSAGO API Client
 * 
 * Интеграция с Страховой Компанией "Согласие" для оформления электронного полиса ОСАГО
 * 
 * Production: https://b2b.soglasie.ru
 * Test: https://b2b.soglasie.ru/daily
 * Test (new partners): https://b2b.soglasie.ru/upload-test
 */

export interface KbmDriverRequest {
  driverLicense: {
    countryCode: string;
    docType: number;
    docSeries?: string;
    docNumber: string;
    lastName: string;
    firstName: string;
    middleName?: string;
    birthDate: string;
  };
  altDriverLicense?: {
    countryCode: string;
    docType: number;
    docSeries?: string;
    docNumber: string;
    lastName: string;
    firstName: string;
    middleName?: string;
    birthDate: string;
  };
}

export interface KbmRequest {
  vehicleId?: {
    vin?: string;
    licensePlate?: string;
    bodyNumber?: string;
    chassisNumber?: string;
  };
  driverLimitIndicator: boolean;
  contractEffectiveDate: string;
  contractClosingDate: string;
  persons?: KbmDriverRequest[];
  organization?: {
    residentIndicator: boolean;
    inn: string;
    fullName: string;
    byTender?: boolean;
  };
}

export interface KbmResponse {
  requestId: string;
  responseId?: string;
  statusCode: number;
  processingResult?: {
    calculatedKbmValue: number;
    calculateKbmResponses: Array<{
      partyRequestId: string;
      kbm: number;
      originalKbm: number;
    }>;
  };
  errors?: Array<{
    code: string;
    description: string;
    isCritical: boolean;
  }>;
}

export interface EosagoApplicationRequest {
  DeclarationDate: string;
  BeginDate: string;
  EndDate: string;
  PrevPolicy?: {
    Serial: string;
    Number: string;
  };
  PrevPolicyOther?: {
    SerialOther: string;
    NumberOther: string;
  };
  Period1Begin: string;
  Period1End: string;
  IsTransCar: boolean;
  IsForeignCar?: boolean;
  IsInsureTrailer?: boolean;
  CarInfo: CarInfo;
  Insurer: Person;
  CarOwner: Person;
  Drivers?: {
    Driver: Array<{
      Face: PersonFace;
      DrivingExpDate: string;
    }>;
  };
  IKP1: string;
  CashPaymentOption?: boolean;
  InsurerPay?: boolean;
  SubagentID?: string;
  DopFieldCalc?: string;
  SpecialConditions?: string;
}

export interface CarInfo {
  VIN?: string;
  BodyNumber?: string;
  ChassisNumber?: string;
  LicensePlate?: string;
  MarkModelCarCode: number;
  MarkPTS: string;
  ModelPTS: string;
  YearIssue: number;
  DocumentCar?: VehicleDocument;
  CertificateCar?: VehicleDocument;
  TicketCar?: VehicleDocument;
  TicketCarYear?: number;
  TicketCarMonth?: number;
  TicketDiagnosticDate?: string;
  EngCap: number;
  MaxMass?: number;
  GoalUse: string;
  IsPledge?: boolean;
  PasQuant?: number;
  Rented: boolean;
}

export interface VehicleDocument {
  TypeRSA?: string;
  Type?: number;
  Serial?: string;
  Number: string;
  Date: string;
  IsPrimary?: boolean;
}

export interface Person {
  Phisical?: PhisicalPerson;
  Juridical?: JuridicalPerson;
}

export interface PhisicalPerson {
  Resident: boolean;
  PBOUL?: boolean;
  Surname: string;
  Name: string;
  Patronymic?: string;
  BirthDate: string;
  Sex: string;
  INN?: string;
  Snils?: string;
  Documents?: {
    Document: Document[];
  };
  Addresses?: {
    Address?: Address[];
  };
  Email?: string;
  PhoneMobile?: string;
}

export interface JuridicalPerson {
  Resident?: boolean;
  FullName: string;
  BriefName?: string;
  OPF: string;
  INN: string;
  Documents?: {
    Document: Document[];
  };
  Addresses?: {
    Address?: Address[];
  };
  Tel?: string;
  Fax?: string;
  Email?: string;
}

export interface PersonFace {
  Resident: boolean;
  Surname: string;
  Name: string;
  Patronymic?: string;
  BirthDate: string;
  Sex: string;
  INN?: string;
  Snils?: string;
  Documents: {
    Document: Document[];
  };
  Addresses?: {
    Address?: Address[];
  };
  PhisicalOld?: {
    Surname?: string;
    Name?: string;
    Patronymic?: string;
    Document?: Document;
  };
}

export interface Document {
  TypeRSA?: string;
  Type?: number;
  Serial?: string;
  Number: string;
  Date?: string;
  Exit?: string;
  IsPrimary?: boolean;
}

export interface Address {
  Type: string;
  Country: string;
  AddressCode: string;
  Street?: string;
  Hous?: string;
  Housing?: string;
  Structure?: string;
  Flat?: string;
  Index?: string;
  AddressString?: string;
  IsPrimary?: boolean;
  FiasGuid?: string;
}

export interface ApplicationResponse {
  policyId: number;
  packageId: number;
}

export interface EosagoStatusRequest {
  akv?: boolean;
  overlimit?: boolean;
}

export interface EosagoStatusResponse {
  date: string;
  policyId: number;
  status: string;
  lastError?: string;
  policy?: {
    status: string;
    statusName: string;
    policyserial?: string;
    policyno?: string;
    premium: number;
    surcharge: number;
    redirect: string;
    delivery: boolean;
    drivers: Array<{
      name: string;
      kbm: number;
      kbmClass: string;
    }>;
    coeffs: Array<{
      brief: string;
      name: string;
      value: number;
    }>;
    akv?: number;
    overlimit?: boolean;
  };
  rsacheck?: Array<{
    type: string;
    status: string;
    index?: number;
    rsaid?: string;
    found?: boolean;
    checked?: boolean;
    result: string;
    updated: string;
  }>;
  confirmed?: boolean;
  contractid?: number;
}

export interface PayLinkResponse {
  policyId: number;
  PayDate: string;
  PayLink: string;
}

export interface AcquiringRequest {
  PaySum: number;
  TransactionID: string;
  OrderId?: string;
}

export type Environment = 'production' | 'test' | 'upload-test';

export interface SoglasieEosagoConfig {
  login: string;
  password: string;
  subUser?: string;
  subUserPassword?: string;
  environment: Environment;
}

export class SoglasieEosagoClient {
  private baseUrl: string;
  private authHeader: string;
  private authHeaderWithSubUser: string;

  constructor(private config: SoglasieEosagoConfig) {
    const envUrls = {
      production: 'https://b2b.soglasie.ru',
      test: 'https://b2b.soglasie.ru/daily',
      'upload-test': 'https://b2b.soglasie.ru/upload-test',
    };
    this.baseUrl = envUrls[config.environment];
    this.authHeader = this.createAuthHeader(config.login, config.password);
    this.authHeaderWithSubUser = this.createAuthHeader(
      config.login,
      config.subUser || config.password,
      config.subUserPassword || config.password
    );
  }

  private createAuthHeader(login: string, password: string): string {
    return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }

  /**
   * Этап 1: Проверка КБМ 2.0
   */
  async checkKbm(request: KbmRequest): Promise<KbmResponse> {
    const response = await fetch(`${this.baseUrl}/rsaproxy/api/osago/v1/kbm`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errors?.[0]?.description || 'KBM check failed');
    }

    return response.json();
  }

  /**
   * Этап 3: Загрузка заявления ЕОСАГО
   */
  async loadApplication(application: EosagoApplicationRequest): Promise<ApplicationResponse> {
    const response = await fetch(`${this.baseUrl}/online/api/eosago`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeaderWithSubUser,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(application),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.errorInfo || 'Failed to load application');
    }

    return response.json();
  }

  /**
   * Этап 3: Загрузка заявления в черновом режиме (без проверки РСА)
   */
  async loadApplicationDraft(application: EosagoApplicationRequest): Promise<ApplicationResponse> {
    const response = await fetch(`${this.baseUrl}/online/api/eosago?test=true`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeaderWithSubUser,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(application),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.errorInfo || 'Failed to load draft application');
    }

    return response.json();
  }

  /**
   * Этап 4: Проверка статуса заявления
   */
  async getApplicationStatus(policyId: number, params?: EosagoStatusRequest): Promise<EosagoStatusResponse> {
    const url = new URL(`${this.baseUrl}/online/api/eosago/${policyId}/status`);
    if (params?.akv) url.searchParams.set('akv', 'true');
    if (params?.overlimit) url.searchParams.set('overlimit', 'true');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get status for policy ${policyId}`);
    }

    return response.json();
  }

  /**
   * Этап 7: Получение ссылки на оплату
   */
  async getPayLink(policyId: number): Promise<PayLinkResponse> {
    const response = await fetch(`${this.baseUrl}/online/api/eosago/${policyId}/paylink`, {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get pay link for policy ${policyId}`);
    }

    return response.json();
  }

  /**
   * Этап 8: Запись успешной оплаты
   */
  async confirmPayment(policyId: number, acquiring: AcquiringRequest): Promise<void> {
    const response = await fetch(`${this.baseUrl}/online/api/eosago/${policyId}/acquiring`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeaderWithSubUser,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(acquiring),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to confirm payment');
    }
  }

  /**
   * Ожидание завершения обработки заявления
   */
  async waitForStatus(
    policyId: number,
    targetStatuses: string[],
    maxAttempts = 30,
    intervalMs = 3000
  ): Promise<EosagoStatusResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getApplicationStatus(policyId);
      
      if (targetStatuses.includes(status.policy?.status || status.status)) {
        return status;
      }

      if (status.status === 'ERROR') {
        throw new Error(status.lastError || 'Processing failed');
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Timeout waiting for status: ${targetStatuses.join(', ')}`);
  }
}

/**
 * Утилита для проверки статусов
 */
export const STATUS = {
  DRAFT: 'DRAFT',
  RSA_CHECK: 'RSA_CHECK',
  RSA_CHECK_FAIL: 'RSA_CHECK_FAIL',
  RSA_CHECK_OK: 'RSA_CHECK_OK',
  SK_CHECK: 'SK_CHECK',
  SK_CHECK_FAIL: 'SK_CHECK_FAIL',
  SK_CHECK_OK: 'SK_CHECK_OK',
  PAY_COMPLETE: 'PAY_COMPLETE',
  RSA_SIGN: 'RSA_SIGN',
  RSA_SIGNED: 'RSA_SIGNED',
  SIGNED: 'SIGNED',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
  OTHER_SK: 'OTHER_SK',
} as const;

export const FINAL_STATUSES = [STATUS.SIGNED, STATUS.SUSPENDED, STATUS.CANCELED, STATUS.OTHER_SK];

/**
 * Статусы готовности к оплате
 */
export const PAYABLE_STATUSES = [STATUS.RSA_CHECK_OK, STATUS.SK_CHECK_OK];

/**
 * Статусы ожидания
 */
export const PENDING_STATUSES = [
  STATUS.DRAFT,
  STATUS.RSA_CHECK,
  STATUS.SK_CHECK,
  STATUS.SK_CHECK_START,
  STATUS.PAY_COMPLETE,
  STATUS.RSA_SIGN,
  STATUS.RSA_SIGNED,
];