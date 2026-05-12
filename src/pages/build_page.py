#!/usr/bin/env python3
"""Build AuthPage.tsx from template parts."""
import os, textwrap

OUT = "/Users/manso/Desktop/разработка/mansoni/src/pages/AuthPage.tsx"

HEADER = '''/**
 * AuthPage — premium auth screen with split Login/Register flows.
 * Clean two-panel layout for desktop, single panel for mobile.
 */

import { useRef, useState, useMemo } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, Heart, KeyRound, Mail, QrCode, UserPlus, Eye, EyeOff, Loader2 } from "lucide-react";

import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeLogin } from "@/components/auth/QRCodeLogin";
import { RecommendedUsersModal } from "@/components/profile/RecommendedUsersModal";

import { supabase } from "@/lib/supabase";
import { getVerifyEmailOtpUrls, getSendEmailOtpUrls, getAnonHeaders } from "@/lib/auth/backendEndpoints";
import { logger } from "@/lib/logger";

import type { FlowAction, EntityType } from "./auth/types";
import {
  fetchJsonWithRetry, withTimeout, payloadString, payloadBoolean,
  getReadableAuthErrorMessage, isTransientSupabaseAvailabilityError,
  toVerifyOtpUrl, pushUniqueUrl, OTP_RESEND_COOLDOWN_SEC, AUTH_TIMEOUT_MS,
} from "./auth/api";
import { useTheme, useThemeTokens } from "./auth/theme";
import { useAuthFlow, useMediaFlag, useOtpCountdown, calcPasswordStrength } from "./auth/hooks";

import { AuroraBackground } from "./auth/components/AuroraBackground";
import { PrimaryButton } from "./auth/components/PrimaryButton";
import { GlassInput } from "./auth/components/GlassInput";
import { OtpInput } from "./auth/components/OtpInput";
import { SecurityFooter } from "./auth/components/SecurityFooter";
import { AuthToggle } from "./auth/components/AuthToggle";
import { SocialLoginButtons } from "./auth/components/SocialLoginButtons";
import { PasswordInput } from "./auth/components/PasswordInput";
import { SuccessScreen } from "./auth/components/SuccessScreen";
import { TermsCheckbox } from "./auth/components/TermsCheckbox";
import { BrandPanel } from "./auth/components/BrandPanel";
import { StepTransition, AnimatedCard } from "./auth/components/PremiumAuthLayout";


export function AuthPage() {
  const { theme, toggle } = useTheme("dark");
  const tokens = useThemeTokens(theme);
  const [flow, dispatch] = useAuthFlow();
  const navigate = useNavigate();

  const otpEmailRef = useRef("");
  const otpSendUrlRef = useRef("");
  const isRegisterFlowRef = useRef(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  const reduced = useMediaFlag("(prefers-reduced-motion: reduce)");
  useOtpCountdown(flow.otpCountdown, dispatch);
'''

