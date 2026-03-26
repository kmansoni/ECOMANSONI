import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { RegistrationModal } from "@/components/auth/RegistrationModal";
import { supabase } from "@/lib/supabase";
import { RecommendedUsersModal } from "@/components/profile/RecommendedUsersModal";
import { setGuestMode } from "@/lib/demo/demoMode";
import { getVerifyEmailOtpUrls, getSendEmailOtpUrls, getAnonHeaders } from "@/lib/auth/backendEndpoints";
import { logger } from "@/lib/logger";

/**
 * Auth modes:
 *  select   — choose login / register
 *  login    — phone input → lookup user → send OTP to stored email
 *  register — phone + email → send OTP to given email
 *  otp      — enter 6-digit code from email
 */
type AuthMode = "select" | "login" | "register" | "otp";

const OTP_RESEND_COOLDOWN_SEC = 60;
const AUTH_TIMEOUT_MS = 20_000;
const AUTH_RETRY_ATTEMPTS = 2;
const AUTH_RETRY_DELAY_MS = 700;

async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<{ response: Response; data: any | null }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: any | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_parseError) {
      data = null;
    }
    return { response, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`timeout:${label}`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isRetryableAuthTransportError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return (
    normalized.startsWith("timeout:") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset") ||
    normalized.includes("load failed")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<{ response: Response; data: any | null }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= AUTH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJsonWithTimeout(input, init, timeoutMs, `${label}:attempt-${attempt}`);
    } catch (err) {
      lastError = err;
      if (!isRetryableAuthTransportError(err) || attempt >= AUTH_RETRY_ATTEMPTS) {
        throw err;
      }
      await sleep(AUTH_RETRY_DELAY_MS * attempt);
    }
  }
  throw (lastError || new Error(`Failed to fetch ${label}`));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) window.clearTimeout(timer);
  });
}

function getReadableAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset")
  ) {
    return "Сетевой сбой при обращении к серверу подтверждения. Проверьте интернет/VPN и повторите.";
  }
  if (normalized.startsWith("timeout:")) {
    return "Сервер отвечает слишком долго. Повторите попытку.";
  }
  return raw;
}

function isTransientSupabaseAvailabilityError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return (
    error instanceof TypeError ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset") ||
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("504") ||
    normalized.startsWith("timeout:")
  );
}

function toVerifyOtpUrl(sendOtpUrl: string): string {
  return sendOtpUrl.replace(/\/send-email-otp$/i, "/verify-email-otp");
}

function pushUniqueUrl(list: string[], url: string) {
  if (!url) return;
  if (!list.includes(url)) list.push(url);
}

