/**
 * SK Soglasie E-OSAGO Types
 * 
 * TypeScript типы для интеграции с API Е-ОСАГО СК Согласие
 */

import type { Environment } from './client';

// ═══════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════

/** Статусы заявления */
export type ApplicationStatus =
  | 'DRAFT'
  | 'RSA_CHECK'
  | 'RSA_CHECK_OK'
  | 'RSA_CHECK_FAIL'
  | 'SK_CHECK'
  | 'SK_CHECK_START'
  | 'SK_CHECK_OK'
  | 'SK_CHECK_FAIL'
  | 'PAY_COMPLETE'
  | 'RSA_SIGN'
  | 'RSA_SIGNED'
  | 'RSA_SIGN_FAIL'
  | 'SIGNED'
  | 'SUSPENDED'
  | 'CANCELED'
  | 'OTHER_SK';

/** Тип собственника ТС */
export type OwnerType = 1001 | 1002 | 1003 | 1004;

/** Тип ТС для ОСАГО */
export type VehicleType = 1 | 2 | 3 | 4 | 5 | 6;

/** Цель использования ТС */
export type GoalUse =
  | 'Personal'
  | 'RidingTraining'
  | 'Collection'
  | 'Ambulance'
  | 'Taxi'
  | 'TrafficAndSpecial'
  | 'Other'
  | 'RegularPassengers'
  | 'DangerousAndFlammable'
  | 'Rent'
  | 'EmergencyAndMunicipal';

// ═══════════════════════════════════════════════════════════
// КБМ Request/Response
// ═══════════════════════════════════════════════════════════

/** Запрос проверки КБМ */
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
  persons?: KbmDriver[];
  organization?: KbmOrganization;
}

/** Водитель для КБМ */
export interface KbmDriver {
  driverLicense: KbmDocument;
  altDriverLicense?: KbmDocument;
}

/** Организация для КБМ (ЮЛ) */
export interface KbmOrganization {
  residentIndicator: boolean;
  inn: string;
  fullName: string;
  byTender?: boolean;
}

/** Документ для КБМ */
export interface KbmDocument {
  countryCode: string;
  docType: number;
  docSeries?: string;
  docNumber: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  birthDate: string;
}

/** Ответ проверки КБМ */
export interface KbmResponse {
  requestId: string;
  responseId?: string;
  statusCode: number;
  lastModified?: string;
  processingResult?: {
    calculatedKbmValue: number;
    calculateKbmResponses: KbmResultPerson[];
  };
  errors?: KbmError[];
}

/** Результат КБМ для одного лица */
export interface KbmResultPerson {
  partyRequestId: string;
  kbm: number;
  originalKbm: number;
  accidentCount: number;
}

/** Ошибка КБМ */
export interface KbmError {
  code: string;
  description: string;
  isCritical: boolean;
}

// ═══════════════════════════════════════════════════════════
// Заявление Е-ОСАГО
// ═══════════════════════════════════════════════════════════

/** Запрос загрузки заявления */
export interface EosagoApplication {
  DeclarationDate: string;
  BeginDate: string;
  EndDate: string;
  /** Предыдущий полис СК Согласие */
  PrevPolicy?: PrevPolicy;
  /** Полис другой СК */
  PrevPolicyOther?: PrevPolicyOther;
  Period1Begin: string;
  Period1End: string;
  /** ТС следует к месту регистрации */
  IsTransCar: boolean;
  /** Иностранное ТС */
  IsForeignCar?: boolean;
  /** Страхование прицепа */
  IsInsureTrailer?: boolean;
  CarInfo: CarInfo;
  Insurer: Person;
  CarOwner: Person;
  Drivers?: Drivers;
  /** Индивидуальный код продавца */
  IKP1: string;
  /** Наличная форма оплаты */
  CashPaymentOption?: boolean;
  /** Платеж от страхователя */
  InsurerPay?: boolean;
  /** Субагент */
  SubagentID?: string;
  /** Инвойс */
  DopFieldCalc?: string;
  /** Особые отметки */
  SpecialConditions?: string;
}

/** Предыдущий полис */
export interface PrevPolicy {
  Serial: string;
  Number: string;
}

