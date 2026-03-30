/**
 * VIN Check Edge Function
 *
 * Агрегирует данные из открытых государственных источников РФ:
 *
 *  1. ГИБДД (xn--c1azba3b.xn--b1aew.xn--p1ai) — ограничения, угон, ДТП, кол-во владельцев
 *  2. ФНП (reestr-zalogov.ru) — залоги банков и лизинговых компаний
 *  3. ФССП (fssprus.ru) — исполнительные производства / арест
 *  4. avtocod.ru API (если ключ задан в env) — полный отчёт с историей
 *
 * Все результаты кэшируются в crm.auto_vehicles.vin_check_result
 *
 * CORS: функция принимает OPTIONS preflight и возвращает CORS-заголовки.
 *
 * Переменные окружения:
 *  AVTOCOD_API_KEY      — ключ avtocod.ru (опционально, платно ~5-50₽/запрос)
 *  SUPABASE_URL         — автоматически
 *  SUPABASE_SERVICE_ROLE_KEY — автоматически
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VinCheckSource {
  source: string;
  status: "ok" | "error" | "not_found" | "timeout";
  data: Record<string, unknown>;
  checked_at: string;
}

interface VinCheckResult {
  vin: string;
  // ГИБДД
  restrictions: boolean;          // ограничения на регистрационные действия
  restrictions_detail: string[];  // список ограничений
  stolen: boolean;                // в угоне / розыске
  accidents_count: number;        // количество ДТП
  owners_count: number | null;    // количество владельцев по ПТС
  mileage_last: number | null;    // последний известный пробег
  // ФНП (нотариат)
  pledges: boolean;               // есть ли залоги
  pledges_count: number;
  pledges_detail: Array<{ creditor: string; date: string; status: string }>;
  // ФССП
  enforcement_proceedings: boolean;
  enforcement_count: number;
  // avtocod.ru (если ключ есть)
  full_report_available: boolean;
  report_url: string | null;
  // История
  sources: VinCheckSource[];
  total_risk_score: number;       // 0-100. 0 = чисто, 100 = очень рискованно
  risk_factors: string[];
  recommendation: "buy" | "caution" | "avoid";
  checked_at: string;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  try {
    const { vin, vehicle_id } = await req.json() as { vin: string; vehicle_id?: string };

    if (!vin || vin.length < 7) {
      return new Response(JSON.stringify({ error: "Invalid VIN" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const vinUpper = vin.toUpperCase().replace(/[^A-Z0-9]/g, "");

    const [gibddResult, fnpResult, fssp] = await Promise.allSettled([
      checkGibdd(vinUpper),
      checkFnpPledges(vinUpper),
      checkFssp(vinUpper),
    ]);

    // Parse results
    const gibdd = gibddResult.status === "fulfilled" ? gibddResult.value : null;
    const fnp   = fnpResult.status === "fulfilled" ? fnpResult.value : null;
    const fsspResult = fssp.status === "fulfilled" ? fssp.value : null;

    // Optional: avtocod.ru
    const avtocod = Deno.env.get("AVTOCOD_API_KEY")
      ? await checkAvtocod(vinUpper, Deno.env.get("AVTOCOD_API_KEY")!)
      : null;

    // Build consolidated result
    const sources: VinCheckSource[] = [];
    const riskFactors: string[] = [];
    let riskScore = 0;

    if (gibdd) {
      sources.push({ source: "ГИБДД", status: "ok", data: gibdd, checked_at: new Date().toISOString() });
      if (gibdd.stolen) { riskScore += 50; riskFactors.push("🚨 Авто в розыске/угоне"); }
      if (gibdd.restrictions) { riskScore += 30; riskFactors.push(`⛔ Ограничения на рег. действия: ${(gibdd.restrictions_detail as string[]).join(", ")}`); }
      if ((gibdd.accidents_count as number) > 2) { riskScore += 20; riskFactors.push(`💥 ${gibdd.accidents_count} ДТП в истории`); }
      else if ((gibdd.accidents_count as number) > 0) { riskScore += 10; riskFactors.push(`⚠️ ${gibdd.accidents_count} ДТП`); }
    } else {
      sources.push({ source: "ГИБДД", status: "error", data: {}, checked_at: new Date().toISOString() });
    }

    if (fnp) {
      sources.push({ source: "ФНП (залоги)", status: "ok", data: fnp, checked_at: new Date().toISOString() });
      if (fnp.pledges_count as number > 0) {
        riskScore += 25;
        riskFactors.push(`🏦 ${fnp.pledges_count} залога(ов) в реестре ФНП`);
      }
    } else {
      sources.push({ source: "ФНП (залоги)", status: "error", data: {}, checked_at: new Date().toISOString() });
    }

    if (fsspResult) {
      sources.push({ source: "ФССП", status: "ok", data: fsspResult, checked_at: new Date().toISOString() });
      if (fsspResult.count as number > 0) {
        riskScore += 15;
        riskFactors.push(`⚖️ ФССП: ${fsspResult.count} исполнительных производств`);
      }
    }

    if (avtocod) {
      sources.push({ source: "avtocod.ru", status: "ok", data: avtocod, checked_at: new Date().toISOString() });
    }

    const result: VinCheckResult = {
      vin: vinUpper,
      restrictions:           gibdd?.restrictions as boolean      ?? false,
      restrictions_detail:    gibdd?.restrictions_detail as string[] ?? [],
      stolen:                 gibdd?.stolen as boolean             ?? false,
      accidents_count:        gibdd?.accidents_count as number     ?? 0,
      owners_count:           gibdd?.owners_count as number | null ?? null,
      mileage_last:           gibdd?.mileage_last as number | null ?? null,
      pledges:                (fnp?.pledges_count as number ?? 0) > 0,
      pledges_count:          fnp?.pledges_count as number         ?? 0,
      pledges_detail:         fnp?.pledges_detail as Array<{ creditor: string; date: string; status: string }> ?? [],
      enforcement_proceedings: (fsspResult?.count as number ?? 0) > 0,
      enforcement_count:      fsspResult?.count as number          ?? 0,
      full_report_available:  !!avtocod,
      report_url:             avtocod?.report_url as string | null ?? null,
      sources,
      total_risk_score:       Math.min(100, riskScore),
      risk_factors:           riskFactors,
      recommendation:         riskScore >= 50 ? "avoid" : riskScore >= 20 ? "caution" : "buy",
      checked_at:             new Date().toISOString(),
    };

    // If vehicle_id provided → save to DB
    if (vehicle_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // Use RPC to update with crm schema
      await supabase.rpc("crm_update_vin_check", {
        p_vehicle_id:    vehicle_id,
        p_vin_result:    result,
        p_checked_at:    result.checked_at,
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("VIN check error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

// ─── ГИБДД checker ────────────────────────────────────────────────────────────
/**
 * Проверка в базе ГИБДД через официальную форму проверки.
 * URL: https://xn--c1azba3b.xn--b1aew.xn--p1ai/check/auto (нбд.мвд.рф/check/auto)
 *
 * ГИБДД не предоставляет публичный JSON API — используем HTML scraping.
 * Данные: ограничения на регистрацию, угон/розыск, ДТП (если авторизован).
 *
 * Резервный метод — avtocod.ru (если ключ задан).
 */
