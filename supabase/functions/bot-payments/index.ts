// Edge Function: bot-payments
// Routes: POST /create-invoice | POST /pay | POST /refund | GET /invoices
// Security: JWT required for pay/refund/list; bot auth via API key for create-invoice
// Rate limiting: handled at API Gateway (Supabase project rate limits)
// Atomicity: Stars payments via SECURITY DEFINER PostgreSQL functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_WEBHOOK_SECRET = Deno.env.get("BOT_WEBHOOK_SECRET") ?? "";

// ── Types ──────────────────────────────────────────────────────────────────

interface CreateInvoiceBody {
  bot_id: string;
  chat_id: string;
  user_id: string;
  title: string;
  description: string;
  currency?: "XTR" | "USD" | "EUR" | "RUB";
  amount: number;
  payload?: string;
  photo_url?: string;
  idempotency_key?: string;
}

interface PayBody {
  invoice_id: string;
}

interface RefundBody {
  invoice_id: string;
  amount?: number;
  reason?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Фабрика json-ответа; origin передаётся из роутера
let _currentOrigin: string | null = null;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(_currentOrigin), "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

// Verify bot ownership via X-Bot-Token header (token stored in bots.api_token)
async function verifyBotToken(
  supabase: ReturnType<typeof createClient>,
  botId: string,
  token: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("bots")
    .select("id")
    .eq("id", botId)
    .eq("api_token", token)
    .single();
  return !error && !!data;
}

// Trigger bot webhook (fire-and-forget, errors logged but not propagated)
async function notifyBotWebhook(
  supabase: ReturnType<typeof createClient>,
  botId: string,
  event: object
): Promise<void> {
  try {
    const { data: bot } = await supabase
      .from("bots")
      .select("webhook_url")
      .eq("id", botId)
      .single();
    if (!bot?.webhook_url) return;
    await fetch(bot.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": BOT_WEBHOOK_SECRET,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
  } catch (_e) {
    // Non-critical: webhook delivery failure does not roll back payment
    console.error("Webhook delivery failed:", _e);
  }
}

// ── Handlers ───────────────────────────────────────────────────────────────

async function handleCreateInvoice(req: Request): Promise<Response> {
  const botToken = req.headers.get("x-bot-token") ?? "";
  if (!botToken) return err("x-bot-token header required", 401);

  let body: CreateInvoiceBody;
  try {
    body = await req.json();
  } catch {
    return err("invalid json");
  }

  const { bot_id, chat_id, user_id, title, description, amount, currency = "XTR", payload, photo_url, idempotency_key } = body;
  if (!bot_id || !chat_id || !user_id || !title || !description || !amount) {
    return err("missing required fields");
  }
  if (amount <= 0 || !Number.isInteger(amount)) return err("amount must be positive integer");
  if (title.length > 255) return err("title too long");
  if (description.length > 2048) return err("description too long");
  if (payload && payload.length > 4096) return err("payload too long");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Authenticate bot
  const valid = await verifyBotToken(supabase, bot_id, botToken);
  if (!valid) return err("invalid bot token", 403);

  // Idempotency: if key provided, check existing
  if (idempotency_key) {
    const { data: existing } = await supabase
      .from("payment_invoices")
      .select("*")
      .eq("idempotency_key", idempotency_key)
      .single();
    if (existing) return json({ ok: true, invoice: existing });
  }

  const { data: invoice, error: insertError } = await supabase
    .from("payment_invoices")
    .insert({
      bot_id,
      chat_id,
      user_id,
      title,
      description,
      currency,
      amount,
      payload: payload ?? null,
      photo_url: photo_url ?? null,
      idempotency_key: idempotency_key ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    console.error("Insert invoice error:", insertError);
    return err("failed to create invoice", 500);
  }

  return json({ ok: true, invoice });
}

async function handlePay(req: Request): Promise<Response> {
  // Require authenticated user JWT
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return err("authorization required", 401);
  const jwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return err("unauthorized", 401);

  let body: PayBody;
  try {
    body = await req.json();
  } catch {
    return err("invalid json");
  }
  const { invoice_id } = body;
  if (!invoice_id) return err("invoice_id required");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Optimistic read — fast path to return early for obviously wrong states.
  const { data: invoiceCheck } = await supabase
    .from("payment_invoices")
    .select("currency, bot_id, amount, status")
    .eq("id", invoice_id)
    .single();

  if (!invoiceCheck) return err("invoice not found", 404);
  if (invoiceCheck.status !== "pending") return err("invoice already processed");

  if (invoiceCheck.currency === "XTR") {
    // Атомарная оплата через SECURITY DEFINER функцию (debit + credit + status в одной транзакции)
    const { data: result, error: fnErr } = await supabase.rpc("pay_invoice_with_stars", {
      p_invoice_id: invoice_id,
      p_user_id: user.id,
    });
    if (fnErr) {
      console.error("pay_invoice_with_stars error:", fnErr);
      return err("payment failed", 500);
    }
    if (!result.ok) return err(result.error, result.error === "insufficient_stars" ? 402 : 400);

    // Notify bot webhook asynchronously (pre_checkout_query + successful_payment)
    notifyBotWebhook(supabase, invoiceCheck.bot_id, {
      type: "successful_payment",
      invoice_id,
      user_id: user.id,
      currency: "XTR",
      amount: invoiceCheck.amount,
      paid_at: result.paid_at,
    });

    return json({ ok: true, paid_at: result.paid_at });

  } else {
    // External provider path.
    // We must atomically transition the invoice to 'processing' before contacting
    // the external API.  Without this CAS, two concurrent /pay requests for the
    // same invoice would both pass the optimistic status check above, both create
    // a payment intent, and the user would be double-charged.
    //
    // The UPDATE ... WHERE status='pending' acts as a distributed lock:
    // only one of the concurrent requests gets rowsAffected = 1; the other
    // reads 0 rows and receives 409 Conflict below.
    const { data: lockResult, error: lockErr } = await supabase
      .from("payment_invoices")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", invoice_id)
      .eq("status", "pending")          // CAS guard
      .select("id")
      .maybeSingle();

    if (lockErr) {
      console.error("Status lock error:", lockErr);
      return err("payment lock failed", 500);
    }
    if (!lockResult) {
      // Another concurrent request already locked or processed this invoice.
      return err("invoice already being processed", 409);
    }

    const { data: provider } = await supabase
      .from("bot_payment_providers")
      .select("provider_type, provider_config, is_active")
      .eq("bot_id", invoiceCheck.bot_id)
      .eq("provider_type", invoiceCheck.currency === "USD" ? "stripe" : "yookassa")
      .eq("is_active", true)
      .single();

    if (!provider) return err("payment provider not configured", 400);

    if (provider.provider_type === "stripe") {
      // SECURITY: provider_config stores a Supabase Vault secret ID
      // (the UUID of the record in vault.secrets), NOT the raw key.
      // Resolution via the RPC below decrypts the key inside PostgreSQL;
      // it never travels over the wire or appears in application logs.
      const vaultId = provider.provider_config?.vault_secret_id as string | undefined;
      if (!vaultId) return err("stripe vault_secret_id not configured", 500);

      // Resolve the Vault secret using the service-role RPC.
      const { data: vaultRow, error: vaultErr } = await supabase
        .rpc("get_vault_secret", { secret_id: vaultId });
      if (vaultErr || !vaultRow) {
        console.error("Vault resolution failed:", vaultErr);
        return err("stripe key unavailable", 500);
      }
      const stripeSecretKey: string = vaultRow;

      // Create Stripe Payment Intent
      const stripeResp = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          amount: String(invoiceCheck.amount),
          currency: invoiceCheck.currency.toLowerCase(),
          "metadata[invoice_id]": invoice_id,
          "metadata[user_id]": user.id,
        }),
      });
      if (!stripeResp.ok) return err("stripe payment intent failed", 500);
      const intent = await stripeResp.json();
      return json({ ok: true, provider: "stripe", client_secret: intent.client_secret });

    } else if (provider.provider_type === "yookassa") {
      const shopId = provider.provider_config?.shop_id as string | undefined;
      const apiKey = provider.provider_config?.api_key as string | undefined;
      if (!shopId || !apiKey) return err("yookassa not configured", 500);

      const ykResp = await fetch("https://api.yookassa.ru/v3/payments", {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${shopId}:${apiKey}`),
          "Content-Type": "application/json",
          "Idempotence-Key": invoice_id,
        },
        body: JSON.stringify({
          amount: { value: (invoiceCheck.amount / 100).toFixed(2), currency: "RUB" },
          confirmation: { type: "embedded" },
          metadata: { invoice_id, user_id: user.id },
          capture: true,
        }),
      });
      if (!ykResp.ok) return err("yookassa payment failed", 500);
      const ykPayment = await ykResp.json();
      return json({ ok: true, provider: "yookassa", confirmation_token: ykPayment.confirmation?.confirmation_token });
    }

    return err("unsupported provider", 400);
  }
}

async function handleRefund(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return err("authorization required", 401);
  const jwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return err("unauthorized", 401);

  let body: RefundBody;
  try {
    body = await req.json();
  } catch {
    return err("invalid json");
  }
  const { invoice_id, amount, reason } = body;
  if (!invoice_id) return err("invoice_id required");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Only bot owner can initiate refund
  const { data: invoice } = await supabase
    .from("payment_invoices")
    .select("amount, currency, bot_id, status")
    .eq("id", invoice_id)
    .single();
  if (!invoice) return err("invoice not found", 404);

  const { data: bot } = await supabase.from("bots").select("owner_id").eq("id", invoice.bot_id).single();
  if (!bot || bot.owner_id !== user.id) return err("forbidden", 403);

  const refundAmount = amount ?? invoice.amount;
  if (refundAmount <= 0 || refundAmount > invoice.amount) return err("invalid refund amount");

  if (invoice.currency === "XTR") {
    const { data: result, error: fnErr } = await supabase.rpc("refund_invoice_stars", {
      p_invoice_id: invoice_id,
      p_amount: refundAmount,
      p_reason: reason ?? null,
    });
    if (fnErr) return err("refund failed", 500);
    if (!result.ok) return err(result.error);
    return json({ ok: true });
  }

  return err("external provider refunds not yet implemented");
}

async function handleListInvoices(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return err("authorization required", 401);
  const jwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return err("unauthorized", 401);

  const url = new URL(req.url);
  const botId = url.searchParams.get("bot_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let query = supabase
    .from("payment_invoices")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (botId) {
    // Verify bot ownership
    const { data: bot } = await supabase.from("bots").select("owner_id").eq("id", botId).single();
    if (!bot || bot.owner_id !== user.id) return err("forbidden", 403);
    query = query.eq("bot_id", botId);
  } else {
    // Return user's own invoices (as buyer)
    query = query.eq("user_id", user.id);
  }

  const { data: invoices, error: qErr, count } = await query;
  if (qErr) return err("query failed", 500);

  return json({ ok: true, invoices, total: count, limit, offset });
}

// ── Router ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  _currentOrigin = req.headers.get("origin");

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/bot-payments/, "").replace(/\/$/, "") || "/";

  try {
    if (req.method === "POST" && path === "/create-invoice") {
      return await handleCreateInvoice(req);
    }
    if (req.method === "POST" && path === "/pay") {
      return await handlePay(req);
    }
    if (req.method === "POST" && path === "/refund") {
      return await handleRefund(req);
    }
    if (req.method === "GET" && path === "/invoices") {
      return await handleListInvoices(req);
    }
    return err("not found", 404);
  } catch (e) {
    console.error("Unhandled error:", e);
    return err("internal server error", 500);
  }
});
