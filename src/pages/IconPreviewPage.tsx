import { useMemo, useState } from "react";
import {
  AppPageShell,
  AppGlassCard,
  AppPrimaryButton,
  AppSecondaryButton,
} from "@/components/ui/app-shell";
import {
  ArrowBackIcon,
  BellIcon,
  BookmarkIcon,
  CameraIcon,
  CameraSwapIcon,
  CheckIcon,
  CloseIcon,
  CommentIcon,
  CreateIcon,
  ExploreIcon,
  EyeIcon,
  EyeOffIcon,
  FireIcon,
  HangupIcon,
  HomeIcon,
  LikeIcon,
  MessageIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  PhoneCallIcon,
  PlayIcon,
  PlusIcon,
  ReelsIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  StarIcon,
  UserIcon,
  VerifiedIcon,
  VideoCallIcon,
  VolumeIcon,
  type AppIconProps,
} from "@/components/ui/app-icons";

type IconComponent = (props: AppIconProps) => JSX.Element;

type IconEntry = {
  id: string;
  label: string;
  Component: IconComponent;
};

type IconGroup = {
  id: string;
  title: string;
  hint: string;
  items: IconEntry[];
};

const GROUPS: IconGroup[] = [
  {
    id: "social",
    title: "Социальные",
    hint: "Лента, реакции, коммуникация",
    items: [
      { id: "like", label: "Лайк", Component: LikeIcon },
      { id: "comment", label: "Комментарий", Component: CommentIcon },
      { id: "message", label: "Сообщение", Component: MessageIcon },
      { id: "share", label: "Поделиться", Component: ShareIcon },
      { id: "bookmark", label: "Закладка", Component: BookmarkIcon },
      { id: "star", label: "В избранное", Component: StarIcon },
      { id: "fire", label: "Огонь", Component: FireIcon },
      { id: "verified", label: "Верифицирован", Component: VerifiedIcon },
    ],
  },
  {
    id: "nav",
    title: "Навигация",
    hint: "Переходы, экраны, панели",
    items: [
      { id: "home", label: "Главная", Component: HomeIcon },
      { id: "explore", label: "Открытия", Component: ExploreIcon },
      { id: "reels", label: "Reels", Component: ReelsIcon },
      { id: "create", label: "Создать", Component: CreateIcon },
      { id: "search", label: "Поиск", Component: SearchIcon },
      { id: "user", label: "Профиль", Component: UserIcon },
      { id: "arrow-back", label: "Назад", Component: ArrowBackIcon },
    ],
  },
  {
    id: "system",
    title: "Системные",
    hint: "Действия и статусы",
    items: [
      { id: "settings", label: "Настройки", Component: SettingsIcon },
      { id: "bell", label: "Уведомления", Component: BellIcon },
      { id: "check", label: "Готово", Component: CheckIcon },
      { id: "close", label: "Закрыть", Component: CloseIcon },
      { id: "plus", label: "Добавить", Component: PlusIcon },
      { id: "eye", label: "Показать", Component: EyeIcon },
      { id: "eye-off", label: "Скрыть", Component: EyeOffIcon },
    ],
  },
  {
    id: "calls",
    title: "Звонки",
    hint: "Голос и видеосвязь",
    items: [
      { id: "phone-call", label: "Позвонить", Component: PhoneCallIcon },
      { id: "video-call", label: "Видеозвонок", Component: VideoCallIcon },
      { id: "hangup", label: "Положить трубку", Component: HangupIcon },
      { id: "mic", label: "Микрофон", Component: MicIcon },
      { id: "mic-off", label: "Микрофон выкл", Component: MicOffIcon },
      { id: "volume", label: "Громкость", Component: VolumeIcon },
      { id: "camera", label: "Камера", Component: CameraIcon },
      { id: "camera-swap", label: "Сменить камеру", Component: CameraSwapIcon },
    ],
  },
  {
    id: "media",
    title: "Медиа",
    hint: "Воспроизведение",
    items: [
      { id: "play", label: "Играть", Component: PlayIcon },
      { id: "pause", label: "Пауза", Component: PauseIcon },
    ],
  },
];

const ALL_IDS = GROUPS.flatMap((g) => g.items.map((i) => `${g.id}:${i.id}`));