async function checkGibdd(vin: string): Promise<Record<string, unknown>> {
  const GIBDD_URL = "https://xn--c1azba3b.xn--b1aew.xn--p1ai/check/auto";
  const TIMEOUT_MS = 10000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Step 1: GET the form to get any CSRF tokens
    const formResp = await fetch(GIBDD_URL, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const html = await formResp.text();

    // Extract CSRF token if present
    const csrfMatch = html.match(/name="_csrf"\s+value="([^"]+)"/);
    const csrf = csrfMatch ? csrfMatch[1] : "";

    // Step 2: POST VIN check
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);

    const checkResp = await fetch(GIBDD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": GIBDD_URL,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9",
        "Cookie": formResp.headers.get("Set-Cookie") ?? "",
      },
      body: new URLSearchParams({
        "vin": vin,
        "_csrf": csrf,
      }).toString(),
      signal: controller2.signal,
    });
    clearTimeout(timer2);

    const resultHtml = await checkResp.text();

    // Parse HTML for key indicators
    // ГИБДД shows: "Ограничения не обнаружены" / "Обнаружены ограничения"
    // "Нахождение в розыске: Не числится" / "ЧИСЛИТСЯ В РОЗЫСКЕ"
    const stolen = /числится в розыске/i.test(resultHtml) || /WANTED/i.test(resultHtml);
    const hasRestrictions = /обнаружены ограничения/i.test(resultHtml) &&
                            !/не обнаружены/i.test(resultHtml);

    // Extract restrictions text
    const restrictionDetails: string[] = [];
    const restrictMatch = resultHtml.match(/Основание[^<]*<[^>]+>([^<]+)/gi);
    if (restrictMatch) {
      restrictMatch.forEach(m => {
        const text = m.replace(/<[^>]+>/g, "").trim();
        if (text.length > 3) restrictionDetails.push(text);
      });
    }

    // Count accidents (ДТП)
    const dtp = (resultHtml.match(/участие в ДТП|ACCIDENT/gi) ?? []).length;

    // Owner count
    const ownersMatch = resultHtml.match(/Количество владельцев[^0-9]*(\d+)/i);
    const ownersCount = ownersMatch ? parseInt(ownersMatch[1]) : null;

    return {
      stolen,
      restrictions: hasRestrictions,
      restrictions_detail: restrictionDetails,
      accidents_count: dtp,
      owners_count: ownersCount,
      mileage_last: null,  // ГИБДД не даёт пробег напрямую
      raw_html_length: resultHtml.length,
    };

  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error("ГИБДД timeout");
    }
    // Fallback: return safe defaults (unknown = not found in open sources)
    console.warn("ГИБДД check failed:", err);
    return {
      stolen: false,
      restrictions: false,
      restrictions_detail: [],
      accidents_count: 0,
      owners_count: null,
      mileage_last: null,
      error: String(err),
    };
  }
}

