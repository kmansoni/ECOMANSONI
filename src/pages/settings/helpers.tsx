/**
 * src/pages/settings/helpers.tsx
 * Pure UI rendering helpers shared across all Settings sub-sections.
 * No side effects, no state — only deterministic JSX factories.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Screen, SettingsPostItem } from "./types";

// ——— JSX helpers ————————————————————————————————————————————————————————

interface HeaderProps {
  title: string;
  showBack?: boolean;
  isDark: boolean;
  currentScreen: Screen;
  onBack: () => void;
  onClose: () => void;
}

export function SettingsHeader({
  title,
  showBack = true,
  isDark,
  currentScreen,
  onBack,
  onClose,
}: HeaderProps): React.ReactElement {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      {showBack && (
        <button
          onClick={onBack}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            isDark
              ? "settings-dark-pill hover:opacity-90"
              : "bg-card/80 backdrop-blur-xl border border-border hover:bg-muted/50",
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <h2 className={cn("text-xl font-semibold flex-1", !isDark && "text-white")}>{title}</h2>
      {currentScreen === "main" && (
        <button
          onClick={onClose}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            isDark
              ? "settings-dark-pill hover:opacity-90"
              : "bg-card/80 backdrop-blur-xl border border-border hover:bg-muted/50",
          )}
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  isDark: boolean;
  onClick?: () => void;
  value?: string;
}

export function SettingsMenuItem({ icon, label, isDark, onClick, value }: MenuItemProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-5 py-3.5 transition-colors",
        isDark ? "hover:bg-white/5 active:bg-white/10" : "hover:bg-muted/50 active:bg-muted",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {value && (
        <span className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>{value}</span>
      )}
      <ChevronRight className={cn("w-5 h-5", isDark ? "text-white/40" : "text-muted-foreground")} />
    </button>
  );
}

interface ToggleItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  isDark: boolean;
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
}

export function SettingsToggleItem({
  icon,
  label,
  description,
  isDark,
  checked,
  onCheckedChange,
}: ToggleItemProps): React.ReactElement {
  return (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

interface PostsListProps {
  rows: SettingsPostItem[];
  loading: boolean;
  emptyText: string;
  isDark: boolean;
}

function SettingsPostThumbnail({ mediaUrl, title, isDark }: { mediaUrl: string | null | undefined; title: string; isDark: boolean }) {
  const [broken, setBroken] = React.useState(false);

  if (!mediaUrl || broken) {
    return (
      <div
        className={cn(
          "w-full h-full flex items-center justify-center text-xs text-center px-2",
          isDark ? "text-white/50 bg-white/5" : "text-white/70 bg-muted/60",
        )}
      >
        Нет медиа
      </div>
    );
  }

  return (
    <img
      src={mediaUrl}
      alt={title}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

export function SettingsPostsList({ rows, loading, emptyText, isDark }: PostsListProps): React.ReactElement {
  const navigate = useNavigate();

  if (loading) {
    return (
      <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>
        Загрузка...
      </p>
    );
  }

  if (!rows.length) {
    return (
      <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>
        {emptyText}
      </p>
    );
  }

  return (
    <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
      {rows.map((post) => (
        <button
          key={post.id}
          onClick={() => navigate(`/post/${post.id}`)}
          className={cn(
            "w-full px-5 py-4 text-left flex items-center gap-3 border-b",
            isDark ? "border-white/10 hover:bg-white/5" : "border-white/20 hover:bg-muted/30",
          )}
        >
          <div
            className={cn(
              "w-14 h-14 rounded-xl overflow-hidden border shrink-0",
              isDark ? "border-white/10" : "border-white/20",
            )}
          >
            <SettingsPostThumbnail
              mediaUrl={post.media_url}
              title={post.content?.trim() || "Публикация без текста"}
              isDark={isDark}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>
              {post.content?.trim() || "Публикация без текста"}
            </p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>
              {new Date(post.created_at).toLocaleDateString("ru-RU")} · ❤ {post.likes_count ?? 0} · 💬{" "}
              {post.comments_count ?? 0}
            </p>
          </div>
          <ChevronRight className={cn("w-5 h-5 shrink-0", isDark ? "text-white/40" : "text-muted-foreground")} />
        </button>
      ))}
    </div>
  );
}