/** Полис другой СК */
export interface PrevPolicyOther {
  SerialOther: string;
  NumberOther: string;
}

/** Транспортное средство */
export interface CarInfo {
  /** VIN (17 символов) */
  VIN?: string;
  /** Номер кузова */
  BodyNumber?: string;
  /** Номер шасси */
  ChassisNumber?: string;
  /** Госномер */
  LicensePlate?: string;
  /** Код модели из справочника */
  MarkModelCarCode: number;
  /** Марка по ПТС */
  MarkPTS: string;
  /** Модель по ПТС */
  ModelPTS: string;
  /** Год выпуска */
  YearIssue: number;
  /** Документ ТС */
  DocumentCar?: VehicleDocument;
  /** СТС (если несколько документов) */
  CertificateCar?: VehicleDocument;
  /** Диагностическая карта */
  TicketCar?: VehicleDocument;
  /** Год следующего ТО */
  TicketCarYear?: number;
  /** Месяц следующего ТО */
  TicketCarMonth?: number;
  /** Дата диагностической карты */
  TicketDiagnosticDate?: string;
  /** Мощность двигателя */
  EngCap: number;
  /** Максимальная масса (для грузовых) */
  MaxMass?: number;
  /** Цель использования */
  GoalUse: string;
  /** ТС в залоге */
  IsPledge?: boolean;
  /** Количество пассажирских мест */
  PasQuant?: number;
  /** Сдается в аренду */
  Rented: boolean;
}

/** Документ ТС */
export interface VehicleDocument {
  /** Код РСА */
  TypeRSA?: string;
  /** Код справочника */
  Type?: number;
  /** Серия */
  Serial?: string;
  /** Номер */
  Number: string;
  /** Дата выдачи */
  Date: string;
  /** Основной документ */
  IsPrimary?: boolean;
}

/** Страхователь/Собственник */
export interface Person {
  Phisical?: PhisicalPerson;
  Juridical?: JuridicalPerson;
}

/** Физическое лицо */
export interface PhisicalPerson {
  Resident: boolean;
  /** ИП */
  PBOUL?: boolean;
  Surname: string;
  Name: string;
  Patronymic?: string;
  BirthDate: string;
  Sex: string;
  INN?: string;
  Snils?: string;
  Documents: Documents;
  Addresses?: Addresses;
  Email?: string;
  PhoneMobile?: string;
}

/** Юридическое лицо */
export interface JuridicalPerson {
  Resident?: boolean;
  FullName: string;
  BriefName?: string;
  OPF: string;
  INN: string;
  Documents: Documents;
  Addresses?: Addresses;
  Tel?: string;
  Fax?: string;
  Email?: string;
}

/** Список документов */
export interface Documents {
  Document: Document[];
}

/** Документ */
export interface Document {
  TypeRSA?: string;
  Type?: number;
  Serial?: string;
  Number: string;
  Date?: string;
  Exit?: string;
  IsPrimary?: boolean;
}

/** Список адресов */
export interface Addresses {
  Address?: Address[];
}

/** Адрес */
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

/** Водители */
export interface Drivers {
  Driver: Driver[];
}

/** Водитель */
export interface Driver {
  Face: PersonFace;
  DrivingExpDate: string;
}

/** Физ.лицо (для водителя) */
export interface PersonFace {
  Resident: boolean;
  Surname: string;
  Name: string;
  Patronymic?: string;
  BirthDate: string;
  Sex: string;
  INN?: string;
  Snils?: string;
  Documents: Documents;
  Addresses?: Addresses;
  PhisicalOld?: OldPersonInfo;
}

/** Старые данные */
export interface OldPersonInfo {
  Surname?: string;
  Name?: string;
  Patronymic?: string;
  Document?: Document;
}

// ═══════════════════════════════════════════════════════════
// Response Types
// ═══════════════════════════════════════════════════════════

/** Ответ загрузки заявления */
export interface ApplicationResponse {
  policyId: number;
  packageId: number;
}

/** Ответ статуса */
export interface EosagoStatusResponse {
  date: string;
  policyId: number;
  status: string;
  lastError?: string;
  policy?: PolicyInfo;
  rsacheck?: RsaCheck[];
  confirmed?: boolean;
  contractid?: number;
}

