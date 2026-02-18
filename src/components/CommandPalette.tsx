import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Home,
  Search,
  MessageCircle,
  User,
  Building2,
  Shield,
  Video,
  Settings,
  Plus,
  TrendingUp,
  Bell,
  Bookmark,
} from "lucide-react";

const navigationItems = [
  { icon: Home, label: "Главная", path: "/", keywords: "home главная лента" },
  { icon: Search, label: "Поиск", path: "/search", keywords: "search поиск найти" },
  { icon: MessageCircle, label: "Чаты", path: "/chats", keywords: "chats чаты сообщения" },
  { icon: User, label: "Профиль", path: "/profile", keywords: "profile профиль аккаунт" },
  { icon: Building2, label: "Недвижимость", path: "/realestate", keywords: "real estate недвижимость квартира дом" },
  { icon: Shield, label: "Страхование", path: "/insurance", keywords: "insurance страхование полис" },
  { icon: Video, label: "Reels", path: "/reels", keywords: "reels видео клипы" },
];

const quickActions = [
  { icon: Plus, label: "Создать пост", action: "create-post", keywords: "create post создать пост" },
  { icon: TrendingUp, label: "Тренды", action: "trends", keywords: "trends тренды популярное" },
  { icon: Bell, label: "Уведомления", action: "notifications", keywords: "notifications уведомления" },
  { icon: Bookmark, label: "Сохранённое", action: "saved", keywords: "saved bookmarks сохранённое закладки" },
  { icon: Settings, label: "Настройки", action: "settings", keywords: "settings настройки" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleNavigate = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleAction = (action: string) => {
    // В будущем можно добавить реальные действия
    console.log("Action:", action);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Поиск страниц и действий..." />
      <CommandList>
        <CommandEmpty>Ничего не найдено.</CommandEmpty>
        
        <CommandGroup heading="Навигация">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.path}
              value={item.keywords}
              onSelect={() => handleNavigate(item.path)}
              className="flex items-center gap-3 cursor-pointer"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        
        <CommandSeparator />
        
        <CommandGroup heading="Быстрые действия">
          {quickActions.map((item) => (
            <CommandItem
              key={item.action}
              value={item.keywords}
              onSelect={() => handleAction(item.action)}
              className="flex items-center gap-3 cursor-pointer"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
