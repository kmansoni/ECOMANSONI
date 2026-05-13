// Edge Function: stars-balance
// Routes: GET /balance | POST /purchase

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

// GET /balance - get user's star balance
async function handleGetBalance(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return err("authorization required", 401);
  const jwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return err("unauthorized", 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get balance from user_stars table
  const { data: balance, error } = await supabase
    .from("user_stars")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  if (error?.code === "PGRST116") {
    // Create new balance record if not exists
    const { data: newBalance } = await supabase
      .from("user_stars")
      .insert({ user_id: user.id, balance: 0 })
      .select("balance")
      .single();
    return json({ ok: true, balance: newBalance?.balance ?? 0 });
  }

  return json({ ok: true, balance: balance?.balance ?? 0 });
}

// POST /purchase - initiate star purchase (Telegram Payments)
async function handlePurchase(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return err("authorization required", 401);
  const jwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return err("unauthorized", 401);

  let body: { amount: number; telegram_payment_charge_id?: string };
  try {
    body = await req.json();
  } catch {
    return err("invalid json");
  }

  const { amount, telegram_payment_charge_id } = body;
  if (!amount || amount <= 0) return err("amount must be positive");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get current balance first
  const { data: currentBalance } = await supabase
    .from("user_stars")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  const currentBalanceValue = currentBalance?.balance ?? 0;

  // Record the purchase transaction
  const { data: transaction, error } = await supabase
    .from("star_transactions")
    .insert({
      user_id: user.id,
      amount,
      type: "purchase",
      balance_before: currentBalanceValue,
      balance_after: currentBalanceValue + amount,
    })
    .select()
    .single();

  if (error) {
    console.error("Purchase transaction error:", error);
    return err("failed to record purchase", 500);
  }

  // Update balance atomically using RPC
  const { data: updatedBalance } = await supabase.rpc("update_stars_balance", {
    p_user_id: user.id,
    p_amount: amount,
    p_type: "credit",
  });

  return json({ ok: true, transaction, balance: updatedBalance });
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  _currentOrigin = req.headers.get("origin");

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/stars-balance/, "").replace(/\/$/, "") || "/";

  try {
    if (req.method === "GET" && path === "/balance") {
      return await handleGetBalance(req);
    }
    if (req.method === "POST" && path === "/purchase") {
      return await handlePurchase(req);
    }
    return err("not found", 404);
  } catch (e) {
    console.error("Unhandled error:", e);
    return err("internal server error", 500);
  }
});