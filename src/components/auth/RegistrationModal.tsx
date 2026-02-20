import { useState } from "react";
import { X, User, Mail, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { useSearchParams } from "react-router-dom";

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  onSuccess: () => void;
}

type EntityType = "individual" | "legal_entity" | "entrepreneur";
type Gender = "male" | "female";

export function RegistrationModal({ isOpen, onClose, phone, onSuccess }: RegistrationModalProps) {
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
      const displayName = `${firstName} ${lastName}`;

      // Call phone-auth function via supabase.functions.invoke
      const { data, error } = await supabase.functions.invoke('phone-auth', {
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: {
          action: "register-or-login",
          phone: `+${digits}`,
          display_name: displayName,
          email: email,
        },
      });

      if (error || !data?.ok) {
        toast.error("Не удалось создать аккаунт", { description: error?.message || data?.error || "Unknown error" });
        return;
      }

      // Sign in with the access token and refresh token
      const { error: signInError } = await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });

      if (signInError) {
        console.error("Sign-in error:", signInError);
        toast.error("Ошибка входа");
        return;
      }

      // Update profile with full information
      const profilePatch: any = {
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: digits,
        birth_date: birthDate,
        age: calculateAge(birthDate),
        gender,
        entity_type: entityType,
      };

      console.log("📝 About to upsert profile with user_id:", data.userId);
      console.log("📝 Profile data:", profilePatch);

      const { data: upsertData, error: updateError } = await supabase
        .from("profiles")
        .upsert({ user_id: data.userId, ...profilePatch }, { onConflict: "user_id" });

      console.log("✅ Upsert response data:", upsertData);

      if (updateError) {
        console.error("❌ Profile update error:", updateError);
        console.error("❌ Error code:", updateError.code);
        console.error("❌ Error message:", updateError.message);
        console.error("❌ Error details:", JSON.stringify(updateError, null, 2));
        toast.error("Ошибка обновления профиля: " + (updateError.message || "Unknown error"));
        return;
      }

      toast.success("Аккаунт создан!");
      onSuccess();
    } catch (error) {
      console.error("❌ Registration error:", error);
      console.error("❌ Error type:", error instanceof Error ? error.constructor.name : typeof error);
      console.error("❌ Error details:", JSON.stringify(error, null, 2));
      toast.error("Ошибка регистрации", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Завершите регистрацию</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded text-sm">
            <p className="text-gray-600 dark:text-gray-400">
              Номер: <span className="font-semibold text-gray-900 dark:text-white">{phone}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName" className="text-sm">Имя *</Label>
              <Input
                id="firstName"
                placeholder="Иван"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="lastName" className="text-sm">Фамилия *</Label>
              <Input
                id="lastName"
                placeholder="Петров"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email" className="text-sm">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="mail@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="birthDate" className="text-sm">Дата рождения *</Label>
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="gender" className="text-sm">Пол *</Label>
              <Select value={gender} onValueChange={(value: any) => setGender(value)}>
                <SelectTrigger id="gender" disabled={loading}>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Мужской</SelectItem>
                  <SelectItem value="female">Женский</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="entity" className="text-sm">Тип *</Label>
              <Select value={entityType} onValueChange={(value: any) => setEntityType(value)}>
                <SelectTrigger id="entity" disabled={loading}>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Физ. лицо</SelectItem>
                  <SelectItem value="entrepreneur">ИП</SelectItem>
                  <SelectItem value="legal_entity">Юр. лицо</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? "Создание..." : "Создать аккаунт"}
          </Button>
        </form>
      </div>
    </div>
  );
}
