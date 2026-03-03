import type {
  OsagoCalculationRequest,
  KaskoCalculationRequest,
  DmsCalculationRequest,
  TravelCalculationRequest,
  PropertyCalculationRequest,
  MortgageCalculationRequest,
  LifeCalculationRequest,
} from "@/types/insurance";
import {
  OSAGO_BASE_RATES,
  OSAGO_REGIONS,
  OSAGO_KM_COEFS,
  OSAGO_KS,
  KBM_TABLE,
  TRAVEL_ZONE_RATES,
  TRAVEL_COUNTRIES,
} from "./constants";

/**
 * Вычисляет КВС (коэффициент возраст-стаж) для ОСАГО
 */
function getKvs(age: number, experienceYears: number): number {
  // Упрощённая таблица КВС ЦБ РФ 2024
  if (age < 22) {
    if (experienceYears < 1) return 1.87;
    if (experienceYears < 3) return 1.87;
    return 1.63;
  }
  if (age < 25) {
    if (experienceYears < 1) return 1.77;
    if (experienceYears < 3) return 1.77;
    if (experienceYears < 5) return 1.04;
    return 0.96;
  }
  if (age < 30) {
    if (experienceYears < 1) return 1.77;
    if (experienceYears < 3) return 1.04;
    if (experienceYears < 5) return 1.04;
    return 0.83;
  }
  if (age < 35) {
    if (experienceYears < 1) return 1.63;
    if (experienceYears < 3) return 1.04;
    return 0.83;
  }
  // 35+
  if (experienceYears < 1) return 1.04;
  return 0.83;
}

/**
 * Вычисляет КМ (коэффициент мощности двигателя) для ОСАГО
 */
function getKm(enginePower: number): number {
  for (const row of OSAGO_KM_COEFS) {
    if (enginePower <= row.max_hp) return row.coefficient;
  }
  return 1.6;
}

/**
 * Рассчитывает стоимость ОСАГО по формуле ЦБ РФ:
 * П = ТБ × КТ × КБМ × КВС × КО × КМ × КС × КП × КН
 *
 * @param request - параметры расчёта ОСАГО
 * @returns стоимость страховой премии в рублях
 */
export function calculateOsagoPremium(request: OsagoCalculationRequest): number {
  const { min: tbMin, max: tbMax } = OSAGO_BASE_RATES[request.vehicle_type] || OSAGO_BASE_RATES.car;
  const tb = (tbMin + tbMax) / 2;

  // КТ — коэффициент территории
  const region = OSAGO_REGIONS.find((r) => r.code === request.region_code);
  const kt = region?.coefficient ?? 1.0;

  // КБМ — бонус-малус
  const kbm = KBM_TABLE[Math.max(0, Math.min(13, request.kbm_class))] ?? 1.0;

  // КВС — возраст-стаж
  const kvs = getKvs(request.driver_age, request.driver_experience_years);

  // КО — ограничение по числу водителей
  const ko = request.multi_driver ? 1.94 : 1.0;

  // КМ — мощность двигателя
  const km = getKm(request.engine_power);

  // КС — сезонность использования
  const ks = OSAGO_KS[request.usage_period_months] ?? 1.0;

  // КП — прицеп
  const kp = request.has_trailer ? 1.16 : 1.0;

  // КН — нарушения (базово 1.0)
  const kn = 1.0;

  const premium = tb * kt * kbm * kvs * ko * km * ks * kp * kn;
  return Math.round(premium);
}

/**
 * Рассчитывает стоимость КАСКО
 *
 * @param request - параметры расчёта КАСКО
 * @returns стоимость страховой премии в рублях
 */
export function calculateKaskoPremium(request: KaskoCalculationRequest): number {
  // Базовая ставка: 4-7% от стоимости авто в год
  let baseRate = 0.055; // 5.5%

  // Возраст и стаж водителя
  if (request.driver_age < 25 || request.driver_experience_years < 3) {
    baseRate += 0.02;
  } else if (request.driver_age > 50) {
    baseRate -= 0.005;
  }

  // Возраст автомобиля
  const currentYear = new Date().getFullYear();
  const carAge = currentYear - request.vehicle_year;
  if (carAge > 10) baseRate += 0.02;
  else if (carAge > 5) baseRate += 0.01;
  else if (carAge < 2) baseRate -= 0.01;

  // КБМ
  const kbm = KBM_TABLE[Math.max(0, Math.min(13, request.kbm_class))] ?? 1.0;
  baseRate *= kbm;

  // Тип покрытия
  if (request.coverage_type === "total_loss_only") {
    baseRate *= 0.4;
  } else if (request.coverage_type === "partial") {
    baseRate *= 0.7;
  }

  // Противоугонная система
  if (request.has_anti_theft) baseRate -= 0.005;

  // Гаражное хранение
  if (request.garage_parking) baseRate -= 0.003;

  // Регион (Москва и СПб дороже)
  const region = OSAGO_REGIONS.find((r) => r.code === request.region_code);
  const regionCoef = region ? region.coefficient / 1.4 : 1.0;
  baseRate *= Math.min(1.3, regionCoef);

  // Франшиза снижает цену
  if (request.franchise_amount > 0) {
    const francRatio = request.franchise_amount / request.vehicle_price;
    baseRate *= Math.max(0.7, 1 - francRatio * 3);
  }

  // Доп. опции
  baseRate += request.additional_options.length * 0.003;

  // Ограничиваем ставку разумными пределами
  baseRate = Math.max(0.025, Math.min(0.15, baseRate));

  return Math.round(request.vehicle_price * baseRate);
}

