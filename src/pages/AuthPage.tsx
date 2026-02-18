import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { RegistrationModal } from "@/components/auth/RegistrationModal";

type AuthMode = "select" | "login" | "register";

export function AuthPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("select");
  const [phone, setPhone] = useState("");
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast.error("Введите корректный номер телефона");
      return;
    }
    
    setLoading(true);

    try {
      // Try to sign in with phone-based email
      const email = `user.${digits}@phoneauth.app`;
      const password = `ph_${digits}_secure`;
      
      const result = await signIn(email, password);
      
      if (result.error) {
        toast.error("Аккаунт не найден. Зарегистрируйтесь.");
        setMode("select");
      } else {
        toast.success("Добро пожаловать!");
        navigate("/");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Ошибка входа");
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
    toast.success("Аккаунт создан! Добро пожаловать!");
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
    </div>
  );
}

export default AuthPage;
