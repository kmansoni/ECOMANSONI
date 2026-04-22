// deno-lint-ignore-file
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { loadActiveAdapters } from "./adapters/registry.ts";
import { parseQuoteBody } from "./lib/validate.ts";
import { rankOffers } from "./lib/rank.ts";
import type { AdapterQuoteResult } from "./adapters/types.ts";

const GLOBAL_TIMEOUT_MS = 20_000;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  // общий таймаут на весь хендлер
  const ac = new AbortController();
  const globalTimer = setTimeout(() => ac.abort(), GLOBAL_TIMEOUT_MS);

  try {
    // --- auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Требуется авторизация" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Невалидный токен" }, 401);

    // service_role для логов и записи в БД
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- parse body ---
    const body = await req.json();
    const parsed = parseQuoteBody(body);
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const { category, params, preferred_providers } = parsed;
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // --- загрузить адаптеры ---
    const adapters = await loadActiveAdapters(serviceClient, category, preferred_providers);
    if (!adapters.length) {
      return json({ error: `Нет активных провайдеров для категории ${category}` }, 404);
    }

    // --- параллельные запросы ---
    const settled = await Promise.allSettled(
      adapters.map(({ adapter, config }) => {
        const perProviderAc = new AbortController();
        const timer = setTimeout(() => perProviderAc.abort(), config.timeout_ms);

        const promise = adapter.getQuotes(
          { category, request_id: requestId, params },
          config,
        ).finally(() => clearTimeout(timer));

        // если общий таймаут сработал — прервать всё
        ac.signal.addEventListener("abort", () => perProviderAc.abort(), { once: true });
        return promise;
      }),
    );

    // --- агрегируем результаты ---
    type FailedInfo = { code: string; error: string; response_time_ms: number };
    const allOffers: Array<ReturnType<typeof rankOffers>[number] & { provider_code: string }> = [];
    const failedProviders: FailedInfo[] = [];
    let succeededCount = 0;

    for (let i = 0; i < settled.length; i++) {
      const entry = settled[i];
      const providerCode = adapters[i].adapter.code;

      let result: AdapterQuoteResult;
      if (entry.status === "rejected") {
        result = {
          status: "error",
          offers: [],
          error_message: String(entry.reason),
          response_time_ms: 0,
        };
      } else {
        result = entry.value;
      }

      // логируем каждый вызов
      serviceClient.from("insurance_provider_logs").insert({
        request_id: requestId,
        provider_code: providerCode,
        operation: category,
        category,
        is_success: result.status === "ok",
        status: result.status,
        http_status: result.status === "ok" ? 200 : 500,
        offers_count: result.offers.length,
        error_message: result.error_message ?? null,
        response_time_ms: result.response_time_ms,
        user_id: user.id,
      }).then(({ error: logErr }) => {
        if (logErr) console.error(`[insurance-quote] ошибка записи лога: ${logErr.message}`);
      });

      if (result.status === "ok" && result.offers.length) {
        succeededCount++;
        for (const offer of result.offers) {
          allOffers.push({ ...offer, provider_code: providerCode, rank: 0 });
        }
      } else if (result.status !== "ok" || result.offers.length === 0) {
        failedProviders.push({
          code: providerCode,
          error: result.error_message ?? result.status,
          response_time_ms: result.response_time_ms,
        });
      }
    }

    // --- ранжирование ---
    const ranked = rankOffers(allOffers);
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const sessionId = crypto.randomUUID();
    const totalTime = Date.now() - startTime;

    // --- сохраняем сессию ---
    await serviceClient.from("insurance_quote_sessions").insert({
      id: sessionId,
      user_id: user.id,
      category,
      request_params: params,
      params,
      providers_queried: adapters.length,
      providers_succeeded: succeededCount,
      offers_count: ranked.length,
      calculation_time_ms: totalTime,
      expires_at: expiresAt,
    });

    // --- сохраняем офферы ---
    if (ranked.length) {
      const offerRows = ranked.map((o) => ({
        id: crypto.randomUUID(),
        session_id: sessionId,
        provider_code: (o as typeof allOffers[number]).provider_code,
        company_name: o.company_name,
        external_offer_id: o.external_offer_id,
        premium_amount: o.premium_amount,
        premium_monthly: o.premium_monthly ?? null,
        coverage_amount: o.coverage_amount,
        deductible_amount: o.deductible_amount ?? 0,
        valid_until: o.valid_until,
        features: o.features,
        exclusions: o.exclusions,
        documents_required: o.documents_required,
        purchase_available: o.purchase_available,
        is_mock: o.is_mock,
        rank: o.rank,
        details: o.details,
      }));

      const { error: insertErr } = await serviceClient
        .from("insurance_quote_offers")
        .insert(offerRows);

      if (insertErr) {
        console.error(`[insurance-quote] ошибка записи офферов: ${insertErr.message}`);
      }
    }

    return json({
      session_id: sessionId,
      category,
      offers: ranked.map((o) => ({
        id: crypto.randomUUID(),
        session_id: sessionId,
        provider_code: (o as typeof allOffers[number]).provider_code,
        company_name: o.company_name,
        external_offer_id: o.external_offer_id,
        premium_amount: o.premium_amount,
        premium_monthly: o.premium_monthly ?? null,
        coverage_amount: o.coverage_amount,
        deductible_amount: o.deductible_amount ?? 0,
        valid_until: o.valid_until,
        features: o.features,
        exclusions: o.exclusions,
        documents_required: o.documents_required,
        purchase_available: o.purchase_available,
        is_mock: o.is_mock,
        rank: o.rank,
        details: o.details,
      })),
      providers_queried: adapters.length,
      providers_succeeded: succeededCount,
      providers_failed: failedProviders,
      calculation_time_ms: totalTime,
      expires_at: expiresAt,
      has_real_quotes: ranked.some((o) => !o.is_mock),
    });
  } catch (err) {
    const msg = err instanceof DOMException && err.name === "AbortError"
      ? "Превышен общий таймаут запроса"
      : (err as Error).message ?? "Внутренняя ошибка";
    console.error(`[insurance-quote] ${msg}`, err);
    return json({ error: msg }, 500);
  } finally {
    clearTimeout(globalTimer);
  }
});