BODY = '''
  const phoneDigits = flow.phone.replace(/\\D/g, "");
  const canContinuePhone = phoneDigits.length >= 10;
  const canContinueOtp = flow.otp.length === 6;
  const passwordStrength = useMemo(() => calcPasswordStrength(flow.password), [flow.password]);
  const passwordsMatch = !!flow.password && !!flow.passwordConfirm && flow.password === flow.passwordConfirm;

  const clearRegisterFields = () => {
    const fields = ["firstName", "lastName", "middleName", "birthDate", "gender", "entityType", "password", "passwordConfirm"];
    for (const field of fields) dispatch({ type: "setRegisterField", field, value: "" });
    dispatch({ type: "setRegisterError", error: "" });
  };

  const completeRegistrationProfile = async (): Promise<boolean> => {
    const displayName = [flow.firstName.trim(), flow.lastName.trim(), flow.middleName.trim()].filter(Boolean).join(" ");
    const digits = flow.phone.replace(/\\D/g, "");
    const normalizedEmail = (otpEmailRef.current || flow.email).trim().toLowerCase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { toast.error("Сессия истекла, войдите снова"); return false; }
    const { error: authUpdateError } = await supabase.auth.updateUser({
      password: flow.password,
      data: { full_name:displayName, first_name:flow.firstName.trim(), last_name:flow.lastName.trim(), middle_name:flow.middleName.trim()||undefined, email:normalizedEmail, birth_date:flow.birthDate, gender:flow.gender as any, entity_type:flow.entityType as any, phone:digits||undefined }
    });
    if (authUpdateError) { logger.error("[AuthPage] auth update failed",{error:authUpdateError.message}); toast.error("Не удалось обновить аккаунт"); return false; }
    const pp: Record<string, unknown> = { display_name:displayName, full_name:displayName, first_name:flow.firstName.trim(), last_name:flow.lastName.trim(), email:normalizedEmail, birth_date:flow.birthDate, gender:flow.gender, entity_type:flow.entityType };
    if (digits) pp.phone = digits;
    const { data:ep, error:epErr } = await supabase.from("profiles").select("user_id").eq("user_id",session.user.id).maybeSingle();
    if (epErr) { toast.error("Не удалось проверить профиль"); return false; }
    const mut = ep ? await supabase.from("profiles").update(pp as never).eq("user_id",session.user.id) : await supabase.from("profiles").insert({user_id:session.user.id, ...pp} as never);
    if (mut.error) { toast.error("Не удалось сохранить профиль"); return false; }
    return true;
  };

  const submitPhone = async () => {
    if (!canContinuePhone || flow.loading) return;
    const trimmedPhone = flow.phone.trim();
    dispatch({ type: "loading", value: true });
    try {
      isRegisterFlowRef.current = false;
      let response: Response | null = null, data: Record<string, unknown> | null = null, lastError: unknown = null;
      for (const u of getSendEmailOtpUrls()) {
        try {
          const r = await fetchJsonWithRetry(u,{method:"POST",headers:getAnonHeaders(),body:JSON.stringify({phone:trimmedPhone})},AUTH_TIMEOUT_MS,"send-email-otp");
          if (r.response.ok) { response=r.response; data=r.data; otpSendUrlRef.current=u; break; }
          response=r.response; data=r.data;
        } catch(e) { lastError=e; }
      }
      if (!response) throw (lastError||new Error("Failed"));
      if (response.status===404 && payloadString(data,"error")==="not_found") {
        toast.message("Аккаунта нет",{description:"Создайте новый — это займёт минуту"});
        dispatch({type:"goto",step:"register"});
        return;
      }
      if (!response.ok) { const m=payloadString(data,"message")||payloadString(data,"error")||`HTTP ${response.status}`; toast.error("Не удалось отправить код",{description:m}); return; }
      otpEmailRef.current = payloadString(data,"email")||"";
      dispatch({type:"setMaskedEmail",maskedEmail:payloadString(data,"maskedEmail")||""});
      dispatch({type:"setOtp",otp:""});
      dispatch({type:"setCountdown",value:OTP_RESEND_COOLDOWN_SEC});
      toast.success(`Код отправлен на ${payloadString(data,"maskedEmail")||"почту"}`);
      dispatch({type:"goto",step:"otp"});
    } catch(e) {
      if (isTransientSupabaseAvailabilityError(e)) logger.warn("[AuthPage] Send OTP outage",{error:e});
      else logger.error("[AuthPage] Send OTP error",{error:e});
      toast.error("Ошибка отправки кода",{description:getReadableAuthErrorMessage(e)});
    } finally { dispatch({type:"loading",value:false}); }
  };

  const submitRegister = async () => {
    const tp=flow.phone.trim(), te=flow.email.trim().toLowerCase(), tf=flow.firstName.trim(), tl=flow.lastName.trim();
    if (!tp||tp.replace(/\\D/g,"").length<10) { dispatch({type:"setRegisterError",error:"Введите корректный номер телефона"}); return; }
    if (!tf||!tl||!flow.birthDate||!flow.gender||!flow.entityType) { dispatch({type:"setRegisterError",error:"Заполните обязательные поля"}); return; }
    if (!te||!/^[^@\\s]+@[^\\s@]+\\.[^\\s@]+$/.test(te)) { dispatch({type:"setRegisterError",error:"Введите корректный email"}); return; }
    if (flow.password.length<6) { dispatch({type:"setRegisterError",error:"Пароль минимум 6 символов"}); return; }
    if (flow.password!==flow.passwordConfirm) { dispatch({type:"setRegisterError",error:"Пароли не совпадают"}); return; }
    if (!flow.termsAccepted) { dispatch({type:"setRegisterError",error:"Примите условия использования"}); return; }
    dispatch({type:"setRegisterError",error:""});
    dispatch({type:"loading",value:true});
    try {
      isRegisterFlowRef.current = true;
      let response: Response | null = null, data: Record<string, unknown> | null = null, lastError: unknown = null;
      for (const u of getSendEmailOtpUrls()) {
        try { const r=await fetchJsonWithRetry(u,{method:"POST",headers:getAnonHeaders(),body:JSON.stringify({email:te,phone:tp})},AUTH_TIMEOUT_MS,"register-send-email-otp"); if(r.response.ok){response=r.response;data=r.data;otpSendUrlRef.current=u;break;} response=r.response;data=r.data; } catch(e){lastError=e;}
      }
      if (!response) throw(lastError||new Error("Failed"));
      if (!response.ok) { const m=payloadString(data,"message")||payloadString(data,"error")||`HTTP ${response.status}`; toast.error("Не удалось отправить код",{description:m}); return; }
      otpEmailRef.current=te; dispatch({type:"setMaskedEmail",maskedEmail:te}); dispatch({type:"setOtp",otp:""}); dispatch({type:"setCountdown",value:OTP_RESEND_COOLDOWN_SEC});
      toast.success("Код отправлен на "+te); dispatch({type:"goto",step:"otp"});
    } catch(e) {
      if(isTransientSupabaseAvailabilityError(e)) logger.warn("[AuthPage] Register send OTP outage",{error:e,email:te,phone:tp});
      else logger.error("[AuthPage] Register send OTP error",{error:e,email:te,phone:tp});
      toast.error("Не удалось отправить код",{description:getReadableAuthErrorMessage(e)});
    } finally { dispatch({type:"loading",value:false}); }
  };

  const submitOtp = async () => {
    if (!canContinueOtp||flow.loading) return;
    const ve = otpEmailRef.current||flow.email.trim().toLowerCase();
    dispatch({type:"loading",value:true});
    try {
      const vu: string[] = [];
      if(otpSendUrlRef.current) pushUniqueUrl(vu,toVerifyOtpUrl(otpSendUrlRef.current));
      else for(const u of getVerifyEmailOtpUrls()) pushUniqueUrl(vu,u);
      let response: Response | null = null, data: Record<string, unknown> | null = null, lastError: unknown = null;
      for(const v of vu){
        try{const r=await fetchJsonWithRetry(v,{method:"POST",headers:getAnonHeaders(),body:JSON.stringify({email:ve,code:flow.otp.trim()})},AUTH_TIMEOUT_MS,"verify-email-otp"); if(r.response.ok){response=r.response;data=r.data;break;} response=r.response;data=r.data;}catch(e){lastError=e;}
      }
      if(!response) throw(lastError||new Error("Failed"));
      if(!response.ok||!payloadBoolean(data,"ok")){const m=payloadString(data,"message")||payloadString(data,"error")||`HTTP ${response.status}`; logger.error("[AuthPage] verify-email-otp failed",{error:m,email:ve}); toast.error("Неверный или просроченный код",{description:m}); return; }
      const at=payloadString(data,"accessToken"), rt=payloadString(data,"refreshToken");
      if(!at||!rt){toast.error("Не удалось создать сессию"); return;}
      const{error:se}=await withTimeout(supabase.auth.setSession({access_token:at,refresh_token:rt}),8000,"setSession");
      if(se){logger.error("[AuthPage] setSession error");toast.error("Не удалось создать сессию");return;}
      const isNew=payloadBoolean(data,"isNewUser")||isRegisterFlowRef.current;
      if(isNew){const saved=await completeRegistrationProfile();if(!saved)return;toast.success("Аккаунт создан!");clearRegisterFields();dispatch({type:"goto",step:"success"});setShowRecommendations(true);}
      else{toast.success("Добро пожаловать!");dispatch({type:"goto",step:"success"});setTimeout(()=>navigate("/"),500);}
    } catch(e) {
      if(isTransientSupabaseAvailabilityError(e)) logger.warn("[AuthPage] Verify OTP outage",{error:e,email:ve});
      else logger.error("[AuthPage] Verify OTP error",{error:e,email:ve});
      toast.error("Ошибка проверки кода",{description:getReadableAuthErrorMessage(e)});
    } finally { dispatch({type:"loading",value:false}); }
  };

  const handleResendOtp = async () => {
    if(flow.otpCountdown>0||flow.loading) return;
    const re=otpEmailRef.current||flow.email.trim().toLowerCase();
    dispatch({type:"loading",value:true});
    try{
      const payload = isRegisterFlowRef.current?{email:re}:flow.phone.trim()?{phone:flow.phone.trim()}:{email:re};
      let response: Response | null = null, lastError: unknown = null;
      for(const u of getSendEmailOtpUrls()){try{const r=await fetchJsonWithRetry(u,{method:"POST",headers:getAnonHeaders(),body:JSON.stringify(payload)},AUTH_TIMEOUT_MS,"resend-email-otp");if(r.response.ok){response=r.response;otpSendUrlRef.current=u;break;}response=r.response;}catch(e){lastError=e;}}
      if(!response) throw(lastError||new Error("Failed"));
      if(!response.ok){toast.error("Не удалось переотправить код");return;}
      toast.success("Код отправлен повторно"); dispatch({type:"setOtp",otp:""}); dispatch({type:"setCountdown",value:OTP_RESEND_COOLDOWN_SEC});
    }catch(e){
      if(isTransientSupabaseAvailabilityError(e)) logger.warn("[AuthPage] Resend OTP outage");
      else logger.error("[AuthPage] Resend OTP error",{error:e});
      toast.error("Не удалось переотправить код",{description:getReadableAuthErrorMessage(e)});
    }finally{dispatch({type:"loading",value:false});}
  };

  const handleBack = () => {
    if(flow.loading) return;
    if(flow.step==="otp"){dispatch({type:"goto",step:isRegisterFlowRef.current?"register":"phone"});dispatch({type:"setOtp",otp:""});otpEmailRef.current="";dispatch({type:"setMaskedEmail",maskedEmail:""});otpSendUrlRef.current="";return;}
    if(flow.step==="register"||flow.step==="qr"){dispatch({type:"goto",step:"phone"});isRegisterFlowRef.current=false;}
  };
''';

