import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { uploadAvatar } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { NamePronunciationRecorder } from "./NamePronunciationRecorder";
import { dbLoose } from "@/lib/supabase";

export interface ProfileData {
  display_name?: string | null;
  username?: string | null;
  bio?: string | null;
  website?: string | null;
  gender?: string | null;
  category?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_private?: boolean;
  avatar_url?: string | null;
  name_pronunciation_url?: string | null;
}

interface EditProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileData | null;
  userId: string;
  onSaved: (updated: ProfileData) => void;
}

export function EditProfileSheet({ isOpen, onClose, profile, userId, onSaved }: EditProfileSheetProps) {
  const [form, setForm] = useState({
    display_name: profile?.display_name || "",
    username: profile?.username || "",
    bio: profile?.bio || "",
    website: profile?.website || "",
    gender: profile?.gender || "",
    category: profile?.category || "",
    contact_email: profile?.contact_email || "",
    contact_phone: profile?.contact_phone || "",
    is_private: profile?.is_private || false,
  });
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url || null);
  const [pronunciationUrl, setPronunciationUrl] = useState<string | null>(profile?.name_pronunciation_url || null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadAvatar(userId, file);
      setAvatar(url);
      await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", userId);
      toast.success("Фото профиля обновлено");
    } catch {
      toast.error("Не удалось загрузить фото");
    }
  };

  const handleSave = async () => {
    if (form.bio.length > 150) {
      toast.error("Биография не может быть длиннее 150 символов");
      return;
    }
    setSaving(true);
    try {
      const { error } = await dbLoose
        .from("profiles")
        .update({
          display_name: form.display_name.trim() || null,
          bio: form.bio.trim() || null,
          website: form.website.trim() || null,
          gender: form.gender || null,
          category: form.category || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          is_private: form.is_private,
        })
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Профиль сохранён");
      onSaved({ ...profile, ...form, avatar_url: avatar });
      onClose();
    } catch {
      toast.error("Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-3xl overflow-hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{ maxHeight: "95dvh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border sticky top-0 bg-background z-10">
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
              <h2 className="font-semibold text-base">Редактировать профиль</h2>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-primary font-semibold text-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Готово"}
              </button>
            </div>

            <div className="overflow-y-auto pb-10">
              {/* Avatar */}
              <div className="flex flex-col items-center py-6 border-b border-border">
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={avatar || undefined} />
                    <AvatarFallback className="bg-violet-500 text-white text-2xl">
                      {form.display_name?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full"
                  >
                    <Camera className="w-6 h-6 text-white" />
                  </button>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 text-sm text-primary font-medium"
                >
                  Изменить фото профиля
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>

              {/* Name Pronunciation */}
              <div className="px-4 py-3 border-b border-border">
                <label className="text-xs text-muted-foreground block mb-2">Произношение имени</label>
                <NamePronunciationRecorder
                  userId={userId}
                  existingUrl={pronunciationUrl}
                  onChanged={setPronunciationUrl}
                />
              </div>

              {/* Fields */}
              <div className="px-4 py-2 space-y-1">
                <Field
                  label="Имя"
                  value={form.display_name}
                  onChange={v => handleChange("display_name", v)}
                  placeholder="Ваше имя"
                />
                <Field
                  label="Имя пользователя"
                  value={form.username}
                  onChange={v => handleChange("username", v)}
                  placeholder="username"
                />
                <Field
                  label="Вебсайт"
                  value={form.website}
                  onChange={v => handleChange("website", v)}
                  placeholder="https://example.com"
                  type="url"
                />
                <div className="py-3 border-b border-border">
                  <label className="text-xs text-muted-foreground block mb-1">Биография</label>
                  <textarea
                    value={form.bio}
                    onChange={e => handleChange("bio", e.target.value)}
                    placeholder="Расскажите о себе..."
                    rows={3}
                    maxLength={150}
                    className="w-full bg-transparent text-sm text-foreground resize-none outline-none placeholder:text-muted-foreground"
                  />
                  <p className={`text-xs text-right ${form.bio.length >= 140 ? "text-orange-400" : "text-muted-foreground"}`}>
                    {form.bio.length}/150
                  </p>
                </div>
                <Field
                  label="Пол"
                  value={form.gender}
                  onChange={v => handleChange("gender", v)}
                  placeholder="Не указан"
                  select
                  options={["", "Мужской", "Женский", "Другой", "Предпочитаю не указывать"]}
                />
                <Field
                  label="Категория аккаунта"
                  value={form.category}
                  onChange={v => handleChange("category", v)}
                  placeholder="Личный блог"
                  select
                  options={["", "Личный блог", "Публичная личность", "Бизнес", "Деятель искусства", "Музыкант", "Спортсмен", "Другое"]}
                />
              </div>

              {/* Contact */}
              <div className="px-4 py-2 mt-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Контактная информация</p>
                <div className="space-y-1">
                  <Field
                    label="Email"
                    value={form.contact_email}
                    onChange={v => handleChange("contact_email", v)}
                    placeholder="contact@example.com"
                    type="email"
                  />
                  <Field
                    label="Телефон"
                    value={form.contact_phone}
                    onChange={v => handleChange("contact_phone", v)}
                    placeholder="+7 (999) 000-00-00"
                    type="tel"
                  />
                </div>
              </div>

              {/* Privacy */}
              <div className="px-4 py-4 mt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Закрытый аккаунт</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Только одобренные смогут видеть ваш профиль</p>
                  </div>
                  <button
                    onClick={() => handleChange("is_private", !form.is_private)}
                    className={`w-12 h-6 rounded-full transition-colors ${form.is_private ? "bg-primary" : "bg-muted"}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.is_private ? "translate-x-6" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  select = false,
  options = [],
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  select?: boolean;
  options?: string[];
}) {
  return (
    <div className="py-3 border-b border-border">
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {select ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-foreground outline-none appearance-none"
        >
          {options.map(o => (
            <option key={o} value={o} className="bg-background">{o || placeholder}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}
