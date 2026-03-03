import { z } from "zod";

// === Схема ОСАГО ===
export const osagoSchema = z.object({
  region_code: z.string().min(1, "Выберите регион"),
  vehicle_type: z.enum(["car", "truck", "motorcycle", "bus"], {
    errorMap: () => ({ message: "Выберите тип ТС" }),
  }),
  engine_power: z
    .number({ invalid_type_error: "Укажите мощность двигателя" })
    .min(1, "Мощность должна быть больше 0")
    .max(2000, "Некорректная мощность"),
  driver_age: z
    .number({ invalid_type_error: "Укажите возраст водителя" })
    .min(16, "Минимальный возраст 16 лет")
    .max(100, "Некорректный возраст"),
  driver_experience_years: z
    .number({ invalid_type_error: "Укажите стаж вождения" })
    .min(0, "Стаж не может быть отрицательным")
    .max(80, "Некорректный стаж"),
  kbm_class: z
    .number()
    .min(0, "Минимальный класс КБМ: 0")
    .max(13, "Максимальный класс КБМ: 13")
    .default(3),
  usage_period_months: z
    .number()
    .min(3, "Минимальный период 3 месяца")
    .max(12, "Максимальный период 12 месяцев")
    .default(12),
  multi_driver: z.boolean().default(false),
  has_trailer: z.boolean().default(false),
  owner_type: z.enum(["individual", "legal_entity"]).default("individual"),
  registration_type: z.enum(["russian", "transit", "foreign"]).optional(),
});

// === Схема КАСКО ===
export const kaskoSchema = z.object({
  vehicle_make: z.string().min(1, "Укажите марку автомобиля"),
  vehicle_model: z.string().min(1, "Укажите модель автомобиля"),
  vehicle_year: z
    .number({ invalid_type_error: "Укажите год выпуска" })
    .min(1980, "Некорректный год")
    .max(new Date().getFullYear() + 1, "Некорректный год"),
  vehicle_price: z
    .number({ invalid_type_error: "Укажите стоимость автомобиля" })
    .min(100000, "Укажите корректную стоимость")
    .max(100000000, "Укажите корректную стоимость"),
  engine_power: z
    .number({ invalid_type_error: "Укажите мощность двигателя" })
    .min(1, "Мощность должна быть больше 0")
    .max(2000, "Некорректная мощность"),
  region_code: z.string().min(1, "Выберите регион"),
  driver_age: z.number().min(16).max(100),
  driver_experience_years: z.number().min(0).max(80),
  kbm_class: z.number().min(0).max(13).default(3),
  has_anti_theft: z.boolean().default(false),
  garage_parking: z.boolean().default(false),
  franchise_amount: z.number().min(0).default(0),
  coverage_type: z.enum(["full", "partial", "total_loss_only"]).default("full"),
  additional_options: z.array(z.string()).default([]),
});

// === Схема ДМС ===
export const dmsSchema = z.object({
  age: z
    .number({ invalid_type_error: "Укажите возраст" })
    .min(0, "Некорректный возраст")
    .max(100, "Некорректный возраст"),
  gender: z.enum(["male", "female"], {
    errorMap: () => ({ message: "Выберите пол" }),
  }),
  region_code: z.string().min(1, "Выберите регион"),
  program_type: z.enum(["basic", "standard", "premium", "vip"]).default("standard"),
  has_chronic_diseases: z.boolean().default(false),
  include_dental: z.boolean().default(false),
  include_emergency: z.boolean().default(true),
  include_consultation: z.boolean().default(true),
  employees_count: z.number().min(1).optional(),
  company_inn: z.string().optional(),
});

