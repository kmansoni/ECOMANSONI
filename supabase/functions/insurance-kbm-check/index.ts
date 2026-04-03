import { handleCors, getCorsHeaders } from "../_shared/utils.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const KBM_CLASSES = [
  { klass: 0, coefficient: 2.45, label: "M" },
  { klass: 1, coefficient: 2.3, label: "0" },
  { klass: 2, coefficient: 1.55, label: "1" },
  { klass: 3, coefficient: 1.4, label: "2" },
  { klass: 4, coefficient: 1.25, label: "3" },
  { klass: 5, coefficient: 1.15, label: "4" },
  { klass: 6, coefficient: 1.0, label: "5" },
  { klass: 7, coefficient: 0.95, label: "6" },
  { klass: 8, coefficient: 0.9, label: "7" },
  { klass: 9, coefficient: 0.85, label: "8" },
  { klass: 10, coefficient: 0.8, label: "9" },
  { klass: 11, coefficient: 0.75, label: "10" },
  { klass: 12, coefficient: 0.7, label: "11" },
  { klass: 13, coefficient: 0.65, label: "12" },
];

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function estimateKbm(driverLicense: string): { klass: number; coefficient: number; label: string; claims: number } {
  const hash = Array.from(driverLicense).reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  const absHash = Math.abs(hash);
  const klass = 6 + (absHash % 7);
  const claims = klass >= 10 ? 0 : klass >= 7 ? 1 : 2;
  const entry = KBM_CLASSES.find((k) => k.klass === klass) ?? KBM_CLASSES[6];
  return { klass, coefficient: entry.coefficient, label: entry.label, claims };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") {
      return json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);
    }

    const body = await req.json();
    const birth_date = body?.birth_date;
    const driver_license = body?.driver_license
      ?? [body?.driver_license_series, body?.driver_license_number].filter(Boolean).join("");

    if (!driver_license || !birth_date) {
      return json({ error: { code: "VALIDATION_ERROR", message: "driver_license and birth_date required" } }, 400);
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- кэш по SHA-256 хэшам ---
    const [licenseHash, birthHash] = await Promise.all([
      sha256(driver_license),
      sha256(birth_date),
    ]);

    const { data: cached } = await svc
      .from("insurance_kbm_cache")
      .select("kbm_class, kbm_coefficient, kbm_label, claims, source")
      .eq("driver_license_hash", licenseHash)
      .eq("birth_date_hash", birthHash)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (cached) {
      const now = new Date();
      return json({
        driver_license,
        birth_date,
        kbm_class: cached.kbm_class,
        kbm_label: cached.kbm_label,
        kbm_coefficient: cached.kbm_coefficient,
        kbm_value: cached.kbm_coefficient,
        previous_claims_count: cached.claims ?? 0,
        last_updated: new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0],
        source: "cache",
        status: "found",
        is_real: cached.source === "inssmart",
      });
    }

    // --- попытка получить реальный КБМ через InsSmart ---
    let kbmResult: {
      klass: number; coefficient: number; label: string;
      claims: number; isReal: boolean; source: string;
    } | null = null;

    const { data: provider } = await svc
      .from("insurance_providers")
      .select("base_url, sandbox_mode, config")
      .eq("code", "inssmart")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (provider) {
      const apiKey = Deno.env.get("INSSMART_API_KEY");
      const baseUrl = provider.base_url || "https://b2b-api.inssmart.ru/api/v1";

      if (apiKey) {
        try {
          const headers: Record<string, string> = {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          };
          if (provider.sandbox_mode) headers["X-Sandbox"] = "true";

          const resp = await fetch(`${baseUrl}/kbm`, {
            method: "POST",
            headers,
            body: JSON.stringify({ driver_license, birth_date }),
            signal: AbortSignal.timeout(8000),
          });

          if (resp.ok) {
            const d = await resp.json() as Record<string, unknown>;
            const klass = Number(d.kbm_class ?? d.class ?? 3);
            const entry = KBM_CLASSES.find(k => k.klass === klass) ?? KBM_CLASSES[3];
            kbmResult = {
              klass,
              coefficient: Number(d.coefficient ?? entry.coefficient),
              label: String(d.label ?? entry.label),
              claims: Number(d.claims ?? d.previous_claims ?? 0),
              isReal: true,
              source: "inssmart",
            };
          } else {
            console.error(`[kbm-check] InsSmart ${resp.status}: ${await resp.text().catch(() => "")}`);
          }

          svc.from("insurance_provider_logs").insert({
            provider_code: "inssmart",
            category: "kbm",
            status: resp.ok ? "ok" : "error",
            response_time_ms: 0,
            error_message: resp.ok ? null : `HTTP ${resp.status}`,
          }).then(({ error: e }) => { if (e) console.error("[kbm-check] лог:", e.message); });
        } catch (err) {
          console.error("[kbm-check] InsSmart:", (err as Error).message);
        }
      }
    }

    // fallback на estimate
    if (!kbmResult) {
      const est = estimateKbm(driver_license);
      kbmResult = {
        klass: est.klass,
        coefficient: est.coefficient,
        label: est.label,
        claims: est.claims,
        isReal: false,
        source: "estimate",
      };
    }

    // записать кэш (90 дней)
    svc.from("insurance_kbm_cache").upsert(
      {
        driver_license_hash: licenseHash,
        birth_date_hash: birthHash,
        kbm_class: kbmResult.klass,
        kbm_coefficient: kbmResult.coefficient,
        kbm_label: kbmResult.label,
        claims: kbmResult.claims,
        source: kbmResult.source,
        expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
      },
      { onConflict: "driver_license_hash,birth_date_hash" },
    ).then(({ error: e }) => { if (e) console.error("[kbm-check] кэш:", e.message); });

    const now = new Date();
    return json({
      driver_license,
      birth_date,
      kbm_class: kbmResult.klass,
      kbm_label: kbmResult.label,
      kbm_coefficient: kbmResult.coefficient,
      kbm_value: kbmResult.coefficient,
      previous_claims_count: kbmResult.claims,
      last_updated: new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0],
      source: kbmResult.source,
      status: "found",
      is_real: kbmResult.isReal,
    });
  } catch (err) {
    console.error("[kbm-check]", err);
    return json({ error: { code: "SERVER_ERROR", message: (err as Error).message } }, 500);
  }
});
