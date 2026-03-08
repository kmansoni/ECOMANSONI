import React, { useState, useEffect } from "react";
import {
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Clock,
  MessageSquare,
  Tag,
  BarChart3,
  Plus,
  Trash2,
  Save,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shield,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useBusinessAccount,
  type BusinessCategory,
  type BusinessHours,
  type BusinessHourEntry,
} from "@/hooks/useBusinessAccount";

// ── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  retail: "Розница",
  food: "Еда и рестораны",
  services: "Услуги",
  education: "Образование",
  tech: "Технологии",
  other: "Другое",
};

const DAYS = [
  { key: "mon", label: "Пн" },
  { key: "tue", label: "Вт" },
  { key: "wed", label: "Ср" },
  { key: "thu", label: "Чт" },
  { key: "fri", label: "Пт" },
  { key: "sat", label: "Сб" },
  { key: "sun", label: "Вс" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

const DEFAULT_HOURS: BusinessHours = Object.fromEntries(
  DAYS.map(({ key }) => [key, { open: "09:00", close: "18:00", closed: key === "sun" }])
) as BusinessHours;

const LABEL_PRESETS = [
  { name: "Важный", color: "#ef4444" },
  { name: "Новый клиент", color: "#22c55e" },
  { name: "VIP", color: "#3b82f6" },
  { name: "Ожидает", color: "#f59e0b" },
  { name: "Завершён", color: "#6b7280" },
];

// ── Sub-components ──────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <div className="rounded-2xl bg-zinc-800/60 border border-white/8 overflow-hidden">
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/8">
      <span className="text-accent">{icon}</span>
      <h2 className="text-white font-semibold text-sm">{title}</h2>
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({
  label,
  ...props
}) => (
  <div className="space-y-1">
    <label className="text-zinc-400 text-xs font-medium">{label}</label>
    <input
      {...props}
      className={cn(
        "w-full bg-zinc-700/60 border border-white/10 rounded-xl px-3 py-2.5",
        "text-white text-sm placeholder:text-zinc-500",
        "focus:outline-none focus:border-accent/60 transition-colors",
        props.className
      )}
    />
  </div>
);

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }> = ({
  label,
  ...props
}) => (
  <div className="space-y-1">
    <label className="text-zinc-400 text-xs font-medium">{label}</label>
    <textarea
      {...props}
      rows={3}
      className={cn(
        "w-full bg-zinc-700/60 border border-white/10 rounded-xl px-3 py-2.5",
        "text-white text-sm placeholder:text-zinc-500 resize-none",
        "focus:outline-none focus:border-accent/60 transition-colors"
      )}
    />
  </div>
);

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <div className="flex items-center justify-between">
    <span className="text-white text-sm">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-zinc-600"
      )}
    >
      <div
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  </div>
);

// ── Main Page ───────────────────────────────────────────────────────────────