FOOTER = '''
  const canRegisterFinal = canContinuePhone && flow.emailValid && passwordStrength !== "weak" && passwordStrength !== "empty" && passwordsMatch && flow.firstName.trim() && flow.lastName.trim() && flow.birthDate && flow.gender && flow.entityType && flow.termsAccepted;

  const renderPhoneStep = () => (
    <StepTransition>
      <AnimatedCard key="phone">
        <form onSubmit={(e)=>{e.preventDefault();void submitPhone();}} className="flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Heart className={`w-4 h-4 ${tokens.isDark?"text-cyan-300":"text-teal-600"}`}/>
            <span className={`text-xs font-semibold ${tokens.isDark?"text-white":"text-gray-700"}`}>Добро пожаловать</span>
          </div>
          <h2 className={`text-[26px] sm:text-[30px] font-bold tracking-tight leading-tight mb-2 ${tokens.textPrimary}`}>Войдите в аккаунт</h2>
          <p className={`text-sm mb-1 ${tokens.textMuted}`}>Укажите номер телефона для входа или регистрации</p>
          <div className="mt-4">
            <PhoneInput value={flow.phone} onChange={(v)=>dispatch({type:"setPhone",phone:v,countryCode:getCountryCode(v)})} dark={tokens.isDark}/>
          </div>
          <div className="mt-5">
            <PrimaryButton type="submit" icon={<ArrowRight className="w-5 h-5"/>} disabled={!canContinuePhone} loading={flow.loading}>Получить код</PrimaryButton>
          </div>
          <button type="button" onClick={()=>dispatch({type:"goto",step:"qr"})} className={`mt-3 group flex items-center justify-center gap-2 h-12 rounded-2xl border backdrop-blur-xl transition ${tokens.pillSurface} ${tokens.textSecondary}`}>
            <QrCode className="w-5 h-5 text-cyan-500"/> Войти по QR-коду
          </button>
        </form>
      </AnimatedCard>
    </StepTransition>
  );

  const renderRegisterStep = () => (
    <StepTransition>
      <AnimatedCard key="register" direction="left">
        <form onSubmit={(e)=>{e.preventDefault();void submitRegister();}} className="flex flex-col gap-4">
          <div>
            <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>Создать аккаунт</h1>
            <p className={`mt-2 text-sm ${tokens.textMuted}`}>Аккаунта с номером <span className={tokens.textPrimary}>{flow.phone||"телефон"}</span> пока нет.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GlassInput id="firstName" label="Имя *" value={flow.firstName} onChange={(v)=>dispatch({type:"setRegisterField",field:"firstName",value:v})} autoComplete="given-name" tokens={tokens}/>
            <GlassInput id="lastName" label="Фамилия *" value={flow.lastName} onChange={(v)=>dispatch({type:"setRegisterField",field:"lastName",value:v})} autoComplete="family-name" tokens={tokens}/>
          </div>
          <GlassInput id="middleName" label="Отчество (по желанию)" value={flow.middleName} onChange={(v)=>dispatch({type:"setRegisterField",field:"middleName",value:v})} tokens={tokens}/>
          <GlassInput id="email" label="Электронная почта *" value={flow.email} onChange={(v)=>dispatch({type:"setEmail",email:v})} type="email" autoComplete="email" icon={<Mail className="h-5 w-5"/>} tokens={tokens} error={!flow.emailValid&&flow.email?"Введите корректный email":undefined}/>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GlassInput id="birthDate" label="Дата рождения *" value={flow.birthDate} onChange={(v)=>dispatch({type:"setRegisterField",field:"birthDate",value:v})} type="date" tokens={tokens}/>
            <Select value={flow.gender} onValueChange={(v)=>dispatch({type:"setRegisterField",field:"gender",value:v})}>
              <SelectTrigger className={`h-14 rounded-2xl border backdrop-blur-xl ${tokens.inputSurface} ${tokens.textPrimary}`}><SelectValue placeholder="Пол *"/></SelectTrigger>
              <SelectContent className="glass-popover">
                <SelectItem value="male">Мужской</SelectItem>
                <SelectItem value="female">Женский</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={flow.entityType} onValueChange={(v)=>dispatch({type:"setRegisterField",field:"entityType",value:v})}>
            <SelectTrigger className={`h-14 rounded-2xl border backdrop-blur-xl ${tokens.inputSurface} ${tokens.textPrimary}`}><SelectValue placeholder="Тип пользователя *"/></SelectTrigger>
            <SelectContent className="glass-popover">
              <SelectItem value="individual">Физ. лицо</SelectItem>
              <SelectItem value="self_employed">Самозанятый</SelectItem>
              <SelectItem value="entrepreneur">ИП</SelectItem>
              <SelectItem value="legal_entity">Юр. лицо</SelectItem>
            </SelectContent>
          </Select>
          <PasswordInput id="password" label="Пароль *" value={flow.password} onChange={(v)=>dispatch({type:"setRegisterField",field:"password",value:v})} tokens={tokens} strength={passwordStrength}/>
          <PasswordInput id="passwordConfirm" label="Подтвердите пароль *" value={flow.passwordConfirm} onChange={(v)=>{dispatch({type:"setRegisterField",field:"passwordConfirm",value:v});dispatch({type:"setPasswordsMatch",match:flow.password===v});}} tokens={tokens} error={!passwordsMatch&&flow.passwordConfirm?"Пароли не совпадают":undefined}/>
          <TermsCheckbox checked={flow.termsAccepted} onChange={()=>dispatch({type:"toggleTerms"})} tokens={tokens}/>
          {flow.registerError&&<div className={`rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs ${tokens.isDark?"text-rose-200":"text-rose-700"}`}>{flow.registerError}</div>}
          <PrimaryButton type="submit" icon={<UserPlus className="w-5 h-5"/>} disabled={!canRegisterFinal||flow.loading} loading={flow.loading}>Создать аккаунт</PrimaryButton>
          <button type="button" onClick={()=>dispatch({type:"goto",step:"phone"})} className={`group flex items-center justify-center gap-2 h-12 rounded-2xl border backdrop-blur-xl transition ${tokens.pillSurface} ${tokens.textSecondary}`}>
            <ChevronLeft className="h-5 w-5"/> Изменить номер
          </button>
        </form>
      </AnimatedCard>
    </StepTransition>
  );

  const renderOtpStep = () => (
    <StepTransition>
      <AnimatedCard key="otp">
        <form onSubmit={(e)=>{e.preventDefault();void submitOtp();}} className="flex flex-col gap-5">
          <div>
            <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>Код подтверждения</h1>
            <p className={`mt-2 text-sm ${tokens.textMuted}`}>Отправили 6-значный код на <span className={tokens.textPrimary}>{flow.maskedEmail||otpEmailRef.current||flow.email||"почту"}</span></p>
          </div>
          <OtpInput value={flow.otp} onChange={(v)=>dispatch({type:"setOtp",otp:v})} tokens={tokens}/>
          <PrimaryButton type="submit" icon={<KeyRound className="w-5 h-5"/>} disabled={!canContinueOtp} loading={flow.loading}>Подтвердить</PrimaryButton>
          <div className={`text-center text-sm ${tokens.textMuted}`}>
            {flow.otpCountdown>0?(
              <>Отправить повторно через {Math.floor(flow.otpCountdown/60)}:{String(flow.otpCountdown%60).padStart(2,"0")}</>
            ):(
              <>Не пришло?{" "}<button type="button" onClick={()=>void handleResendOtp()} className={`${tokens.textPrimary} underline-offset-2 hover:underline`}>Отправить ещё раз</button></>
            )}
          </div>
        </form>
      </AnimatedCard>
    </StepTransition>
  );

  const renderQRStep = () => (
    <StepTransition>
      <AnimatedCard key="qr" direction="left">
        <div className="flex flex-col gap-5">
          <div>
            <h1 className={`text-[24px] sm:text-[28px] leading-[1.1] font-bold tracking-tight ${tokens.textPrimary}`}>Вход по QR-коду</h1>
            <p className={`mt-2 text-sm ${tokens.textMuted}`}>Откройте mansoni на другом устройстве и отсканируйте код.</p>
          </div>
          <QRCodeLogin onSuccess={()=>navigate("/")}/>
        </div>
      </AnimatedCard>
    </StepTransition>
  );

  const renderSuccessStep = () => (
    <StepTransition>
      <div key="success" className="flex flex-col items-center text-center py-8 px-4">
        <SuccessScreen tokens={tokens} displayName={[flow.firstName.trim(),flow.lastName.trim()].filter(Boolean).join(" ")} onContinue={()=>navigate("/")}/>
      </div>
    </StepTransition>
  );

  const handleToggle = () => {
    dispatch({type:"setAuthMode",mode:flow.authMode==="login"?"register":"login"});
    dispatch({type:"setOtp",otp:""});
    dispatch({type:"setMaskedEmail",maskedEmail:""});
    otpEmailRef.current="";
    otpSendUrlRef.current="";
    isRegisterFlowRef.current=false;
  };

  const getCountryCode = (phone) => {
    if(!phone) return "7";
    if(phone.startsWith("7")) return "7";
    return "7";
  };

  return (
    <div className={`relative h-[100dvh] w-full overflow-x-hidden overflow-y-auto overscroll-y-contain font-[Manrope,system-ui,sans-serif] ${tokens.textPrimary}`} style={{colorScheme:theme,paddingTop:"env(safe-area-inset-top)",paddingBottom:"env(safe-area-inset-bottom)"}}>
      <style>{\`.auth-scroll{scrollbar-width:none!important;-ms-overflow-style:none!important}.auth-scroll::-webkit-scrollbar{display:none!important} @media(max-width:640px){.auth-card{padding:1rem!important;min-width:0!important;max-width:100vw!important;min-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))!important;display:flex!important;flex-direction:column!important;border-radius:0!important;}}\`}</style>
      <AuroraBackground theme={theme}/>
      <div className="relative z-10 flex min-h-[100dvh] items-start sm:items-center justify-center px-3 py-6 sm:px-6 sm:py-8">
        <div className="hidden lg:flex w-[420px] xl:w-[480px] pr-8 xl:pr-12">
          <BrandPanel tokens={tokens}/>
        </div>
        <div className="relative w-full max-w-md lg:max-w-md">
          <div className={`relative rounded-2xl sm:rounded-3xl p-4 sm:p-7 lg:p-8 border backdrop-blur-2xl overflow-hidden auth-card ${tokens.glassCard} ${tokens.glassCardShadow}`} style={{display:"flex",flexDirection:"column"}}>
            <motion.button onClick={toggle} whileTap={{scale:0.9,rotate:180}} className={`absolute top-3 right-3 sm:top-5 sm:right-5 h-10 w-10 rounded-full border backdrop-blur-xl flex items-center justify-center transition ${tokens.iconBtn} z-20`} style={{boxShadow:"0 2px 12px 0 rgba(0,0,0,0.08)"}} aria-label="Toggle theme">
              <AnimatePresence mode="wait" initial={false}>
                {theme==="dark"?(<motion.span key="moon" initial={{opacity:0,rotate:-90}} animate={{opacity:1,rotate:0}} exit={{opacity:0,rotate:90}}><Heart className="h-5 w-5"/></motion.span>):(<motion.span key="sun" initial={{opacity:0,rotate:90}} animate={{opacity:1,rotate:0}} exit={{opacity:0,rotate:-90}}><Heart className="h-5 w-5"/></motion.span>)}
              </AnimatePresence>
            </motion.button>
            <div className="pointer-events-none absolute inset-0 rounded-[inherit]">
              <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent ${tokens.isDark?"via-white/70":"via-white"} to-transparent`}/>
              <div className={`absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent ${tokens.isDark?"via-cyan-400/30":"via-teal-300"} to-transparent`}/>
            </div>
            <div className="flex items-center justify-center mb-5 sm:mb-6">
              <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} transition={{duration:0.7,delay:0.1}} className="flex items-center gap-3">
                <img src="/brand/mansoni-logo.svg" alt="" className="w-10 h-10 sm:w-12 sm:h-12 shrink-0" aria-hidden="true"/>
                <span className="text-[26px] sm:text-[32px] font-bold tracking-[0.1em] uppercase text-gradient-brand" style={{fontFeatureSettings:'"ss01"',textShadow:"0 0 30px rgba(6,182,212,0.25)"}}>mansoni</span>
              </motion.div>
            </div>
            {flow.step==="phone" && <AuthToggle mode={flow.authMode} onToggle={handleToggle} tokens={tokens}/>}
            <div className="relative flex-1 flex flex-col justify-center min-h-[260px] sm:min-h-[300px]">
              <AnimatePresence mode="wait" initial={false}>
                {flow.step==="phone" && renderPhoneStep()}
                {flow.step==="register" && renderRegisterStep()}
                {flow.step==="otp" && renderOtpStep()}
                {flow.step==="qr" && renderQRStep()}
                {flow.step==="success" && renderSuccessStep()}
              </AnimatePresence>
            </div>
            {flow.step==="phone" && flow.authMode==="login" && <SocialLoginButtons tokens={tokens}/>}
            {flow.step==="phone" && <QRLoginSection tokens={tokens}/>}
            <SecurityFooter tokens={tokens}/>
          </div>
        </div>
      </div>
      <RecommendedUsersModal isOpen={showRecommendations} onClose={()=>{setShowRecommendations(false);navigate("/");}}/>
    </div>
  );
}

export default AuthPage;
'''

os.makedirs(os.path.dirname(OUT), exist_ok=True)

with open(OUT, "w", encoding="utf-8") as f:
    f.write(HEADER.strip() + "\n\n" + BODY.strip() + "\n\n" + FOOTER.strip() + "\n")

print(f"Written {OUT} ({os.path.getsize(OUT)} bytes)")