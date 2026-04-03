import type {
  AdapterConfig,
  AdapterOffer,
  AdapterQuoteParams,
  AdapterQuoteResult,
  ProviderAdapter,
} from "./types.ts";

const SUPPORTED_CATEGORIES = new Set([
  "osago", "kasko", "dms", "property", "mortgage", "life",
]);

export class InsSmartAdapter implements ProviderAdapter {
  readonly code = "inssmart";

  supports(category: string) {
    return SUPPORTED_CATEGORIES.has(category);
  }

  async getQuotes(
    req: AdapterQuoteParams,
    cfg: AdapterConfig,
  ): Promise<AdapterQuoteResult> {
    const t0 = Date.now();
    const elapsed = () => Date.now() - t0;

    const apiKey = Deno.env.get("INSSMART_API_KEY");
    if (!apiKey) {
      return {
        status: "error",
        offers: [],
        error_message: "INSSMART_API_KEY не настроен",
        response_time_ms: elapsed(),
      };
    }

    const baseUrl = cfg.base_url || "https://b2b-api.inssmart.ru/api/v1";
    const headers: Record<string, string> = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    };
    if (cfg.sandbox_mode) headers["X-Sandbox"] = "true";

    const body = mapToInsSmartRequest(req.category, req.params);
    if (!body) {
      return { status: "unsupported", offers: [], response_time_ms: elapsed() };
    }

    try {
      // 1) создаём расчёт
      const calcResp = await fetch(`${baseUrl}/calculation`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(cfg.timeout_ms),
      });

      if (!calcResp.ok) {
        const text = await calcResp.text().catch(() => "");
        return {
          status: "error",
          offers: [],
          error_message: `InsSmart ${calcResp.status}: ${text.slice(0, 200)}`,
          response_time_ms: elapsed(),
        };
      }

      const calcData = await calcResp.json() as { id?: string; offers?: unknown[] };

      // Некоторые расчёты возвращают offers сразу
      if (calcData.offers && Array.isArray(calcData.offers) && calcData.offers.length > 0) {
        return {
          status: "ok",
          offers: mapOffers(calcData.offers, req.category),
          response_time_ms: elapsed(),
        };
      }

      const calcId = calcData.id;
      if (!calcId) {
        return {
          status: "error",
          offers: [],
          error_message: "InsSmart не вернул id расчёта",
          response_time_ms: elapsed(),
        };
      }

      // 2) polling — max 5 попыток по 2 сек
      for (let attempt = 0; attempt < 5; attempt++) {
        await delay(2000);
        if (elapsed() >= cfg.timeout_ms) {
          return { status: "timeout", offers: [], response_time_ms: elapsed() };
        }

        const pollResp = await fetch(`${baseUrl}/calculation/${calcId}/offers`, {
          headers,
          signal: AbortSignal.timeout(Math.max(cfg.timeout_ms - elapsed(), 1000)),
        });

        if (!pollResp.ok) continue;

        const pollData = await pollResp.json() as { status?: string; offers?: unknown[] };
        if (pollData.status === "pending" || pollData.status === "in_progress") continue;

        if (pollData.offers?.length) {
          return {
            status: "ok",
            offers: mapOffers(pollData.offers, req.category),
            response_time_ms: elapsed(),
          };
        }
      }

      return { status: "timeout", offers: [], response_time_ms: elapsed() };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { status: "timeout", offers: [], response_time_ms: elapsed() };
      }
      return {
        status: "error",
        offers: [],
        error_message: String((err as Error).message ?? err),
        response_time_ms: elapsed(),
      };
    }
  }
}

// --- маппинг запроса ---

function mapToInsSmartRequest(
  category: string,
  params: Record<string, unknown>,
): Record<string, unknown> | null {
  switch (category) {
    case "osago":
      return {
        type: "osago",
        vehicle: {
          power: Number(params.engine_power ?? 100),
          year: Number(params.car_year ?? new Date().getFullYear()),
        },
        owner: {
          birth_date: params.birth_date ?? "1990-01-01",
          experience_date: params.experience_start_date ?? "2010-01-01",
        },
        region_code: params.region_code ?? "77",
      };

    case "kasko":
      return {
        type: "kasko",
        vehicle: {
          make: params.vehicle_make ?? "Unknown",
          model: params.vehicle_model ?? "Unknown",
          year: Number(params.vehicle_year ?? params.car_year ?? new Date().getFullYear()),
          value: Number(params.car_value ?? 1_500_000),
        },
        owner: { birth_date: params.birth_date ?? "1990-01-01" },
      };

    case "dms":
      return {
        type: "dms",
        insured_count: Number(params.persons_count ?? 1),
        program: params.program ?? "standard",
      };

    case "property":
      return {
        type: "property",
        object_value: Number(params.property_value ?? 3_000_000),
        area_sqm: Number(params.area ?? 60),
      };

    case "mortgage":
      return {
        type: "mortgage",
        loan_amount: Number(params.loan_amount ?? 5_000_000),
        property_value: Number(params.property_value ?? 7_000_000),
      };

    case "life":
      return {
        type: "life",
        insured_age: Number(params.age ?? 35),
        coverage: Number(params.coverage_amount ?? 1_000_000),
      };

    default:
      return null;
  }
}

// --- маппинг ответа ---

function mapOffers(raw: unknown[], category: string): AdapterOffer[] {
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      external_offer_id: String(item.id ?? item.offer_id ?? crypto.randomUUID()),
      company_name: String(item.company_name ?? item.insurer_name ?? "InsSmart"),
      premium_amount: Math.round(Number(item.premium ?? item.price ?? 0)),
      premium_monthly: item.premium_monthly ? Math.round(Number(item.premium_monthly)) : undefined,
      coverage_amount: Math.round(Number(item.coverage ?? item.sum_insured ?? 0)),
      deductible_amount: item.deductible ? Math.round(Number(item.deductible)) : undefined,
      valid_until: String(item.valid_until ?? new Date(Date.now() + 86400_000).toISOString()),
      features: Array.isArray(item.features) ? item.features.map(String) : [],
      exclusions: Array.isArray(item.exclusions) ? item.exclusions.map(String) : [],
      documents_required: Array.isArray(item.documents)
        ? item.documents.map(String)
        : ["Паспорт", "Заявление"],
      purchase_available: true,
      is_mock: false,
      details: {
        source: "inssmart",
        category,
        raw_id: item.id ?? null,
      },
    }));
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