export default function BusinessAccountPage() {
  const navigate = useNavigate();
  const {
    account,
    createAccount,
    updateAccount,
    deleteAccount,
    quickReplies,
    addQuickReply,
    removeQuickReply,
    chatLabels,
    addLabel,
    isLoading,
    error,
    stats,
  } = useBusinessAccount();

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BusinessCategory>("retail");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [emailField, setEmailField] = useState("");
  const [website, setWebsite] = useState("");
  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [greeting, setGreeting] = useState("");
  const [awayMsg, setAwayMsg] = useState("");
  const [autoReply, setAutoReply] = useState(false);
  const [newReplyText, setNewReplyText] = useState("");
  const [newReplyMessage, setNewReplyMessage] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#3b82f6");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeTab, setActiveTab] = useState<"profile" | "automation" | "labels" | "stats">("profile");

  // Populate form from existing account
  useEffect(() => {
    if (!account) return;
    setName(account.business_name);
    setCategory(account.business_category);
    setDescription(account.business_description ?? "");
    setAddress(account.business_address ?? "");
    setPhone(account.business_phone ?? "");
    setEmailField(account.business_email ?? "");
    setWebsite(account.business_website ?? "");
    setHours(Object.keys(account.business_hours).length > 0 ? account.business_hours : DEFAULT_HOURS);
    setGreeting(account.greeting_message ?? "");
    setAwayMsg(account.away_message ?? "");
    setAutoReply(account.auto_reply_enabled);
  }, [account]);

  const handleSave = async () => {
    setSaveStatus("saving");
    const data = {
      business_name: name.trim(),
      business_category: category,
      business_description: description.trim() || null,
      business_address: address.trim() || null,
      business_phone: phone.trim() || null,
      business_email: emailField.trim() || null,
      business_website: website.trim() || null,
      business_hours: hours,
      greeting_message: greeting.trim() || null,
      away_message: awayMsg.trim() || null,
      auto_reply_enabled: autoReply,
    };
    const result = account ? await updateAccount(data) : await createAccount(data);
    setSaveStatus(result.ok ? "saved" : "error");
    if (result.ok) setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const updateHour = (day: DayKey, field: keyof BusinessHourEntry, value: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? { open: "09:00", close: "18:00", closed: false }), [field]: value },
    }));
  };

  const handleAddQuickReply = async () => {
    if (!newReplyText.trim() || !newReplyMessage.trim()) return;
    await addQuickReply(newReplyText, newReplyMessage);
    setNewReplyText("");
    setNewReplyMessage("");
  };

  const handleAddLabel = async () => {
    if (!newLabelName.trim()) return;
    // Labels stored at account level, not chat level in this flow
    const currentLabels = account?.labels ?? [];
    const newLabel = { id: crypto.randomUUID(), name: newLabelName.trim(), color: newLabelColor };
    await updateAccount({ labels: [...currentLabels, newLabel] });
    setNewLabelName("");
  };

  const TABS = [
    { id: "profile", label: "Профиль" },
    { id: "automation", label: "Автоматизация" },
    { id: "labels", label: "Метки" },
    { id: "stats", label: "Статистика" },
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-900 text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur border-b border-white/8">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-semibold text-base">Бизнес-аккаунт</h1>
            {account?.is_verified && (
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-accent" />
                <span className="text-accent text-xs">Верифицирован</span>
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saveStatus === "saving" || !name.trim()}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all",
              saveStatus === "saved"
                ? "bg-green-500/20 text-green-400"
                : saveStatus === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
            )}
          >
            {saveStatus === "saving" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveStatus === "saved" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : saveStatus === "error" ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{saveStatus === "saved" ? "Сохранено" : saveStatus === "error" ? "Ошибка" : "Сохранить"}</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "bg-accent text-white"
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-red-400/10 border border-red-400/20 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <>
            <Section title="Профиль бизнеса" icon={<Building2 className="w-4 h-4" />}>
              <Input
                label="Название бизнеса *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше название"
                maxLength={255}
              />

              <div className="space-y-1">
                <label className="text-zinc-400 text-xs font-medium">Категория *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as BusinessCategory)}
                  className="w-full bg-zinc-700/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent/60"
                >
                  {(Object.entries(CATEGORY_LABELS) as [BusinessCategory, string][]).map(([val, label]) => (
                    <option key={val} value={val} className="bg-zinc-800">
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <Textarea
                label="Описание"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Расскажите о вашем бизнесе..."
                maxLength={2048}
              />
            </Section>

            <Section title="Контакты" icon={<Phone className="w-4 h-4" />}>
              <Input
                label="Адрес"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ул. Пушкина, д.1"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Телефон"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                  type="tel"
                />
                <Input
                  label="Email"
                  value={emailField}
                  onChange={(e) => setEmailField(e.target.value)}
                  placeholder="info@business.ru"
                  type="email"
                />
              </div>
              <Input
                label="Сайт"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://business.ru"
                type="url"
              />
            </Section>

            <Section title="Часы работы" icon={<Clock className="w-4 h-4" />}>
              <div className="space-y-2">
                {DAYS.map(({ key, label }) => {
                  const entry = hours[key] ?? { open: "09:00", close: "18:00", closed: false };
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-zinc-400 text-sm w-6 shrink-0">{label}</span>
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="time"
                          value={entry.open}
                          disabled={entry.closed}
                          onChange={(e) => updateHour(key, "open", e.target.value)}
                          className="bg-zinc-700/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm
                                     focus:outline-none focus:border-accent/60 disabled:opacity-40 flex-1"
                        />
                        <span className="text-zinc-500 text-xs">—</span>
                        <input
                          type="time"
                          value={entry.close}
                          disabled={entry.closed}
                          onChange={(e) => updateHour(key, "close", e.target.value)}
                          className="bg-zinc-700/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm
                                     focus:outline-none focus:border-accent/60 disabled:opacity-40 flex-1"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => updateHour(key, "closed", !entry.closed)}
                        className={cn(
                          "text-xs px-2 py-1 rounded-lg font-medium transition-colors shrink-0",
                          entry.closed
                            ? "bg-red-500/20 text-red-400"
                            : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                        )}
                      >
                        {entry.closed ? "Выходной" : "Работает"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {/* ── AUTOMATION TAB ── */}
        {activeTab === "automation" && (
          <>
            <Section title="Приветствие" icon={<MessageSquare className="w-4 h-4" />}>
              <Toggle
                checked={autoReply}
                onChange={setAutoReply}
                label="Автоматические ответы"
              />
              <Textarea
                label="Приветственное сообщение"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Добро пожаловать! Чем могу помочь?"
                maxLength={2048}
              />
              <Textarea
                label="Сообщение об отсутствии"
                value={awayMsg}
                onChange={(e) => setAwayMsg(e.target.value)}
                placeholder="Сейчас не в сети. Отвечу в рабочее время."
                maxLength={2048}
              />
            </Section>

            <Section title="Быстрые ответы" icon={<MessageSquare className="w-4 h-4" />}>
              {quickReplies.map((reply) => (
                <div
                  key={reply.id}
                  className="flex items-start gap-3 rounded-xl bg-zinc-700/40 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-accent text-xs font-medium truncate">/{reply.text}</p>
                    <p className="text-zinc-300 text-sm leading-relaxed mt-0.5 line-clamp-2">
                      {reply.message}
                    </p>
                  </div>
                  <button
                    onClick={() => removeQuickReply(reply.id)}
                    className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <div className="rounded-xl border border-dashed border-white/20 p-3 space-y-2">
                <p className="text-zinc-400 text-xs font-medium">Добавить быстрый ответ</p>
                <input
                  value={newReplyText}
                  onChange={(e) => setNewReplyText(e.target.value)}
                  placeholder="Команда (напр. заказать)"
                  className="w-full bg-zinc-700/60 border border-white/10 rounded-xl px-3 py-2 text-white text-sm
                             placeholder:text-zinc-500 focus:outline-none focus:border-accent/60"
                  maxLength={64}
                />
                <textarea
                  value={newReplyMessage}
                  onChange={(e) => setNewReplyMessage(e.target.value)}
                  placeholder="Текст ответа..."
                  rows={2}
                  className="w-full bg-zinc-700/60 border border-white/10 rounded-xl px-3 py-2 text-white text-sm
                             placeholder:text-zinc-500 resize-none focus:outline-none focus:border-accent/60"
                  maxLength={2048}
                />
                <button
                  onClick={handleAddQuickReply}
                  disabled={!newReplyText.trim() || !newReplyMessage.trim()}
                  className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
            </Section>
          </>
        )}

        {/* ── LABELS TAB ── */}
        {activeTab === "labels" && (
          <Section title="Метки чатов" icon={<Tag className="w-4 h-4" />}>
            <p className="text-zinc-400 text-xs">
              Используйте метки для организации клиентских чатов (CRM)
            </p>

            {/* Existing account labels */}
            <div className="flex flex-wrap gap-2">
              {(account?.labels ?? []).map((label) => (
                <div
                  key={label.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                  style={{ backgroundColor: label.color + "33", color: label.color, border: `1px solid ${label.color}55` }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                  <button
                    onClick={() => {
                      const updated = (account?.labels ?? []).filter((l) => l.id !== label.id);
                      updateAccount({ labels: updated });
                    }}
                    className="hover:opacity-70 transition-opacity ml-0.5"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Presets */}
            <div>
              <p className="text-zinc-500 text-xs mb-2">Шаблоны:</p>
              <div className="flex flex-wrap gap-2">
                {LABEL_PRESETS.map((preset) => {
                  const exists = (account?.labels ?? []).some((l) => l.name === preset.name);
                  return (
                    <button
                      key={preset.name}
                      disabled={exists}
                      onClick={() => {
                        if (exists) return;
                        const updated = [...(account?.labels ?? []), { id: crypto.randomUUID(), name: preset.name, color: preset.color }];
                        updateAccount({ labels: updated });
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-opacity",
                        exists ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:opacity-80"
                      )}
                      style={{ backgroundColor: preset.color + "33", color: preset.color, border: `1px solid ${preset.color}55` }}
                    >
                      + {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom label */}
            <div className="rounded-xl border border-dashed border-white/20 p-3 space-y-2">
              <p className="text-zinc-400 text-xs font-medium">Своя метка</p>
              <div className="flex gap-2">
                <input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Название метки"
                  className="flex-1 bg-zinc-700/60 border border-white/10 rounded-xl px-3 py-2 text-white text-sm
                             placeholder:text-zinc-500 focus:outline-none focus:border-accent/60"
                  maxLength={64}
                />
                <input
                  type="color"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                  className="w-10 h-10 rounded-xl border border-white/10 bg-zinc-700/60 cursor-pointer p-1"
                />
              </div>
              <button
                onClick={handleAddLabel}
                disabled={!newLabelName.trim()}
                className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 disabled:opacity-40 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Добавить метку
              </button>
            </div>

            {/* Chat labels summary */}
            {chatLabels.length > 0 && (
              <div>
                <p className="text-zinc-400 text-xs mb-2">Применено к чатам: {chatLabels.length}</p>
              </div>
            )}
          </Section>
        )}

        {/* ── STATS TAB ── */}
        {activeTab === "stats" && (
          <Section title="Статистика" icon={<BarChart3 className="w-4 h-4" />}>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            ) : stats ? (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Сегодня", value: stats.chats_today },
                  { label: "Неделя", value: stats.chats_week },
                  { label: "Месяц", value: stats.chats_month },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl bg-zinc-700/40 p-3 text-center"
                  >
                    <p className="text-white font-bold text-2xl">{item.value}</p>
                    <p className="text-zinc-400 text-xs mt-1">чатов за {item.label.toLowerCase()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-4">
                {account ? "Нет данных" : "Создайте бизнес-профиль для просмотра статистики"}
              </p>
            )}
          </Section>
        )}

        {/* Delete account */}
        {account && activeTab === "profile" && (
          <button
            onClick={async () => {
              if (window.confirm("Удалить бизнес-профиль? Это действие необратимо.")) {
                await deleteAccount();
                navigate(-1);
              }
            }}
            className="w-full py-3 rounded-2xl text-red-400 border border-red-400/20 text-sm font-medium
                       hover:bg-red-400/10 transition-colors"
          >
            Удалить бизнес-профиль
          </button>
        )}
      </div>
    </div>
  );
}
