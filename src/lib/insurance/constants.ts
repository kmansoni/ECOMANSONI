import type { InsuranceCategory, PolicyStatus, ApplicationStatus, ClaimStatus } from "@/types/insurance";

// === Реэкспорт словарей ===
export { VEHICLE_MAKES, VEHICLE_TYPES, getMakeOptions, getModelOptions, getModelsForMake, findMakeById } from "./vehicle-dictionary";
export type { VehicleMake, VehicleModel, VehicleType } from "./vehicle-dictionary";
export { INSURANCE_COMPANIES, getCompanyById, getCompanyBySlug, getCompaniesByCategory, getPartnerCompanies, getCompaniesWithApi } from "./companies-dictionary";
export type { InsuranceCompanyInfo } from "./companies-dictionary";

// === Регионы России с коэффициентами ОСАГО (КТ) ===
export const OSAGO_REGIONS = [
  { code: "77", name: "Москва", coefficient: 1.8, federal_district: "Центральный" },
  { code: "78", name: "Санкт-Петербург", coefficient: 1.72, federal_district: "Северо-Западный" },
  { code: "50", name: "Московская область", coefficient: 1.63, federal_district: "Центральный" },
  { code: "23", name: "Краснодарский край", coefficient: 1.76, federal_district: "Южный" },
  { code: "16", name: "Республика Татарстан", coefficient: 1.67, federal_district: "Приволжский" },
  { code: "02", name: "Республика Башкортостан", coefficient: 1.63, federal_district: "Приволжский" },
  { code: "74", name: "Челябинская область", coefficient: 1.67, federal_district: "Уральский" },
  { code: "66", name: "Свердловская область", coefficient: 1.63, federal_district: "Уральский" },
  { code: "54", name: "Новосибирская область", coefficient: 1.67, federal_district: "Сибирский" },
  { code: "55", name: "Омская область", coefficient: 1.63, federal_district: "Сибирский" },
  { code: "24", name: "Красноярский край", coefficient: 1.63, federal_district: "Сибирский" },
  { code: "18", name: "Удмуртская Республика", coefficient: 1.67, federal_district: "Приволжский" },
  { code: "52", name: "Нижегородская область", coefficient: 1.67, federal_district: "Приволжский" },
  { code: "63", name: "Самарская область", coefficient: 1.63, federal_district: "Приволжский" },
  { code: "73", name: "Ульяновская область", coefficient: 1.67, federal_district: "Приволжский" },
  { code: "36", name: "Воронежская область", coefficient: 1.63, federal_district: "Центральный" },
  { code: "76", name: "Ярославская область", coefficient: 1.63, federal_district: "Центральный" },
  { code: "76", name: "Ярославская область", coefficient: 1.63, federal_district: "Центральный" },
  { code: "64", name: "Саратовская область", coefficient: 1.63, federal_district: "Приволжский" },
  { code: "38", name: "Иркутская область", coefficient: 1.63, federal_district: "Сибирский" },
  { code: "27", name: "Хабаровский край", coefficient: 1.63, federal_district: "Дальневосточный" },
  { code: "25", name: "Приморский край", coefficient: 1.63, federal_district: "Дальневосточный" },
  { code: "53", name: "Новгородская область", coefficient: 1.63, federal_district: "Северо-Западный" },
  { code: "47", name: "Ленинградская область", coefficient: 1.44, federal_district: "Северо-Западный" },
  { code: "69", name: "Тверская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "67", name: "Смоленская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "32", name: "Брянская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "40", name: "Калужская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "71", name: "Тульская область", coefficient: 1.63, federal_district: "Центральный" },
  { code: "57", name: "Орловская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "46", name: "Курская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "31", name: "Белгородская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "48", name: "Липецкая область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "68", name: "Тамбовская область", coefficient: 1.44, federal_district: "Центральный" },
  { code: "37", name: "Ивановская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "44", name: "Костромская область", coefficient: 1.44, federal_district: "Центральный" },
  { code: "33", name: "Владимирская область", coefficient: 1.63, federal_district: "Центральный" },
  { code: "62", name: "Рязанская область", coefficient: 1.53, federal_district: "Центральный" },
  { code: "71", name: "Тульская область", coefficient: 1.63, federal_district: "Центральный" },
  { code: "08", name: "Республика Калмыкия", coefficient: 1.18, federal_district: "Южный" },
  { code: "30", name: "Астраханская область", coefficient: 1.53, federal_district: "Южный" },
  { code: "34", name: "Волгоградская область", coefficient: 1.63, federal_district: "Южный" },
  { code: "61", name: "Ростовская область", coefficient: 1.67, federal_district: "Южный" },
  { code: "01", name: "Республика Адыгея", coefficient: 1.1, federal_district: "Южный" },
  { code: "91", name: "Республика Крым", coefficient: 1.18, federal_district: "Южный" },
  { code: "92", name: "Севастополь", coefficient: 1.53, federal_district: "Южный" },
  { code: "05", name: "Республика Дагестан", coefficient: 1.1, federal_district: "Северо-Кавказский" },
  { code: "06", name: "Республика Ингушетия", coefficient: 1.18, federal_district: "Северо-Кавказский" },
  { code: "07", name: "Кабардино-Балкарская Республика", coefficient: 1.44, federal_district: "Северо-Кавказский" },
  { code: "09", name: "Карачаево-Черкесская Республика", coefficient: 1.1, federal_district: "Северо-Кавказский" },
  { code: "15", name: "Республика Северная Осетия", coefficient: 1.44, federal_district: "Северо-Кавказский" },
  { code: "20", name: "Чеченская Республика", coefficient: 1.1, federal_district: "Северо-Кавказский" },
  { code: "26", name: "Ставропольский край", coefficient: 1.63, federal_district: "Северо-Кавказский" },
  { code: "10", name: "Республика Карелия", coefficient: 1.53, federal_district: "Северо-Западный" },
  { code: "11", name: "Республика Коми", coefficient: 1.44, federal_district: "Северо-Западный" },
  { code: "29", name: "Архангельская область", coefficient: 1.53, federal_district: "Северо-Западный" },
  { code: "35", name: "Вологодская область", coefficient: 1.53, federal_district: "Северо-Западный" },
  { code: "39", name: "Калининградская область", coefficient: 1.53, federal_district: "Северо-Западный" },
  { code: "51", name: "Мурманская область", coefficient: 1.53, federal_district: "Северо-Западный" },
  { code: "60", name: "Псковская область", coefficient: 1.44, federal_district: "Северо-Западный" },
  { code: "83", name: "Ненецкий АО", coefficient: 1.44, federal_district: "Северо-Западный" },
  { code: "12", name: "Республика Марий Эл", coefficient: 1.44, federal_district: "Приволжский" },
  { code: "13", name: "Республика Мордовия", coefficient: 1.44, federal_district: "Приволжский" },
  { code: "21", name: "Чувашская Республика", coefficient: 1.67, federal_district: "Приволжский" },
  { code: "43", name: "Кировская область", coefficient: 1.53, federal_district: "Приволжский" },
  { code: "56", name: "Оренбургская область", coefficient: 1.53, federal_district: "Приволжский" },
  { code: "58", name: "Пензенская область", coefficient: 1.53, federal_district: "Приволжский" },
  { code: "59", name: "Пермский край", coefficient: 1.63, federal_district: "Приволжский" },
  { code: "03", name: "Республика Бурятия", coefficient: 1.53, federal_district: "Сибирский" },
  { code: "04", name: "Республика Алтай", coefficient: 1.1, federal_district: "Сибирский" },
  { code: "17", name: "Республика Тыва", coefficient: 1.44, federal_district: "Сибирский" },
  { code: "19", name: "Республика Хакасия", coefficient: 1.44, federal_district: "Сибирский" },
  { code: "22", name: "Алтайский край", coefficient: 1.67, federal_district: "Сибирский" },
  { code: "42", name: "Кемеровская область", coefficient: 1.67, federal_district: "Сибирский" },
  { code: "70", name: "Томская область", coefficient: 1.63, federal_district: "Сибирский" },
  { code: "75", name: "Забайкальский край", coefficient: 1.53, federal_district: "Сибирский" },
  { code: "14", name: "Республика Саха (Якутия)", coefficient: 1.53, federal_district: "Дальневосточный" },
  { code: "28", name: "Амурская область", coefficient: 1.53, federal_district: "Дальневосточный" },
  { code: "41", name: "Камчатский край", coefficient: 1.53, federal_district: "Дальневосточный" },
  { code: "49", name: "Магаданская область", coefficient: 1.44, federal_district: "Дальневосточный" },
  { code: "65", name: "Сахалинская область", coefficient: 1.53, federal_district: "Дальневосточный" },
  { code: "79", name: "Еврейская АО", coefficient: 1.44, federal_district: "Дальневосточный" },
  { code: "87", name: "Чукотский АО", coefficient: 1.1, federal_district: "Дальневосточный" },
  { code: "72", name: "Тюменская область", coefficient: 1.67, federal_district: "Уральский" },
  { code: "45", name: "Курганская область", coefficient: 1.53, federal_district: "Уральский" },
  { code: "86", name: "Ханты-Мансийский АО", coefficient: 1.53, federal_district: "Уральский" },
  { code: "89", name: "Ямало-Ненецкий АО", coefficient: 1.53, federal_district: "Уральский" },
];

// === Базовые тарифы ОСАГО (ТБ) 2024 — диапазон мин/макс ===
export const OSAGO_BASE_RATES: Record<string, { min: number; max: number }> = {
  car: { min: 3432, max: 9751 },
  truck: { min: 3509, max: 9938 },
  motorcycle: { min: 867, max: 1579 },
  bus: { min: 2246, max: 4001 },
};

// === Полная таблица базовых ставок ОСАГО по категориям ТС (ЦБ РФ, 2024) ===
export interface OsagoBaseRateEntry {
  categoryCode: string;
  categoryName: string;
  vehicleType: string;
  min: number;
  max: number;
  notes?: string;
}

export const OSAGO_BASE_RATES_FULL: OsagoBaseRateEntry[] = [
  { categoryCode: 'A', categoryName: 'Мотоциклы и мопеды', vehicleType: 'motorcycle', min: 867, max: 1579, notes: 'Категория А' },
  { categoryCode: 'B_personal', categoryName: 'Легковые автомобили (физлица)', vehicleType: 'car', min: 3432, max: 9751, notes: 'Категория B, физические лица и ИП' },
  { categoryCode: 'B_legal', categoryName: 'Легковые автомобили (юрлица)', vehicleType: 'car_legal', min: 2058, max: 2911, notes: 'Категория B, юридические лица' },
  { categoryCode: 'B_taxi', categoryName: 'Легковые автомобили (такси)', vehicleType: 'taxi', min: 4165, max: 12435, notes: 'Категория B, используемые в качестве такси' },
  { categoryCode: 'C_max16t', categoryName: 'Грузовые ТС до 16 тонн', vehicleType: 'truck_light', min: 3509, max: 9938, notes: 'Категория C, разрешённая масса до 16 тонн' },
  { categoryCode: 'C_over16t', categoryName: 'Грузовые ТС свыше 16 тонн', vehicleType: 'truck_heavy', min: 5284, max: 9121, notes: 'Категория C, разрешённая масса свыше 16 тонн' },
  { categoryCode: 'D_max16pass', categoryName: 'Автобусы до 16 пассажирских мест', vehicleType: 'bus_small', min: 2246, max: 4001, notes: 'Категория D, до 16 пассажирских мест' },
  { categoryCode: 'D_over16pass', categoryName: 'Автобусы свыше 16 пассажирских мест', vehicleType: 'bus_large', min: 3487, max: 5987, notes: 'Категория D, свыше 16 пассажирских мест' },
  { categoryCode: 'D_intercity', categoryName: 'Автобусы (межгородские)', vehicleType: 'bus_intercity', min: 4584, max: 7834, notes: 'Категория D, используемые на регулярных перевозках' },
  { categoryCode: 'D_taxi', categoryName: 'Автобусы (маршрутное такси)', vehicleType: 'bus_taxi', min: 5302, max: 9034, notes: 'Категория D, маршрутное такси' },
  { categoryCode: 'Tb', categoryName: 'Троллейбусы', vehicleType: 'trolleybus', min: 2246, max: 4001, notes: 'Категория Тб' },
  { categoryCode: 'Tm', categoryName: 'Трамваи', vehicleType: 'tram', min: 2246, max: 4001, notes: 'Категория Тм' },
  { categoryCode: 'E', categoryName: 'Тракторы и самоходные машины', vehicleType: 'special', min: 616, max: 1026, notes: 'Категория E и спецтехника' },
];

// === Коэффициент возраст-стаж (КВС) для ОСАГО ===
export const OSAGO_KVS: Array<{
  age_min: number;
  age_max: number;
  exp_min: number;
  exp_max: number;
  coefficient: number;
}> = [
  { age_min: 16, age_max: 21, exp_min: 0, exp_max: 0, coefficient: 1.87 },
  { age_min: 16, age_max: 21, exp_min: 1, exp_max: 2, coefficient: 1.87 },
  { age_min: 22, age_max: 24, exp_min: 0, exp_max: 0, coefficient: 1.77 },
  { age_min: 22, age_max: 24, exp_min: 1, exp_max: 2, coefficient: 1.77 },
  { age_min: 22, age_max: 24, exp_min: 3, exp_max: 4, coefficient: 1.04 },
  { age_min: 25, age_max: 29, exp_min: 0, exp_max: 0, coefficient: 1.77 },
  { age_min: 25, age_max: 29, exp_min: 1, exp_max: 2, coefficient: 1.04 },
  { age_min: 25, age_max: 29, exp_min: 3, exp_max: 4, coefficient: 1.04 },
  { age_min: 25, age_max: 29, exp_min: 5, exp_max: 6, coefficient: 0.96 },
  { age_min: 30, age_max: 34, exp_min: 0, exp_max: 0, coefficient: 1.63 },
  { age_min: 30, age_max: 34, exp_min: 1, exp_max: 2, coefficient: 1.04 },
  { age_min: 30, age_max: 34, exp_min: 3, exp_max: 4, coefficient: 1.04 },
  { age_min: 30, age_max: 34, exp_min: 5, exp_max: 99, coefficient: 0.83 },
  { age_min: 35, age_max: 39, exp_min: 0, exp_max: 0, coefficient: 1.63 },
  { age_min: 35, age_max: 99, exp_min: 0, exp_max: 0, coefficient: 1.04 },
  { age_min: 35, age_max: 99, exp_min: 1, exp_max: 99, coefficient: 0.83 },
];

// === Коэффициент мощности (КМ) ===
export const OSAGO_KM_COEFS: Array<{ max_hp: number; coefficient: number }> = [
  { max_hp: 50, coefficient: 0.6 },
  { max_hp: 70, coefficient: 1.0 },
  { max_hp: 100, coefficient: 1.1 },
  { max_hp: 120, coefficient: 1.2 },
  { max_hp: 150, coefficient: 1.4 },
  { max_hp: Infinity, coefficient: 1.6 },
];

// === Коэффициент периода (КС) ===
export const OSAGO_KS: Record<number, number> = {
  3: 0.5,
  4: 0.6,
  5: 0.65,
  6: 0.7,
  7: 0.8,
  8: 0.9,
  9: 0.95,
  10: 1.0,
  11: 1.0,
  12: 1.0,
};

// === КБМ по классам (устаревший формат для обратной совместимости) ===
export const KBM_TABLE: Record<number, number> = {
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

// === Полная таблица КБМ (15 классов согласно указанию ЦБ РФ) ===
// Класс M — максимальный риск, классы 0-13 — история страхования
export interface KbmClass {
  class: string;      // "M" | "0" | "1" | ... | "13"
  classNum: number;   // -1 для M, иначе 0-13
  coefficient: number;
  description: string;
  requiredClaimFreeYears?: number;
}

export const KBM_FULL_TABLE: KbmClass[] = [
  { class: 'M',  classNum: -1, coefficient: 2.45, description: 'Класс М (более 3 страховых случаев)' },
  { class: '0',  classNum: 0,  coefficient: 2.3,  description: 'Класс 0 (2-3 страховых случая)' },
  { class: '1',  classNum: 1,  coefficient: 1.55, description: 'Класс 1 (1 страховой случай)' },
  { class: '2',  classNum: 2,  coefficient: 1.4,  description: 'Класс 2 (нет истории / первоначальный при авариях)' },
  { class: '3',  classNum: 3,  coefficient: 1.0,  description: 'Класс 3 (начальный, нет истории)', requiredClaimFreeYears: 0 },
  { class: '4',  classNum: 4,  coefficient: 0.95, description: 'Класс 4', requiredClaimFreeYears: 1 },
  { class: '5',  classNum: 5,  coefficient: 0.9,  description: 'Класс 5', requiredClaimFreeYears: 2 },
  { class: '6',  classNum: 6,  coefficient: 0.85, description: 'Класс 6', requiredClaimFreeYears: 3 },
  { class: '7',  classNum: 7,  coefficient: 0.8,  description: 'Класс 7', requiredClaimFreeYears: 4 },
  { class: '8',  classNum: 8,  coefficient: 0.75, description: 'Класс 8', requiredClaimFreeYears: 5 },
  { class: '9',  classNum: 9,  coefficient: 0.7,  description: 'Класс 9', requiredClaimFreeYears: 6 },
  { class: '10', classNum: 10, coefficient: 0.65, description: 'Класс 10', requiredClaimFreeYears: 7 },
  { class: '11', classNum: 11, coefficient: 0.6,  description: 'Класс 11', requiredClaimFreeYears: 8 },
  { class: '12', classNum: 12, coefficient: 0.55, description: 'Класс 12', requiredClaimFreeYears: 9 },
  { class: '13', classNum: 13, coefficient: 0.5,  description: 'Класс 13 (максимальная скидка)', requiredClaimFreeYears: 10 },
];

// Функция получения КБМ по номеру класса
export function getKbmByClass(classNum: number): number {
  if (classNum === -1) return 2.45;
  const entry = KBM_FULL_TABLE.find(k => k.classNum === classNum);
  return entry?.coefficient ?? 1.0;
}

// Функция расчёта нового класса после года страхования
export function getNewKbmClass(currentClass: number, claimsCount: number): number {
  if (claimsCount === 0) {
    // Повышение класса на 1 (максимум 13)
    return Math.min(currentClass + 1, 13);
  }
  // Понижение класса
  const penalties: Record<number, number> = { 0: 0, 1: -1, 2: -5, 3: -10 };
  const penalty = claimsCount >= 3 ? penalties[3] : (penalties[claimsCount] ?? 0);
  return Math.max(currentClass + penalty, -1); // -1 = класс M
}

// === Марки и модели автомобилей ===
export const CAR_MAKES = [
  { value: "lada", label: "LADA (ВАЗ)" },
  { value: "kia", label: "KIA" },
  { value: "hyundai", label: "Hyundai" },
  { value: "toyota", label: "Toyota" },
  { value: "volkswagen", label: "Volkswagen" },
  { value: "skoda", label: "Škoda" },
  { value: "renault", label: "Renault" },
  { value: "nissan", label: "Nissan" },
  { value: "bmw", label: "BMW" },
  { value: "mercedes", label: "Mercedes-Benz" },
  { value: "audi", label: "Audi" },
  { value: "ford", label: "Ford" },
  { value: "chevrolet", label: "Chevrolet" },
  { value: "mitsubishi", label: "Mitsubishi" },
  { value: "mazda", label: "Mazda" },
  { value: "honda", label: "Honda" },
  { value: "lexus", label: "Lexus" },
  { value: "land_rover", label: "Land Rover" },
  { value: "volvo", label: "Volvo" },
  { value: "peugeot", label: "Peugeot" },
  { value: "citroen", label: "Citroën" },
  { value: "opel", label: "Opel" },
  { value: "suzuki", label: "Suzuki" },
  { value: "subaru", label: "Subaru" },
  { value: "jeep", label: "Jeep" },
  { value: "porsche", label: "Porsche" },
  { value: "infiniti", label: "Infiniti" },
  { value: "geely", label: "Geely" },
  { value: "chery", label: "Chery" },
  { value: "haval", label: "Haval" },
];

// === Страны для travel страхования ===
export const TRAVEL_COUNTRIES = [
  { value: "DE", label: "Германия", zone: "schengen" },
  { value: "FR", label: "Франция", zone: "schengen" },
  { value: "IT", label: "Италия", zone: "schengen" },
  { value: "ES", label: "Испания", zone: "schengen" },
  { value: "GR", label: "Греция", zone: "schengen" },
  { value: "CZ", label: "Чехия", zone: "schengen" },
  { value: "AT", label: "Австрия", zone: "schengen" },
  { value: "NL", label: "Нидерланды", zone: "schengen" },
  { value: "PT", label: "Португалия", zone: "schengen" },
  { value: "PL", label: "Польша", zone: "schengen" },
  { value: "CH", label: "Швейцария", zone: "schengen" },
  { value: "SE", label: "Швеция", zone: "schengen" },
  { value: "NO", label: "Норвегия", zone: "schengen" },
  { value: "FI", label: "Финляндия", zone: "schengen" },
  { value: "DK", label: "Дания", zone: "schengen" },
  { value: "TR", label: "Турция", zone: "world" },
  { value: "EG", label: "Египет", zone: "world" },
  { value: "TH", label: "Таиланд", zone: "world" },
  { value: "AE", label: "ОАЭ", zone: "world" },
  { value: "US", label: "США", zone: "usa_canada" },
  { value: "CA", label: "Канада", zone: "usa_canada" },
  { value: "CN", label: "Китай", zone: "world" },
  { value: "JP", label: "Япония", zone: "world" },
  { value: "IN", label: "Индия", zone: "world" },
  { value: "ID", label: "Индонезия (Бали)", zone: "world" },
  { value: "VN", label: "Вьетнам", zone: "world" },
  { value: "CY", label: "Кипр", zone: "world" },
  { value: "MT", label: "Мальта", zone: "schengen" },
  { value: "HR", label: "Хорватия", zone: "schengen" },
  { value: "ME", label: "Черногория", zone: "world" },
  { value: "RS", label: "Сербия", zone: "world" },
  { value: "AM", label: "Армения", zone: "cis" },
  { value: "GE", label: "Грузия", zone: "cis" },
  { value: "AZ", label: "Азербайджан", zone: "cis" },
  { value: "KZ", label: "Казахстан", zone: "cis" },
  { value: "BY", label: "Беларусь", zone: "cis" },
  { value: "UZ", label: "Узбекистан", zone: "cis" },
  { value: "KG", label: "Кыргызстан", zone: "cis" },
  { value: "TJ", label: "Таджикистан", zone: "cis" },
  { value: "MD", label: "Молдова", zone: "cis" },
  { value: "MX", label: "Мексика", zone: "world" },
  { value: "BR", label: "Бразилия", zone: "world" },
  { value: "AR", label: "Аргентина", zone: "world" },
  { value: "AU", label: "Австралия", zone: "world" },
  { value: "NZ", label: "Новая Зеландия", zone: "world" },
  { value: "ZA", label: "ЮАР", zone: "world" },
  { value: "MA", label: "Марокко", zone: "world" },
  { value: "TN", label: "Тунис", zone: "world" },
  { value: "IL", label: "Израиль", zone: "world" },
  { value: "OTHER", label: "Другая страна", zone: "world" },
];

// === Ценовые коэффициенты по зонам для travel ===
export const TRAVEL_ZONE_RATES: Record<string, number> = {
  cis: 0.8,
  schengen: 1.0,
  world: 1.5,
  usa_canada: 2.5,
};

// === Банки для ипотечного страхования ===
export const MORTGAGE_BANKS = [
  { value: "sberbank", label: "Сбербанк" },
  { value: "vtb", label: "ВТБ" },
  { value: "gazprombank", label: "Газпромбанк" },
  { value: "alfabank", label: "Альфа-Банк" },
  { value: "rosselhozbank", label: "Россельхозбанк" },
  { value: "raiffeisen", label: "Райффайзенбанк" },
  { value: "sovcombank", label: "Совкомбанк" },
  { value: "unicredit", label: "ЮниКредит Банк" },
  { value: "otkritie", label: "Банк Открытие" },
  { value: "promsvyazbank", label: "Промсвязьбанк" },
  { value: "rosbank", label: "Росбанк" },
  { value: "citibank", label: "Ситибанк" },
  { value: "homecredit", label: "Хоум Кредит" },
  { value: "uralsib", label: "Уралсиб" },
  { value: "other", label: "Другой банк" },
];

// === Иконки и цвета категорий (lucide-react иконки) ===
export const CATEGORY_CONFIG: Record<InsuranceCategory, {
  icon: string;
  color: string;
  bgColor: string;
  label: string;
  description: string;
}> = {
  osago: {
    icon: "Car",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    label: "ОСАГО",
    description: "Обязательное страхование автогражданской ответственности",
  },
  kasko: {
    icon: "Shield",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    label: "КАСКО",
    description: "Добровольное страхование автомобиля",
  },
  mini_kasko: {
    icon: "ShieldCheck",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    label: "Мини-КАСКО",
    description: "Страхование от угона и полной гибели",
  },
  dms: {
    icon: "Stethoscope",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    label: "ДМС",
    description: "Добровольное медицинское страхование",
  },
  travel: {
    icon: "Plane",
    color: "text-sky-400",
    bgColor: "bg-sky-500/10",
    label: "Путешествия",
    description: "Страхование выезжающих за рубеж",
  },
  property: {
    icon: "Building2",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    label: "Имущество",
    description: "Страхование квартиры, дома, дачи",
  },
  mortgage: {
    icon: "Home",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    label: "Ипотека",
    description: "Комплексное страхование ипотеки",
  },
  life: {
    icon: "Heart",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    label: "Жизнь",
    description: "Страхование жизни и накопительное страхование",
  },
  health: {
    icon: "Activity",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10",
    label: "Здоровье",
    description: "Страхование от болезней и несчастных случаев",
  },
  auto: {
    icon: "Wrench",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
    label: "Авто",
    description: "Дополнительное страхование для автовладельцев",
  },
  osgop: {
    icon: "Bus",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    label: "ОСГОП",
    description: "Страхование ответственности перевозчика",
  },
};

// === Метки статусов полисов ===
export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  draft: "Черновик",
  pending: "Ожидает оплаты",
  active: "Активен",
  expired: "Истёк",
  cancelled: "Отменён",
  claimed: "Страховой случай",
};

export const POLICY_STATUS_COLORS: Record<PolicyStatus, string> = {
  draft: "text-gray-400",
  pending: "text-yellow-400",
  active: "text-emerald-400",
  expired: "text-red-400",
  cancelled: "text-gray-400",
  claimed: "text-orange-400",
};

export const POLICY_STATUS_BADGE_COLORS: Record<PolicyStatus, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  active: "bg-emerald-500/20 text-emerald-400",
  expired: "bg-red-500/20 text-red-400",
  cancelled: "bg-gray-500/20 text-gray-400",
  claimed: "bg-orange-500/20 text-orange-400",
};