// === Схема Travel ===
export const travelSchema = z.object({
  destination_country: z.string().min(1, "Выберите страну"),
  trip_duration_days: z
    .number({ invalid_type_error: "Укажите продолжительность поездки" })
    .min(1, "Минимум 1 день")
    .max(365, "Максимум 365 дней"),
  travelers_count: z
    .number({ invalid_type_error: "Укажите количество путешественников" })
    .min(1, "Минимум 1 человек")
    .max(50, "Максимум 50 человек"),
  traveler_ages: z
    .array(z.number().min(0).max(100))
    .min(1, "Укажите возраст хотя бы одного путешественника"),
  coverage_amount: z
    .number()
    .min(30000, "Минимальная страховая сумма 30 000 USD")
    .default(50000),
  sport_activities: z.boolean().default(false),
  include_cancellation: z.boolean().default(false),
  include_luggage: z.boolean().default(false),
  include_accident: z.boolean().default(false),
  trip_purpose: z.enum(["tourism", "business", "study", "work"]).default("tourism"),
  multi_trip: z.boolean().default(false),
});

// === Схема страхования имущества ===
export const propertySchema = z.object({
  property_type: z.enum(["apartment", "house", "townhouse", "commercial"], {
    errorMap: () => ({ message: "Выберите тип недвижимости" }),
  }),
  property_area: z
    .number({ invalid_type_error: "Укажите площадь" })
    .min(1, "Площадь должна быть больше 0")
    .max(10000, "Некорректная площадь"),
  property_value: z
    .number({ invalid_type_error: "Укажите стоимость" })
    .min(100000, "Укажите корректную стоимость")
    .max(1000000000, "Укажите корректную стоимость"),
  region_code: z.string().min(1, "Выберите регион"),
  construction_year: z
    .number()
    .min(1800, "Некорректный год строительства")
    .max(new Date().getFullYear(), "Год не может быть в будущем"),
  construction_material: z.enum(["brick", "panel", "wood", "monolith", "other"]).default("brick"),
  floor: z.number().min(0).max(200).default(1),
  total_floors: z.number().min(1).max(200).default(10),
  include_interior: z.boolean().default(true),
  include_liability: z.boolean().default(false),
  include_movables: z.boolean().default(false),
  coverage_amount: z.number().min(0).default(0),
});

// === Схема ипотечного страхования ===
export const mortgageSchema = z.object({
  property_value: z
    .number({ invalid_type_error: "Укажите стоимость недвижимости" })
    .min(500000, "Укажите корректную стоимость")
    .max(1000000000, "Укажите корректную стоимость"),
  loan_amount: z
    .number({ invalid_type_error: "Укажите сумму кредита" })
    .min(100000, "Укажите корректную сумму кредита")
    .max(999000000, "Укажите корректную сумму кредита"),
  loan_term_years: z
    .number()
    .min(1, "Минимальный срок 1 год")
    .max(30, "Максимальный срок 30 лет"),
  borrower_age: z
    .number({ invalid_type_error: "Укажите возраст заёмщика" })
    .min(18, "Минимальный возраст 18 лет")
    .max(75, "Максимальный возраст 75 лет"),
  borrower_gender: z.enum(["male", "female"], {
    errorMap: () => ({ message: "Выберите пол" }),
  }),
  bank_name: z.string().min(1, "Выберите банк"),
  include_life: z.boolean().default(true),
  include_title: z.boolean().default(false),
  include_property: z.boolean().default(true),
  region_code: z.string().min(1, "Выберите регион"),
});

// === Схема страхования жизни ===
export const lifeSchema = z.object({
  age: z
    .number({ invalid_type_error: "Укажите возраст" })
    .min(16, "Минимальный возраст 16 лет")
    .max(70, "Максимальный возраст для страхования 70 лет"),
  gender: z.enum(["male", "female"], {
    errorMap: () => ({ message: "Выберите пол" }),
  }),
  coverage_amount: z
    .number({ invalid_type_error: "Укажите страховую сумму" })
    .min(100000, "Минимальная страховая сумма 100 000 ₽")
    .max(100000000, "Превышена максимальная сумма"),
  term_years: z
    .number()
    .min(1, "Минимальный срок 1 год")
    .max(40, "Максимальный срок 40 лет"),
  program_type: z.enum(["risk", "endowment", "investment", "pension"]).default("risk"),
  smoker: z.boolean().default(false),
  dangerous_occupation: z.boolean().default(false),
  dangerous_hobbies: z.boolean().default(false),
  include_accident: z.boolean().default(false),
  include_critical_illness: z.boolean().default(false),
  beneficiary_count: z.number().min(1).max(10).default(1),
});

