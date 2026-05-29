import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { uploadAvatar } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { NamePronunciationRecorder } from "./NamePronunciationRecorder";
import { dbLoose } from "@/lib/supabase";

function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "");
}

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
  const [usernameError, setUsernameError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
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
    const normalizedOwnUsername = normalizeUsernameInput(profile?.username || "");
    const normalizedUsername = normalizeUsernameInput(form.username || "");

    if (normalizedUsername && (normalizedUsername.length < 3 || normalizedUsername.length > 30)) {
      setUsernameError("От 3 до 30 символов");
      return;
    }
    if (normalizedUsername && !/^[a-z0-9_]+$/.test(normalizedUsername)) {
      setUsernameError("Только латинские буквы, цифры и _");
      return;
    }
    if (usernameStatus === "taken") {
      setUsernameError("Этот никнейм уже занят");
      return;
    }

    if (form.bio.length > 150) {
      toast.error("Биография не может быть длиннее 150 символов");
      return;
    }
    setSaving(true);
    try {
      if (normalizedUsername && normalizedUsername !== normalizedOwnUsername) {
        const { data: existing, error: existingErr } = await dbLoose
          .from("profiles")
          .select("user_id")
          .eq("username", normalizedUsername)
          .neq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (existingErr) throw existingErr;
        if (existing) {
          setUsernameError("Этот никнейм уже занят");
          setUsernameStatus("taken");
          setSaving(false);
          return;
        }
      }

      const { error } = await dbLoose
        .from("profiles")
        .update({
          display_name: form.display_name.trim() || null,
          username: normalizedUsername || null,
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
      onSaved({ ...profile, ...form, username: normalizedUsername || null, avatar_url: avatar });
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
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl flex flex-col"
            style={{
              height: "100dvh",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(32px) saturate(1.6)",
              WebkitBackdropFilter: "blur(32px) saturate(1.6)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderBottom: "none",
              boxShadow: "0 -12px 48px rgba(0,0,0,0.35)",
              colorScheme: "dark",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 sticky top-0 z-10"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", backdropFilter: "blur(20px)" }}>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
              <h2 className="font-semibold text-base text-white">Редактировать профиль</h2>
              <button onClick={handleSave} disabled={saving} className="text-sm font-semibold text-violet-300 disabled:opacity-40 transition-opacity">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Готово"}
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pb-10" style={{ overscrollBehavior: "contain" }}>
              {/* Avatar */}
              <div className="flex flex-col items-center py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={avatar || undefined} />
                    <AvatarFallback className="bg-violet-600 text-white text-2xl">
                      {form.display_name?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-full"
                    style={{ background: "rgba(0,0,0,0.45)" }}>
                    <Camera className="w-6 h-6 text-white" />
                  </button>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="mt-3 text-sm font-medium text-violet-300">
                  Изменить фото профиля
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>

              {/* Name Pronunciation */}
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <label className="text-xs text-white/70 block mb-2">Произношение имени</label>
                <NamePronunciationRecorder userId={userId} existingUrl={pronunciationUrl} onChanged={setPronunciationUrl} />
              </div>

              {/* Fields */}
              <div className="px-4 pt-2 pb-4 space-y-1">
                <GlassField label="Имя" value={form.display_name} onChange={v => handleChange("display_name", v)} placeholder="Ваше имя" />
                <div className="py-2">
                  <label className="text-xs text-white/70 block mb-1.5 px-1">Имя пользователя</label>
                  <div className="relative px-1 py-1">
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-sm text-white/30">@</span>
                    <input
                      type="text"
                      value={form.username}
                      onChange={async (e) => {
                        const next = normalizeUsernameInput(e.target.value);
                        handleChange("username", next);
                        setUsernameError("");
                        const normalizedOwnUsername = normalizeUsernameInput(profile?.username || "");
                        if (!next || next === normalizedOwnUsername) { setUsernameStatus("idle"); return; }
                        if (next.length < 3 || next.length > 30 || !/^[a-z0-9_]+$/.test(next)) { setUsernameStatus("idle"); return; }
                        setUsernameStatus("checking");
                        const { data: existing, error } = await dbLoose.from("profiles").select("user_id").eq("username", next).neq("user_id", userId).limit(1).maybeSingle();
                        if (error) { setUsernameStatus("idle"); return; }
                        if (existing) { setUsernameStatus("taken"); setUsernameError("Этот никнейм уже занят"); }
                        else setUsernameStatus("available");
                      }}
                      placeholder="username"
                      maxLength={30}
                      style={{ background: "transparent", color: "white", WebkitTextFillColor: "white" } as React.CSSProperties}
                      className="w-full pl-5 text-sm outline-none placeholder:text-white/25"
                    />
                  </div>
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.1)", marginTop: "8px" }} />
                  {usernameError && <p className="text-xs text-red-400 mt-1 px-1">{usernameError}</p>}
                  {!usernameError && usernameStatus === "checking" && <p className="text-xs text-white/40 mt-1 px-1">Проверяем...</p>}
                  {!usernameError && usernameStatus === "available" && <p className="text-xs text-emerald-400 mt-1 px-1">Никнейм свободен</p>}
                  <p className="text-xs text-white/25 mt-1 px-1">Латинские буквы, цифры и _ (3–30 символов)</p>
                </div>
                <GlassField label="Вебсайт" value={form.website} onChange={v => handleChange("website", v)} placeholder="https://example.com" type="url" />
                <div className="py-2">
                  <label className="text-xs text-white/70 block mb-1.5 px-1">Биография</label>
                  <textarea value={form.bio} onChange={e => handleChange("bio", e.target.value)}
                    onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                    placeholder="Расскажите о себе..." rows={1} maxLength={150}
                    style={{ background: "transparent", color: "white", WebkitTextFillColor: "white", overflow: "hidden" } as React.CSSProperties}
                    spellCheck={false}
                    className="w-full text-sm resize-none outline-none px-1 py-1 placeholder:text-white/25" />
                  <div className="flex justify-end">
                    <p className={`text-xs ${form.bio.length >= 140 ? "text-orange-400" : "text-white/30"}`}>{form.bio.length}/150</p>
                  </div>
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.1)" }} />
                </div>
                <GlassField label="Пол" value={form.gender} onChange={v => handleChange("gender", v)} placeholder="Не указан" select options={["", "Мужской", "Женский", "Другой", "Предпочитаю не указывать"]} />
                <GlassField label="Категория аккаунта" value={form.category} onChange={v => handleChange("category", v)} placeholder="Личный блог" select options={["", "Личный блог", "Публичная личность", "Бизнес", "Деятель искусства", "Музыкант", "Спортсмен", "Другое"]} />
              </div>

              {/* Contact */}
              <div className="px-4 py-2 mt-2">
                <p className="text-xs text-white/30 font-medium uppercase tracking-wider mb-2">Контактная информация</p>
                <div className="space-y-1">
                  <GlassField label="Email" value={form.contact_email} onChange={v => handleChange("contact_email", v)} placeholder="contact@example.com" type="email" />
                  <GlassField label="Телефон" value={form.contact_phone} onChange={v => handleChange("contact_phone", v)} placeholder="+7 (999) 000-00-00" type="tel" />
                </div>
              </div>

              {/* Privacy */}
              <div className="px-4 py-4 mt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Закрытый аккаунт</p>
                    <p className="text-xs text-white/40 mt-0.5">Только одобренные смогут видеть ваш профиль</p>
                  </div>
                  <button onClick={() => handleChange("is_private", !form.is_private)}
                    className={`w-12 h-6 rounded-full transition-colors ${form.is_private ? "bg-violet-600" : "bg-white/15"}`}>
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

function GlassField({
  label, value, onChange, placeholder, type = "text", select = false, options = [],
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; select?: boolean; options?: string[];
}) {
  const fieldStyle = { background: "transparent", color: "white", WebkitTextFillColor: "white" } as React.CSSProperties;
  return (
    <div className="py-2">
      <label className="text-xs text-white/70 block mb-1.5 px-1">{label}</label>
      {select ? (
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ ...fieldStyle, background: "transparent" }}
          className="w-full text-sm appearance-none outline-none px-1 py-1">
          {options.map(o => <option key={o} value={o} style={{ background: "#0d1526" }}>{o || placeholder}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={fieldStyle}
          className="w-full text-sm outline-none px-1 py-1 placeholder:text-white/25" />
      )}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.1)", marginTop: "8px" }} />
    </div>
  );
}