/** Информация о полисе */
export interface PolicyInfo {
  status: string;
  statusName: string;
  policyserial?: string;
  policyno?: string;
  premium: number;
  surcharge: number;
  redirect: string;
  delivery: boolean;
  drivers: DriverInfo[];
  coeffs: Coefficient[];
  akv?: number;
  overlimit?: boolean;
}

/** Информация о водителе */
export interface DriverInfo {
  name: string;
  kbm: number;
  kbmClass: string;
}

/** Коэффициент */
export interface Coefficient {
  brief: string;
  name: string;
  value: number;
}

/** Проверка РСА */
export interface RsaCheck {
  type: string;
  status: string;
  index?: number;
  rsaid?: string;
  found?: boolean;
  checked?: boolean;
  result: string;
  updated: string;
}

/** Ответ ссылки на оплату */
export interface PayLinkResponse {
  policyId: number;
  PayDate: string;
  PayLink: string;
}

/** Запрос подтверждения оплаты */
export interface AcquiringRequest {
  PaySum: number;
  TransactionID: string;
  OrderId?: string;
}

// ═══════════════════════════════════════════════════════════
// Catalog Types
// ═══════════════════════════════════════════════════════════

/** Ответ справочника */
export interface CatalogResponse {
  id: number;
  name: string;
}

/** Информация о модели */
export interface ModelInfo {
  id: number;
  name: string;
  cat?: string;
  type?: number;
}

/** Ответ типов ТС */
export interface ModelTypesResponse extends Array<CatalogResponse> {}

// ═══════════════════════════════════════════════════════════
// Utility Types
// ═══════════════════════════════════════════════════════════

/** Конфигурация */
export interface Config {
  login: string;
  password: string;
  subUser?: string;
  subUserPassword?: string;
  environment: Environment;
}

/** Результат оформления */
export interface WorkflowResult {
  policyId: number;
  status: string;
  contractId?: number;
  policySerial?: string;
  policyNumber?: string;
  premium: number;
  coefficients: Coefficient[];
  drivers: DriverInfo[];
}

/** Параметры workflow */
export interface WorkflowOptions {
  autoGetPayLink?: boolean;
  autoConfirmPayment?: boolean;
  statusIntervalMs?: number;
  maxStatusChecks?: number;
}

// ═══════════════════════════════════════════════════════════
// CCM (Расчет премии)
// ═══════════════════════════════════════════════════════════

/** Параметры договора для расчета CCM */
export interface CcmContract {
  subuser: string;
  datebeg: string;
  dateend: string;
  ВидДокумента: string;
  ДопускБезОграничений: 0 | 1;
  ИДРасчетаКБМ?: string;
  VIN?: string;
  МодельТС?: number;
  Мощность?: number;
  ПериодИсп?: number;
  ПотокВвода?: number;
  ПризнСтрахПрицеп?: 0 | 1;
  Пролонгация?: 0 | 1;
  СрокСтрах?: number;
  ТерриторияИспользования?: string;
  ТипСобственникаТС?: 1001 | 1002 | 1003 | 1004;
  ТипТСОСАГО?: 1 | 2 | 3 | 4 | 5;
  ТСИностранное?: 0 | 1;
  Кбм?: number;
}

/** Параметр для CCM */
export interface CcmParam {
  brief: string;
  val: string;
}

/** Коэффициент для CCM */
export interface CcmCoeff {
  brief: string;
  name: string;
  value: number;
}

/** Запрос расчета премии CCM */
export interface CcmCalcRequest {
  contract: CcmContract;
  params?: CcmParam[];
}

/** Результат расчета CCM */
export interface CcmCalcResult {
  result: number;
  premium: number;
  coeffs: CcmCoeff[];
  contractId?: number;
}

/** Ответ расчета премии CCM */
export interface CcmCalcResponse {
  requestId: string;
  responseId?: string;
  statusCode: number;
  result?: CcmCalcResult;
  errors?: CcmError[];
}

/** Ошибка CCM */
export interface CcmError {
  code: string;
  description: string;
  isCritical: boolean;
}

// ═══════════════════════════════════════════════════════════
// Счета для ЮЛ (Этап 9)
// ═══════════════════════════════════════════════════════════