export default function IconPreviewPage() {
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALL_IDS.map((id) => [id, false])),
  );
  const [size, setSize] = useState<20 | 24 | 28 | 32 | 40>(28);
  const [noAnimate, setNoAnimate] = useState(false);
  const [dark, setDark] = useState<"auto" | "light" | "dark">("auto");

  const activeCount = useMemo(
    () => Object.values(activeMap).filter(Boolean).length,
    [activeMap],
  );

  const setAll = (value: boolean) =>
    setActiveMap(Object.fromEntries(ALL_IDS.map((id) => [id, value])));

  const bgClass =
    dark === "dark"
      ? "bg-[#05070d] text-white"
      : dark === "light"
        ? "bg-[#f5f3ff] text-slate-900"
        : "bg-transparent";

  return (
    <AppPageShell aurora className={`px-4 py-8 sm:py-10 ${bgClass}`}>
      <div className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-6">
        <AppGlassCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="glass-muted text-xs uppercase tracking-[0.22em]">Design Lab</p>
              <h1 className="glass-title mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
                Icon System · Preview v2
              </h1>
              <p className="glass-muted mt-2 text-sm max-w-lg">
                Наведите на иконку — увидите idle-hover эффект. Кликните — переключится active
                с уникальной анимацией. Ниже переключатели размера, фона и motion.
              </p>
            </div>

            <div className="glass-muted text-sm sm:text-right space-y-0.5">
              <div>Всего: {ALL_IDS.length}</div>
              <div>Активно: {activeCount}</div>
              <div>Размер: {size}px</div>
              <div>Группы: {GROUPS.length}</div>
            </div>
          </div>
        </AppGlassCard>

        <AppGlassCard>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            <AppPrimaryButton type="button" onClick={() => setAll(true)}>
              Активировать все
            </AppPrimaryButton>
            <AppSecondaryButton type="button" onClick={() => setAll(false)}>
              Сбросить все
            </AppSecondaryButton>
            <AppSecondaryButton
              type="button"
              onClick={() => setNoAnimate((v) => !v)}
              className={noAnimate ? "ring-2 ring-cyan-300/60" : ""}
            >
              {noAnimate ? "Анимации: OFF" : "Анимации: ON"}
            </AppSecondaryButton>
            <AppSecondaryButton
              type="button"
              onClick={() =>
                setSize((s) =>
                  s === 20 ? 24 : s === 24 ? 28 : s === 28 ? 32 : s === 32 ? 40 : 20,
                )
              }
            >
              Размер: {size}px
            </AppSecondaryButton>
            <AppSecondaryButton
              type="button"
              onClick={() =>
                setDark((d) => (d === "auto" ? "light" : d === "light" ? "dark" : "auto"))
              }
            >
              Фон: {dark}
            </AppSecondaryButton>
          </div>
        </AppGlassCard>

        {GROUPS.map((group) => (
          <AppGlassCard key={group.id}>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="glass-title text-lg sm:text-xl font-semibold">{group.title}</h2>
                <p className="glass-muted text-xs uppercase tracking-[0.14em] mt-0.5">
                  {group.hint}
                </p>
              </div>
              <span className="glass-muted text-xs">{group.items.length} шт</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.items.map((item) => {
                const key = `${group.id}:${item.id}`;
                const isActive = Boolean(activeMap[key]);
                const Icon = item.Component;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setActiveMap((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className="group relative rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-3 py-3 text-left overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="glass-muted text-[11px] uppercase tracking-[0.14em]">
                        {item.id}
                      </span>
                      <span
                        className={
                          isActive
                            ? "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200"
                            : "text-[10px] px-2 py-0.5 rounded-full bg-white/10 opacity-70"
                        }
                      >
                        {isActive ? "active" : "idle"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="relative rounded-xl bg-black/15 dark:bg-white/5 ring-1 ring-white/10 p-1">
                        <Icon
                          active={isActive}
                          size={size}
                          noAnimate={noAnimate}
                        />
                      </div>
                      <span className="glass-title text-sm font-medium leading-tight">
                        {item.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </AppGlassCard>
        ))}

        <AppGlassCard>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <p className="glass-muted text-sm">
              Все иконки — одна кастомная SVG-библиотека. Анимации построены на Framer Motion
              с учётом prefers-reduced-motion. Градиенты — общие defs, монтируются один раз.
            </p>
          </div>
        </AppGlassCard>
      </div>
    </AppPageShell>
  );
}