export function AuthPage() {
  const navigate = useNavigate();
  const [authPageOperation, setAuthPageOperation] = useState<"login" | "otp" | null>(null);
  const authPageOpMutexRef = useRef<Promise<void> | null>(null);
  const [mode, setMode] = useState<AuthMode>("select");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  /** The real email used for OTP (may come from server lookup) */
  const [otpEmail, setOtpEmail] = useState("");
  /** Masked email shown to user (e.g. "u***@example.com") */
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const isRegisterFlowRef = useRef(false);
  const otpSendUrlRef = useRef<string>("");
  const loading = authPageOperation !== null;

  // Countdown timer for OTP resend
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  const runExclusiveAuthPageOp = async (
    operation: NonNullable<typeof authPageOperation>,
    runner: () => Promise<void>,
  ) => {
    if (authPageOpMutexRef.current) {
      return;
    }

    const run = (async () => {
      setAuthPageOperation(operation);
      try {
        await runner();
      } finally {
        setAuthPageOperation((prev) => (prev === operation ? null : prev));
      }
    })();

    authPageOpMutexRef.current = run.finally(() => {
      authPageOpMutexRef.current = null;
    });

    await authPageOpMutexRef.current;
  };

  /**
   * Login: user enters phone → server looks up email → sends OTP.
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPhone = phone.trim();
    if (!trimmedPhone || trimmedPhone.replace(/\D/g, "").length < 10) {
      toast.error("Введите корректный номер телефона");
      return;
    }

    await runExclusiveAuthPageOp("login", async () => {
      try {
        setGuestMode(false);
        isRegisterFlowRef.current = false;

        const sendUrls = getSendEmailOtpUrls();
        let response: Response | null = null;
        let data: any | null = null;
        let lastError: unknown = null;

        for (const sendUrl of sendUrls) {
          try {
            const result = await fetchJsonWithRetry(
              sendUrl,
              {
                method: "POST",
                headers: getAnonHeaders(),
                body: JSON.stringify({ phone: trimmedPhone }),
              },
              AUTH_TIMEOUT_MS,
              "send-email-otp",
            );

            if (result.response.ok) {
              response = result.response;
              data = result.data;
              otpSendUrlRef.current = sendUrl;
              break;
            }

            response = result.response;
            data = result.data;
          } catch (err) {
            lastError = err;
          }
        }

        if (!response) {
          throw (lastError || new Error("Failed to reach send-email-otp endpoint"));
        }

        if (response.status === 404 && data?.error === "not_found") {
          toast.error("Аккаунт не найден", { description: "Пройдите регистрацию для создания аккаунта" });
          setMode("register");
          return;
        }

        if (!response.ok) {
          const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
          toast.error("Не удалось отправить код", { description: errMsg });
          return;
        }

        // Server returns { success, maskedEmail, email }
        const serverEmail = data?.email || "";
        const masked = data?.maskedEmail || "";

        setOtpEmail(serverEmail);
        setMaskedEmail(masked);
        toast.success(`Код отправлен на ${masked || "почту"}`);
        setOtpCode("");
        setOtpCountdown(OTP_RESEND_COOLDOWN_SEC);
        setMode("otp");
      } catch (error) {
        if (isTransientSupabaseAvailabilityError(error)) {
          logger.warn("[AuthPage] Send OTP transient backend outage", { error, phone: trimmedPhone });
        } else {
          logger.error("[AuthPage] Send OTP error", { error, phone: trimmedPhone });
        }
        const errorMsg = getReadableAuthErrorMessage(error);
        toast.error("Ошибка отправки кода", { description: errorMsg });
      }
    });
  };

  /**
   * Step 2: user enters OTP code → verify with the email used for sending.
   */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedCode = otpCode.trim();
    if (trimmedCode.length !== 6) {
      toast.error("Введите 6-значный код из письма");
      return;
    }

    // Use otpEmail (from server lookup or registration email)
    const verifyEmail = otpEmail || email.trim().toLowerCase();

    await runExclusiveAuthPageOp("otp", async () => {
      try {
        const verifyUrls: string[] = [];
        if (otpSendUrlRef.current) {
          pushUniqueUrl(verifyUrls, toVerifyOtpUrl(otpSendUrlRef.current));
        } else {
          for (const url of getVerifyEmailOtpUrls()) {
            pushUniqueUrl(verifyUrls, url);
          }
        }
        let response: Response | null = null;
        let data: any | null = null;
        let lastError: unknown = null;

        for (const verifyUrl of verifyUrls) {
          try {
            const result = await fetchJsonWithRetry(
              verifyUrl,
              {
                method: "POST",
                headers: getAnonHeaders(),
                body: JSON.stringify({ email: verifyEmail, code: trimmedCode }),
              },
              AUTH_TIMEOUT_MS,
              "verify-email-otp",
            );
            if (result.response.ok) {
              response = result.response;
              data = result.data;
              break;
            }

            response = result.response;
            data = result.data;
          } catch (err) {
            lastError = err;
          }
        }

        if (!response) {
          throw (lastError || new Error("Failed to reach verify-email-otp endpoint"));
        }

        if (!response.ok || !data?.ok) {
          const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
          logger.error("[AuthPage] verify-email-otp failed", { error: errMsg, email: verifyEmail });
          toast.error("Неверный или просроченный код", { description: errMsg });
          return;
        }

        // Set session from server-returned tokens
        const { error: sessionError } = await withTimeout(
          supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          }),
          8000,
          "setSession",
        );

        if (sessionError) {
          logger.error("[AuthPage] setSession error", { error: sessionError });
          toast.error("Не удалось создать сессию");
          return;
        }

        const isNewUser = data.isNewUser || isRegisterFlowRef.current;

        if (isNewUser) {
          toast.success("Заполните профиль для завершения регистрации");
          setShowRegistrationModal(true);
        } else {
          toast.success("Добро пожаловать!");
          navigate("/");
        }
      } catch (error) {
        if (isTransientSupabaseAvailabilityError(error)) {
          logger.warn("[AuthPage] Verify OTP transient backend outage", { error, email: verifyEmail });
        } else {
          logger.error("[AuthPage] Verify OTP error", { error, email: verifyEmail });
        }
        const errorMsg = getReadableAuthErrorMessage(error);
        toast.error("Ошибка проверки кода", { description: errorMsg });
      }
    });
  };

  /**
   * Resend OTP to the same email.
   */
  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    const resendEmail = otpEmail || email.trim().toLowerCase();

    await runExclusiveAuthPageOp("login", async () => {
      try {
        // For login flow (phone-based), re-send by phone
        // For register flow, re-send by email
        const payload = isRegisterFlowRef.current
          ? { email: resendEmail }
          : phone.trim()
            ? { phone: phone.trim() }
            : { email: resendEmail };

        const sendUrls = getSendEmailOtpUrls();
        let response: Response | null = null;
        let data: any | null = null;
        let lastError: unknown = null;

        for (const sendUrl of sendUrls) {
          try {
            const result = await fetchJsonWithRetry(
              sendUrl,
              {
                method: "POST",
                headers: getAnonHeaders(),
                body: JSON.stringify(payload),
              },
              AUTH_TIMEOUT_MS,
              "resend-email-otp",
            );
            if (result.response.ok) {
              response = result.response;
              data = result.data;
              otpSendUrlRef.current = sendUrl;
              break;
            }

            response = result.response;
            data = result.data;
          } catch (err) {
            lastError = err;
          }
        }

        if (!response) {
          throw (lastError || new Error("Failed to reach send-email-otp endpoint"));
        }

        if (!response.ok) {
          const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
          toast.error("Не удалось переотправить код", { description: errMsg });
          return;
        }
        toast.success("Код отправлен повторно");
        setOtpCode("");
        setOtpCountdown(OTP_RESEND_COOLDOWN_SEC);
      } catch (error) {
        if (isTransientSupabaseAvailabilityError(error)) {
          logger.warn("[AuthPage] Resend OTP transient backend outage", { error });
        } else {
          logger.error("[AuthPage] Resend OTP error", { error });
        }
        toast.error("Не удалось переотправить код", {
          description: getReadableAuthErrorMessage(error),
        });
      }
    });
  };

  /**
   * Register: phone + email → send OTP to given email → verify → registration modal.
   */
  const handleRegisterClick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedPhone || trimmedPhone.replace(/\D/g, "").length < 10) {
      toast.error("Введите корректный номер телефона");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Введите корректный email");
      return;
    }

    await runExclusiveAuthPageOp("login", async () => {
      try {
        setGuestMode(false);
        isRegisterFlowRef.current = true;

        const sendUrls = getSendEmailOtpUrls();
        let response: Response | null = null;
        let data: any | null = null;
        let lastError: unknown = null;

        for (const sendUrl of sendUrls) {
          try {
            const result = await fetchJsonWithRetry(
              sendUrl,
              {
                method: "POST",
                headers: getAnonHeaders(),
                body: JSON.stringify({ email: trimmedEmail, phone: trimmedPhone }),
              },
              AUTH_TIMEOUT_MS,
              "register-send-email-otp",
            );

            if (result.response.ok) {
              response = result.response;
              data = result.data;
              otpSendUrlRef.current = sendUrl;
              break;
            }

            response = result.response;
            data = result.data;
          } catch (err) {
            lastError = err;
          }
        }

        if (!response) {
          throw (lastError || new Error("Failed to reach send-email-otp endpoint"));
        }

        if (!response.ok) {
          const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
          toast.error("Не удалось отправить код", { description: errMsg });
          return;
        }

        setOtpEmail(trimmedEmail);
        setMaskedEmail("");
        toast.success("Код отправлен на " + trimmedEmail);
        setOtpCode("");
        setOtpCountdown(OTP_RESEND_COOLDOWN_SEC);
        setMode("otp");
      } catch (error) {
        if (isTransientSupabaseAvailabilityError(error)) {
          logger.warn("[AuthPage] Register send OTP transient backend outage", {
            error,
            email: trimmedEmail,
            phone: trimmedPhone,
          });
        } else {
          logger.error("[AuthPage] Register send OTP error", { error, email: trimmedEmail, phone: trimmedPhone });
        }
        toast.error("Не удалось отправить код", { description: getReadableAuthErrorMessage(error) });
      }
    });
  };

  const handleBack = () => {
    if (loading) return;
    if (mode === "otp") {
      // Go back to whatever mode we came from
      setMode(isRegisterFlowRef.current ? "register" : "login");
      setOtpCode("");
      setOtpEmail("");
      setMaskedEmail("");
      otpSendUrlRef.current = "";
      return;
    }
    if (mode === "register") {
      setMode("login");
      setEmail("");
      isRegisterFlowRef.current = false;
      return;
    }
    if (mode === "select") {
      navigate(-1);
    } else {
      setMode("select");
      setPhone("");
    }
  };

  const handleRegistrationSuccess = () => {
    setShowRegistrationModal(false);
    toast.success("Аккаунт создан!");
    setShowRecommendations(true);
  };

  const handleRecommendationsClose = () => {
    setShowRecommendations(false);
    navigate("/");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden">
      {/* Brand gradient background - logo colors */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2035] to-[#071420]" />
      
      {/* Animated floating orbs in logo colors */}
      <div 
        className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-60"
        style={{
          background: 'radial-gradient(circle, #0066CC 0%, transparent 70%)',
          animation: 'float-orb-1 15s ease-in-out infinite',
        }}
      />
      <div 
        className="absolute bottom-20 right-0 w-[450px] h-[450px] rounded-full blur-[100px] opacity-50"
        style={{
          background: 'radial-gradient(circle, #00A3B4 0%, transparent 70%)',
          animation: 'float-orb-2 18s ease-in-out infinite',
          animationDelay: '-5s',
        }}
      />
      <div 
        className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full blur-[90px] opacity-55"
        style={{
          background: 'radial-gradient(circle, #00C896 0%, transparent 70%)',
          animation: 'float-orb-3 20s ease-in-out infinite',
          animationDelay: '-10s',
        }}
      />
      <div 
        className="absolute bottom-1/3 -left-10 w-[350px] h-[350px] rounded-full blur-[80px] opacity-45"
        style={{
          background: 'radial-gradient(circle, #4FD080 0%, transparent 70%)',
          animation: 'float-orb-4 22s ease-in-out infinite',
          animationDelay: '-3s',
        }}
      />
      
      {/* Shimmer mesh overlay */}
      <div 
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(at 30% 20%, hsla(200,100%,40%,0.25) 0px, transparent 50%),
                            radial-gradient(at 70% 10%, hsla(175,80%,45%,0.2) 0px, transparent 50%),
                            radial-gradient(at 10% 60%, hsla(160,70%,50%,0.2) 0px, transparent 50%),
                            radial-gradient(at 90% 70%, hsla(140,60%,50%,0.15) 0px, transparent 50%),
                            radial-gradient(at 50% 90%, hsla(185,90%,40%,0.2) 0px, transparent 50%)`,
          backgroundSize: '200% 200%',
          animation: 'shimmer-gradient 8s ease-in-out infinite',
        }}
      />

      {/* Back button */}
      {(mode !== "select") && (
        <div className="relative z-20 p-4 safe-area-top">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center p-6 safe-area-top safe-area-bottom">
        <div
          className="max-w-sm mx-auto w-full space-y-8"
          style={{ animation: "auth-enter 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both" }}
        >
          
          {/* Glossy bubble avatar - mirror glass effect */}
          <div className="flex justify-center">
            <div 
              className="relative"
              style={{ animation: 'bubble-breathe 4s ease-in-out infinite' }}
            >
              {/* Outer glow in logo colors */}
              <div 
                className="absolute -inset-6 rounded-full blur-2xl opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #0066CC 0%, #00A3B4 50%, #00C896 100%)',
                }}
              />
              
              {/* Main bubble container */}
              <div className="relative w-36 h-36 rounded-full overflow-hidden"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 50%, rgba(0,102,204,0.1) 100%)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: `
                    0 0 60px rgba(0,163,180,0.3),
                    0 0 40px rgba(0,200,150,0.2),
                    inset 0 -10px 30px rgba(0,102,204,0.2),
                    inset 0 5px 20px rgba(255,255,255,0.3)
                  `,
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                {/* Top highlight/reflection */}
                <div 
                  className="absolute top-1 left-3 right-3 h-12 rounded-full opacity-80"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 60%, transparent 100%)',
                  }}
                />
                
                {/* Secondary reflection */}
                <div 
                  className="absolute top-6 left-6 w-5 h-5 rounded-full opacity-70"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)',
                  }}
                />
                
                {/* Inner gradient overlay */}
                <div 
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 30% 30%, transparent 30%, rgba(0,163,180,0.05) 70%, rgba(0,102,204,0.1) 100%)',
                  }}
                />
                
                {/* Logo */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img 
                    src={logo} 
                    alt="Logo" 
                    className="w-20 h-20 object-contain drop-shadow-lg"
                    style={{ filter: 'drop-shadow(0 4px 12px rgba(0,163,180,0.3))' }}
                  />
                </div>
                
                {/* Bottom reflection */}
                <div 
                  className="absolute bottom-2 left-4 right-4 h-6 rounded-full opacity-30"
                  style={{
                    background: 'linear-gradient(0deg, rgba(0,200,150,0.3) 0%, transparent 100%)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold text-white drop-shadow-lg">
              {mode === "select" && "Добро пожаловать"}
              {mode === "login" && "Вход"}
              {mode === "otp" && "Код подтверждения"}
              {mode === "register" && "Регистрация"}
            </h1>
            <p className="text-white/80 text-base">
              {mode === "select" && "Выберите действие для продолжения"}
              {mode === "login" && "Введите номер телефона"}
              {mode === "otp" && `Код отправлен на ${maskedEmail || otpEmail || email.trim()}`}
              {mode === "register" && "Укажите телефон и почту"}
            </p>
          </div>

          {/* Mode selection */}
          {mode === "select" && (
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute -inset-1 bg-white/10 rounded-3xl blur-xl" />
                <div
                  className="relative bg-white/10 backdrop-blur-2xl rounded-3xl p-6 space-y-4 border border-white/20 shadow-2xl"
                  style={{
                    boxShadow:
                      "0 20px 60px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                  
                  <Button 
                    onClick={() => setMode("register")}
                    disabled={loading}
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-white/90 hover:bg-white text-slate-800 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Регистрация
                  </Button>
                  
                  <Button 
                    onClick={() => setMode("login")}
                    disabled={loading}
                    variant="outline"
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Вход
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Login form */}
          {mode === "login" && (
            <>
              <div className="relative">
                <div className="absolute -inset-1 bg-white/10 rounded-3xl blur-xl" />
                
                <form 
                  onSubmit={handleLogin} 
                  className="relative bg-white/10 backdrop-blur-2xl rounded-3xl p-6 space-y-4 border border-white/20 shadow-2xl"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                  
                  <div className="relative group">
                    <div className="absolute inset-0 bg-white/5 rounded-2xl group-focus-within:bg-white/10 transition-colors" />
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      placeholder="+7 (___) ___-__-__"
                      required
                      className="relative"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-white/90 hover:bg-white text-slate-800 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-slate-800/30 border-t-slate-800 rounded-full animate-spin" />
                        <span>Отправка...</span>
                      </div>
                    ) : (
                      "Войти"
                    )}
                  </Button>

                </form>
              </div>

              <p className="text-center text-white/50 text-sm px-4">
                Нет аккаунта?{" "}
                <button 
                  onClick={() => setMode("register")} 
                  disabled={loading}
                  className="text-white/80 underline hover:text-white"
                >
                  Зарегистрируйтесь
                </button>
              </p>
            </>
          )}

          {/* OTP verify step */}
          {mode === "otp" && (
            <>
              <div className="relative">
                <div className="absolute -inset-1 bg-white/10 rounded-3xl blur-xl" />
                
                <form 
                  onSubmit={handleVerifyOtp} 
                  className="relative bg-white/10 backdrop-blur-2xl rounded-3xl p-6 space-y-4 border border-white/20 shadow-2xl"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                  
                  <div className="relative group">
                    <div className="absolute inset-0 bg-white/5 rounded-2xl group-focus-within:bg-white/10 transition-colors" />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Введите 6-значный код из письма"
                      className="relative w-full h-14 rounded-2xl bg-transparent text-white text-center text-2xl tracking-[0.5em] font-mono placeholder:text-white/30 placeholder:text-base placeholder:tracking-normal px-4 outline-none focus:ring-2 focus:ring-white/30 transition-all"
                      autoFocus
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-white/90 hover:bg-white text-slate-800 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                    disabled={loading || otpCode.length !== 6}
                  >
                    {authPageOperation === "otp" ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-slate-800/30 border-t-slate-800 rounded-full animate-spin" />
                        <span>Проверка...</span>
                      </div>
                    ) : (
                      "Подтвердить"
                    )}
                  </Button>

                  <div className="text-center">
                    {otpCountdown > 0 ? (
                      <p className="text-white/50 text-sm">
                        Отправить повторно через {Math.floor(otpCountdown / 60)}:{String(otpCountdown % 60).padStart(2, "0")}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={loading}
                        className="text-white/70 text-sm underline hover:text-white transition-colors"
                      >
                        Отправить код повторно
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <button
                onClick={handleBack}
                disabled={loading}
                className="text-center text-white/50 text-sm hover:text-white/70 transition-colors"
              >
                Назад
              </button>
            </>
          )}

          {/* Register form - phone + email, then OTP → registration modal */}
          {mode === "register" && (
            <>
              <div className="relative">
                <div className="absolute -inset-1 bg-white/10 rounded-3xl blur-xl" />
                
                <form 
                  onSubmit={handleRegisterClick} 
                  className="relative bg-white/10 backdrop-blur-2xl rounded-3xl p-6 space-y-4 border border-white/20 shadow-2xl"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                  
                  <div className="relative group">
                    <div className="absolute inset-0 bg-white/5 rounded-2xl group-focus-within:bg-white/10 transition-colors" />
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      placeholder="+7 (___) ___-__-__"
                      required
                      className="relative"
                    />
                  </div>

                  <div className="relative group">
                    <div className="absolute inset-0 bg-white/5 rounded-2xl group-focus-within:bg-white/10 transition-colors" />
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="relative h-14 rounded-2xl bg-transparent text-white placeholder:text-white/30 px-4 outline-none border-0 focus-visible:ring-2 focus-visible:ring-white/30 text-base"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-white/90 hover:bg-white text-slate-800 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-slate-800/30 border-t-slate-800 rounded-full animate-spin" />
                        <span>Отправка...</span>
                      </div>
                    ) : (
                      "Зарегистрироваться"
                    )}
                  </Button>
                </form>
              </div>

              <p className="text-center text-white/50 text-sm px-4">
                Уже есть аккаунт?{" "}
                <button 
                  onClick={() => setMode("login")} 
                  disabled={loading}
                  className="text-white/80 underline hover:text-white"
                >
                  Войти
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Bottom safe area gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/20 to-transparent" />

      {/* Registration Modal */}
      <RegistrationModal 
        isOpen={showRegistrationModal}
        onClose={() => {
          if (!loading) setShowRegistrationModal(false);
        }}
        phone={phone}
        email={otpEmail || email}
        onSuccess={handleRegistrationSuccess}
      />

      {/* Recommended Users Modal */}
      <RecommendedUsersModal
        isOpen={showRecommendations}
        onClose={handleRecommendationsClose}
      />
    </div>
  );
}

export default AuthPage;
