import { handleCors, getCorsHeaders } from "../_shared/utils.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-]/g, "");
}

function guessVehicleType(data: Record<string, unknown>): "car" | "motorcycle" | "truck" {
  const bodyObj = data?.body as Record<string, string> | undefined;
  const body = String(bodyObj?.type ?? data?.type ?? "").toLowerCase();
  if (/мото|скутер|мопед/i.test(body)) return "motorcycle";
  if (/грузов|фургон|тягач|самосвал/i.test(body)) return "truck";
  return "car";
}

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
    const rawPlate = body?.plate as string | undefined;
    const rawVin = body?.vin as string | undefined;

    if (!rawPlate && !rawVin) {
      return json({ error: "Укажите plate или vin" }, 400);
    }

    const plate = rawPlate ? normalizePlate(rawPlate) : undefined;

    // кэш
    if (plate) {
      const { data: cached } = await svc
        .from("insurance_vehicle_cache")
        .select("plate, vin, make, model, year, engine_power, body_type, color, vehicle_type, source")
        .eq("plate_normalized", plate)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (cached) {
        return json({ ...cached, cached: true, source: "cache" });
      }
    }

    // DaData
    const dadataKey = Deno.env.get("DADATA_API_KEY");
    if (!dadataKey) {
      return json({ error: "DADATA_API_KEY не сконфигурирован" }, 503);
    }

    const query = plate ?? rawVin!;
    const fetchStart = Date.now();
    const dadataResp = await fetch(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/car",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${dadataKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(8000),
      },
    );

    const fetchElapsed = Date.now() - fetchStart;

    // лог
    svc.from("insurance_provider_logs").insert({
      provider_code: "dadata",
      operation: "vehicle_lookup",
      category: "vehicle_lookup",
      is_success: dadataResp.ok,
      status: dadataResp.ok ? "ok" : "error",
      http_status: dadataResp.status,
      response_time_ms: fetchElapsed,
      user_id: user.id,
      error_message: dadataResp.ok ? null : `HTTP ${dadataResp.status}`,
    }).then(({ error: e }) => { if (e) console.error("[vehicle-lookup] лог:", e.message); });

    if (!dadataResp.ok) {
      const txt = await dadataResp.text().catch(() => "");
      return json({ error: `DaData ${dadataResp.status}: ${txt.slice(0, 200)}` }, 502);
    }

    const dadataJson = await dadataResp.json() as {
      suggestions?: Array<{ value?: string; data?: Record<string, unknown> }>;
    };

    const suggestion = dadataJson.suggestions?.[0];
    if (!suggestion?.data) {
      return json({ error: "Автомобиль не найден" }, 404);
    }

    const d = suggestion.data;
    const brand = d.brand as Record<string, string> | undefined;
    const model = d.model as Record<string, string> | undefined;
    const engine = d.engine as Record<string, unknown> | undefined;
    const bodyData = d.body as Record<string, string> | undefined;

    const result = {
      plate: (d.number as string) ?? plate ?? "",
      vin: (d.vin as string) ?? rawVin,
      make: brand?.name ?? String(d.brand ?? ""),
      model: model?.name ?? String(d.model ?? ""),
      year: Number(d.year) || 0,
      engine_power: engine?.power ? Number(engine.power) : undefined,
      body_type: bodyData?.type ?? undefined,
      color: (d.color as string) ?? undefined,
      vehicle_type: guessVehicleType(d),
      source: "dadata" as const,
      cached: false,
    };

    // сохраняем кэш (30 дней)
    if (result.make) {
      svc.from("insurance_vehicle_cache").upsert(
        {
          plate: result.plate || null,
          vin: result.vin || null,
          make: result.make,
          model: result.model,
          year: result.year || null,
          engine_power: result.engine_power || null,
          body_type: result.body_type || null,
          color: result.color || null,
          vehicle_type: result.vehicle_type,
          source: "dadata",
          expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        },
        { onConflict: "plate_normalized" },
      ).then(({ error: e }) => { if (e) console.error("[vehicle-lookup] кэш:", e.message); });
    }

    return json(result);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return json({ error: "Таймаут запроса к DaData" }, 504);
    }
    console.error("[vehicle-lookup]", err);
    return json({ error: (err as Error).message }, 500);
  }
});
