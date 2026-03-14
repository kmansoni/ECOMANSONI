import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import logo from "@/assets/logo.png";

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  email?: string;
  onSuccess: () => void;
}

type EntityType = "individual" | "legal_entity" | "entrepreneur";
type Gender = "male" | "female";

export function RegistrationModal({ isOpen, onClose, phone, email: initialEmail, onSuccess }: RegistrationModalProps) {
  const [loading, setLoading] = useState(false);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailField, setEmailField] = useState(initialEmail || "");
  const [phoneField, setPhoneField] = useState(phone || "");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [entityType, setEntityType] = useState<EntityType | "">("");

  useEffect(() => {
    if (!isOpen) return;
    setEmailField(initialEmail || "");
    setPhoneField(phone || "");
  }, [isOpen, initialEmail, phone]);

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
    if (loading) return;
    
    if (!firstName.trim() || !lastName.trim() || !emailField.trim() || !birthDate || !gender || !entityType) {
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
      const displayName = `${firstName} ${lastName}`;
      const digits = phoneField.replace(/\D/g, '');

      // Get current session — user is already logged in via email OTP
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("Сессия истекла, войдите снова");
        return;
      }

      // Update Supabase Auth user metadata
      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          full_name: displayName,
          phone: digits || undefined,
        },
      });

      if (authUpdateError) {
        console.error("[RegistrationModal] auth update failed:", authUpdateError.message);
        toast.error("Ошибка обновления аккаунта: " + (authUpdateError.message || "Unknown error"));
        return;
      }

      // Update profile with full information
      const profilePatch: Record<string, unknown> = {
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        email: emailField,
        birth_date: birthDate,
        age: calculateAge(birthDate),
        gender,
        entity_type: entityType,
      };
      if (digits) profilePatch.phone = digits;

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existingProfileError) {
        console.error("[RegistrationModal] profile existence check failed:", existingProfileError.message);
        toast.error("Ошибка проверки профиля: " + (existingProfileError.message || "Unknown error"));
        return;
      }

      const profileMutation = existingProfile
        ? await supabase
            .from("profiles")
            .update(profilePatch)
            .eq("user_id", session.user.id)
        : await supabase
            .from("profiles")
            .insert({ user_id: session.user.id, ...profilePatch });

      const updateError = profileMutation.error;

      if (updateError) {
        console.error("[RegistrationModal] profile save failed:", updateError.message);
        toast.error("Ошибка обновления профиля: " + (updateError.message || "Unknown error"));
        return;
      }

      toast.success("Аккаунт создан!");
      onSuccess();
    } catch (error) {
      console.error("[RegistrationModal] registration error:", error instanceof Error ? error.message : String(error));
      toast.error("Ошибка регистрации", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-xl max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="w-8 h-8 object-contain" />
            <h2 className="text-xl font-bold text-foreground">Завершите регистрацию</h2>
          </div>
          <button
            onClick={() => {
              if (!loading) onClose();
            }}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
            <p className="text-muted-foreground">
              Email: <span className="font-semibold text-foreground">{emailField || initialEmail || "-"}</span>
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
              value={emailField}
              onChange={(e) => setEmailField(e.target.value)}
              disabled={loading || !!initialEmail}
                className={initialEmail ? "disabled:opacity-100 disabled:bg-muted/70 disabled:text-foreground" : undefined}
            />
          </div>

          <div>
            <Label htmlFor="phone" className="text-sm">Телефон</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+7 (999) 123-45-67"
              value={phoneField}
              onChange={(e) => setPhoneField(e.target.value)}
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
