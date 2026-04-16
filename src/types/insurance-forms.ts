/**
 * Централизованные типы для форм страхования
 * @module insurance-forms
 */

import type { InsuranceCategory } from "./insurance";

// ============================================================================
// Общие типы для всех форм
// ============================================================================

/**
 * Персональные данные страхователя
 */
export interface PersonalFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  email: string;
  // Паспортные данные
  passportSeries: string;
  passportNumber: string;
  passportDate: string;
  passportIssued: string;
  address: string;
}

/**
 * Данные водителя для ОСАГО/КАСКО
 */
export interface DriverFormData {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  licenseNumber: string;
  licenseDate: string;
  kbm: string;
}

/**
 * Данные транспортного средства
 */
export interface VehicleFormData {
  make: string;
  model: string;
  year: string;
  enginePower: string;
  vehicleType: string;
  vin: string;
  regNumber: string;
  // Документы на ТС
  ptsSeries: string;
  ptsNumber: string;
  stsSeries: string;
  stsNumber: string;
}

/**
 * Данные недвижимости
 */
export interface PropertyFormData {
  address: string;
  propertyType: string;
  area: string;
  constructionYear: string;
  floor: string;
  totalFloors: string;
  cadastralNumber: string;
  value: string;
}

/**
 * Данные для страхования путешествий
 */
export interface TravelFormData {
  destinationCountry: string;
  startDate: string;
  endDate: string;
  travelersCount: string;
  tripPurpose: string;
  coverageAmount: string;
  includeSport: boolean;
  includeCancellation: boolean;
  includeLuggage: boolean;
}

/**
 * Данные для ДМС
 */
export interface DmsFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  email: string;
  gender: string;
  programType: string;
  includeDental: boolean;
  includeEmergency: boolean;
  includeConsultation: boolean;
  hasChronicDiseases: boolean;
  companyInn: string;
  employeesCount: string;
}

/**
 * Данные для ипотечного страхования
 */
export interface MortgageFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  email: string;
  propertyValue: string;
  loanAmount: string;
  loanTermYears: string;
  borrowerAge: string;
  borrowerGender: string;
  bankName: string;
  includeLife: boolean;
  includeTitle: boolean;
  includeProperty: boolean;
}

/**
 * Данные для страхования жизни
 */
export interface LifeFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  email: string;
  gender: string;
  age: string;
  coverageAmount: string;
  termYears: string;
  programType: string;
  smoker: boolean;
  dangerousOccupation: boolean;
  dangerousHobbies: boolean;
  includeAccident: boolean;
  includeCriticalIllness: boolean;
  beneficiaryCount: string;
}

// ============================================================================
// Типы для каждого вида страхования
// ============================================================================

/**
 * Данные формы ОСАГО
 */
export interface OsagoFormData extends PersonalFormData, VehicleFormData {
  startDate: string;
  usagePeriod: string;
  drivers: DriverFormData[];
}

/**
 * Данные формы КАСКО
 */
export interface KaskoFormData extends PersonalFormData, VehicleFormData {
  vehiclePrice: string;
  franchise: string;
  antiTheft: boolean;
  garageParking: boolean;
  drivers: DriverFormData[];
}

/**
 * Данные формы страхования имущества
 */
export interface PropertyApplicationFormData extends PersonalFormData, Omit<PropertyFormData, "address"> {
  propertyAddress: string;
  constructionMaterial: string;
  rooms: string;
  includeInterior: boolean;
  includeLiability: boolean;
  includeMovables: boolean;
}

/**
 * Данные формы страхования путешествий
 * @extends PersonalFormData
 * @extends TravelFormData
 */
export interface TravelApplicationFormData extends PersonalFormData, TravelFormData {
  travelerAges: string[];
}

/**
 * Объединённый тип для всех форм
 */
export type InsuranceFormData =
  | OsagoFormData
  | KaskoFormData
  | DmsFormData
  | TravelApplicationFormData
  | PropertyApplicationFormData
  | MortgageFormData
  | LifeFormData;

// ============================================================================
// Фабрики для создания дефолтных данных
// ============================================================================

/**
 * Создаёт пустого водителя
 */
export function createEmptyDriver(): DriverFormData {
  return {
    id: Date.now().toString(),
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    licenseNumber: "",
    licenseDate: "",
    kbm: "3",
  };
}

/**
 * Создаёт дефолтные данные для формы ОСАГО
 */
export function createDefaultOsagoFormData(): OsagoFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    phone: "",
    email: "",
    passportSeries: "",
    passportNumber: "",
    passportDate: "",
    passportIssued: "",
    address: "",
    make: "",
    model: "",
    year: "",
    enginePower: "",
    vehicleType: "",
    vin: "",
    regNumber: "",
    ptsSeries: "",
    ptsNumber: "",
    stsSeries: "",
    stsNumber: "",
    startDate: "",
    usagePeriod: "12",
    drivers: [createEmptyDriver()],
  };
}

