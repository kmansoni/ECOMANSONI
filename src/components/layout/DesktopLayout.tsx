import { useRef } from "react";
import { Outlet, useLocation, useNavigate, NavLink } from "react-router-dom";
import {
  BellIcon,
  BookmarkIcon,
  HomeIcon,
  MessageIcon,
  ReelsIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  type AppIconProps,
} from "@/components/ui/app-icons";
import { Users } from "lucide-react";
import type { ComponentType } from "react";
import { ServicesMenu } from "./ServicesMenu";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { usePresence } from "@/hooks/usePresence";
import { useUnreadChats } from "@/hooks/useUnreadChats";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

type SidebarIcon = ComponentType<AppIconProps> | "users";

const SIDEBAR_NAV = [
  { to: "/", icon: HomeIcon as SidebarIcon, label: "Лента" },
  { to: "/chats", icon: MessageIcon as SidebarIcon, label: "Чаты" },
  { to: "/search", icon: SearchIcon as SidebarIcon, label: "Поиск" },
  { to: "/reels", icon: ReelsIcon as SidebarIcon, label: "Reels" },
  { to: "/notifications", icon: BellIcon as SidebarIcon, label: "Уведомления" },
  { to: "/people-nearby", icon: "users" as SidebarIcon, label: "Люди рядом" },
  { to: "/saved-messages", icon: BookmarkIcon as SidebarIcon, label: "Избранное" },
  { to: "/settings", icon: SettingsIcon as SidebarIcon, label: "Настройки" },
  { to: "/profile", icon: UserIcon as SidebarIcon, label: "Профиль" },
] as const;

export function DesktopLayout() {
  usePresence();

  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const { unreadCount } = useUnreadChats();
  const { unreadCount: notifCount } = useNotifications();

  const renderSidebarIcon = (icon: SidebarIcon, isActive: boolean, label: string) => {
    if (icon === "users") {
      return <Users className={cn("w-5 h-5", isActive && "text-cyan-200")} />;
    }

    const Icon = icon;
    return <Icon active={isActive} size={20} label={label} />;
  };

  return (
    <div className="DesktopShell h-full flex bg-background">
      {/* Sidebar */}
      <aside className="w-[84px] h-full flex flex-col items-center py-4 gap-2 border-r border-white/10 bg-[radial-gradient(circle_at_top,rgba(115,82,255,0.12),transparent_34%),linear-gradient(180deg,rgba(10,14,31,0.94),rgba(6,9,20,0.9))] flex-shrink-0">
        <div className="mb-2">
          <ServicesMenu />
        </div>
        {SIDEBAR_NAV.map((item) => {
          const isActive = item.to === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.to);

          const badge =
            item.to === "/chats" ? unreadCount :
            item.to === "/notifications" ? notifCount :
            0;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex flex-col items-center justify-center w-[60px] min-h-[68px] rounded-[20px] transition-all duration-200 text-white/72",
                "hover:bg-white/[0.08] hover:text-white",
                isActive && "bg-white/[0.12] text-white shadow-[0_0_28px_rgba(99,102,241,0.16)]"
              )}
              title={item.label}
            >
              <span className="relative z-10 flex items-center justify-center">
                {renderSidebarIcon(item.icon, isActive, item.label)}
              </span>
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              <span className="mt-1 text-[10px] leading-none tracking-[0.04em] uppercase opacity-85">{item.label}</span>
            </NavLink>
          );
        })}
      </aside>

      {/* Main content */}
      <ScrollContainerProvider value={mainRef}>
        <main
          ref={mainRef}
          className="flex-1 overflow-x-hidden overflow-y-auto relative"
          style={{
            overscrollBehavior: "contain",
          }}
        >
          <Outlet />
        </main>
      </ScrollContainerProvider>
    </div>
  );
}