/** Статус счета */
export type InvoiceStatus = 'NEW' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELED';

/** Запрос на создание счета для ЮЛ */
export interface InvoiceRequest {
  /** ID заявления */
  policyId: number;
  /** Сумма */
  amount: number;
  /** ИНН плательщика */
  inn: string;
  /** Наименование плательщика */
  name: string;
  /** Email для отправки счета */
  email: string;
  /** Телефон */
  phone: string;
}

/** Ответ на создание/получение счета */
export interface InvoiceResponse {
  /** ID счета */
  invoiceId: number;
  /** Номер счета */
  number: string;
  /** Статус */
  status: InvoiceStatus;
  /** Ссылка на оплату */
  link?: string;
}

/** Параметры фильтра для списка счетов */
export interface InvoiceListFilters {
  /** Фильтр по статусу */
  status?: InvoiceStatus;
  /** ID заявления */
  policyId?: number;
  /** Дата создания с (ISO) */
  dateFrom?: string;
  /** Дата создания по (ISO) */
  dateTo?: string;
  /** Лимит записей */
  limit?: number;
  /** Смещение */
  offset?: number;
}

/** Ответ списка счетов */
export interface InvoiceListResponse {
  items: InvoiceResponse[];
  total: number;
}

// ═══════════════════════════════════════════════════════════
// Document Type Constants
// ═══════════════════════════════════════════════════════════

/** Типы документов (TypeRSA) */
export const DocumentType = {
  PASSPORT_RF: 12,
  DRIVER_LICENSE_RF: 20,
  DRIVER_LICENSE_FOREIGN: 22,
  STS: 31,
  PTS: 30,
  DIAGNOSTIC_CARD: 53,
} as const;

/** Типы документов ТС (TypeRSA) */
export const VehicleDocumentType = {
  TECH_PASSPORT: 33,
  PTS: 30,
  STS: 31,
  TECH_TALON: 34,
  FOREIGN_PTS: 36,
  FOREIGN_STS: 38,
  DIAGNOSTIC_CARD: 53,
  E_PTS: 41,
} as const;

/** Типы ТС */
export const VehicleTypeCode = {
  MOTORCYCLE: 1,
  CAR: 2,
  TRUCK: 3,
  BUS: 4,
  TRACTOR: 5,
} as const;

/** Типы собственника */
export const OwnerTypeCode = {
  INDIVIDUAL: 1001,
  LEGAL: 1002,
  IP: 1003,
  PBOUL: 1004,
} as const;

/** Цели использования */
export const GoalUseCode = {
  PERSONAL: 'Personal',
  RIDING_TRAINING: 'RidingTraining',
  TAXI: 'Taxi',
  RENT: 'Rent',
  REGULAR_PASSENGERS: 'RegularPassengers',
  OTHER: 'Other',
} as const;

/** Константы CCM (Е-ОСАГО) */
export const CcmConstants = {
  PRODUCT: 'ОСАГО',
  DOC_TYPE: 'ДогСтрахЕОСАГО',
  DRIVER_LIMITED: 0,
  DRIVER_UNLIMITED: 1,
  STREAM_OLD: 24,
} as const;

/** Статусы счета */
export const InvoiceStatusCode = {
  NEW: 'NEW',
  SENT: 'SENT',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELED: 'CANCELED',
} as const;

// ═══════════════════════════════════════════════════════════
// Этап 11: Загрузка документов
// ═══════════════════════════════════════════════════════════

/** Типы документов для загрузки */
export type DocumentType =
  | 'passport'
  | 'driver_license'
  | 'sts'
  | 'pts'
  | 'diagnostic_card'
  | 'other';

/** Запрос на загрузку документа */
export interface DocumentUploadRequest {
  /** Имя файла */
  fileName: string;
  /** Тип документа */
  docType: DocumentType;
  /** Описание */
  description?: string;
}

/** Ответ загрузки документа */
export interface DocumentUploadResponse {
  /** ID документа */
  documentId: number;
  /** Ссылка на документ */
  url: string;
}

/** Информация о документе */
export interface DocumentInfo {
  documentId: number;
  docType: DocumentType;
  fileName: string;
  description?: string;
  url: string;
  createdAt: string;
}