/**
 * AuthPage — Premium auth screen с liquid-glass дизайном.
 * Использует BrandPanel, WaveBackground, SocialLoginButtons, SuccessScreen.
 * Mounted at /auth.
 */

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  KeyRound,
  Mail,
  Moon,
  QrCode,
  Sun,
  UserPlus,
} from "lucide-react";

import { PhoneInput } from "@/components/ui/phone-input";
import { QRCodeLogin } from "@/components/auth/QRCodeLogin";
import { RecommendedUsersModal } from "@/components/profile/RecommendedUsersModal";

import { supabase } from "@/lib/supabase";
import { getVerifyEmailOtpUrls, getSendEmailOtpUrls, getAnonHeaders } from "@/lib/auth/backendEndpoints";
import { logger } from "@/lib/logger";

import type { FlowAction, Gender, EntityType, ThemeTokens } from "./auth/types";
import {
  fetchJsonWithRetry,
  withTimeout,
  payloadString,
  payloadBoolean,
  getReadableAuthErrorMessage,
  isTransientSupabaseAvailabilityError,
  toVerifyOtpUrl,
  pushUniqueUrl,
  OTP_RESEND_COOLDOWN_SEC,
  AUTH_TIMEOUT_MS,
} from "./auth/api";
import { useTheme, useThemeTokens } from "./auth/theme";
import { useAuthFlow, useMediaFlag, useOtpCountdown } from "./auth/hooks";

// Premium components
import { PremiumAuthLayout, PremiumGlassCard } from "./auth/components/PremiumAuthLayout";
import { BrandPanel } from "./auth/components/BrandPanel";
import { WaveBackground } from "./auth/components/WaveBackground";
import { SocialLoginButtons } from "./auth/components/SocialLoginButtons";
import { SuccessScreen } from "./auth/components/SuccessScreen";
import { GlassInput } from "./auth/components/GlassInput";
import { GlassSelect } from "./auth/components/GlassSelect";
import { PrimaryButton } from "./auth/components/PrimaryButton";
import { OtpInput } from "./auth/components/OtpInput";
import { SecurityFooter } from "./auth/components/SecurityFooter";
import { KindTipsTicker } from "./auth/components/KindTipsTicker";

