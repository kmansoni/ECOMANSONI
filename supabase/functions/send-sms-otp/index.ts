import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCors } from "../_shared/utils.ts";

// In-memory rate limiting (simple, per-instance)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3; // 3 SMS per phone per 10 minutes
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(phone: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(phone);
  
  if (!entry || now > entry.resetAt) {
    rateLimits.set(phone, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Generate 4-digit OTP code
function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone: remove all non-digits
    const normalizedPhone = phone.replace(/\D/g, "");
    
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit
    if (!checkRateLimit(normalizedPhone)) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate OTP code
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OTP in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env", {
        hasUrl: !!supabaseUrl,
        hasServiceRoleKey: !!supabaseServiceKey,
      });
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete any existing OTPs for this phone
    await supabase
      .from("phone_otps")
      .delete()
      .eq("phone", normalizedPhone);

    // Insert new OTP
    const { error: insertError } = await supabase
      .from("phone_otps")
      .insert({
        phone: normalizedPhone,
        code: code,
        expires_at: expiresAt.toISOString(),
        attempts: 0,
      });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate verification code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send SMS via SMS.ru
    const smsruApiId = Deno.env.get("SMSRU_API_ID");
    if (!smsruApiId) {
      console.error("SMSRU_API_ID not configured");
      return new Response(
        JSON.stringify({ error: "SMS service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smsMessage = `Ваш код для входа: ${code}. Никому не сообщайте этот код.`;
    const smsUrl = `https://sms.ru/sms/send?api_id=${smsruApiId}&to=${normalizedPhone}&msg=${encodeURIComponent(smsMessage)}&json=1`;

    const smsResponse = await fetch(smsUrl);

    let smsResult: any = null;
    try {
      smsResult = await smsResponse.json();
    } catch (e) {
      const text = await smsResponse.text().catch(() => "");
      console.error("SMS.ru non-JSON response", { status: smsResponse.status, text });
      // Cleanup OTP so user can request again cleanly.
      await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      return new Response(
        JSON.stringify({ error: "SMS provider error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("SMS.ru response:", JSON.stringify({ status: smsResult?.status, status_code: smsResult?.status_code }));

    // Check if SMS was sent successfully - need to check both global status and per-phone status
    if (!smsResponse.ok || smsResult.status !== "OK") {
      console.error("SMS.ru global error:", { httpStatus: smsResponse.status, smsResult });
      // Cleanup OTP so user can request again cleanly.
      await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      return new Response(
        JSON.stringify({ error: "Failed to send SMS. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check individual SMS status
    const phoneStatus = smsResult.sms?.[normalizedPhone];
    if (phoneStatus?.status === "ERROR") {
      console.error("SMS.ru per-phone error:", phoneStatus);
      const errorText = phoneStatus.status_text || "SMS delivery failed";
      // Cleanup OTP so user can request again cleanly.
      await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      return new Response(
        JSON.stringify({ error: `SMS error: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Verification code sent",
        // Don't expose the code in production!
        // code: code, // Only for testing
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-sms-otp:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
