import { handleCors, getCorsHeaders } from "../_shared/utils.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

  try {
    if (req.method !== "POST") return json({ error: "POST required" }, 405);

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

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { session_id, offer_id, personal_data, vehicle_data, idempotency_key } = body ?? {};

    if (!session_id || !offer_id) {
      return json({ error: "session_id и offer_id обязательны" }, 400);
    }
    if (!personal_data?.full_name) {
      return json({ error: "personal_data.full_name обязателен" }, 400);
    }

    // idempotency — проверяем по external_id
    if (idempotency_key) {
      const { data: existing } = await svc
        .from("insurance_payments")
        .select("id, policy_id, status")
        .eq("external_id", idempotency_key)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // уже обработан — вернуть предыдущий результат
        const { data: policy } = await svc
          .from("insurance_policies")
          .select("policy_number")
          .eq("id", existing.policy_id)
          .limit(1)
          .maybeSingle();

        return json({
          status: "success",
          policy_number: policy?.policy_number ?? null,
          policy_id: existing.policy_id,
        });
      }
    }

    // загрузить сессию
    const { data: session, error: sessErr } = await svc
      .from("insurance_quote_sessions")
      .select("id, user_id, category, status")
      .eq("id", session_id)
      .limit(1)
      .maybeSingle();

    if (sessErr || !session) return json({ error: "Сессия не найдена" }, 404);
    if (session.user_id !== user.id) return json({ error: "Нет доступа к сессии" }, 403);

    // загрузить оффер
    const { data: offer, error: offerErr } = await svc
      .from("insurance_quote_offers")
      .select("id, session_id, provider_code, company_name, premium_amount, coverage_amount, valid_until, is_mock, external_offer_id, details")
      .eq("id", offer_id)
      .eq("session_id", session_id)
      .limit(1)
      .maybeSingle();

    if (offerErr || !offer) return json({ error: "Оффер не найден" }, 404);

    if (new Date(offer.valid_until) < new Date()) {
      return json({ error: "Оффер истёк, запросите новый расчёт" }, 410);
    }

    // --- маршрутизация по провайдеру ---

    if (offer.is_mock) {
      return await handleMockPurchase(svc, user.id, session, offer, personal_data, idempotency_key, json);
    }

    // real провайдер
    const { data: provider } = await svc
      .from("insurance_providers")
      .select("code, base_url, sandbox_mode, config")
      .eq("code", offer.provider_code)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!provider) {
      return json({ error: `Провайдер ${offer.provider_code} недоступен` }, 503);
    }

    switch (provider.code) {
      case "inssmart":
        return await handleInsSmartPurchase(svc, provider, user.id, session, offer, personal_data, vehicle_data, idempotency_key, json);

      case "cherehapa":
        return await handleCherehapaRedirect(provider, offer, json);

      default:
        return json({ error: `Покупка через ${provider.code} пока не поддерживается` }, 501);
    }
  } catch (err) {
    console.error("[insurance-purchase]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// --- mock ---

// deno-lint-ignore no-explicit-any
async function handleMockPurchase(
  svc: any,
  userId: string,
  session: { id: string; category: string },
  offer: { id: string; premium_amount: number; coverage_amount: number; company_name: string },
  personalData: Record<string, unknown>,
  idempotencyKey: string | undefined,
  json: (body: unknown, status?: number) => Response,
) {
  const policyNumber = "MOCK-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const policyId = crypto.randomUUID();

  const { error: policyErr } = await svc.from("insurance_policies").insert({
    id: policyId,
    user_id: userId,
    company_name: offer.company_name,
    type: session.category,
    status: "active",
    premium_amount: offer.premium_amount,
    coverage_amount: offer.coverage_amount,
    policy_number: policyNumber,
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 365 * 86400_000).toISOString(),
    holder_name: personalData.full_name,
  });

  if (policyErr) {
    console.error("[purchase] mock policy insert:", policyErr.message);
    return json({ status: "error", error_message: "Ошибка создания полиса" }, 500);
  }

  await svc.from("insurance_payments").insert({
    policy_id: policyId,
    user_id: userId,
    amount: offer.premium_amount,
    status: "completed",
    payment_method: "mock",
    external_id: idempotencyKey || crypto.randomUUID(),
  });

  // обновить статусы
  svc.from("insurance_quote_offers").update({ status: "purchased" }).eq("id", offer.id)
    .then(({ error: e }: { error: { message: string } | null }) => { if (e) console.error("[purchase] offer update:", e.message); });
  svc.from("insurance_quote_sessions").update({ status: "purchased" }).eq("id", session.id)
    .then(({ error: e }: { error: { message: string } | null }) => { if (e) console.error("[purchase] session update:", e.message); });

  return json({
    status: "success",
    policy_number: policyNumber,
    policy_id: policyId,
  });
}

// --- InsSmart ---

// deno-lint-ignore no-explicit-any
async function handleInsSmartPurchase(
  svc: any,
  provider: { base_url: string | null; sandbox_mode: boolean; config: Record<string, unknown> },
  userId: string,
  session: { id: string; category: string },
  offer: { id: string; external_offer_id: string; premium_amount: number; coverage_amount: number; company_name: string },
  personalData: Record<string, unknown>,
  vehicleData: Record<string, unknown> | undefined,
  idempotencyKey: string | undefined,
  json: (body: unknown, status?: number) => Response,
) {
  const apiKey = Deno.env.get("INSSMART_API_KEY");
  if (!apiKey) return json({ status: "error", error_message: "INSSMART_API_KEY не настроен" }, 503);

  const baseUrl = provider.base_url || "https://b2b-api.inssmart.ru/api/v1";
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
  };
  if (provider.sandbox_mode) headers["X-Sandbox"] = "true";

  const issueBody = {
    offer_id: offer.external_offer_id,
    personal_data: personalData,
    vehicle_data: vehicleData ?? undefined,
    idempotency_key: idempotencyKey,
  };

  const resp = await fetch(`${baseUrl}/issue`, {
    method: "POST",
    headers,
    body: JSON.stringify(issueBody),
    signal: AbortSignal.timeout(15_000),
  });

  svc.from("insurance_provider_logs").insert({
    provider_code: "inssmart",
    category: session.category,
    status: resp.ok ? "ok" : "error",
    response_time_ms: 0,
    user_id: userId,
    error_message: resp.ok ? null : `HTTP ${resp.status}`,
  }).then(({ error: e }: { error: { message: string } | null }) => { if (e) console.error("[purchase] лог:", e.message); });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error(`[purchase] InsSmart issue ${resp.status}: ${txt.slice(0, 300)}`);
    return json({ status: "error", error_message: `Ошибка оформления: ${resp.status}` }, 502);
  }

  const result = await resp.json() as Record<string, unknown>;

  // в зависимости от ответа — success или requires_payment
  if (result.payment_url) {
    const policyId = crypto.randomUUID();
    await svc.from("insurance_policies").insert({
      id: policyId,
      user_id: userId,
      company_name: offer.company_name,
      type: session.category,
      status: "pending_payment",
      premium_amount: offer.premium_amount,
      coverage_amount: offer.coverage_amount,
      policy_number: String(result.policy_number ?? ""),
      external_id: String(result.id ?? ""),
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 365 * 86400_000).toISOString(),
      holder_name: personalData.full_name,
    });

    await svc.from("insurance_payments").insert({
      policy_id: policyId,
      user_id: userId,
      amount: offer.premium_amount,
      status: "pending",
      payment_method: "online",
      external_id: idempotencyKey || String(result.id ?? crypto.randomUUID()),
    });

    return json({
      status: "requires_payment",
      policy_id: policyId,
      payment_url: String(result.payment_url),
      external_id: String(result.id ?? ""),
    });
  }

  // прямой успех
  const policyId = crypto.randomUUID();
  await svc.from("insurance_policies").insert({
    id: policyId,
    user_id: userId,
    company_name: offer.company_name,
    type: session.category,
    status: "active",
    premium_amount: offer.premium_amount,
    coverage_amount: offer.coverage_amount,
    policy_number: String(result.policy_number ?? ""),
    external_id: String(result.id ?? ""),
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 365 * 86400_000).toISOString(),
    holder_name: personalData.full_name,
  });

  await svc.from("insurance_payments").insert({
    policy_id: policyId,
    user_id: userId,
    amount: offer.premium_amount,
    status: "completed",
    payment_method: "online",
    external_id: idempotencyKey || String(result.id ?? crypto.randomUUID()),
  });

  svc.from("insurance_quote_offers").update({ status: "purchased" }).eq("id", offer.id)
    .then(({ error: e }: { error: { message: string } | null }) => { if (e) console.error("[purchase] offer:", e.message); });
  svc.from("insurance_quote_sessions").update({ status: "purchased" }).eq("id", session.id)
    .then(({ error: e }: { error: { message: string } | null }) => { if (e) console.error("[purchase] session:", e.message); });

  return json({
    status: "success",
    policy_number: String(result.policy_number ?? ""),
    policy_id: policyId,
    pdf_url: result.pdf_url ? String(result.pdf_url) : undefined,
    external_id: String(result.id ?? ""),
  });
}

// --- Cherehapa (redirect) ---

function handleCherehapaRedirect(
  provider: { config: Record<string, unknown> },
  offer: { external_offer_id: string },
  json: (body: unknown, status?: number) => Response,
) {
  const partnerUrl = provider.config?.partner_url as string | undefined;
  if (!partnerUrl) {
    return json({ status: "error", error_message: "URL партнёра Cherehapa не настроен" }, 503);
  }

  const paymentUrl = `${partnerUrl}?offer=${encodeURIComponent(offer.external_offer_id)}`;
  return json({
    status: "requires_payment",
    payment_url: paymentUrl,
    external_id: offer.external_offer_id,
  });
}