export function AuthPage() {
  const { theme, toggle } = useTheme("dark");
  const tokens = useThemeTokens(theme);
  const [flow, dispatch] = useAuthFlow();
  const navigate = useNavigate();

  const otpEmailRef = useRef("");
  const otpSendUrlRef = useRef("");
  const isRegisterFlowRef = useRef(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  const isTouch = useMediaFlag("(pointer: coarse)");
  const reduced = useMediaFlag("(prefers-reduced-motion: reduce)");
  useOtpCountdown(flow.otpCountdown, dispatch);

  const phoneDigits = flow.phone.replace(/\D/g, "");
  const canContinuePhone = phoneDigits.length >= 10;
  const canContinueOtp = flow.otp.length === 6;

  const clearRegisterFields = () => {
    const fields = ["firstName", "lastName", "middleName", "birthDate", "gender", "entityType", "password", "passwordConfirm"] as const;
    for (const field of fields) dispatch({ type: "setRegisterField", field, value: "" });
  };

  const completeRegistrationProfile = async (): Promise<boolean> => {
    const displayName = [flow.firstName.trim(), flow.lastName.trim(), flow.middleName.trim()].filter(Boolean).join(" ");
    const digits = flow.phone.replace(/\D/g, "");
    const normalizedEmail = (otpEmailRef.current || flow.email).trim().toLowerCase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      toast.error("Сессия истекла, войдите снова");
      return false;
    }

    const { error: authUpdateError } = await supabase.auth.updateUser({
      password: flow.password,
      data: {
        full_name: displayName,
        first_name: flow.firstName.trim(),
        last_name: flow.lastName.trim(),
        middle_name: flow.middleName.trim() || undefined,
        email: normalizedEmail,
        birth_date: flow.birthDate,
        gender: flow.gender as Gender,
        entity_type: flow.entityType as EntityType,
        phone: digits || undefined,
      },
    });

    if (authUpdateError) {
      logger.error("[AuthPage] auth update failed", { error: authUpdateError.message });
      toast.error("Не удалось обновить аккаунт. Попробуйте снова.");
      return false;
    }

    const profilePatch: Record<string, unknown> = {
      display_name: displayName,
      full_name: displayName,
      first_name: flow.firstName.trim(),
      last_name: flow.lastName.trim(),
      email: normalizedEmail,
      birth_date: flow.birthDate,
      gender: flow.gender,
      entity_type: flow.entityType,
    };
    if (digits) profilePatch.phone = digits;

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (existingProfileError) {
      logger.error("[AuthPage] profile existence check failed", { error: existingProfileError.message });
      toast.error("Не удалось проверить профиль. Попробуйте снова.");
      return false;
    }

    const profileMutation = existingProfile
      ? await supabase.from("profiles").update(profilePatch as never).eq("user_id", session.user.id)
      : await supabase.from("profiles").insert({ user_id: session.user.id, ...profilePatch } as never);

    if (profileMutation.error) {
      logger.error("[AuthPage] profile save failed", { error: profileMutation.error.message });
      toast.error("Не удалось сохранить профиль. Попробуйте снова.");
      return false;
    }

    return true;
  };

  const submitPhone = async () => {
    if (!canContinuePhone || flow.loading) return;
    const trimmedPhone = flow.phone.trim();
    dispatch({ type: "loading", value: true });
    try {
      isRegisterFlowRef.current = false;

      const sendUrls = getSendEmailOtpUrls();
      let response: Response | null = null;
      let data: ReturnType<typeof payloadString> extends string ? never : Record<string, unknown> | null = null;
      let lastError: unknown = null;

      for (const sendUrl of sendUrls) {
        try {
          const result = await fetchJsonWithRetry(
            sendUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify({ phone: trimmedPhone }) },
            AUTH_TIMEOUT_MS,
            "send-email-otp",
          );
          if (result.response.ok) { response = result.response; data = result.data; otpSendUrlRef.current = sendUrl; break; }
          response = result.response;
          data = result.data;
        } catch (err) { lastError = err; }
      }

      if (!response) throw (lastError || new Error("Failed to reach send-email-otp endpoint"));

      if (response.status === 404 && payloadString(data, "error") === "not_found") {
        toast.message("Аккаунта нет", { description: "Создайте новый — это займёт минуту" });
        dispatch({ type: "goto", step: "register" });
        return;
      }

      if (!response.ok) {
        const errMsg = payloadString(data, "message") || payloadString(data, "error") || `HTTP ${response.status}`;
        toast.error("Не удалось отправить код", { description: errMsg });
        return;
      }

      otpEmailRef.current = payloadString(data, "email") || "";
      dispatch({ type: "setMaskedEmail", maskedEmail: payloadString(data, "maskedEmail") || "" });
      dispatch({ type: "setOtp", otp: "" });
      dispatch({ type: "setCountdown", value: OTP_RESEND_COOLDOWN_SEC });
      toast.success(`Код отправлен на ${payloadString(data, "maskedEmail") || "почту"}`);
      dispatch({ type: "goto", step: "otp" });
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Send OTP transient backend outage", { error, phone: trimmedPhone });
      } else {
        logger.error("[AuthPage] Send OTP error", { error, phone: trimmedPhone });
      }
      toast.error("Ошибка отправки кода", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const submitRegister = async () => {
    if (flow.loading) return;
    const trimmedPhone = flow.phone.trim();
    const trimmedEmail = flow.email.trim().toLowerCase();
    const trimmedFirstName = flow.firstName.trim();
    const trimmedLastName = flow.lastName.trim();

    if (!trimmedPhone || trimmedPhone.replace(/\D/g, "").length < 10) {
      dispatch({ type: "setRegisterError", error: "Введите корректный номер телефона" }); return;
    }
    if (!trimmedFirstName || !trimmedLastName || !flow.birthDate || !flow.gender || !flow.entityType) {
      dispatch({ type: "setRegisterError", error: "Заполните обязательные поля" }); return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      dispatch({ type: "setRegisterError", error: "Введите корректный email" }); return;
    }
    if (flow.password.length < 6) {
      dispatch({ type: "setRegisterError", error: "Пароль должен содержать минимум 6 символов" }); return;
    }
    if (flow.password !== flow.passwordConfirm) {
      dispatch({ type: "setRegisterError", error: "Пароли не совпадают" }); return;
    }
    dispatch({ type: "setRegisterError", error: "" });
    dispatch({ type: "loading", value: true });

    try {
      isRegisterFlowRef.current = true;

      const sendUrls = getSendEmailOtpUrls();
      let response: Response | null = null;
      let data: Record<string, unknown> | null = null;
      let lastError: unknown = null;

      for (const sendUrl of sendUrls) {
        try {
          const result = await fetchJsonWithRetry(
            sendUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify({ email: trimmedEmail, phone: trimmedPhone }) },
            AUTH_TIMEOUT_MS,
            "register-send-email-otp",
          );
          if (result.response.ok) { response = result.response; data = result.data; otpSendUrlRef.current = sendUrl; break; }
          response = result.response; data = result.data;
        } catch (err) { lastError = err; }
      }

      if (!response) throw (lastError || new Error("Failed to reach send-email-otp endpoint"));

      if (!response.ok) {
        const errMsg = payloadString(data, "message") || payloadString(data, "error") || `HTTP ${response.status}`;
        toast.error("Не удалось отправить код", { description: errMsg });
        return;
      }

      otpEmailRef.current = trimmedEmail;
      dispatch({ type: "setMaskedEmail", maskedEmail: trimmedEmail });
      dispatch({ type: "setOtp", otp: "" });
      dispatch({ type: "setCountdown", value: OTP_RESEND_COOLDOWN_SEC });
      toast.success("Код отправлен на " + trimmedEmail);
      dispatch({ type: "goto", step: "otp" });
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Register send OTP transient backend outage", { error, email: trimmedEmail, phone: trimmedPhone });
      } else {
        logger.error("[AuthPage] Register send OTP error", { error, email: trimmedEmail, phone: trimmedPhone });
      }
      toast.error("Не удалось отправить код", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const submitOtp = async () => {
    if (!canContinueOtp || flow.loading) return;
    const verifyEmail = otpEmailRef.current || flow.email.trim().toLowerCase();
    dispatch({ type: "loading", value: true });

    try {
      const verifyUrls: string[] = [];
      if (otpSendUrlRef.current) {
        pushUniqueUrl(verifyUrls, toVerifyOtpUrl(otpSendUrlRef.current));
      } else {
        for (const url of getVerifyEmailOtpUrls()) pushUniqueUrl(verifyUrls, url);
      }

      let response: Response | null = null;
      let data: Record<string, unknown> | null = null;
      let lastError: unknown = null;

      for (const verifyUrl of verifyUrls) {
        try {
          const result = await fetchJsonWithRetry(
            verifyUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify({ email: verifyEmail, code: flow.otp.trim() }) },
            AUTH_TIMEOUT_MS,
            "verify-email-otp",
          );
          if (result.response.ok) { response = result.response; data = result.data; break; }
          response = result.response; data = result.data;
        } catch (err) { lastError = err; }
      }

      if (!response) throw (lastError || new Error("Failed to reach verify-email-otp endpoint"));

      if (!response.ok || !payloadBoolean(data, "ok")) {
        const errMsg = payloadString(data, "message") || payloadString(data, "error") || `HTTP ${response.status}`;
        logger.error("[AuthPage] verify-email-otp failed", { error: errMsg, email: verifyEmail });
        toast.error("Неверный или просроченный код", { description: errMsg });
        return;
      }

      const accessToken = payloadString(data, "accessToken");
      const refreshToken = payloadString(data, "refreshToken");
      if (!accessToken || !refreshToken) {
        toast.error("Не удалось создать сессию", { description: "Ответ сервера не содержит токены" });
        return;
      }

      const { error: sessionError } = await withTimeout(
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
        8000,
        "setSession",
      );
      if (sessionError) {
        logger.error("[AuthPage] setSession error", { error: sessionError });
        toast.error("Не удалось создать сессию");
        return;
      }

      const isNewUser = payloadBoolean(data, "isNewUser") || isRegisterFlowRef.current;

      if (isNewUser) {
        const saved = await completeRegistrationProfile();
        if (!saved) return;
        toast.success("Аккаунт создан!");
        clearRegisterFields();
        dispatch({ type: "goto", step: "success" });
        setShowRecommendations(true);
      } else {
        toast.success("Добро пожаловать!");
        dispatch({ type: "goto", step: "success" });
        window.setTimeout(() => navigate("/"), 500);
      }
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Verify OTP transient backend outage", { error, email: verifyEmail });
      } else {
        logger.error("[AuthPage] Verify OTP error", { error, email: verifyEmail });
      }
      toast.error("Ошибка проверки кода", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const handleResendOtp = async () => {
    if (flow.otpCountdown > 0 || flow.loading) return;
    const resendEmail = otpEmailRef.current || flow.email.trim().toLowerCase();
    dispatch({ type: "loading", value: true });

    try {
      const payload = isRegisterFlowRef.current
        ? { email: resendEmail }
        : flow.phone.trim()
          ? { phone: flow.phone.trim() }
          : { email: resendEmail };

      const sendUrls = getSendEmailOtpUrls();
      let response: Response | null = null;
      let lastError: unknown = null;

      for (const sendUrl of sendUrls) {
        try {
          const result = await fetchJsonWithRetry(
            sendUrl,
            { method: "POST", headers: getAnonHeaders(), body: JSON.stringify(payload) },
            AUTH_TIMEOUT_MS,
            "resend-email-otp",
          );
          if (result.response.ok) { response = result.response; otpSendUrlRef.current = sendUrl; break; }
          response = result.response;
        } catch (err) { lastError = err; }
      }

      if (!response) throw (lastError || new Error("Failed to reach send-email-otp endpoint"));

      if (!response.ok) {
        toast.error("Не удалось переотправить код");
        return;
      }
      toast.success("Код отправлен повторно");
      dispatch({ type: "setOtp", otp: "" });
      dispatch({ type: "setCountdown", value: OTP_RESEND_COOLDOWN_SEC });
    } catch (error) {
      if (isTransientSupabaseAvailabilityError(error)) {
        logger.warn("[AuthPage] Resend OTP transient backend outage", { error });
      } else {
        logger.error("[AuthPage] Resend OTP error", { error });
      }
      toast.error("Не удалось переотправить код", { description: getReadableAuthErrorMessage(error) });
    } finally {
      dispatch({ type: "loading", value: false });
    }
  };

  const handleBack = () => {
    if (flow.loading) return;
    if (flow.step === "otp") {
      dispatch({ type: "goto", step: isRegisterFlowRef.current ? "register" : "phone" });
      dispatch({ type: "setOtp", otp: "" });
      otpEmailRef.current = "";
      dispatch({ type: "setMaskedEmail", maskedEmail: "" });
      otpSendUrlRef.current = "";
      return;
    }
    if (flow.step === "register" || flow.step === "qr") {
      dispatch({ type: "goto", step: "phone" });
      isRegisterFlowRef.current = false;
    }
  };

  const handleContinue = () => {
    setShowRecommendations(false);
    navigate("/");
  };

  return (
    <PremiumAuthLayout tokens={tokens}>
      <WaveBackground tokens={tokens} />

      {/* Brand Panel - left side on desktop */}
      <BrandPanel tokens={tokens} />

      {/* Auth Card - right side */}
      <PremiumGlassCard tokens={tokens} className="w-full max-w-[440px] p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        {/* Top row: Back button + Theme toggle - always visible */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <AnimatePresence>
            {flow.step !== "phone" && (
              <motion.button
                key="back-btn"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={handleBack}
                className="h-10 w-10 rounded-full border border-white/10 bg-white/[0.05] backdrop-blur-xl flex items-center justify-center transition hover:bg-white/[0.1]"
              >
                <ChevronLeft className="h-5 w-5 text-white/70" />
              </motion.button>
            )}
            {(flow.step === "phone" || !flow.step) && <div className="w-10" />}
          </AnimatePresence>
          <motion.button
            onClick={toggle}
            whileTap={{ scale: 0.9 }}
            className="h-10 w-10 rounded-full border border-white/10 bg-white/[0.05] backdrop-blur-xl flex items-center justify-center transition hover:bg-white/[0.1]"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Moon className="h-5 w-5 text-white/70" /> : <Sun className="h-5 w-5 text-white/70" />}
          </motion.button>
        </div>

        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <motion.img
            src="/brand/logo.png"
            alt=""
            className="w-8 h-8 sm:w-9 sm:h-9"
            aria-hidden="true"
            animate={{
              y: [0, -3, 0],
              filter: [
                "drop-shadow(0 0 12px rgba(0,188,212,0.5))",
                "drop-shadow(0 0 20px rgba(0,188,212,0.8))",
                "drop-shadow(0 0 12px rgba(0,188,212,0.5))",
              ],
            }}
            transition={{
              y: { duration: 4, ease: "easeInOut", repeat: Infinity },
              filter: { duration: 4, ease: "easeInOut", repeat: Infinity },
            }}
          />
          <span className="text-[24px] sm:text-[28px] tracking-[0.3em] uppercase font-bold text-gradient-brand">
            mansoni
          </span>
        </div>

        {/* Kind Tips Ticker */}
        <div className="flex-1 flex flex-col justify-end pb-4">
          <KindTipsTicker tokens={tokens} />
        </div>

        {/* Steps */}
        <div className="relative flex flex-col gap-4 mt-auto">
          <AnimatePresence mode="wait">
            {flow.step === "phone" && (
              <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="space-y-4">
                  <PhoneInput value={flow.phone} onChange={(v) => dispatch({ type: "setPhone", phone: v })} />
                  <PrimaryButton type="button" onClick={() => void submitPhone()} disabled={!canContinuePhone} loading={flow.loading}>
                    Получить код
                  </PrimaryButton>
                </div>
              </motion.div>
            )}

            {flow.step === "register" && (
              <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <h2 className="text-xl font-bold text-white">Создать аккаунт</h2>
                <div className="grid grid-cols-2 gap-3">
                  <GlassInput tokens={tokens} id="firstName" label="Имя *" value={flow.firstName} onChange={(v) => dispatch({ type: "setRegisterField", field: "firstName", value: v })} />
                  <GlassInput tokens={tokens} id="lastName" label="Фамилия *" value={flow.lastName} onChange={(v) => dispatch({ type: "setRegisterField", field: "lastName", value: v })} />
                </div>
                <GlassInput tokens={tokens} id="middleName" label="Отчество" value={flow.middleName} onChange={(v) => dispatch({ type: "setRegisterField", field: "middleName", value: v })} />
                <GlassInput tokens={tokens} id="email" label="Email *" value={flow.email} onChange={(v) => dispatch({ type: "setEmail", email: v })} type="email" icon={<Mail className="h-5 w-5" />} />
                <div className="grid grid-cols-2 gap-3">
                  <GlassInput tokens={tokens} id="password" label="Пароль *" value={flow.password} onChange={(v) => dispatch({ type: "setRegisterField", field: "password", value: v })} type="password" />
                  <GlassInput tokens={tokens} id="passwordConfirm" label="Подтвердите *" value={flow.passwordConfirm} onChange={(v) => dispatch({ type: "setRegisterField", field: "passwordConfirm", value: v })} type="password" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] tracking-[0.18em] uppercase opacity-80 ${tokens.textSecondary}`}>Дата рождения *</label>
                    <input
                      type="date"
                      value={flow.birthDate}
                      onChange={(e) => dispatch({ type: "setRegisterField", field: "birthDate", value: e.target.value })}
                      className="w-full h-14 px-4 rounded-2xl border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl text-white text-[15px] outline-none transition-all hover:border-white/15 focus:border-white/20"
                    />
                  </div>
                  <GlassSelect
                    id="gender"
                    label="Пол *"
                    value={flow.gender}
                    options={[
                      { value: "male", label: "Мужской" },
                      { value: "female", label: "Женский" }
                    ]}
                    onChange={(v) => dispatch({ type: "setRegisterField", field: "gender", value: v })}
                  />
                </div>
                <GlassSelect
                  id="entity"
                  label="Тип *"
                  value={flow.entityType}
                  options={[
                    { value: "individual", label: "Физ. лицо" },
                    { value: "self_employed", label: "Самозанятый" },
                    { value: "entrepreneur", label: "ИП" },
                    { value: "legal_entity", label: "Юр. лицо" }
                  ]}
                  onChange={(v) => dispatch({ type: "setRegisterField", field: "entityType", value: v })}
                />
                {flow.registerError && <div className="text-xs rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200">{flow.registerError}</div>}
                <PrimaryButton type="button" onClick={() => void submitRegister()} disabled={flow.loading} loading={flow.loading}>
                  Создать аккаунт
                </PrimaryButton>
              </motion.div>
            )}

            {flow.step === "otp" && (
              <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <h2 className="text-xl font-bold text-white">Код подтверждения</h2>
                <p className={`text-sm ${tokens.textMuted}`}>Отправлен на {flow.maskedEmail || otpEmailRef.current || "почту"}</p>
                <OtpInput value={flow.otp} onChange={(v) => dispatch({ type: "setOtp", otp: v })} />
                <PrimaryButton type="button" onClick={() => void submitOtp()} disabled={!canContinueOtp} loading={flow.loading}>
                  Подтвердить
                </PrimaryButton>
                <div className={`text-center text-sm ${tokens.textMuted}`}>
                  {flow.otpCountdown > 0 ? (
                    <>Повторно через {Math.floor(flow.otpCountdown / 60)}:{String(flow.otpCountdown % 60).padStart(2, "0")}</>
                  ) : (
                    <button type="button" onClick={() => void handleResendOtp()} className={`${tokens.textPrimary} underline`}>Отправить ещё раз</button>
                  )}
                </div>
              </motion.div>
            )}

            {flow.step === "qr" && (
              <motion.div key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <h2 className="text-xl font-bold text-white">Вход по QR-коду</h2>
                <QRCodeLogin onSuccess={() => navigate("/")} />
              </motion.div>
            )}

            {flow.step === "success" && (
              <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SuccessScreen
                  tokens={tokens}
                  displayName={flow.firstName}
                  onContinue={handleContinue}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Social Login */}
          <SocialLoginButtons tokens={tokens} />

          {/* Security & Legal */}
          <SecurityFooter tokens={tokens} />
        </div>
      </PremiumGlassCard>

      <RecommendedUsersModal isOpen={showRecommendations} onClose={() => { setShowRecommendations(false); navigate("/"); }} />
    </PremiumAuthLayout>
  );
}

export default AuthPage;