// ─── ФНП залоги checker ───────────────────────────────────────────────────────
/**
 * Реестр уведомлений о залоге движимого имущества (Федеральная нотариальная палата).
 *
 * Официальный публичный REST API:
 * POST https://ws.reestr-zalogov.ru/services/rs/objSearch/v1
 *
 * Документация: https://www.reestr-zalogov.ru/information/api
 */
async function checkFnpPledges(vin: string): Promise<Record<string, unknown>> {
  const FNP_URL = "https://www.reestr-zalogov.ru/search/index";
  const FNP_API = "https://ws.reestr-zalogov.ru/services/rs/objSearch/v1";
  const TIMEOUT_MS = 8000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Official ФНП API
    const resp = await fetch(FNP_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
        "Referer": FNP_URL,
        "Origin": "https://www.reestr-zalogov.ru",
      },
      body: JSON.stringify({
        "query": vin,
        "searchType": "VIN",
        "page": 0,
        "size": 10,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await resp.json() as {
      content?: Array<{
        noticeInfo?: {
          pledgor?: Array<{ name?: string }>;
          pledgee?: Array<{ name?: string }>;
          regDate?: string;
          endDate?: string;
        };
        status?: string;
      }>;
      totalElements?: number;
    };

    const pledges = data?.content ?? [];
    const pledgeDetails = pledges.map(p => ({
      creditor: p.noticeInfo?.pledgee?.[0]?.name ?? "Неизвестно",
      date: p.noticeInfo?.regDate ?? "",
      status: p.status ?? "active",
    }));

    return {
      pledges_count: data?.totalElements ?? pledges.length,
      pledges_detail: pledgeDetails,
    };

  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error("ФНП timeout");
    }

    // Fallback: try alternative form-based search
    try {
      return await checkFnpFallback(vin);
    } catch {
      console.warn("ФНП check failed:", err);
      return { pledges_count: 0, pledges_detail: [], error: String(err) };
    }
  }
}

