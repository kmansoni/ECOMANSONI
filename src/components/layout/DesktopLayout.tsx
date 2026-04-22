import { useRef, useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, NavLink } from "react-router-dom";
import {
  Home, Search, MessageCircle, Bell, Film, User, Settings,
  Phone, Bookmark, Archive, Users, Megaphone
} from "lucide-react";
import { ServicesMenu } from "./ServicesMenu";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { usePresence } from "@/hooks/usePresence";
import { useUnreadChats } from "@/hooks/useUnreadChats";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const SIDEBAR_NAV = [
  { to: "/", icon: Home, label: "Лента" },
  { to: "/chats", icon: MessageCircle, label: "Чаты" },
  { to: "/search", icon: Search, label: "Поиск" },
  { to: "/reels", icon: Film, label: "Reels" },
  { to: "/notifications", icon: Bell, label: "Уведомления" },
  { to: "/people-nearby", icon: Users, label: "Люди рядом" },
  { to: "/saved-messages", icon: Bookmark, label: "Избранное" },
  { to: "/settings", icon: Settings, label: "Настройки" },
  { to: "/profile", icon: User, label: "Профиль" },
] as const;

export function DesktopLayout() {
  usePresence();

  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const { unreadCount } = useUnreadChats();
  const { unreadCount: notifCount } = useNotifications();

  return (
    <div className="DesktopShell h-full flex bg-background">
      {/* Sidebar */}
      <aside className="w-[72px] h-full flex flex-col items-center py-4 gap-1 border-r border-border bg-card/50 flex-shrink-0">
        <div className="mb-2">
          <ServicesMenu />
        </div>
        {SIDEBAR_NAV.map((item) => {
          const Icon = item.icon;
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
                "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors",
                "hover:bg-accent/50",
                isActive && "bg-primary/10 text-primary"
              )}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              <span className="mt-0.5 text-[10px] leading-none opacity-80 tracking-[0.01em] [font-family:ui-rounded,Trebuchet_MS,Segoe_UI,sans-serif]">{item.label}</span>
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