// === Схема персональных данных ===
export const personalDataSchema = z.object({
  first_name: z.string().min(1, "Укажите имя"),
  last_name: z.string().min(1, "Укажите фамилию"),
  middle_name: z.string().optional(),
  birth_date: z.string().min(1, "Укажите дату рождения"),
  gender: z.enum(["male", "female"]),
  passport_series: z
    .string()
    .regex(/^\d{4}$/, "Серия паспорта: 4 цифры"),
  passport_number: z
    .string()
    .regex(/^\d{6}$/, "Номер паспорта: 6 цифр"),
  passport_issued_by: z.string().min(3, "Укажите кем выдан паспорт"),
  passport_issued_date: z.string().min(1, "Укажите дату выдачи паспорта"),
  inn: z.string().regex(/^(\d{10}|\d{12})$/, "ИНН: 10 или 12 цифр").optional().or(z.literal("")),
  snils: z
    .string()
    .regex(/^\d{3}-\d{3}-\d{3} \d{2}$/, "СНИЛС: формат XXX-XXX-XXX XX")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .regex(/^\+7\d{10}$/, "Телефон: +7XXXXXXXXXX"),
  email: z.string().email("Некорректный email"),
  registration_address: z.string().min(5, "Укажите адрес регистрации"),
  actual_address: z.string().optional(),
});

// === Схема данных транспортного средства ===
export const vehicleDataSchema = z.object({
  make: z.string().min(1, "Укажите марку"),
  model: z.string().min(1, "Укажите модель"),
  year: z.number().min(1980).max(new Date().getFullYear() + 1),
  vin: z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Некорректный VIN-номер (17 символов)"),
  license_plate: z
    .string()
    .min(6, "Укажите госномер")
    .max(9, "Некорректный госномер"),
  body_number: z.string().optional(),
  engine_power: z.number().min(1).max(2000),
  vehicle_type: z.string().min(1),
  pts_series: z.string().min(2, "Укажите серию ПТС"),
  pts_number: z.string().min(6, "Укажите номер ПТС"),
  sts_series: z.string().optional(),
  sts_number: z.string().optional(),
  diagnostic_card_number: z.string().optional(),
  diagnostic_card_valid_until: z.string().optional(),
});

// === Схема данных недвижимости ===
export const propertyDataValidationSchema = z.object({
  type: z.enum(["apartment", "house", "townhouse", "commercial"]),
  address: z.string().min(5, "Укажите адрес объекта"),
  cadastral_number: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{6,7}:\d+$/, "Некорректный кадастровый номер")
    .optional()
    .or(z.literal("")),
  area: z.number().min(1).max(10000),
  construction_year: z.number().min(1800).max(new Date().getFullYear()),
  floor: z.number().min(0).max(200).optional(),
  total_floors: z.number().min(1).max(200).optional(),
  rooms: z.number().min(0).max(50).optional(),
  value: z.number().min(100000),
});

// === Типы инференции ===
export type OsagoFormValues = z.infer<typeof osagoSchema>;
export type KaskoFormValues = z.infer<typeof kaskoSchema>;
export type DmsFormValues = z.infer<typeof dmsSchema>;
export type TravelFormValues = z.infer<typeof travelSchema>;
export type PropertyFormValues = z.infer<typeof propertySchema>;
export type MortgageFormValues = z.infer<typeof mortgageSchema>;
export type LifeFormValues = z.infer<typeof lifeSchema>;
export type PersonalDataFormValues = z.infer<typeof personalDataSchema>;
export type VehicleDataFormValues = z.infer<typeof vehicleDataSchema>;
export type PropertyDataFormValues = z.infer<typeof propertyDataValidationSchema>;
