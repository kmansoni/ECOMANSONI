import { useState, useEffect, forwardRef, useRef, useCallback } from "react";
import { Home, Search, Heart, FileText, LucideIcon, Check, ChevronDown, Camera, MessageCircle, User, AlertCircle, Bell, Film, Loader2 } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useReelsContext } from "@/contexts/ReelsContext";
import { cn } from "@/lib/utils";
import { useUnreadChats } from "@/hooks/useUnreadChats";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMultiAccount } from "@/contexts/MultiAccountContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavItem {
  to: string;
  icon?: LucideIcon;
  label: string;
  hasBadge?: boolean;
  isAction?: boolean;
  hasLongPress?: boolean;
  isCenter?: boolean;
}


// Default nav items: Лента → Reels → Уведомления → Чаты → Профиль | AR (отдельная кнопка)
const defaultNavItems: NavItem[] = [
  { to: "/", icon: Home, label: "Лента" },
  { to: "/reels", icon: Film, label: "Reels" },
  { to: "/notifications", icon: Bell, label: "Уведомления", hasBadge: true },
  { to: "/chats", icon: MessageCircle, label: "Чаты", hasBadge: true },
  { to: "/profile", icon: User, label: "Профиль", hasLongPress: true },
  { to: "/ar", label: "AR" },
];

// Real estate service nav items
const realEstateNavItems: NavItem[] = [
  { to: "/", icon: Home, label: "Главная" },
  { to: "#search", icon: Search, label: "Поиск", isAction: true },
  { to: "/chats", icon: MessageCircle, label: "Чаты", hasBadge: true },
  { to: "#favorites", icon: Heart, label: "Избранное", isAction: true },
];

// Insurance service nav items
const insuranceNavItems: NavItem[] = [
  { to: "/", icon: Home, label: "Главная" },
  { to: "/chats", icon: MessageCircle, label: "Чаты", hasBadge: true },
  { to: "/insurance/policies", icon: FileText, label: "Полисы" },
];

const BOTTOM_NAV_BAR_HEIGHT_PX = 56;

interface BottomNavProps {
  hidden?: boolean;
  disableHideAnimation?: boolean;
  /** Callback called when user taps the central "+" create button */
  onCreateClick?: () => void;
}

