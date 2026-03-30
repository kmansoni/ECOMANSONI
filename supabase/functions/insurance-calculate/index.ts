// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

interface CalculationResult {
  id: string;
  category: string;
  provider_id: string;
  provider_name: string;
  provider_logo: string;
  provider_rating: number;
  premium_amount: number;
  premium_monthly?: number;
  coverage_amount: number;
  deductible_amount?: number;
  currency: "RUB";
  valid_until: string;
  features: string[];
  exclusions: string[];
  documents_required: string[];
  details: Record<string, unknown>;
}

const PROVIDERS = [
  { id: "ingos", name: "Ингосстрах", rating: 4.8, baseMultiplier: 1.05 },
  { id: "sogaz", name: "СОГАЗ", rating: 4.7, baseMultiplier: 1.0 },
  { id: "alfa", name: "АльфаСтрахование", rating: 4.6, baseMultiplier: 0.97 },
  { id: "ren", name: "Ренессанс Страхование", rating: 4.5, baseMultiplier: 0.95 },
  { id: "rosgos", name: "РОСГОССТРАХ", rating: 4.3, baseMultiplier: 0.93 },
];

function buildResult(
  category: string,
  productName: string,
  provider: { id: string; name: string; rating: number; baseMultiplier: number },
  premiumAmount: number,
  coverageAmount: number,
  features: string[],
): CalculationResult {
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `${category}-${provider.id}`,
    category,
    provider_id: provider.id,
    provider_name: provider.name,
    provider_logo: "",
    provider_rating: provider.rating,
    premium_amount: premiumAmount,
    premium_monthly: Math.round(premiumAmount / 12),
    coverage_amount: coverageAmount,
    deductible_amount: 0,
    currency: "RUB",
    valid_until: validUntil,
    features,
    exclusions: ["Умышленное повреждение", "Управление в состоянии опьянения"],
    documents_required: ["Паспорт", "Заявление"],
    details: {
      product_name: productName,
    },
  };
}

function calcOsago(params: Record<string, unknown>): CalculationResult[] {
  const power = Number(params.engine_power ?? 100);
  const kbm = Number(params.kbm_coefficient ?? 1.0);
  const age = Number(params.driver_age ?? 30);
  const exp = Number(params.driver_experience ?? 5);

  const km = power <= 50 ? 0.6 : power <= 70 ? 1.0 : power <= 100 ? 1.1 : power <= 120 ? 1.2 : power <= 150 ? 1.4 : 1.6;
  const kvs = age < 25 && exp < 3 ? 1.77 : 0.83;
  const base = 5000 * km * kbm * kvs;

  return PROVIDERS.slice(0, 4).map((p) => buildResult(
    "osago",
    "ОСАГО",
    p,
    Math.round(base * p.baseMultiplier),
    400000,
    ["Выплата до 400 000 \u20bd", "Урегулирование онлайн", "Без ограничений"],
  ));
}

function calcKasko(params: Record<string, unknown>): CalculationResult[] {
  const carValue = Number(params.car_value ?? 1500000);
  const age = Number(params.car_age ?? 3);
  const franchise = Number(params.franchise ?? 0);
  const ageCoef = age <= 1 ? 1.0 : age <= 3 ? 0.95 : age <= 5 ? 0.85 : 0.75;
  const franCoef = franchise === 0 ? 1.0 : franchise <= 15000 ? 0.9 : 0.8;
  const rate = 0.04 * ageCoef * franCoef;
  const base = carValue * rate;

  return PROVIDERS.slice(0, 5).map((p) => buildResult(
    "kasko",
    "КАСКО",
    p,
    Math.round(base * p.baseMultiplier),
    carValue,
    ["Угон и ущерб", "Эвакуатор бесплатно", "Аварийный комиссар"],
  ));
}

function calcDms(params: Record<string, unknown>): CalculationResult[] {
  const persons = Number(params.persons_count ?? 1);
  const program = String(params.program ?? "standard");
  const programRate = program === "premium" ? 1.8 : program === "vip" ? 2.5 : 1.0;
  const base = 15000 * persons * programRate;

  return PROVIDERS.slice(0, 4).map((p) => buildResult(
    "dms",
    "ДМС",
    p,
    Math.round(base * p.baseMultiplier),
    500000 * persons,
    ["Поликлиника", "Стоматология", "Скорая помощь"],
  ));
}

function calcTravel(params: Record<string, unknown>): CalculationResult[] {
  const days = Number(params.days ?? 7);
  const persons = Number(params.persons_count ?? 1);
  const coverageAmount = Number(params.coverage_amount ?? 50000);
  const coverageRate = coverageAmount >= 100000 ? 1.5 : 1.0;
  const base = days * persons * 80 * coverageRate;

  return PROVIDERS.slice(0, 3).map((p) => buildResult(
    "travel",
    "Туристическое страхование",
    p,
    Math.round(base * p.baseMultiplier),
    coverageAmount,
    ["Медпомощь за рубежом", "Задержка рейса", "Багаж"],
  ));
}

function calcProperty(params: Record<string, unknown>): CalculationResult[] {
  const value = Number(params.property_value ?? 3000000);
  const area = Number(params.area ?? 60);
  const base = value * 0.005 * (area / 60);

  return PROVIDERS.slice(0, 4).map((p) => buildResult(
    "property",
    "Страхование имущества",
    p,
    Math.round(base * p.baseMultiplier),
    value,
    ["Пожар и потоп", "Кража", "Ущерб от 3-х лиц"],
  ));
}

function calcMortgage(params: Record<string, unknown>): CalculationResult[] {
  const loanAmount = Number(params.loan_amount ?? 5000000);
  const rate = 0.0015;
  const base = loanAmount * rate;

  return PROVIDERS.slice(0, 4).map((p) => buildResult(
    "mortgage",
    "Ипотечное страхование",
    p,
    Math.round(base * p.baseMultiplier),
    loanAmount,
    ["Имущество", "Жизнь и здоровье", "Титул"],
  ));
}

function calcLife(params: Record<string, unknown>): CalculationResult[] {
  const age = Number(params.age ?? 35);
  const coverage = Number(params.coverage_amount ?? 1000000);
  const ageCoef = age < 30 ? 0.8 : age < 40 ? 1.0 : age < 50 ? 1.4 : 2.0;
  const base = coverage * 0.003 * ageCoef;

  return PROVIDERS.slice(0, 3).map((p) => buildResult(
    "life",
    "Страхование жизни",
    p,
    Math.round(base * p.baseMultiplier),
    coverage,
    ["НС и болезнь", "Инвалидность", "Накопительный элемент"],
  ));
}

function calculateByCategory(category: string, params: Record<string, unknown>): CalculationResult[] {
  switch (category) {
    case "osago": return calcOsago(params);
    case "kasko": return calcKasko(params);
    case "dms": return calcDms(params);
    case "travel": return calcTravel(params);
    case "property": return calcProperty(params);
    case "mortgage": return calcMortgage(params);
    case "life": return calcLife(params);
    default: return calcOsago(params);
  }
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const startTime = Date.now();
    const body = await req.json();
    const category = String(body?.category ?? "");
    const params = (body?.params ?? body?.data) as Record<string, unknown> | undefined;

    if (!category || !params) {
      return new Response(
        JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "category and params required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = calculateByCategory(category, params);
    const calculationTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        request_id: crypto.randomUUID(),
        category,
        results,
        total_providers_queried: results.length,
        successful_providers: results.length,
        failed_providers: [],
        calculation_time_ms: calculationTime,
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: { code: "CALCULATION_ERROR", message: (error as Error).message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
