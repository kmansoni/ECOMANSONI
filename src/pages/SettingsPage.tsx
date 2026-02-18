import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Moon, Sun, Bell, Lock, HelpCircle, Info, LogOut, ChevronRight, ChevronLeft, User, Shield, Heart, Archive, Clock, Bookmark, Eye, UserX, MessageCircle, AtSign, Share2, Users, Globe, Smartphone, Key, Mail, Phone, Database, Trash2, Download, FileText, AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { BrandBackground } from "@/components/ui/brand-background";

type Screen = "main" | "saved" | "archive" | "activity" | "notifications" | "privacy" | "security" | "help" | "about";

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [currentScreen, setCurrentScreen] = useState<Screen>("main");

  const handleBack = () => {
    if (currentScreen === "main") {
      navigate(-1);
    } else {
      setCurrentScreen("main");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const renderHeader = (title: string, showBack: boolean = true) => (
    <div className="flex items-center gap-3 px-5 py-4">
      {showBack && (
        <button 
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}
      <h2 className="text-xl font-semibold flex-1 text-white">{title}</h2>
      {currentScreen === "main" && (
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );

  const renderMenuItem = (icon: React.ReactNode, label: string, onClick?: () => void, value?: string) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors"
    >
      {icon}
      <span className="flex-1 text-left text-white">{label}</span>
      {value && <span className="text-sm text-white/60">{value}</span>}
      <ChevronRight className="w-5 h-5 text-white/40" />
    </button>
  );

  const renderToggleItem = (icon: React.ReactNode, label: string, description: string, checked: boolean, onCheckedChange: (val: boolean) => void) => (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-white/60">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );

  const renderScreen = () => {
    switch (currentScreen) {
      case "saved":
        return (
          <>
            {renderHeader("Сохранённое")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<Bookmark className="w-5 h-5 text-white/60" />, "Все публикации")}
                {renderMenuItem(<Heart className="w-5 h-5 text-white/60" />, "Понравившиеся")}
              </div>
              <p className="p-5 text-center text-white/60 text-sm">
                Создавайте коллекции для сохранённых публикаций
              </p>
            </div>
          </>
        );

      case "archive":
        return (
          <>
            {renderHeader("Архив")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<Archive className="w-5 h-5 text-white/60" />, "Архив историй")}
                {renderMenuItem(<Archive className="w-5 h-5 text-white/60" />, "Архив публикаций")}
                {renderMenuItem(<Archive className="w-5 h-5 text-white/60" />, "Архив прямых эфиров")}
              </div>
            </div>
          </>
        );

      case "activity":
        return (
          <>
            {renderHeader("Ваша активность")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<Clock className="w-5 h-5 text-white/60" />, "Время в приложении", undefined, "1ч 23м")}
                {renderMenuItem(<Heart className="w-5 h-5 text-white/60" />, "Лайки")}
                {renderMenuItem(<MessageCircle className="w-5 h-5 text-white/60" />, "Комментарии")}
                {renderMenuItem(<Share2 className="w-5 h-5 text-white/60" />, "Репосты")}
                {renderMenuItem(<Download className="w-5 h-5 text-white/60" />, "Скачать данные")}
              </div>
            </div>
          </>
        );

      case "notifications":
        return (
          <>
            {renderHeader("Уведомления")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderToggleItem(
                  <Bell className="w-5 h-5 text-white/60" />,
                  "Push-уведомления",
                  "Получать уведомления на устройство",
                  true,
                  () => {}
                )}
                {renderToggleItem(
                  <Heart className="w-5 h-5 text-white/60" />,
                  "Лайки",
                  "Уведомлять о новых лайках",
                  true,
                  () => {}
                )}
                {renderToggleItem(
                  <MessageCircle className="w-5 h-5 text-white/60" />,
                  "Комментарии",
                  "Уведомлять о новых комментариях",
                  true,
                  () => {}
                )}
                {renderToggleItem(
                  <Users className="w-5 h-5 text-white/60" />,
                  "Подписчики",
                  "Уведомлять о новых подписчиках",
                  true,
                  () => {}
                )}
              </div>
            </div>
          </>
        );

      case "privacy":
        return (
          <>
            {renderHeader("Конфиденциальность")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderToggleItem(
                  <Lock className="w-5 h-5 text-white/60" />,
                  "Закрытый аккаунт",
                  "Только подписчики видят ваши публикации",
                  false,
                  () => {}
                )}
                {renderToggleItem(
                  <Eye className="w-5 h-5 text-white/60" />,
                  "Статус активности",
                  "Показывать когда вы были онлайн",
                  true,
                  () => {}
                )}
              </div>
              <div className="mx-4 mt-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<Users className="w-5 h-5 text-white/60" />, "Близкие друзья")}
                {renderMenuItem(<UserX className="w-5 h-5 text-white/60" />, "Заблокированные")}
                {renderMenuItem(<MessageCircle className="w-5 h-5 text-white/60" />, "Управление сообщениями")}
              </div>
            </div>
          </>
        );

      case "security":
        return (
          <>
            {renderHeader("Безопасность")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<Key className="w-5 h-5 text-white/60" />, "Пароль", undefined, "Изменить")}
                {renderToggleItem(
                  <Shield className="w-5 h-5 text-white/60" />,
                  "Двухфакторная аутентификация",
                  "Дополнительная защита аккаунта",
                  false,
                  () => {}
                )}
              </div>
              <div className="mx-4 mt-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<Smartphone className="w-5 h-5 text-white/60" />, "Активные сеансы")}
                {renderMenuItem(<Mail className="w-5 h-5 text-white/60" />, "Письма от нас")}
                {renderMenuItem(<Database className="w-5 h-5 text-white/60" />, "Данные аккаунта")}
              </div>
            </div>
          </>
        );

      case "help":
        return (
          <>
            {renderHeader("Помощь")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<HelpCircle className="w-5 h-5 text-white/60" />, "Справочный центр")}
                {renderMenuItem(<AlertCircle className="w-5 h-5 text-white/60" />, "Сообщить о проблеме")}
                {renderMenuItem(<FileText className="w-5 h-5 text-white/60" />, "Условия использования")}
                {renderMenuItem(<Lock className="w-5 h-5 text-white/60" />, "Политика конфиденциальности")}
              </div>
            </div>
          </>
        );

      case "about":
        return (
          <>
            {renderHeader("О приложении")}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="p-8 flex flex-col items-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-4 shadow-lg">
                  <span className="text-3xl text-white font-bold">M</span>
                </div>
                <h3 className="text-xl font-semibold text-white">mansoni</h3>
                <p className="text-sm text-white/60">Версия 1.0.0</p>
              </div>
              <div className="mx-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                {renderMenuItem(<FileText className="w-5 h-5 text-white/60" />, "Лицензии открытого ПО")}
                {renderMenuItem(<Info className="w-5 h-5 text-white/60" />, "Информация о разработчике")}
              </div>
            </div>
          </>
        );

      default:
        return (
          <>
            {renderHeader("Настройки", false)}

            <div className="flex-1 overflow-y-auto native-scroll pb-8">
              {/* Theme Toggle */}
              <div className="px-4 py-4">
                <p className="text-sm text-white/60 mb-3 px-1">Тема оформления</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all border",
                      theme === "light" 
                        ? "bg-white/20 border-white/40 text-white" 
                        : "bg-white/5 border-white/10 text-white/70"
                    )}
                  >
                    <Sun className="w-5 h-5" />
                    <span className="font-medium">Светлая</span>
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all border",
                      theme === "dark" 
                        ? "bg-white/20 border-white/40 text-white" 
                        : "bg-white/5 border-white/10 text-white/70"
                    )}
                  >
                    <Moon className="w-5 h-5" />
                    <span className="font-medium">Тёмная</span>
                  </button>
                </div>
              </div>

              {/* Account */}
              <div className="px-4 mb-3">
                <p className="text-sm text-white/60 mb-2 px-1">Аккаунт</p>
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                  {renderMenuItem(<Bookmark className="w-5 h-5 text-white/60" />, "Сохранённое", () => setCurrentScreen("saved"))}
                  {renderMenuItem(<Archive className="w-5 h-5 text-white/60" />, "Архив", () => setCurrentScreen("archive"))}
                  {renderMenuItem(<Clock className="w-5 h-5 text-white/60" />, "Ваша активность", () => setCurrentScreen("activity"))}
                </div>
              </div>

              {/* Settings */}
              <div className="px-4 mb-3">
                <p className="text-sm text-white/60 mb-2 px-1">Настройки</p>
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                  {renderMenuItem(<Bell className="w-5 h-5 text-white/60" />, "Уведомления", () => setCurrentScreen("notifications"))}
                  {renderMenuItem(<Lock className="w-5 h-5 text-white/60" />, "Конфиденциальность", () => setCurrentScreen("privacy"))}
                  {renderMenuItem(<Shield className="w-5 h-5 text-white/60" />, "Безопасность", () => setCurrentScreen("security"))}
                </div>
              </div>

              {/* Support */}
              <div className="px-4 mb-3">
                <p className="text-sm text-white/60 mb-2 px-1">Поддержка</p>
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
                  {renderMenuItem(<HelpCircle className="w-5 h-5 text-white/60" />, "Помощь", () => setCurrentScreen("help"))}
                  {renderMenuItem(<Info className="w-5 h-5 text-white/60" />, "О приложении", () => setCurrentScreen("about"))}
                </div>
              </div>

              {/* Logout */}
              <div className="px-4 mt-6">
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Выйти</span>
                </button>
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <BrandBackground />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col safe-area-top safe-area-bottom">
        {renderScreen()}
      </div>
    </div>
  );
}
