import { useState } from "react";
import { X, Moon, Sun, Bell, Lock, HelpCircle, Info, LogOut, ChevronRight, ChevronLeft, User, Shield, Heart, Archive, Clock, Bookmark, Eye, UserX, MessageCircle, AtSign, Share2, Users, Globe, Smartphone, Key, Mail, Phone, Database, Trash2, Download, FileText, AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Screen = "main" | "editProfile" | "saved" | "archive" | "activity" | "notifications" | "privacy" | "security" | "help" | "about";

export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { theme, setTheme } = useTheme();
  const [currentScreen, setCurrentScreen] = useState<Screen>("main");

  const handleBack = () => {
    setCurrentScreen("main");
  };

  const handleClose = () => {
    setCurrentScreen("main");
    onClose();
  };

  const renderHeader = (title: string, showBack: boolean = false) => (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
      {showBack ? (
        <button 
          onClick={handleBack}
          className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      ) : null}
      <h2 className="text-xl font-semibold flex-1">{title}</h2>
      <button 
        onClick={handleClose}
        className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  const renderMenuItem = (icon: React.ReactNode, label: string, onClick?: () => void, value?: string) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-3.5 active:bg-muted/50 transition-colors"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {value && <span className="text-sm text-muted-foreground">{value}</span>}
      <ChevronRight className="w-5 h-5 text-muted-foreground" />
    </button>
  );

  const renderToggleItem = (icon: React.ReactNode, label: string, description: string, checked: boolean, onCheckedChange: (val: boolean) => void) => (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={handleClose}
      />
      
      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 bottom-0 z-[81] w-[85%] max-w-[360px] bg-card shadow-2xl transition-transform duration-300 ease-out overflow-hidden",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex flex-col h-full safe-area-top safe-area-bottom">
          
          {/* Main Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col transition-transform duration-300",
            currentScreen === "main" ? "translate-x-0" : "-translate-x-full"
          )}>
            {renderHeader("Настройки")}

            <div className="flex-1 overflow-y-auto native-scroll">
              {/* Theme Toggle */}
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm text-muted-foreground mb-3">Тема оформления</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all",
                      theme === "light" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-foreground"
                    )}
                  >
                    <Sun className="w-5 h-5" />
                    <span className="font-medium">Светлая</span>
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all",
                      theme === "dark" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-foreground"
                    )}
                  >
                    <Moon className="w-5 h-5" />
                    <span className="font-medium">Тёмная</span>
                  </button>
                </div>
              </div>

              {/* Account */}
              <div className="border-b border-border">
                <p className="px-5 pt-4 pb-2 text-sm text-muted-foreground">Аккаунт</p>
                {renderMenuItem(<Bookmark className="w-5 h-5 text-muted-foreground" />, "Сохранённое", () => setCurrentScreen("saved"))}
                {renderMenuItem(<Archive className="w-5 h-5 text-muted-foreground" />, "Архив", () => setCurrentScreen("archive"))}
                {renderMenuItem(<Clock className="w-5 h-5 text-muted-foreground" />, "Ваша активность", () => setCurrentScreen("activity"))}
              </div>

              {/* Settings */}
              <div className="border-b border-border">
                <p className="px-5 pt-4 pb-2 text-sm text-muted-foreground">Настройки</p>
                {renderMenuItem(<Bell className="w-5 h-5 text-muted-foreground" />, "Уведомления", () => setCurrentScreen("notifications"))}
                {renderMenuItem(<Lock className="w-5 h-5 text-muted-foreground" />, "Конфиденциальность", () => setCurrentScreen("privacy"))}
                {renderMenuItem(<Shield className="w-5 h-5 text-muted-foreground" />, "Безопасность", () => setCurrentScreen("security"))}
              </div>

              {/* Support */}
              <div className="border-b border-border">
                <p className="px-5 pt-4 pb-2 text-sm text-muted-foreground">Поддержка</p>
                {renderMenuItem(<HelpCircle className="w-5 h-5 text-muted-foreground" />, "Помощь", () => setCurrentScreen("help"))}
                {renderMenuItem(<Info className="w-5 h-5 text-muted-foreground" />, "О приложении", () => setCurrentScreen("about"))}
              </div>
            </div>

            {/* Logout */}
            <div className="px-5 py-4 border-t border-border">
              <button className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive active:opacity-70 transition-opacity">
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Выйти</span>
              </button>
            </div>
          </div>

          {/* Edit Profile Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "editProfile" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Редактировать профиль", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="p-5 flex flex-col items-center border-b border-border">
                <div className="w-20 h-20 rounded-full bg-muted mb-3 overflow-hidden">
                  <img src="https://i.pravatar.cc/150?img=32" alt="" className="w-full h-full object-cover" />
                </div>
                <button className="text-primary font-medium">Изменить фото</button>
              </div>
              {renderMenuItem(<User className="w-5 h-5 text-muted-foreground" />, "Имя", undefined, "Александр Иванов")}
              {renderMenuItem(<AtSign className="w-5 h-5 text-muted-foreground" />, "Имя пользователя", undefined, "alex_ivanov")}
              {renderMenuItem(<FileText className="w-5 h-5 text-muted-foreground" />, "О себе", undefined, "Предприниматель")}
              {renderMenuItem(<Globe className="w-5 h-5 text-muted-foreground" />, "Ссылка", undefined, "Добавить")}
              {renderMenuItem(<Mail className="w-5 h-5 text-muted-foreground" />, "Эл. почта", undefined, "alex@mail.ru")}
              {renderMenuItem(<Phone className="w-5 h-5 text-muted-foreground" />, "Телефон", undefined, "+7 999 ***")}
            </div>
          </div>

          {/* Saved Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "saved" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Сохранённое", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              {renderMenuItem(<Bookmark className="w-5 h-5 text-muted-foreground" />, "Все публикации")}
              {renderMenuItem(<Heart className="w-5 h-5 text-muted-foreground" />, "Понравившиеся")}
              <div className="p-5 text-center text-muted-foreground">
                <p className="text-sm">Создавайте коллекции для сохранённых публикаций</p>
              </div>
            </div>
          </div>

          {/* Archive Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "archive" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Архив", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              {renderMenuItem(<Archive className="w-5 h-5 text-muted-foreground" />, "Архив историй")}
              {renderMenuItem(<Archive className="w-5 h-5 text-muted-foreground" />, "Архив публикаций")}
              {renderMenuItem(<Archive className="w-5 h-5 text-muted-foreground" />, "Архив прямых эфиров")}
            </div>
          </div>

          {/* Activity Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "activity" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Ваша активность", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              {renderMenuItem(<Clock className="w-5 h-5 text-muted-foreground" />, "Время в приложении", undefined, "1ч 23м")}
              {renderMenuItem(<Heart className="w-5 h-5 text-muted-foreground" />, "Лайки")}
              {renderMenuItem(<MessageCircle className="w-5 h-5 text-muted-foreground" />, "Комментарии")}
              {renderMenuItem(<Share2 className="w-5 h-5 text-muted-foreground" />, "Репосты")}
              {renderMenuItem(<Download className="w-5 h-5 text-muted-foreground" />, "Скачать данные")}
            </div>
          </div>

          {/* Notifications Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "notifications" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Уведомления", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              {renderToggleItem(
                <Bell className="w-5 h-5 text-muted-foreground" />,
                "Push-уведомления",
                "Получать уведомления на устройство",
                true,
                () => {}
              )}
              {renderToggleItem(
                <Heart className="w-5 h-5 text-muted-foreground" />,
                "Лайки",
                "Уведомлять о новых лайках",
                true,
                () => {}
              )}
              {renderToggleItem(
                <MessageCircle className="w-5 h-5 text-muted-foreground" />,
                "Комментарии",
                "Уведомлять о новых комментариях",
                true,
                () => {}
              )}
              {renderToggleItem(
                <Users className="w-5 h-5 text-muted-foreground" />,
                "Подписчики",
                "Уведомлять о новых подписчиках",
                true,
                () => {}
              )}
              {renderToggleItem(
                <AtSign className="w-5 h-5 text-muted-foreground" />,
                "Упоминания",
                "Уведомлять об упоминаниях",
                true,
                () => {}
              )}
            </div>
          </div>

          {/* Privacy Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "privacy" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Конфиденциальность", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              {renderToggleItem(
                <Lock className="w-5 h-5 text-muted-foreground" />,
                "Закрытый аккаунт",
                "Только подписчики видят ваши публикации",
                false,
                () => {}
              )}
              {renderToggleItem(
                <Eye className="w-5 h-5 text-muted-foreground" />,
                "Статус активности",
                "Показывать когда вы были онлайн",
                true,
                () => {}
              )}
              {renderMenuItem(<Users className="w-5 h-5 text-muted-foreground" />, "Близкие друзья")}
              {renderMenuItem(<UserX className="w-5 h-5 text-muted-foreground" />, "Заблокированные")}
              {renderMenuItem(<MessageCircle className="w-5 h-5 text-muted-foreground" />, "Управление сообщениями")}
              {renderMenuItem(<AtSign className="w-5 h-5 text-muted-foreground" />, "Упоминания")}
              {renderMenuItem(<Share2 className="w-5 h-5 text-muted-foreground" />, "Репосты")}
            </div>
          </div>

          {/* Security Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "security" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Безопасность", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              {renderMenuItem(<Key className="w-5 h-5 text-muted-foreground" />, "Пароль", undefined, "Изменить")}
              {renderToggleItem(
                <Shield className="w-5 h-5 text-muted-foreground" />,
                "Двухфакторная аутентификация",
                "Дополнительная защита аккаунта",
                false,
                () => {}
              )}
              {renderMenuItem(<Smartphone className="w-5 h-5 text-muted-foreground" />, "Активные сеансы")}
              {renderMenuItem(<Mail className="w-5 h-5 text-muted-foreground" />, "Письма от нас")}
              {renderMenuItem(<Database className="w-5 h-5 text-muted-foreground" />, "Данные аккаунта")}
            </div>
          </div>

          {/* Help Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "help" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("Помощь", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              {renderMenuItem(<HelpCircle className="w-5 h-5 text-muted-foreground" />, "Справочный центр")}
              {renderMenuItem(<AlertCircle className="w-5 h-5 text-muted-foreground" />, "Сообщить о проблеме")}
              {renderMenuItem(<FileText className="w-5 h-5 text-muted-foreground" />, "Условия использования")}
              {renderMenuItem(<Lock className="w-5 h-5 text-muted-foreground" />, "Политика конфиденциальности")}
            </div>
          </div>

          {/* About Screen */}
          <div className={cn(
            "absolute inset-0 flex flex-col bg-card transition-transform duration-300",
            currentScreen === "about" ? "translate-x-0" : "translate-x-full"
          )}>
            {renderHeader("О приложении", true)}
            <div className="flex-1 overflow-y-auto native-scroll">
              <div className="p-8 flex flex-col items-center border-b border-border">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                  <span className="text-3xl text-primary-foreground font-bold">B</span>
                </div>
                <h3 className="text-xl font-semibold">bitforge</h3>
                <p className="text-sm text-muted-foreground">Версия 1.0.0</p>
              </div>
              {renderMenuItem(<FileText className="w-5 h-5 text-muted-foreground" />, "Лицензии открытого ПО")}
              {renderMenuItem(<Globe className="w-5 h-5 text-muted-foreground" />, "Наш сайт")}
              <div className="p-5 text-center">
                <p className="text-sm text-muted-foreground">© 2024 bitforge</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}