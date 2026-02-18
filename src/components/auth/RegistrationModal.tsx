import { useState } from "react";
import { X, User, Mail, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  onSuccess: () => void;
}

type EntityType = "individual" | "legal_entity" | "entrepreneur";
type Gender = "male" | "female";

export function RegistrationModal({ isOpen, onClose, phone, onSuccess }: RegistrationModalProps) {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [entityType, setEntityType] = useState<EntityType | "">("");

  const calculateAge = (birthDateStr: string): number => {
    const today = new Date();
    const birth = new Date(birthDateStr);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !birthDate || !gender || !entityType) {
      toast.error("Заполните все поля");
      return;
    }

    const age = calculateAge(birthDate);
    if (age < 18) {
      toast.error("Регистрация доступна только с 18 лет");
      return;
    }

    setLoading(true);

    try {
      const digits = phone.replace(/\D/g, '');
      const authEmail = `user.${digits}@phoneauth.app`;
      const password = `ph_${digits}_secure`;

      // Create user account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: authEmail,
        password: password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: `${firstName} ${lastName}`,
            phone: digits,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          toast.error("Этот номер телефона уже зарегистрирован");
        } else {
          toast.error("Ошибка регистрации: " + signUpError.message);
        }
        return;
      }

      if (signUpData.user) {
        // Update profile with additional info
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            user_id: signUpData.user.id,
            display_name: `${firstName} ${lastName}`,
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone: digits,
            birth_date: birthDate,
            age: age,
            gender: gender,
            entity_type: entityType,
          }, {
            onConflict: 'user_id',
          });

        if (profileError) {
          console.error("Profile update error:", profileError);
        }

        // Sign in the user
        const signInResult = await signIn(authEmail, password);
        if (signInResult.error) {
          toast.error("Аккаунт создан, но не удалось войти автоматически");
          return;
        }

        onSuccess();
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* Glass effect glow */}
        <div className="absolute -inset-2 bg-white/10 rounded-[2rem] blur-2xl" />
        
        <div className="relative bg-white/10 backdrop-blur-2xl rounded-3xl p-6 border border-white/20 shadow-2xl">
          {/* Top highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-t-3xl" />
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold text-white">Заполните данные</h2>
            <p className="text-white/60 text-sm mt-1">Номер: {phone}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* First Name */}
            <div className="space-y-2">
              <Label className="text-white/80 text-sm">Имя</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  type="text"
                  placeholder="Введите имя"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="pl-10 h-12 bg-white/10 border-white/20 rounded-xl text-white placeholder:text-white/40 focus:border-white/40 focus:ring-0"
                />
              </div>
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label className="text-white/80 text-sm">Фамилия</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  type="text"
                  placeholder="Введите фамилию"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="pl-10 h-12 bg-white/10 border-white/20 rounded-xl text-white placeholder:text-white/40 focus:border-white/40 focus:ring-0"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-white/80 text-sm">Электронная почта</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-12 bg-white/10 border-white/20 rounded-xl text-white placeholder:text-white/40 focus:border-white/40 focus:ring-0"
                />
              </div>
            </div>

            {/* Birth Date */}
            <div className="space-y-2">
              <Label className="text-white/80 text-sm">Дата рождения</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                  className="pl-10 h-12 bg-white/10 border-white/20 rounded-xl text-white placeholder:text-white/40 focus:border-white/40 focus:ring-0 [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label className="text-white/80 text-sm">Пол</Label>
              <Select value={gender} onValueChange={(value) => setGender(value as Gender)}>
                <SelectTrigger className="h-12 bg-white/10 border-white/20 rounded-xl text-white focus:ring-0">
                  <SelectValue placeholder="Выберите пол" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/20 rounded-xl z-[200]">
                  <SelectItem value="male" className="text-white hover:bg-white/10">Мужской</SelectItem>
                  <SelectItem value="female" className="text-white hover:bg-white/10">Женский</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Entity Type */}
            <div className="space-y-2">
              <Label className="text-white/80 text-sm">Тип лица</Label>
              <Select value={entityType} onValueChange={(value) => setEntityType(value as EntityType)}>
                <SelectTrigger className="h-12 bg-white/10 border-white/20 rounded-xl text-white focus:ring-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-white/40" />
                    <SelectValue placeholder="Выберите тип" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/20 rounded-xl z-[200]">
                  <SelectItem value="individual" className="text-white hover:bg-white/10">Физическое лицо</SelectItem>
                  <SelectItem value="legal_entity" className="text-white hover:bg-white/10">Юридическое лицо</SelectItem>
                  <SelectItem value="entrepreneur" className="text-white hover:bg-white/10">ИП</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Submit button */}
            <Button 
              type="submit" 
              className="w-full h-14 rounded-2xl text-base font-semibold bg-white/90 hover:bg-white text-slate-800 shadow-xl shadow-black/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] mt-6"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-slate-800/30 border-t-slate-800 rounded-full animate-spin" />
                  <span>Регистрация...</span>
                </div>
              ) : (
                "Завершить регистрацию"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