/**
 * Создаёт дефолтные данные для формы КАСКО
 */
export function createDefaultKaskoFormData(): KaskoFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    phone: "",
    email: "",
    passportSeries: "",
    passportNumber: "",
    passportDate: "",
    passportIssued: "",
    address: "",
    make: "",
    model: "",
    year: "",
    enginePower: "",
    vehicleType: "",
    vin: "",
    regNumber: "",
    ptsSeries: "",
    ptsNumber: "",
    stsSeries: "",
    stsNumber: "",
    vehiclePrice: "",
    franchise: "0",
    antiTheft: false,
    garageParking: false,
    drivers: [createEmptyDriver()],
  };
}

/**
 * Создаёт дефолтные данные для формы ДМС
 */
export function createDefaultDmsFormData(): DmsFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    phone: "",
    email: "",
    gender: "",
    programType: "standard",
    includeDental: false,
    includeEmergency: false,
    includeConsultation: false,
    hasChronicDiseases: false,
    companyInn: "",
    employeesCount: "",
  };
}

/**
 * Создаёт дефолтные данные для формы путешествий
 */
export function createDefaultTravelFormData(): TravelApplicationFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    phone: "",
    email: "",
    passportSeries: "",
    passportNumber: "",
    passportDate: "",
    passportIssued: "",
    address: "",
    destinationCountry: "",
    startDate: "",
    endDate: "",
    travelersCount: "1",
    travelerAges: [],
    tripPurpose: "tourism",
    coverageAmount: "50000",
    includeSport: false,
    includeCancellation: false,
    includeLuggage: false,
  };
}

/**
 * Создаёт дефолтные данные для формы страхования имущества
 */
export function createDefaultPropertyFormData(): PropertyApplicationFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    phone: "",
    email: "",
    passportSeries: "",
    passportNumber: "",
    passportDate: "",
    passportIssued: "",
    address: "",
    propertyType: "apartment",
    propertyAddress: "",
    cadastralNumber: "",
    area: "",
    constructionYear: "",
    floor: "",
    totalFloors: "",
    rooms: "",
    value: "",
    constructionMaterial: "brick",
    includeInterior: false,
    includeLiability: false,
    includeMovables: false,
  };
}

/**
 * Создаёт дефолтные данные для формы ипотечного страхования
 */
export function createDefaultMortgageFormData(): MortgageFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    phone: "",
    email: "",
    propertyValue: "",
    loanAmount: "",
    loanTermYears: "20",
    borrowerAge: "",
    borrowerGender: "",
    bankName: "",
    includeLife: true,
    includeTitle: true,
    includeProperty: true,
  };
}

/**
 * Создаёт дефолтные данные для формы страхования жизни
 */
export function createDefaultLifeFormData(): LifeFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    phone: "",
    email: "",
    gender: "",
    age: "",
    coverageAmount: "1000000",
    termYears: "10",
    programType: "risk",
    smoker: false,
    dangerousOccupation: false,
    dangerousHobbies: false,
    includeAccident: false,
    includeCriticalIllness: false,
    beneficiaryCount: "1",
  };
}

/**
 * Маппинг категорий к функциям создания дефолтных данных
 */
export const DEFAULT_FORM_DATA_FACTORIES: Record<
  InsuranceCategory,
  () => InsuranceFormData
> = {
  osago: createDefaultOsagoFormData,
  kasko: createDefaultKaskoFormData,
  mini_kasko: createDefaultKaskoFormData,
  dms: createDefaultDmsFormData,
  travel: createDefaultTravelFormData,
  property: createDefaultPropertyFormData,
  mortgage: createDefaultMortgageFormData,
  life: createDefaultLifeFormData,
  health: createDefaultDmsFormData,
  auto: createDefaultKaskoFormData,
  osgop: createDefaultOsagoFormData,
};

// ============================================================================
// Валидация форм
// ============================================================================

/**
 * Результат валидации поля
 */
export interface FormFieldError {
  field: string;
  message: string;
}

/**
 * Результат валидации формы
 */
export interface FormValidationResult {
  isValid: boolean;
  errors: FormFieldError[];
}

/**
 * Валидирует обязательные поля
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): FormValidationResult {
  const errors: FormFieldError[] = [];

  for (const field of requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      errors.push({
        field,
        message: `Поле "${field}" обязательно для заполнения`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Валидирует email
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Валидирует телефон (российский формат)
 */
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^[+]?[(]?[0-9]{1,3}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}

/**
 * Валидирует VIN номер
 */
export function validateVin(vin: string): boolean {
  // VIN должен быть 17 символов, без I, O, Q
  const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
  return vinRegex.test(vin);
}

/**
 * Валидирует VIN номер (старый формат, 9 символов)
 */
export function validateVinOld(vin: string): boolean {
  const vinOldRegex = /^[A-HJ-NPR-Z0-9]{9}$/i;
  return vinOldRegex.test(vin);
}
