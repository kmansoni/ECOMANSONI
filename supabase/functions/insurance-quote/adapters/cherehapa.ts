import type {
  AdapterConfig,
  AdapterOffer,
  AdapterQuoteParams,
  AdapterQuoteResult,
  ProviderAdapter,
} from "./types.ts";

export class CherhapaAdapter implements ProviderAdapter {
  readonly code = "cherehapa";

  supports(category: string) {
    return category === "travel";
  }

  async getQuotes(
    req: AdapterQuoteParams,
    cfg: AdapterConfig,
  ): Promise<AdapterQuoteResult> {
    const t0 = Date.now();
    const elapsed = () => Date.now() - t0;

    if (req.category !== "travel") {
      return { status: "unsupported", offers: [], response_time_ms: elapsed() };
    }

    const apiKey = Deno.env.get("CHEREHAPA_API_KEY");
    if (!apiKey) {
      return {
        status: "error",
        offers: [],
        error_message: "CHEREHAPA_API_KEY не настроен",
        response_time_ms: elapsed(),
      };
    }

    const baseUrl = cfg.base_url || "https://api.cherehapa.ru/v2";
    const p = req.params;

    const body = {
      country: p.country ?? "thailand",
      date_from: p.start_date ?? p.date_from,
      date_to: p.end_date ?? p.date_to,
      travelers: [{
        birth_date: p.birth_date ?? "1990-01-01",
      }],
      coverage: Number(p.coverage_amount ?? 50_000),
      currency: "USD",
    };

    try {
      const resp = await fetch(`${baseUrl}/calculate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(cfg.sandbox_mode ? { "X-Sandbox": "true" } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(cfg.timeout_ms),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        return {
          status: "error",
          offers: [],
          error_message: `Cherehapa ${resp.status}: ${text.slice(0, 200)}`,
          response_time_ms: elapsed(),
        };
      }

      const data = await resp.json() as { offers?: unknown[]; results?: unknown[] };
      const rawOffers = data.offers ?? data.results ?? [];

      if (!Array.isArray(rawOffers) || !rawOffers.length) {
        return { status: "ok", offers: [], response_time_ms: elapsed() };
      }

      const offers = rawOffers
        .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
        .map<AdapterOffer>((o) => ({
          external_offer_id: String(o.id ?? o.offer_id ?? crypto.randomUUID()),
          company_name: String(o.company ?? o.insurer ?? "Cherehapa Partner"),
          premium_amount: Math.round(Number(o.price ?? o.premium ?? 0)),
          premium_monthly: undefined,
          coverage_amount: Math.round(Number(o.coverage ?? o.sum ?? body.coverage)),
          deductible_amount: o.deductible ? Math.round(Number(o.deductible)) : 0,
          valid_until: new Date(Date.now() + 3600_000).toISOString(), // час на покупку
          features: Array.isArray(o.options)
            ? o.options.map(String)
            : ["Медпомощь за рубежом", "Задержка рейса"],
          exclusions: Array.isArray(o.exclusions) ? o.exclusions.map(String) : [],
          documents_required: ["Загранпаспорт"],
          purchase_available: false, // redirect на партнёрскую ссылку
          is_mock: false,
          details: {
            source: "cherehapa",
            partner_url: o.url ?? o.purchase_url ?? null,
            currency: o.currency ?? "USD",
          },
        }));

      return { status: "ok", offers, response_time_ms: elapsed() };
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
