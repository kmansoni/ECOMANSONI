import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { RegistrationModal } from "@/components/auth/RegistrationModal";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { RecommendedUsersModal } from "@/components/profile/RecommendedUsersModal";
import { setGuestMode } from "@/lib/demo/demoMode";

const DEMO_GUEST_PHONE = "+70000000000";

type AuthMode = "select" | "login" | "register";

const PHONE_AUTH_TIMEOUT_MS = 12_000;

function buildPhoneAuthUrl(): string {
  // Prefer env-configured project URL to avoid hardcoding projectRef.
  const base = (SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/functions/v1/phone-auth`;
}

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
    } catch {
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) window.clearTimeout(timer);
  });
}

export function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("select");
  const [phone, setPhone] = useState("");
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast.error("Введите корректный номер телефона");
      return;
    }
    
    setLoading(true);

    try {
      // Any explicit login disables guest mode
      setGuestMode(false);
      console.log("🔵 [AuthPage] Starting login with phone:", phone);
      
      // Use phone-auth function via supabase.functions.invoke
      console.log("🔵 [AuthPage] Invoking phone-auth function...");
      const invokeStartTime = Date.now();
      
      // Manually create the request to debug
      const functionUrl = buildPhoneAuthUrl();
      if (!functionUrl) {
        toast.error("Не настроен Supabase URL");
        return;
      }
      
      console.log("🔵 [AuthPage] Manual fetch request to:", functionUrl);
      console.log("🔵 [AuthPage] Headers:", { 
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 10)}...` : 'MISSING',
        'x-client-info': 'supabase-js/2'
      });
      
      const body = {
        action: "register-or-login",
        phone: `+${digits}`,
        display_name: "User",
        email: `user${digits}@placeholder.local`,
      };
      
      console.log("🔵 [AuthPage] Request body:", body);
      
      // Try manual fetch with detailed logging
      const { response, data } = await fetchJsonWithTimeout(
        functionUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
            "x-client-info": "supabase-js/2",
          },
          body: JSON.stringify(body),
        },
        PHONE_AUTH_TIMEOUT_MS,
        "phone-auth",
      );
      
      console.log(`🔵 [AuthPage] Response received after ${Date.now() - invokeStartTime}ms:`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
      
      console.log("🔵 [AuthPage] Response body:", data);

      if (!response.ok || !data?.ok) {
        console.error("🔴 [AuthPage] Function returned error or not ok:", { 
          status: response.status, 
          data 
        });
        toast.error("Не удалось выполнить вход", { 
          description: data?.error || `HTTP ${response.status}` 
        });
        return;
      }

      console.log("🔵 [AuthPage] Got tokens, setting session...", { 
        hasAccessToken: !!data.accessToken,
        hasRefreshToken: !!data.refreshToken,
        userId: data.userId,
        isNewUser: data.isNewUser
      });

      // Sign in with the access token and refresh token
      const { error: signInError } = await withTimeout(
        supabase.auth.setSession({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
        }),
        8000,
        "setSession",
      );

      if (signInError) {
        console.error("🔴 [AuthPage] Sign-in error:", signInError);
        toast.error("Ошибка входа");
        return;
      }

      console.log("🟢 [AuthPage] Session set successfully!");
      
      // Handle new vs existing users
      if (data.isNewUser) {
        console.log("🔵 [AuthPage] New user detected - showing registration modal");
        toast.success("Аккаунт создан, заполните профиль!");
        setShowRegistrationModal(true);
      } else {
        console.log("🟢 [AuthPage] Existing user - navigating to home");
        toast.success("Добро пожаловать!");
        navigate("/");
      }

    } catch (error) {
      console.error("🔴 [AuthPage] Login error:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("🔴 [AuthPage] Error details:", { 
        type: error?.constructor?.name,
        message: errorMsg 
      });
      toast.error("Ошибка входа", {
        description: errorMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = async () => {
    setLoading(true);
    try {
      console.log("🔵 [AuthPage] Guest access: starting");

      const functionUrl = buildPhoneAuthUrl() || "";
      if (!functionUrl) {
        toast.error("Не настроен Supabase URL");
        return;
      }
      const body = {
        action: "register-or-login",
        phone: DEMO_GUEST_PHONE,
        display_name: "Гость",
        email: "guest@placeholder.local",
      };

      const { response, data } = await fetchJsonWithTimeout(
        functionUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
            "x-client-info": "supabase-js/2",
          },
          body: JSON.stringify(body),
        },
        PHONE_AUTH_TIMEOUT_MS,
        "guest-phone-auth",
      );
      if (!response.ok || !data?.ok) {
        toast.error("Не удалось войти как гость", { description: data?.error || `HTTP ${response.status}` });
        return;
      }

      const { error: signInError } = await withTimeout(
        supabase.auth.setSession({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
        }),
        8000,
        "guestSetSession",
      );
      if (signInError) {
        console.error("🔴 [AuthPage] Guest sign-in error:", signInError);
        toast.error("Не удалось войти как гость");
        return;
      }

      setGuestMode(true);
      toast.success("Вход без регистрации");
      navigate("/");
    } catch (err) {
      console.error("🔴 [AuthPage] Guest access error:", err);
      toast.error("Не удалось войти как гость", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterClick = (e: React.FormEvent) => {
    e.preventDefault();
    
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast.error("Введите корректный номер телефона");
      return;
    }
    
    setShowRegistrationModal(true);
  };

  const handleDevGuestMode = () => {
    void handleGuestAccess();
  };

  const handleBack = () => {
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
    <div className="min-h-screen flex flex-col relative overflow-hidden">
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
      {mode !== "select" && (
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
        <div className="max-w-sm mx-auto w-full space-y-8">
          
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
              {mode === "register" && "Регистрация"}
            </h1>
            <p className="text-white/70 text-base">
              {mode === "select" && "Выберите действие для продолжения"}
              {mode === "login" && "Введите номер телефона"}
              {mode === "register" && "Введите номер телефона для регистрации"}
            </p>
          </div>

          {/* Mode selection */}
          {mode === "select" && (
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute -inset-1 bg-white/10 rounded-3xl blur-xl" />
                <div className="relative bg-white/10 backdrop-blur-2xl rounded-3xl p-6 space-y-4 border border-white/20 shadow-2xl">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                  
                  <Button 
                    onClick={() => setMode("login")}
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-white/90 hover:bg-white text-slate-800 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Вход
                  </Button>
                  
                  <Button 
                    onClick={() => setMode("register")}
                    variant="outline"
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Регистрация
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
                      required
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
                        <span>Вход...</span>
                      </div>
                    ) : (
                      "Войти"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full h-12 rounded-2xl text-sm font-medium text-white/60 hover:text-white/80 hover:bg-white/5"
                    onClick={handleDevGuestMode}
                    disabled={loading}
                  >
                    Продолжить без регистрации
                  </Button>
                </form>
              </div>

              <p className="text-center text-white/50 text-sm px-4">
                Нет аккаунта?{" "}
                <button 
                  onClick={() => setMode("register")} 
                  className="text-white/80 underline hover:text-white"
                >
                  Зарегистрируйтесь
                </button>
              </p>
            </>
          )}

          {/* OTP verify section removed - using phone-auth now */}

          {/* Register form - just phone, then modal */}
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
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-14 rounded-2xl text-base font-semibold bg-white/90 hover:bg-white text-slate-800 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Зарегистрироваться
                  </Button>
                </form>
              </div>

              <p className="text-center text-white/50 text-sm px-4">
                Уже есть аккаунт?{" "}
                <button 
                  onClick={() => setMode("login")} 
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
        onClose={() => setShowRegistrationModal(false)}
        phone={phone}
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