/**
 * Рассчитывает стоимость ДМС
 *
 * @param request - параметры расчёта ДМС
 * @returns стоимость страховой премии в рублях
 */
export function calculateDmsPremium(request: DmsCalculationRequest): number {
  // Базовые тарифы по программам
  const basePrices: Record<string, number> = {
    basic: 18000,
    standard: 35000,
    premium: 65000,
    vip: 120000,
  };

  let premium = basePrices[request.program_type] ?? 35000;

  // Возраст
  if (request.age < 30) premium *= 0.85;
  else if (request.age < 45) premium *= 1.0;
  else if (request.age < 55) premium *= 1.3;
  else premium *= 1.7;

  // Пол
  if (request.gender === "female") premium *= 0.95;

  // Хронические заболевания
  if (request.has_chronic_diseases) premium *= 1.4;

  // Дополнительные опции
  if (request.include_dental) premium += 8000;
  if (request.include_emergency) premium += 3000;
  if (request.include_consultation) premium += 2000;

  // Регион
  const region = OSAGO_REGIONS.find((r) => r.code === request.region_code);
  if (region && (region.code === "77" || region.code === "78")) {
    premium *= 1.25;
  }

  // Корпоративная скидка
  if (request.employees_count && request.employees_count > 10) {
    const discount = Math.min(0.3, (request.employees_count - 10) * 0.01);
    premium *= 1 - discount;
  }

  return Math.round(premium);
}

/**
 * Рассчитывает стоимость страхования путешественников
 *
 * @param request - параметры расчёта travel страхования
 * @returns стоимость страховой премии в рублях
 */
export function calculateTravelPremium(request: TravelCalculationRequest): number {
  // Базовая ставка: $1-2.5/чел/день в зависимости от зоны и покрытия
  const countryData = TRAVEL_COUNTRIES.find((c) => c.value === request.destination_country);
  const zone = countryData?.zone ?? "world";
  const zoneRate = TRAVEL_ZONE_RATES[zone] ?? 1.5;

  // Базовая цена на человека в день (в рублях, ~1 USD = 90 RUB)
  let dailyRatePerPerson = 90 * zoneRate;

  // Сумма покрытия
  if (request.coverage_amount >= 100000) dailyRatePerPerson *= 1.5;
  else if (request.coverage_amount >= 50000) dailyRatePerPerson *= 1.2;

  // Возраст путешественников
  const avgAge = request.traveler_ages.reduce((a, b) => a + b, 0) / (request.traveler_ages.length || 1);
  if (avgAge >= 65) dailyRatePerPerson *= 1.8;
  else if (avgAge >= 50) dailyRatePerPerson *= 1.4;
  else if (avgAge < 18) dailyRatePerPerson *= 0.7;

  // Цель поездки
  if (request.trip_purpose === "business") dailyRatePerPerson *= 1.1;
  if (request.trip_purpose === "work") dailyRatePerPerson *= 1.2;

  // Доп. опции
  if (request.sport_activities) dailyRatePerPerson *= 1.3;
  if (request.include_cancellation) dailyRatePerPerson += 50;
  if (request.include_luggage) dailyRatePerPerson += 20;
  if (request.include_accident) dailyRatePerPerson += 15;
  if (request.multi_trip) dailyRatePerPerson *= 2.5; // обычно продают на год

  let premium = dailyRatePerPerson * request.trip_duration_days * request.travelers_count;

  // Скидка за группу
  if (request.travelers_count >= 5) premium *= 0.9;
  if (request.travelers_count >= 10) premium *= 0.8;

  return Math.round(premium);
}

