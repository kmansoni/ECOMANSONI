import type {
  AdapterConfig,
  AdapterOffer,
  AdapterQuoteParams,
  AdapterQuoteResult,
  ProviderAdapter,
} from "./types.ts";

const PROVIDERS = [
  { id: "ingos", name: "Ингосстрах", rating: 4.8, mult: 1.05 },
  { id: "sogaz", name: "СОГАЗ", rating: 4.7, mult: 1.0 },
  { id: "alfa", name: "АльфаСтрахование", rating: 4.6, mult: 0.97 },
  { id: "ren", name: "Ренессанс Страхование", rating: 4.5, mult: 0.95 },
  { id: "rosgos", name: "РОСГОССТРАХ", rating: 4.3, mult: 0.93 },
];

const SUPPORTED = new Set([
  "osago", "kasko", "dms", "travel", "property", "mortgage", "life",
]);

export class MockAdapter implements ProviderAdapter {
  readonly code = "mock";

  supports(category: string) {
    return SUPPORTED.has(category);
  }

  async getQuotes(
    req: AdapterQuoteParams,
    _cfg: AdapterConfig,
  ): Promise<AdapterQuoteResult> {
    const t0 = Date.now();
    // имитируем задержку сети 50-200ms
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));

    const calc = CALCULATORS[req.category];
    if (!calc) {
      return { status: "unsupported", offers: [], response_time_ms: Date.now() - t0 };
    }

    const offers = calc(req.params).map((o) => ({
      ...o,
      is_mock: true,
      purchase_available: false,
    }));

    return { status: "ok", offers, response_time_ms: Date.now() - t0 };
  }
}

// --- калькуляторы по категориям ---

type CalcFn = (p: Record<string, unknown>) => Omit<AdapterOffer, "is_mock" | "purchase_available">[];

const CALCULATORS: Record<string, CalcFn> = {
  osago: calcOsago,
  kasko: calcKasko,
  dms: calcDms,
  travel: calcTravel,
  property: calcProperty,
  mortgage: calcMortgage,
  life: calcLife,
};

function validUntil(): string {
  return new Date(Date.now() + 86400_000).toISOString();
}

function baseOffer(
  category: string,
  provider: typeof PROVIDERS[number],
  premium: number,
  coverage: number,
  features: string[],
): Omit<AdapterOffer, "is_mock" | "purchase_available"> {
  return {
    external_offer_id: `mock-${category}-${provider.id}`,
    company_name: provider.name,
    premium_amount: premium,
    premium_monthly: Math.round(premium / 12),
    coverage_amount: coverage,
    deductible_amount: 0,
    valid_until: validUntil(),
    features,
    exclusions: ["Умышленное повреждение", "Управление в состоянии опьянения"],
    documents_required: ["Паспорт", "Заявление"],
    details: { provider_rating: provider.rating },
  };
}

function calcOsago(p: Record<string, unknown>) {
  const power = Number(p.engine_power ?? 100);
  const kbm = Number(p.kbm_coefficient ?? 1.0);
  const age = Number(p.driver_age ?? 30);
  const exp = Number(p.driver_experience ?? 5);

  const km = power <= 50 ? 0.6 : power <= 70 ? 1.0 : power <= 100 ? 1.1
    : power <= 120 ? 1.2 : power <= 150 ? 1.4 : 1.6;
  const kvs = (age < 25 && exp < 3) ? 1.77 : 0.83;
  const base = 5000 * km * kbm * kvs;

  return PROVIDERS.slice(0, 4).map((pr) =>
    baseOffer("osago", pr, Math.round(base * pr.mult), 400_000, [
      "Выплата до 400 000 ₽", "Урегулирование онлайн", "Без ограничений",
    ])
  );
}

function calcKasko(p: Record<string, unknown>) {
  const carValue = Number(p.car_value ?? 1_500_000);
  const carAge = Number(p.car_age ?? 3);
  const franchise = Number(p.franchise ?? 0);

  const ageCoef = carAge <= 1 ? 1.0 : carAge <= 3 ? 0.95 : carAge <= 5 ? 0.85 : 0.75;
  const franCoef = franchise === 0 ? 1.0 : franchise <= 15000 ? 0.9 : 0.8;
  const base = carValue * 0.04 * ageCoef * franCoef;

  return PROVIDERS.map((pr) =>
    baseOffer("kasko", pr, Math.round(base * pr.mult), carValue, [
      "Угон и ущерб", "Эвакуатор бесплатно", "Аварийный комиссар",
    ])
  );
}

function calcDms(p: Record<string, unknown>) {
  const persons = Number(p.persons_count ?? 1);
  const program = String(p.program ?? "standard");
  const rate = program === "premium" ? 1.8 : program === "vip" ? 2.5 : 1.0;
  const base = 15000 * persons * rate;

  return PROVIDERS.slice(0, 4).map((pr) =>
    baseOffer("dms", pr, Math.round(base * pr.mult), 500_000 * persons, [
      "Поликлиника", "Стоматология", "Скорая помощь",
    ])
  );
}

function calcTravel(p: Record<string, unknown>) {
  const days = Number(p.days ?? 7);
  const persons = Number(p.persons_count ?? 1);
  const coverage = Number(p.coverage_amount ?? 50_000);
  const covRate = coverage >= 100_000 ? 1.5 : 1.0;
  const base = days * persons * 80 * covRate;

  return PROVIDERS.slice(0, 3).map((pr) =>
    baseOffer("travel", pr, Math.round(base * pr.mult), coverage, [
      "Медпомощь за рубежом", "Задержка рейса", "Багаж",
    ])
  );
}

function calcProperty(p: Record<string, unknown>) {
  const value = Number(p.property_value ?? 3_000_000);
  const area = Number(p.area ?? 60);
  const base = value * 0.005 * (area / 60);

  return PROVIDERS.slice(0, 4).map((pr) =>
    baseOffer("property", pr, Math.round(base * pr.mult), value, [
      "Пожар и потоп", "Кража", "Ущерб от 3-х лиц",
    ])
  );
}

function calcMortgage(p: Record<string, unknown>) {
  const loan = Number(p.loan_amount ?? 5_000_000);
  const base = loan * 0.0015;

  return PROVIDERS.slice(0, 4).map((pr) =>
    baseOffer("mortgage", pr, Math.round(base * pr.mult), loan, [
      "Имущество", "Жизнь и здоровье", "Титул",
    ])
  );
}

function calcLife(p: Record<string, unknown>) {
  const age = Number(p.age ?? 35);
  const coverage = Number(p.coverage_amount ?? 1_000_000);
  const ageCoef = age < 30 ? 0.8 : age < 40 ? 1.0 : age < 50 ? 1.4 : 2.0;
  const base = coverage * 0.003 * ageCoef;

  return PROVIDERS.slice(0, 3).map((pr) =>
    baseOffer("life", pr, Math.round(base * pr.mult), coverage, [
      "НС и болезнь", "Инвалидность", "Накопительный элемент",
    ])
  );
}
