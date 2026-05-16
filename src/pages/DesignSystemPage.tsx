import { useEffect, useMemo, useRef, useState } from "react";

type Theme = "light" | "dark";
type Viewport = "desktop" | "mobile";
type Section = "auth" | "feed" | "chats" | "settings" | "profile";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "auth", label: "Вход", icon: "key" },
  { id: "feed", label: "Лента", icon: "feed" },
  { id: "chats", label: "Чаты", icon: "chat" },
  { id: "profile", label: "Профиль", icon: "user" },
  { id: "settings", label: "Настройки", icon: "gear" },
];

export default function DesignSystemPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [section, setSection] = useState<Section>("feed");
  const [modal, setModal] = useState<null | "compose" | "settings">(null);

  return (
    <div className="lg-scope" data-theme={theme} style={{ minHeight: "100vh", padding: "24px 16px 80px" }}>
      <TopBar
        theme={theme}
        viewport={viewport}
        section={section}
        onTheme={setTheme}
        onViewport={setViewport}
        onSection={setSection}
      />

      <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
        <div className="lg-frame" data-viewport={viewport}>
          <div className="lg-frame-inner">
            {viewport === "desktop" ? (
              <DesktopShell section={section} setSection={setSection} onModal={setModal} />
            ) : (
              <MobileShell section={section} setSection={setSection} onModal={setModal} />
            )}
          </div>
        </div>
      </div>

      <Showcase />

      {modal && <Modal kind={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ─────────────── TOP CONTROL BAR ─────────────── */

function TopBar(props: {
  theme: Theme;
  viewport: Viewport;
  section: Section;
  onTheme: (t: Theme) => void;
  onViewport: (v: Viewport) => void;
  onSection: (s: Section) => void;
}) {
  const { theme, viewport, section, onTheme, onViewport, onSection } = props;
  return (
    <div className="lg-glass-strong" style={{ padding: 14, maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="lg-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>M</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>mansoni · Design Lab</div>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Liquid Glass · 2026</div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <SegGroup
        items={[
          { v: "light", label: "Светлая" },
          { v: "dark", label: "Тёмная" },
        ]}
        value={theme}
        onChange={(v) => onTheme(v as Theme)}
      />
      <SegGroup
        items={[
          { v: "desktop", label: "Desktop" },
          { v: "mobile", label: "Mobile" },
        ]}
        value={viewport}
        onChange={(v) => onViewport(v as Viewport)}
      />

      <div style={{ display: "flex", gap: 6 }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className="lg-icon-chip lg-liquid"
            data-active={section === s.id}
            onClick={() => onSection(s.id)}
            onMouseMove={liquidTrack}
            aria-label={s.label}
            title={s.label}
          >
            <Icon name={s.icon} size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SegGroup(props: {
  items: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="lg-glass-soft" style={{ padding: 4, display: "inline-flex", gap: 2 }}>
      {props.items.map((it) => {
        const active = it.v === props.value;
        return (
          <button
            key={it.v}
            onClick={() => props.onChange(it.v)}
            style={{
              border: "none",
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: active ? "var(--lg-grad-aurora)" : "transparent",
              color: active ? "white" : "var(--lg-ink-soft)",
              transition: "all 0.25s var(--lg-ease)",
              boxShadow: active ? "0 6px 16px -6px rgba(106,92,255,0.5)" : "none",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────── DESKTOP SHELL ─────────────── */

function DesktopShell({ section, setSection, onModal }: { section: Section; setSection: (s: Section) => void; onModal: (m: "compose" | "settings") => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: "100%", background: "transparent" }}>
      <Sidebar section={section} setSection={setSection} onCompose={() => onModal("compose")} />
      <div style={{ overflowY: "auto", padding: 24 }}>
        <SectionView section={section} onModal={onModal} />
      </div>
    </div>
  );
}

function Sidebar({ section, setSection, onCompose }: { section: Section; setSection: (s: Section) => void; onCompose: () => void }) {
  return (
    <aside style={{ padding: 16, borderRight: "1px solid var(--lg-divider)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 16px" }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--lg-grad-aurora)", boxShadow: "0 8px 20px -8px rgba(106,92,255,0.6)" }} />
        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>mansoni</div>
      </div>

      {SECTIONS.map((s) => (
        <div
          key={s.id}
          className="lg-nav-item"
          data-active={section === s.id}
          onClick={() => setSection(s.id)}
        >
          <Icon name={s.icon} size={20} />
          <span>{s.label}</span>
          {s.id === "chats" && <span className="lg-badge lg-badge-grad" style={{ marginLeft: "auto" }}>12</span>}
        </div>
      ))}

      <div style={{ flex: 1 }} />

      <button className="lg-btn lg-btn-primary" onClick={onCompose}>
        <Icon name="plus" size={16} /> Создать
      </button>

      <div className="lg-glass-soft" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <div className="lg-avatar" data-online="true" style={{ width: 36, height: 36, fontSize: 13 }}>А</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Александр</div>
          <div style={{ fontSize: 11, opacity: 0.65 }}>В сети</div>
        </div>
        <Icon name="dots" size={16} />
      </div>
    </aside>
  );
}

/* ─────────────── MOBILE SHELL ─────────────── */

function MobileShell({ section, setSection, onModal }: { section: Section; setSection: (s: Section) => void; onModal: (m: "compose" | "settings") => void }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 90px" }}>
        <SectionView section={section} onModal={onModal} compact />
      </div>
      <MobileTabBar section={section} setSection={setSection} onCompose={() => onModal("compose")} />
    </div>
  );
}

function MobileTabBar({ section, setSection, onCompose }: { section: Section; setSection: (s: Section) => void; onCompose: () => void }) {
  return (
    <div style={{ position: "absolute", left: 12, right: 12, bottom: 14 }}>
      <div className="lg-glass-strong" style={{ display: "flex", alignItems: "center", justifyContent: "space-around", padding: 8, borderRadius: 999 }}>
        {SECTIONS.slice(0, 2).map((s) => (
          <TabBtn key={s.id} item={s} active={section === s.id} onClick={() => setSection(s.id)} />
        ))}
        <button className="lg-fab" style={{ width: 48, height: 48 }} onClick={onCompose} aria-label="Создать">
          <Icon name="plus" size={22} />
        </button>
        {SECTIONS.slice(2, 4).map((s) => (
          <TabBtn key={s.id} item={s} active={section === s.id} onClick={() => setSection(s.id)} />
        ))}
      </div>
    </div>
  );
}

function TabBtn({ item, active, onClick }: { item: { id: string; label: string; icon: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        padding: 10,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        cursor: "pointer",
        color: active ? "var(--lg-accent)" : "var(--lg-ink-soft)",
        transition: "color 0.2s ease, transform 0.25s var(--lg-ease-spring)",
        transform: active ? "translateY(-2px)" : "none",
      }}
      aria-label={item.label}
    >
      <Icon name={item.icon} size={22} />
      <span style={{ fontSize: 10, fontWeight: 600 }}>{item.label}</span>
    </button>
  );
}

/* ─────────────── SECTIONS ─────────────── */

function SectionView({ section, onModal, compact }: { section: Section; onModal: (m: "compose" | "settings") => void; compact?: boolean }) {
  switch (section) {
    case "auth": return <AuthView compact={compact} />;
    case "feed": return <FeedView compact={compact} />;
    case "chats": return <ChatsView compact={compact} />;
    case "settings": return <SettingsView compact={compact} onModal={onModal} />;
    case "profile": return <ProfileView compact={compact} />;
  }
}

/* ── AUTH ── */
function AuthView({ compact }: { compact?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: compact ? "auto" : "100%" }}>
      <div className="lg-glass-strong" style={{ padding: 32, width: compact ? "100%" : 420, maxWidth: "100%", borderRadius: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: 18, background: "var(--lg-grad-aurora)", boxShadow: "0 16px 40px -10px rgba(106,92,255,0.6)" }} />
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            {mode === "signin" ? "С возвращением" : "Создать аккаунт"}
          </h2>
          <p style={{ fontSize: 13, opacity: 0.7, margin: "6px 0 0" }}>
            {mode === "signin" ? "Войдите, чтобы продолжить общение" : "Присоединяйся к mansoni за минуту"}
          </p>
        </div>

        <SegGroup
          items={[{ v: "signin", label: "Вход" }, { v: "signup", label: "Регистрация" }]}
          value={mode}
          onChange={(v) => setMode(v as "signin" | "signup")}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {mode === "signup" && <input className="lg-input" placeholder="Ваше имя" />}
          <input className="lg-input" placeholder="Email или телефон" type="email" />
          <input className="lg-input" placeholder="Пароль" type="password" />
          {mode === "signin" && (
            <div style={{ fontSize: 12, textAlign: "right", color: "var(--lg-accent)", cursor: "pointer", fontWeight: 600 }}>
              Забыли пароль?
            </div>
          )}
          <button className="lg-btn lg-btn-primary" style={{ width: "100%", padding: "14px 18px", fontSize: 15 }}>
            {mode === "signin" ? "Войти" : "Создать аккаунт"} <Icon name="arrow" size={16} />
          </button>
        </div>

        <Divider label="или" />

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {["G", "А", ""].map((l, i) => (
            <button key={i} className="lg-icon-chip lg-liquid" onMouseMove={liquidTrack} style={{ width: 48, height: 48, fontWeight: 700 }}>
              {l || <Icon name="apple" size={20} />}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 11, textAlign: "center", marginTop: 20, opacity: 0.55, lineHeight: 1.5 }}>
          Продолжая, вы соглашаетесь с условиями использования и политикой конфиденциальности.
        </p>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0", fontSize: 11, opacity: 0.6 }}>
      <div style={{ flex: 1, height: 1, background: "var(--lg-divider)" }} />
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--lg-divider)" }} />
    </div>
  );
}

/* ── FEED ── */
function FeedView({ compact }: { compact?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 280px", gap: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Stories />
        <PostCard
          author="Алиса"
          time="14 мин назад"
          text="Только что протестировала новый дизайн — это что-то на грани магии. Liquid glass работает идеально на iOS и Android. 🪐"
          image
        />
        <PostCard
          author="Кирилл · Engineer"
          time="1 ч назад"
          text="Опубликовал лонгрид про микросервисную архитектуру. Внутри — практические схемы и подводные камни, с которыми мы столкнулись."
        />
      </div>
      {!compact && <FeedSide />}
    </div>
  );
}

function Stories() {
  const stories = ["Вы", "Алиса", "Кирилл", "Мария", "Lab", "PRO"];
  return (
    <div className="lg-glass" style={{ padding: 14 }}>
      <div style={{ display: "flex", gap: 14, overflowX: "auto" }}>
        {stories.map((s, i) => (
          <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                padding: 2,
                background: i === 0 ? "var(--lg-divider)" : "var(--lg-grad-aurora)",
                transition: "transform 0.3s var(--lg-ease-spring)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.06) rotate(-3deg)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
            >
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--lg-glass-bg-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
                {i === 0 ? "+" : s[0]}
              </div>
            </div>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostCard({ author, time, text, image }: { author: string; time: string; text: string; image?: boolean }) {
  return (
    <article className="lg-card lg-liquid" onMouseMove={liquidTrack}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
        <div className="lg-avatar" data-online="true">{author[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{author}</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{time}</div>
        </div>
        <button className="lg-icon-chip" aria-label="Меню"><Icon name="dots" size={16} /></button>
      </header>
      <div style={{ padding: "0 16px 12px", fontSize: 14, lineHeight: 1.55 }}>{text}</div>
      {image && (
        <div style={{ aspectRatio: "16/9", margin: "0 16px", borderRadius: 16, background: "var(--lg-grad-violet)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 60%)" }} />
        </div>
      )}
      <PostActions />
    </article>
  );
}

function PostActions() {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(248);
  return (
    <footer style={{ display: "flex", alignItems: "center", gap: 4, padding: 8, marginTop: 8, borderTop: "1px solid var(--lg-divider)" }}>
      <button
        className="lg-like"
        data-liked={liked}
        onClick={() => {
          setLiked(!liked);
          setCount((c) => c + (liked ? -1 : 1));
        }}
      >
        <span className="lg-like-spark" />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36 }}>{count}</span>

      <button className="lg-icon-chip" style={{ marginLeft: 6 }} aria-label="Комментарии">
        <Icon name="chat" size={18} />
      </button>
      <span style={{ fontSize: 13, fontWeight: 600 }}>32</span>

      <button className="lg-icon-chip" style={{ marginLeft: 6 }} aria-label="Поделиться">
        <Icon name="share" size={18} />
      </button>

      <div style={{ flex: 1 }} />

      <button className="lg-icon-chip" aria-label="Сохранить">
        <Icon name="bookmark" size={18} />
      </button>
    </footer>
  );
}

function FeedSide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 0, height: "fit-content" }}>
      <div className="lg-glass" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, opacity: 0.8 }}>Что в тренде</div>
        {["#дизайн2026", "#liquidglass", "#mansoni", "#startup"].map((t) => (
          <div key={t} style={{ padding: "8px 0", borderBottom: "1px solid var(--lg-divider)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
            <span>{t}</span>
            <span style={{ opacity: 0.5, fontWeight: 500 }}>{Math.floor(Math.random() * 9 + 1)}k</span>
          </div>
        ))}
      </div>
      <div className="lg-glass" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, opacity: 0.8 }}>Рекомендации</div>
        {["Анна", "Дмитрий", "Виктория"].map((n) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
            <div className="lg-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{n[0]}</div>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{n}</div>
            <button className="lg-btn" style={{ padding: "6px 12px", fontSize: 12 }}>+</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── CHATS ── */
function ChatsView({ compact }: { compact?: boolean }) {
  const [active, setActive] = useState(0);
  const chats = [
    { name: "Алиса", last: "Скинула макет, посмотри 🎨", time: "12:42", unread: 2, online: true },
    { name: "Команда Дизайна", last: "Кирилл: готово", time: "11:30", unread: 0, online: false },
    { name: "Мария", last: "Спасибо! ❤️", time: "Вчера", unread: 0, online: true },
    { name: "Поддержка", last: "Ваш запрос обработан", time: "Пн", unread: 0, online: false },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "320px 1fr", gap: 0, height: compact ? "auto" : "calc(100vh - 200px)", maxHeight: 700 }}>
      {(!compact || true) && (
        <div className="lg-glass" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, borderRadius: compact ? 20 : "20px 0 0 20px" }}>
          <input className="lg-input" placeholder="🔍 Поиск чатов" style={{ marginBottom: 6 }} />
          {chats.map((c, i) => (
            <div
              key={c.name}
              onClick={() => setActive(i)}
              className="lg-liquid"
              onMouseMove={liquidTrack}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 16,
                cursor: "pointer",
                background: active === i ? "var(--lg-glass-bg-strong)" : "transparent",
                transition: "background 0.25s var(--lg-ease)",
              }}
            >
              <div className="lg-avatar" data-online={c.online}>{c.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{c.time}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.last}</div>
              </div>
              {c.unread > 0 && (
                <span className="lg-badge lg-badge-grad" style={{ minWidth: 22, padding: "2px 7px", justifyContent: "center" }}>{c.unread}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {!compact && <ChatPane name={chats[active].name} online={chats[active].online} />}
    </div>
  );
}

function ChatPane({ name, online }: { name: string; online: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--lg-divider)", background: "var(--lg-glass-bg)", borderRadius: "0 20px 20px 0", overflow: "hidden" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderBottom: "1px solid var(--lg-divider)" }}>
        <div className="lg-avatar" data-online={online}>{name[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
          <div style={{ fontSize: 11, opacity: 0.65 }}>{online ? "В сети" : "Был недавно"}</div>
        </div>
        <button className="lg-icon-chip" aria-label="Видеозвонок"><Icon name="video" size={18} /></button>
        <button className="lg-icon-chip" aria-label="Звонок"><Icon name="phone" size={18} /></button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="lg-msg lg-msg-in">Привет! Как продвигается с новой темой?</div>
        <div className="lg-msg lg-msg-out">Уже почти готово, осталось добавить liquid glass на модалках ✨</div>
        <div className="lg-msg lg-msg-in">Огонь, скинь превью когда соберёшь</div>
        <div className="lg-msg lg-msg-out">Сейчас отправлю 🚀</div>
        <div className="lg-typing lg-glass-soft" style={{ width: "fit-content", borderRadius: 20 }}>
          <span /><span /><span />
        </div>
      </div>

      <footer style={{ padding: 12, borderTop: "1px solid var(--lg-divider)", display: "flex", gap: 8, alignItems: "center" }}>
        <button className="lg-icon-chip" aria-label="Прикрепить"><Icon name="plus" size={18} /></button>
        <input className="lg-input" placeholder="Написать сообщение..." style={{ padding: "12px 16px" }} />
        <button className="lg-btn lg-btn-primary lg-btn-icon"><Icon name="send" size={18} /></button>
      </footer>
    </div>
  );
}

/* ── SETTINGS ── */
function SettingsView({ compact, onModal }: { compact?: boolean; onModal: (m: "compose" | "settings") => void }) {
  const [push, setPush] = useState(true);
  const [sound, setSound] = useState(true);
  const [hd, setHd] = useState(false);
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Настройки</h2>

      <div className="lg-glass" style={{ padding: 6 }}>
        {[
          { i: "user", t: "Аккаунт", d: "Личные данные, безопасность" },
          { i: "bell", t: "Уведомления", d: "Push, email, тишина" },
          { i: "lock", t: "Приватность", d: "Видимость, блокировки" },
          { i: "palette", t: "Внешний вид", d: "Тема, шрифт, акцент" },
          { i: "shield", t: "Безопасность", d: "2FA, активные сессии" },
        ].map((it) => (
          <div key={it.t} className="lg-nav-item lg-liquid" onMouseMove={liquidTrack} style={{ padding: 14 }}>
            <div className="lg-icon-chip" style={{ width: 36, height: 36 }}><Icon name={it.i} size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{it.t}</div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>{it.d}</div>
            </div>
            <Icon name="arrow" size={16} />
          </div>
        ))}
      </div>

      <div className="lg-glass" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, opacity: 0.8 }}>Быстрые переключатели</div>
        <ToggleRow label="Push-уведомления" desc="Получать оповещения" value={push} onChange={setPush} />
        <ToggleRow label="Звук сообщений" desc="При входящих" value={sound} onChange={setSound} />
        <ToggleRow label="HD-медиа" desc="Качество фото и видео" value={hd} onChange={setHd} last />
      </div>

      <button className="lg-btn" style={{ alignSelf: "flex-start" }} onClick={() => onModal("settings")}>
        <Icon name="gear" size={16} /> Открыть модалку
      </button>
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange, last }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--lg-divider)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{desc}</div>
      </div>
      <button className="lg-toggle" data-on={value} onClick={() => onChange(!value)} aria-label={label} />
    </div>
  );
}

/* ── PROFILE ── */
function ProfileView({ compact }: { compact?: boolean }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="lg-card" style={{ position: "relative", paddingBottom: 24 }}>
        <div style={{ height: 140, background: "var(--lg-grad-aurora)", borderRadius: "28px 28px 0 0", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.4), transparent 60%)" }} />
        </div>
        <div style={{ padding: "0 20px", marginTop: -44, display: "flex", alignItems: "flex-end", gap: 16 }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", padding: 4, background: "var(--lg-glass-bg-strong)" }}>
            <div className="lg-avatar" style={{ width: "100%", height: "100%", fontSize: 28 }}>А</div>
          </div>
          <div style={{ flex: 1, paddingBottom: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Александр Петров</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>@alex · Product Designer</div>
          </div>
          <button className="lg-btn lg-btn-primary">Изменить</button>
        </div>
        <div style={{ padding: "16px 20px 0", fontSize: 14, lineHeight: 1.55, opacity: 0.85 }}>
          Создаю интерфейсы будущего. Liquid glass, осмысленные анимации, доступность по умолчанию.
        </div>
        <div style={{ display: "flex", gap: 24, padding: "16px 20px 0" }}>
          {[{ n: "248", l: "Постов" }, { n: "12.4k", l: "Подписчиков" }, { n: "892", l: "Подписок" }].map((s) => (
            <div key={s.l}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{s.n}</div>
              <div style={{ fontSize: 11, opacity: 0.65 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 12, marginTop: 20 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="lg-card lg-liquid"
            onMouseMove={liquidTrack}
            style={{
              aspectRatio: "1",
              background: ["var(--lg-grad-aurora)", "var(--lg-grad-mint)", "var(--lg-grad-sunrise)", "var(--lg-grad-violet)"][i % 4],
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────── MODAL ─────────────── */

function Modal({ kind, onClose }: { kind: "compose" | "settings"; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div className="lg-modal-backdrop" onClick={onClose}>
        <div className="lg-modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {kind === "compose" ? "Новый пост" : "Быстрые настройки"}
            </h3>
            <button className="lg-icon-chip" onClick={onClose} aria-label="Закрыть"><Icon name="x" size={16} /></button>
          </div>

          {kind === "compose" ? (
            <>
              <textarea className="lg-input" placeholder="Что нового?" style={{ minHeight: 120, resize: "vertical", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="lg-icon-chip"><Icon name="image" size={18} /></button>
                <button className="lg-icon-chip"><Icon name="video" size={18} /></button>
                <button className="lg-icon-chip"><Icon name="poll" size={18} /></button>
                <div style={{ flex: 1 }} />
                <button className="lg-btn lg-btn-primary" onClick={onClose}>Опубликовать</button>
              </div>
            </>
          ) : (
            <div>
              <ToggleRow label="Тёмная тема" desc="Включить тёмное оформление" value={true} onChange={() => {}} />
              <ToggleRow label="Анимации" desc="Плавные переходы" value={true} onChange={() => {}} />
              <ToggleRow label="Звуки" desc="Уведомления и события" value={false} onChange={() => {}} last />
              <button className="lg-btn lg-btn-primary" style={{ marginTop: 12, width: "100%" }} onClick={onClose}>Сохранить</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── SHOWCASE ─────────────── */

function Showcase() {
  return (
    <div style={{ maxWidth: 1280, margin: "32px auto 0", display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <ShowcaseCard title="Кнопки">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="lg-btn lg-btn-primary">Primary</button>
          <button className="lg-btn">Glass</button>
          <button className="lg-btn lg-btn-ghost">Ghost</button>
          <button className="lg-btn lg-btn-icon" aria-label="икона"><Icon name="heart" size={16} /></button>
        </div>
      </ShowcaseCard>

      <ShowcaseCard title="Иконки в чипах">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["bell", "heart", "chat", "share", "bookmark", "gear", "user", "search"].map((n) => (
            <button key={n} className="lg-icon-chip lg-liquid" onMouseMove={liquidTrack}><Icon name={n} size={18} /></button>
          ))}
        </div>
      </ShowcaseCard>

      <ShowcaseCard title="Лайк">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DemoLike />
          <span style={{ fontSize: 12, opacity: 0.7 }}>Кликни ↗</span>
        </div>
      </ShowcaseCard>

      <ShowcaseCard title="Бейджи">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="lg-badge">PRO</span>
          <span className="lg-badge lg-badge-grad">12 новых</span>
          <span className="lg-badge" style={{ color: "var(--lg-success)", background: "rgba(16,185,129,0.14)" }}>Онлайн</span>
        </div>
      </ShowcaseCard>

      <ShowcaseCard title="Поля ввода">
        <input className="lg-input" placeholder="Простое поле" style={{ marginBottom: 8 }} />
        <input className="lg-input" placeholder="С фокусом — нажми" />
      </ShowcaseCard>

      <ShowcaseCard title="Toggle">
        <DemoToggle />
      </ShowcaseCard>

      <ShowcaseCard title="Скелетон">
        <div className="lg-skeleton" style={{ height: 12, width: "70%", marginBottom: 8 }} />
        <div className="lg-skeleton" style={{ height: 12, width: "90%", marginBottom: 8 }} />
        <div className="lg-skeleton" style={{ height: 12, width: "50%" }} />
      </ShowcaseCard>

      <ShowcaseCard title="Аватары">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {["А", "К", "М", "+5"].map((l, i) => (
            <div key={i} className="lg-avatar" data-online={i === 0 ? "true" : "false"}>{l}</div>
          ))}
        </div>
      </ShowcaseCard>
    </div>
  );
}

function ShowcaseCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lg-glass" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function DemoLike() {
  const [liked, setLiked] = useState(false);
  return (
    <button className="lg-like" data-liked={liked} onClick={() => setLiked(!liked)}>
      <span className="lg-like-spark" />
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}

function DemoToggle() {
  const [v, setV] = useState(true);
  return <button className="lg-toggle" data-on={v} onClick={() => setV(!v)} />;
}

/* ─────────────── ICON SYSTEM ─────────────── */

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "feed": return <svg {...p}><path d="M3 3h18v4H3zM3 11h18v4H3zM3 19h18" /></svg>;
    case "chat": return <svg {...p}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="7" r="4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></svg>;
    case "gear": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case "key": return <svg {...p}><circle cx="8" cy="15" r="4" /><path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" /></svg>;
    case "bell": return <svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
    case "lock": return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case "shield": return <svg {...p}><path d="M12 2 4 5v7c0 5 4 9 8 10 4-1 8-5 8-10V5z" /></svg>;
    case "palette": return <svg {...p}><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2v-.5a1.5 1.5 0 0 1 1.5-1.5H17a5 5 0 0 0 5-5 10 10 0 0 0-10-10z" /></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case "dots": return <svg {...p}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>;
    case "arrow": return <svg {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>;
    case "x": return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
    case "heart": return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" /></svg>;
    case "share": return <svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>;
    case "bookmark": return <svg {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
    case "send": return <svg {...p}><path d="m22 2-11 11M22 2l-7 20-4-9-9-4z" /></svg>;
    case "video": return <svg {...p}><path d="m22 8-6 4 6 4z" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>;
    case "phone": return <svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.4a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>;
    case "image": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>;
    case "poll": return <svg {...p}><path d="M3 3v18h18M8 17V9M13 17V5M18 17v-7" /></svg>;
    case "apple": return <svg {...p}><path d="M18 8a5 5 0 0 0-3.5-1.5 5 5 0 0 0-2.5.6A5 5 0 0 0 9.5 6.5 5 5 0 0 0 6 8a8 8 0 0 0-2 5.5C4 17 7 22 9 22c1 0 1.5-.5 3-.5s2 .5 3 .5c2 0 5-5 5-8.5A6 6 0 0 0 18 8zM12 6a3 3 0 0 0 3-3 3 3 0 0 0-3 3z" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

/* ─────────────── HELPERS ─────────────── */

function liquidTrack(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * 100;
  const y = ((e.clientY - r.top) / r.height) * 100;
  e.currentTarget.style.setProperty("--mx", `${x}%`);
  e.currentTarget.style.setProperty("--my", `${y}%`);
}