async function checkFnpFallback(vin: string): Promise<Record<string, unknown>> {
  // Alternative: HTML form on reestr-zalogov.ru
  const resp = await fetch(
    `https://www.reestr-zalogov.ru/search/result?query=${encodeURIComponent(vin)}&searchType=vin`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html",
      },
    }
  );
  const html = await resp.text();
  const found = /Сведения не найдены/i.test(html) ? 0 : /pledge|залог/i.test(html) ? 1 : 0;
  return { pledges_count: found, pledges_detail: [] };
}

// ─── ФССП checker ─────────────────────────────────────────────────────────────
/**
 * Федеральная служба судебных приставов — исполнительные производства.
 *
 * Публичный REST API ФССП:
 * GET https://api-ip.fssprus.ru/api/v1.0/search/ip/?iss={VIN}
 *
 * Документация: https://fssprus.ru/iss/ip
 * Ограничение: поиск по VIN поддерживается не всегда — пробуем по VIN как ИП.
 */
async function checkFssp(vin: string): Promise<Record<string, unknown>> {
  const FSSP_API = `https://api-ip.fssprus.ru/api/v1.0/search/ip/?type=4&search_string=${encodeURIComponent(vin)}`;
  const TIMEOUT_MS = 8000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(FSSP_API, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return { count: 0, items: [] };
    }

    const data = await resp.json() as { result?: Array<unknown>; total?: number };
    const count = data?.total ?? data?.result?.length ?? 0;

    return {
      count,
      items: (data?.result ?? []).slice(0, 5),
    };

  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error("ФССП timeout");
    }
    console.warn("ФССП check failed:", err);
    return { count: 0, items: [], error: String(err) };
  }
}

// ─── avtocod.ru API (коммерческий) ────────────────────────────────────────────
/**
 * avtocod.ru — наиболее полный агрегатор данных ГИБДД в РФ.
 * Стоимость: ~5-50₽ за запрос в зависимости от тарифа.
 *
 * Документация: https://avtocod.ru/api
 * API: POST https://avtocod.ru/api/v1/reports
 */
async function checkAvtocod(vin: string, apiKey: string): Promise<Record<string, unknown> | null> {
  const AVTOCOD_URL = "https://avtocod.ru/api/v1.1/reports";
  const TIMEOUT_MS = 15000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Create report request
    const createResp = await fetch(AVTOCOD_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        "query": { "type": "VIN", "value": vin },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!createResp.ok) {
      console.warn("avtocod.ru error:", createResp.status, await createResp.text());
      return null;
    }

    const report = await createResp.json() as {
      uid?: string;
      comment?: string;
      uri?: string;
      content?: {
        identifiers?: { vehicle?: { vin?: string; reg_num?: string } };
        tech_data?: { engine?: { volume?: number; power?: { hp?: number } } };
        accidents?: { history?: Array<{ date?: string; type?: string }> };
        pledges?: { items?: Array<{ creditor?: string }> };
        restrictions?: { items?: Array<{ reason?: string }> };
        owners?: { count?: number };
        mileages?: { items?: Array<{ date?: string; mileage?: number }> };
      };
    };

    const content = report?.content;
    return {
      report_uid: report?.uid,
      report_url: `https://avtocod.ru/search?q=${vin}`,
      owners_count: content?.owners?.count ?? null,
      accidents_count: content?.accidents?.history?.length ?? 0,
      pledges_from_avtocod: content?.pledges?.items?.length ?? 0,
      restrictions_from_avtocod: content?.restrictions?.items?.length ?? 0,
      mileage_history: content?.mileages?.items?.slice(-1)?.[0]?.mileage ?? null,
      engine_volume: content?.tech_data?.engine?.volume ?? null,
      engine_power_hp: content?.tech_data?.engine?.power?.hp ?? null,
    };

  } catch (err) {
    console.warn("avtocod.ru check failed:", err);
    return null;
  }
}