export const BottomNav = forwardRef<HTMLElement, BottomNavProps>(function BottomNav({ hidden = false, disableHideAnimation = false, onCreateClick }, ref) {
  const { isReelsPage } = useReelsContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useUnreadChats();
  const { unreadCount: notifUnreadCount } = useNotifications();
  const multiAccountEnabled = import.meta.env.VITE_ENABLE_MULTI_ACCOUNT === "true";
  const {
    accounts: maAccounts,
    activeAccountId,
    switchAccount,
    switchingAccountId,
    isSwitchingAccount,
    isAccountOperationInProgress,
    lookupPhoneGetEmail,
    sendOtpToEmail,
    verifyOtpAndActivate,
    checkRecoveryFactors,
  } = useMultiAccount();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"phone" | "register" | "recovery" | "otp-verify">("phone");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authOtpCode, setAuthOtpCode] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authTargetAccountId, setAuthTargetAccountId] = useState<string | null>(null);
  const [authIsRegister, setAuthIsRegister] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  
  // iOS Safari keyboard detection using visualViewport API
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    
    const onResize = () => {
      // Keyboard is considered open if viewport height is less than 75% of window height
      const isKeyboardOpen = viewport.height < window.innerHeight * 0.75;
      setKeyboardOpen(isKeyboardOpen);
    };
    
    viewport.addEventListener('resize', onResize);
    viewport.addEventListener('scroll', onResize);
    
    return () => {
      viewport.removeEventListener('resize', onResize);
      viewport.removeEventListener('scroll', onResize);
    };
  }, []);
  
  // Determine which nav items to show based on route
  const getNavItems = (): NavItem[] => {
    if (location.pathname.startsWith("/realestate")) {
      return realEstateNavItems;
    }
    if (location.pathname.startsWith("/insurance")) {
      return insuranceNavItems;
    }
    return defaultNavItems;
  };

  const navItems = getNavItems();

  const handleSwitchAccount = async (accountId: string) => {
    try {
      await switchAccount(accountId);
      setAccountSwitcherOpen(false);
    } catch {
      // handled by provider
    }
  };

  const resetAuthSheet = useCallback(() => {
    setAuthMode("phone");
    setAuthEmail("");
    setAuthPassword("");
    setAuthOtpCode("");
    setAuthPhone("");
    setAuthLoading(false);
    setAuthTargetAccountId(null);
    setAuthIsRegister(false);
  }, []);

  const openAuthSheet = useCallback((accountId: string | null) => {
    setAuthTargetAccountId(accountId);
    setAuthMode("phone");
    setAuthEmail("");
    setAuthPassword("");
    setAuthOtpCode("");
    setAuthPhone("");
    setAuthIsRegister(false);
    setAuthSheetOpen(true);
  }, []);

  const handleAuthSheetOpenChange = useCallback((open: boolean) => {
    setAuthSheetOpen(open);
    if (!open) {
      resetAuthSheet();
    }
  }, [resetAuthSheet]);

  /** Нормализует номер телефона к формату E.164 (+7XXXXXXXXXX для РФ) */
  const normalizePhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+7${digits}`;
    if (digits.length === 11 && digits[0] === "8") return `+7${digits.slice(1)}`;
    if (digits.length === 11 && digits[0] === "7") return `+${digits}`;
    if (digits.length > 7) return `+${digits}`;
    return raw.trim();
  };

  const handlePhoneSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(authPhone);
    if (!phone || phone.length < 10) {
      toast.error("Введите корректный номер телефона");
      return;
    }
    setAuthLoading(true);
    try {
      const { email, error } = await lookupPhoneGetEmail(phone);
      if (error) throw error;
      if (email) {
        const { error: otpErr } = await sendOtpToEmail(email, false);
        if (otpErr) throw otpErr;
        setAuthEmail(email);
        setAuthMode("otp-verify");
        toast.success(`Код отправлен на ${email}`);
      } else {
        setAuthMode("register");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка проверки номера");
    } finally {
      setAuthLoading(false);
    }
  }, [authPhone, lookupPhoneGetEmail, sendOtpToEmail]);

  const handleRegisterSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const email = authEmail.trim().toLowerCase();
    if (!email || !authPassword) {
      toast.error("Заполните email и пароль");
      return;
    }
    if (authPassword.length < 6) {
      toast.error("Пароль должен быть не менее 6 символов");
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await sendOtpToEmail(email, true);
      if (error) throw error;
      setAuthIsRegister(true);
      setAuthMode("otp-verify");
      toast.success(`Код регистрации отправлен на ${email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, sendOtpToEmail]);

  const handleVerifyOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const email = authEmail.trim().toLowerCase();
    if (!authOtpCode || authOtpCode.length < 6) {
      toast.error("Введите 6-значный код");
      return;
    }
    setAuthLoading(true);
    try {
      const opts = authIsRegister
        ? { phone: normalizePhone(authPhone), password: authPassword }
        : {};
      const { error } = await verifyOtpAndActivate(email, authOtpCode, opts);
      if (error) throw error;
      toast.success(authTargetAccountId ? "Вход аккаунта восстановлен" : "Аккаунт добавлен");
      setAuthSheetOpen(false);
      resetAuthSheet();
      setAccountSwitcherOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Неверный код");
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authIsRegister, authOtpCode, authPassword, authPhone, authTargetAccountId, resetAuthSheet, verifyOtpAndActivate]);

  const handleRecoverySubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(authPhone);
    const email = authEmail.trim().toLowerCase();
    if (!phone || phone.length < 10 || !email || !authPassword) {
      toast.error("Заполните все поля");
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await checkRecoveryFactors(phone, email, authPassword);
      if (error) throw error;
      setAuthMode("otp-verify");
      toast.success(`Код восстановления отправлен на ${email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Данные не совпадают");
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, authPhone, checkRecoveryFactors]);

  const handleAddAccount = () => {
    openAuthSheet(null);
  };

  const handleTouchStart = useCallback((item: NavItem) => {
    if (!item.hasLongPress) return;
    
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setAccountSwitcherOpen(true);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback((item: NavItem, e: React.TouchEvent | React.MouseEvent) => {
    if (!item.hasLongPress) return;
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    if (isLongPressRef.current) {
      e.preventDefault();
      isLongPressRef.current = false;
    }
  }, []);

  const handleContextMenu = useCallback((item: NavItem, e: React.MouseEvent) => {
    if (item.hasLongPress) {
      e.preventDefault();
      setAccountSwitcherOpen(true);
    }
  }, []);

  // Instagram-style: tap on already-active tab → scroll page to top
  const handleNavClick = useCallback((item: NavItem, isActive: boolean) => {
    if (!isActive) return;
    // Find the main scrollable container: <main> or first overflow-y-auto ancestor
    const scrollTarget =
      document.querySelector<HTMLElement>("main") ??
      document.querySelector<HTMLElement>('[data-scroll-container]') ??
      document.documentElement;
    scrollTarget.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <>
      <div 
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(
          "fixed-nav",
          "fixed bottom-0 left-0 right-0 z-[100]",
          "touch-none select-none",
          "px-4",
          keyboardOpen && "keyboard-open",
          (keyboardOpen || hidden || isReelsPage) && "pointer-events-none"
        )}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: (keyboardOpen || hidden || isReelsPage) ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)',
          WebkitTransform: (keyboardOpen || hidden || isReelsPage) ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)',
          opacity: (hidden || isReelsPage) ? 0 : 1,
          transition: disableHideAnimation
            ? 'none'
            : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
          WebkitTransition: disableHideAnimation
            ? 'none'
            : '-webkit-transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
          willChange: 'transform, opacity',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          isolation: 'isolate',
        }}
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto mb-2">
          {/* Main glass pill navigation container */}
          <nav 
            className={cn(
              "flex-1 flex items-center justify-around",
              "rounded-full",
              "bg-black/40 dark:bg-black/40 backdrop-blur-xl",
              "border border-white/20 dark:border-white/10",
              "shadow-lg shadow-black/5 dark:shadow-black/20"
            )}
            style={{
              height: `${BOTTOM_NAV_BAR_HEIGHT_PX}px`,
              minHeight: `${BOTTOM_NAV_BAR_HEIGHT_PX}px`,
            }}
          >
            {/* Render all items except the last one */}
            {navItems.slice(0, -1).map((item) => {
              // For action items (not real routes), use button
              if (item.isAction) {
                return (
                  <button
                    key={item.to}
                    className={cn(
                      "flex flex-col items-center justify-center flex-1 h-full",
                      "transition-colors duration-150",
                      "active:opacity-70",
                      "min-w-[44px] min-h-[44px]",
                      "text-white/60 hover:text-white"
                    )}
                    style={{ 
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                    }}
                    onClick={() => {
                      if (location.pathname.startsWith("/realestate")) {
                        navigate(`/realestate${item.to}`);
                      }
                    }}
                  >
                    <div className="relative flex items-center justify-center">
                      {item.icon && <item.icon className="w-[22px] h-[22px]" strokeWidth={1.8} />}
                    </div>
                    <span className="text-[10px] font-medium mt-0.5 leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onTouchStart={() => handleTouchStart(item)}
                  onTouchEnd={(e) => handleTouchEnd(item, e)}
                  onMouseDown={() => handleTouchStart(item)}
                  onMouseUp={(e) => handleTouchEnd(item, e)}
                  onMouseLeave={(e) => handleTouchEnd(item, e)}
                  onContextMenu={(e) => handleContextMenu(item, e)}
                  onClick={(e) => {
                    // Use React Router's own match logic — same source of truth
                    // as the isActive prop passed to className/children render props.
                    const matched = item.to === "/"
                      ? location.pathname === "/"
                      : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                    if (matched) {
                      // Already on this tab — don't navigate again, just scroll to top
                      e.preventDefault();
                      handleNavClick(item, true);
                    }
                  }}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center justify-center flex-1 h-full",
                      "transition-colors duration-150",
                      "active:opacity-70",
                      "min-w-[44px] min-h-[44px]",
                      isActive ? "text-white" : "text-white/70"
                    )
                  }
                  style={{ 
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <div className="relative flex items-center justify-center">
                        {item.icon && (
                          <item.icon
                            className={cn(
                              "w-6 h-6 transition-all duration-150",
                              isActive && "stroke-[2.2px]"
                            )}
                            strokeWidth={isActive ? 2.2 : 1.8}
                          />
                        )}
                        {item.hasBadge && item.to === "/notifications" && (
                          <NotificationBadge count={notifUnreadCount} />
                        )}
                        {item.hasBadge && item.to === "/chats" && (
                          <NotificationBadge count={unreadCount} />
                        )}
                      </div>
                      <span className="text-[10px] font-medium mt-0.5 leading-tight">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>



          {/* Separate circular button for the last item (Profile) */}
          {(() => {
            const lastItem = navItems[navItems.length - 1];
            return (
              <NavLink
                to={lastItem.to}
                onTouchStart={() => handleTouchStart(lastItem)}
                onTouchEnd={(e) => handleTouchEnd(lastItem, e)}
                onMouseDown={() => handleTouchStart(lastItem)}
                onMouseUp={(e) => handleTouchEnd(lastItem, e)}
                onMouseLeave={(e) => handleTouchEnd(lastItem, e)}
                onContextMenu={(e) => handleContextMenu(lastItem, e)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-center",
                    "w-14 h-14 rounded-full",
                    "bg-black/40 dark:bg-black/40 backdrop-blur-xl",
                    "border border-white/20 dark:border-white/10",
                    "shadow-lg shadow-black/5 dark:shadow-black/20",
                    "transition-colors duration-150",
                    "active:opacity-70",
                    isActive ? "text-white" : "text-white/70"
                  )
                }
                style={{ 
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                }}
              >
                {({ isActive }) => (
                  <div className="relative flex items-center justify-center">
                    {lastItem.icon ? (
                      <lastItem.icon
                        className={cn(
                          "w-6 h-6 transition-all duration-150",
                          isActive && "stroke-[2.2px]"
                        )}
                        strokeWidth={isActive ? 2.2 : 1.8}
                      />
                    ) : (
                      <span 
                        className={cn(
                          "font-black text-sm tracking-tight",
                          "bg-gradient-to-br from-white via-white/90 to-white/70",
                          "bg-clip-text text-transparent",
                          "drop-shadow-sm",
                          isActive && "scale-110"
                        )}
                        style={{
                          fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
                          letterSpacing: '-0.02em',
                        }}
                      >
                        AR
                      </span>
                    )}
                  </div>
                )}
              </NavLink>
            );
          })()}
        </div>
      </div>

      {/* Account Switcher Drawer */}
      <Drawer open={accountSwitcherOpen} onOpenChange={setAccountSwitcherOpen}>
        <DrawerContent className="bg-card border-border">
          <DrawerHeader className="border-b border-border pb-4">
            <DrawerTitle className="text-center">Сменить аккаунт</DrawerTitle>
          </DrawerHeader>
          
          <div className="p-4 space-y-2">
            {(() => {
              // IRON RULE 3.1: Active account always first in drawer
              const active = maAccounts.find(a => a.accountId === activeAccountId);
              const others = maAccounts.filter(a => a.accountId !== activeAccountId);
              const sorted = active ? [active, ...others] : others;
              return sorted.map((account) => {
              const rawDisplayName = account.profile?.display_name ?? account.profile?.displayName ?? "";
              const displayName = typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
              const rawUsername = typeof account.profile?.username === "string" ? account.profile.username.trim() : "";
              const normalizedUsername = rawUsername.replace(/^@+/, "");
              const primaryLine = normalizedUsername ? `@${normalizedUsername}` : (displayName || "Пользователь");
              const secondaryLine = normalizedUsername
                ? (displayName || "Без ФИО")
                : (displayName ? "Никнейм не задан" : "Профиль не заполнен");
              const avatar = account.profile?.avatar_url || account.profile?.avatarUrl || "";
              const isActive = activeAccountId === account.accountId;
              const needsReauth = account.requiresReauth === true;
              
              return (
              <button
                key={account.accountId}
                onClick={() => {
                  if (isAccountOperationInProgress) return;
                  if (isActive && !needsReauth) return;
                  if (needsReauth) {
                    openAuthSheet(account.accountId);
                    return;
                  }
                  void handleSwitchAccount(account.accountId);
                }}
                disabled={isAccountOperationInProgress}
                title={isAccountOperationInProgress ? "Выполняется операция с аккаунтом..." : undefined}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                  needsReauth 
                    ? "bg-red-50 dark:bg-red-950/20" 
                    : (isActive 
                        ? "bg-primary/10" 
                        : "hover:bg-muted"),
                  isAccountOperationInProgress && "opacity-70"
                )}
              >
                <Avatar className="w-12 h-12">
                  <AvatarImage src={avatar || undefined} alt={displayName || normalizedUsername || "Профиль"} />
                  <AvatarFallback className="bg-muted">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">{primaryLine}</p>
                  <p className="text-sm text-muted-foreground">{secondaryLine}</p>
                </div>
                {isActive && !needsReauth && (
                  <Check className="w-5 h-5 text-primary" />
                )}
                {!isActive && switchingAccountId === account.accountId && (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" aria-label="Переключаем аккаунт" />
                )}
                {needsReauth && (
                  <AlertCircle className="w-5 h-5 text-red-500" aria-label="Требуется переаутентификация" />
                )}
              </button>
              );
            });
            })()}
            
            {/* Add Account Button */}
            <button
              onClick={handleAddAccount}
              disabled={isAccountOperationInProgress}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                isAccountOperationInProgress ? "opacity-60 cursor-not-allowed" : "hover:bg-muted",
              )}
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <span className="w-6 h-6 text-foreground text-xl leading-none flex items-center justify-center">+</span>
              </div>
              <p className="font-medium text-foreground">Добавить аккаунт</p>
            </button>
          </div>
          
          {/* Safe area padding */}
          <div className="h-6" />
        </DrawerContent>
      </Drawer>

      <Drawer open={authSheetOpen} onOpenChange={handleAuthSheetOpenChange}>
        <DrawerContent className="bg-card border-border">
          <DrawerHeader className="border-b border-border pb-4">
            <DrawerTitle className="text-center">
              {authTargetAccountId ? "Войти в аккаунт" : "Добавить аккаунт"}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-4 space-y-3">
            {authMode === "phone" && (
              <form onSubmit={handlePhoneSubmit} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Введите номер телефона. Если аккаунт найден — отправим код на привязанный email.
                </p>
                <PhoneInput
                  value={authPhone}
                  onChange={setAuthPhone}
                />
                <Button type="submit" className="w-full" disabled={authLoading}>
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Далее"}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground underline underline-offset-2 py-1"
                  onClick={() => setAuthMode("recovery")}
                >
                  Нет доступа к номеру?
                </button>
              </form>
            )}

            {authMode === "register" && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Аккаунт с этим номером не найден. Введите email и придумайте пароль для нового аккаунта.
                </p>
                <Input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoFocus
                />
                <Input
                  type="password"
                  placeholder="Придумайте пароль (мин. 6 символов)"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setAuthMode("phone")}>Назад</Button>
                  <Button type="submit" className="flex-1" disabled={authLoading}>
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зарегистрироваться"}
                  </Button>
                </div>
              </form>
            )}

            {authMode === "recovery" && (
              <form onSubmit={handleRecoverySubmit} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Для восстановления укажите телефон, email и пароль — затем введите код из письма.
                </p>
                <PhoneInput
                  value={authPhone}
                  onChange={setAuthPhone}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Пароль"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setAuthMode("phone")}>Назад</Button>
                  <Button type="submit" className="flex-1" disabled={authLoading}>
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Отправить код"}
                  </Button>
                </div>
              </form>
            )}

            {authMode === "otp-verify" && (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <p className="text-sm text-muted-foreground">Код отправлен на {authEmail}</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  value={authOtpCode}
                  onChange={(e) => setAuthOtpCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  className="text-center text-2xl tracking-[0.3em]"
                />
                <Button type="submit" className="w-full" disabled={authLoading}>
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Подтвердить"}
                </Button>
              </form>
            )}
          </div>

          <div className="h-6" />
        </DrawerContent>
      </Drawer>
    </>
  );
});

BottomNav.displayName = "BottomNav";