/**
 * Рассчитывает стоимость страхования имущества
 *
 * @param request - параметры расчёта страхования имущества
 * @returns стоимость страховой премии в рублях
 */
export function calculatePropertyPremium(request: PropertyCalculationRequest): number {
  // Базовая ставка: 0.2-0.5% от стоимости
  let baseRate = 0.003; // 0.3%

  // Тип строения
  const materialRates: Record<string, number> = {
    brick: 0.0025,
    monolith: 0.0025,
    panel: 0.003,
    wood: 0.005,
    other: 0.004,
  };
  baseRate = materialRates[request.construction_material] ?? 0.003;

  // Тип недвижимости
  if (request.property_type === "commercial") baseRate *= 1.3;
  if (request.property_type === "house") baseRate *= 1.1;

  // Возраст здания
  const buildingAge = new Date().getFullYear() - request.construction_year;
  if (buildingAge > 30) baseRate *= 1.3;
  else if (buildingAge > 15) baseRate *= 1.1;

  // Этаж (последний и первый дороже)
  if (request.floor === 1 || request.floor === request.total_floors) {
    baseRate *= 1.05;
  }

  let premium = request.property_value * baseRate;

  // Доп. покрытия
  if (request.include_interior) premium += request.property_area * 3000 * 0.004; // ~3000 руб/кв.м
  if (request.include_liability) premium += 1500;
  if (request.include_movables) premium += 5000;

  // Регион
  const region = OSAGO_REGIONS.find((r) => r.code === request.region_code);
  if (region && (region.code === "77" || region.code === "78")) {
    premium *= 1.15;
  }

  return Math.round(Math.max(3000, premium));
}

/**
 * Рассчитывает стоимость ипотечного страхования
 *
 * @param request - параметры расчёта ипотечного страхования
 * @returns стоимость страховой премии в рублях
 */
export function calculateMortgagePremium(request: MortgageCalculationRequest): number {
  let premium = 0;

  // Страхование имущества: 0.15-0.25% от остатка долга
  if (request.include_property) {
    premium += request.loan_amount * 0.002;
  }

  // Страхование жизни: 0.2-0.5% от суммы кредита
  if (request.include_life) {
    let lifeRate = 0.003;
    if (request.borrower_age > 50) lifeRate += 0.002;
    else if (request.borrower_age > 40) lifeRate += 0.001;
    if (request.borrower_gender === "male") lifeRate *= 1.2;
    premium += request.loan_amount * lifeRate;
  }

  // Страхование титула: 0.1-0.2% от стоимости недвижимости
  if (request.include_title) {
    premium += request.property_value * 0.0015;
  }

  // Надбавка банка
  const bankMarkups: Record<string, number> = {
    sberbank: 1.0,
    vtb: 1.1,
    gazprombank: 1.05,
    alfabank: 1.15,
    default: 1.1,
  };
  const bankMarkup = bankMarkups[request.bank_name] ?? bankMarkups.default;
  premium *= bankMarkup;

  return Math.round(Math.max(5000, premium));
}

/**
 * Рассчитывает стоимость страхования жизни
 *
 * @param request - параметры расчёта страхования жизни
 * @returns стоимость страховой премии в рублях
 */
export function calculateLifePremium(request: LifeCalculationRequest): number {
  // Базовая ставка на 1 000 000 покрытия
  const baseProgramRates: Record<string, number> = {
    risk: 0.005,
    endowment: 0.06,
    investment: 0.07,
    pension: 0.08,
  };

  let baseRate = baseProgramRates[request.program_type] ?? 0.005;

  // Возраст
  if (request.age < 30) baseRate *= 0.6;
  else if (request.age < 40) baseRate *= 0.8;
  else if (request.age < 50) baseRate *= 1.2;
  else if (request.age < 60) baseRate *= 1.8;
  else baseRate *= 2.5;

  // Пол
  if (request.gender === "male") baseRate *= 1.3;

  // Срок страхования влияет на накопительные программы
  if (request.program_type !== "risk") {
    baseRate = baseRate / request.term_years;
  }

  // Факторы риска
  if (request.smoker) baseRate *= 1.5;
  if (request.dangerous_occupation) baseRate *= 1.4;
  if (request.dangerous_hobbies) baseRate *= 1.2;

  // Дополнительные опции
  if (request.include_accident) baseRate += 0.002;
  if (request.include_critical_illness) baseRate += 0.003;

  let premium = request.coverage_amount * baseRate;

  // Скидка при долгосрочном страховании
  if (request.term_years >= 10) premium *= 0.9;
  if (request.term_years >= 20) premium *= 0.85;

  return Math.round(Math.max(5000, premium));
}