// === Метки статусов заявок ===
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Черновик",
  calculating: "Расчёт...",
  quoted: "Расчёт готов",
  applying: "Оформление",
  documents_required: "Нужны документы",
  under_review: "На проверке",
  approved: "Одобрено",
  payment_pending: "Ожидает оплаты",
  paid: "Оплачено",
  issued: "Выдан",
  rejected: "Отклонено",
  cancelled: "Отменена",
};

// === Метки статусов страховых случаев ===
export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  submitted: "Подано",
  under_review: "На рассмотрении",
  approved: "Одобрено",
  rejected: "Отклонено",
  paid: "Выплачено",
};

export const CLAIM_STATUS_COLORS: Record<ClaimStatus, string> = {
  submitted: "bg-blue-500/20 text-blue-400",
  under_review: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-red-500/20 text-red-400",
  paid: "bg-violet-500/20 text-violet-400",
};

// === Программы ДМС ===
export const DMS_PROGRAMS = [
  { value: "basic", label: "Базовая", description: "Поликлиника, скорая помощь" },
  { value: "standard", label: "Стандарт", description: "Поликлиника, госпитализация, стоматология" },
  { value: "premium", label: "Премиум", description: "Расширенный пакет услуг" },
  { value: "vip", label: "VIP", description: "Полное покрытие, частные клиники" },
];

// === Типы программ страхования жизни ===
export const LIFE_PROGRAMS = [
  { value: "risk", label: "Рисковое", description: "Выплата при наступлении страхового случая" },
  { value: "endowment", label: "Накопительное", description: "Накопление + защита" },
  { value: "investment", label: "Инвестиционное", description: "НСЖ с инвестиционным доходом" },
  { value: "pension", label: "Пенсионное", description: "Накопление на пенсию" },
];

// === Материалы конструкции ===
export const CONSTRUCTION_MATERIALS = [
  { value: "brick", label: "Кирпич" },
  { value: "panel", label: "Панель" },
  { value: "monolith", label: "Монолит" },
  { value: "wood", label: "Дерево" },
  { value: "other", label: "Другое" },
];

// === Типы недвижимости ===
export const PROPERTY_TYPES = [
  { value: "apartment", label: "Квартира" },
  { value: "house", label: "Дом" },
  { value: "townhouse", label: "Таунхаус" },
  { value: "commercial", label: "Коммерческая недвижимость" },
];

// === Константа: максимум элементов в сравнении ===
export const MAX_COMPARISON_ITEMS = 5;

// === Константа: дней до истечения полиса (для уведомления) ===
export const EXPIRING_DAYS_THRESHOLD = 30;
