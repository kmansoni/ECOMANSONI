/**
 * Stripe Webhook Handler
 *
 * Обрабатывает входящие webhook-события от Stripe:
 *   - payment_intent.succeeded      → платёж прошёл
 *   - payment_intent.payment_failed → платёж не прошёл
 *   - charge.refunded               → возврат
 *
 * Security: подпись проверяется через Stripe-Signature header + HMAC-SHA256.
 * Ключ хранится в Supabase Vault, никогда не попадает в лог/response.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import crypto from "https://deno.land/std@0.168.0/node/crypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

/**
 * Проверяет подпись Stripe webhook.
 * Тело запроса передаётся как raw string (не JSON),
 * потому что Stripe подписывает именно raw body.
 */
async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",");
  let signature = "";
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") continue; // timestamp — пропускаем
    if (key === "v1") {
      signature = value;
      break;
    }
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${(parts.find((p) => p.startsWith("t=")) || "").split("=")[1]}.${payload}`)
    .digest("hex");

  // Timing-safe comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Обновляет статус инвойса в базе данных.
 * Вызывается из обработчиков Stripe-событий.
 */
async function updateInvoiceStatus(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
  newStatus: "paid" | "failed" | "refunded",
  stripeEventId: string,
  paidAt?: string
) {
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "paid" && paidAt) {
    updateData.paid_at = paidAt;
  }
  if (newStatus === "refunded") {
    updateData.refunded_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("payment_invoices")
    .update(updateData)
    .eq("id", invoiceId)
    .neq("status", newStatus); // не обновляем, если уже в нужном статусе

  if (error) {
    console.error(`[Stripe] Failed to update invoice ${invoiceId}:`, error);
    return false;
  }

  // Логируем event для аудита
  await supabase.from("payment_invoice_events").insert({
    invoice_id: invoiceId,
    event_type: newStatus,
    stripe_event_id: stripeEventId,
    raw_event: {}, // можно расширить
  });

  return true;
}

/**
 * Обработчик payment_intent.succeeded
 */
async function handlePaymentSucceeded(
  supabase: ReturnType<typeof createClient>,
  event: any
) {
  const invoiceId = event.data.object?.metadata?.invoice_id;
  if (!invoiceId) {
    console.warn("[Stripe] No invoice_id in payment_intent.succeeded");
    return json({ ok: false, error: "no invoice_id" }, 400);
  }

  const paidAt = new Date(event.data.object.created * 1000).toISOString();
  const ok = await updateInvoiceStatus(
    supabase,
    invoiceId,
    "paid",
    event.id,
    paidAt
  );

  if (ok) {
    console.log(`[Stripe] Invoice ${invoiceId} marked as paid`);
    // TODO: уведомить бота через webhook о successful_payment
  }

  return json({ ok: true, invoice_id: invoiceId, status: "paid" });
}

/**
 * Обработчик payment_intent.payment_failed
 */
async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  event: any
) {
  const invoiceId = event.data.object?.metadata?.invoice_id;
  if (!invoiceId) {
    console.warn("[Stripe] No invoice_id in payment_intent.payment_failed");
    return json({ ok: false, error: "no invoice_id" }, 400);
  }

  const ok = await updateInvoiceStatus(
    supabase,
    invoiceId,
    "failed",
    event.id
  );

  if (ok) {
    console.log(`[Stripe] Invoice ${invoiceId} marked as failed`);
  }

  return json({ ok: true, invoice_id: invoiceId, status: "failed" });
}

/**
 * Обработчик charge.refunded
 */
async function handleChargeRefunded(
  supabase: ReturnType<typeof createClient>,
  event: any
) {
  const invoiceId = event.data.object?.metadata?.invoice_id;
  if (!invoiceId) {
    // Попробуем найти по charge ID
    const chargeId = event.data.object?.id;
    if (chargeId) {
      const { data: invoice } = await supabase
        .from("payment_invoices")
        .select("id")
        .eq("provider_payment_charge_id", chargeId)
        .single();
      if (invoice) {
        // eslint-disable-next-line no-param-reassign
        event.data.object.metadata = { invoice_id: invoice.id };
      }
    }
    if (!event.data.object?.metadata?.invoice_id) {
      console.warn("[Stripe] No invoice_id in charge.refunded");
      return json({ ok: false, error: "no invoice_id" }, 400);
    }
  }

  // Проверяем partial refund
  const amount = event.data.object?.amount || 0;
  const amountRefunded = event.data.object?.amount_refunded || 0;

  let status: "refunded" | "failed" = "refunded";
  if (amountRefunded < amount) {
    // Partial refund — всё равно помечаем как refunded
    // (можно расширить логику для частичных возвратов)
    status = "refunded";
  }

  const ok = await updateInvoiceStatus(
    supabase,
    event.data.object.metadata.invoice_id,
    status,
    event.id
  );

  if (ok) {
    console.log(
      `[Stripe] Invoice ${event.data.object.metadata.invoice_id} marked as ${status}`
    );
  }

  return json({ ok: true, invoice_id: event.data.object.metadata.invoice_id, status });
}

// ── Router ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/stripe-webhook/, "").replace(/\/$/, "") || "/";

  // Health check
  if (req.method === "GET" && path === "/") {
    return json({ ok: true, message: "Stripe webhook endpoint is alive" });
  }

  // Только POST для событий
  if (req.method !== "POST") {
    return err("Method not allowed", 405);
  }

  // Считываем raw body для верификации подписи
  const rawBody = await req.text();

  // Получаем ключ из Vault
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const vaultId = Deno.env.get("STRIPE_VAULT_SECRET_ID");
  if (!vaultId) {
    console.error("[Stripe] STRIPE_VAULT_SECRET_ID not configured");
    return err("Server misconfiguration", 500);
  }

  const { data: stripeSecret, error: vaultErr } = await supabase.rpc(
    "get_vault_secret",
    { secret_id: vaultId }
  );

  if (vaultErr || !stripeSecret) {
    console.error("[Stripe] Failed to resolve vault secret:", vaultErr);
    return err("Server misconfiguration", 500);
  }

  // Верификация подписи
  const signature = req.headers.get("Stripe-Signature");
  const isValid = await verifyStripeSignature(rawBody, signature, stripeSecret);
  if (!isValid) {
    console.warn("[Stripe] Invalid signature");
    return err("Invalid signature", 401);
  }

  // Парсим JSON (уже проверены подписи — безопасно)
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return err("Invalid JSON", 400);
  }

  // Route по типу события
  const eventType = event.type;
  console.log(`[Stripe] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case "payment_intent.succeeded":
        return await handlePaymentSucceeded(supabase, event);
      case "payment_intent.payment_failed":
        return await handlePaymentFailed(supabase, event);
      case "charge.refunded":
        return await handleChargeRefunded(supabase, event);
      default:
        // Необработанные события — возвращаем 200 (Stripe перестанет ретраить)
        console.log(`[Stripe] Unhandled event type: ${eventType}`);
        return json({ ok: true, message: "event received but not handled" });
    }
  } catch (e) {
    console.error("[Stripe] Error processing event:", e);
    // Stripe будет ретраить по 5xx
    return err("Internal error", 500);
  }
});