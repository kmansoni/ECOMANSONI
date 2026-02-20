import { useState, useEffect, forwardRef, useRef, useCallback } from "react";
import { Home, Search, Heart, FileText, LucideIcon, Plus, Check, ChevronDown, Camera, MessageCircle, User, PlaySquare } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUnreadChats } from "@/hooks/useUnreadChats";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMultiAccount } from "@/contexts/MultiAccountContext";

interface NavItem {
  to: string;
  icon?: LucideIcon;
  label: string;
  hasBadge?: boolean;
  isAction?: boolean;
  hasLongPress?: boolean;
  isCenter?: boolean;
}


// Default nav items: Лента → Reels → Чаты → Профиль | AR (отдельная кнопка)
const defaultNavItems: NavItem[] = [
  { to: "/", icon: Home, label: "Лента" },
  { to: "/reels", icon: PlaySquare, label: "Reels" },
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

interface BottomNavProps {
  hidden?: boolean;
}

export const BottomNav = forwardRef<HTMLElement, BottomNavProps>(function BottomNav({ hidden = false }, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useUnreadChats();
  const { accounts: maAccounts, activeAccountId, switchAccount } = useMultiAccount();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
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

  const isReelsPage = location.pathname === "/reels";

  const handleSwitchAccount = async (accountId: string) => {
    try {
      await switchAccount(accountId);
      setAccountSwitcherOpen(false);
    } catch {
      // handled by provider
    }
  };

  const handleAddAccount = () => {
    setAccountSwitcherOpen(false);
    navigate("/auth?addAccount=1");
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

  return (
    <>
      <div 
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[100]",
          "touch-none select-none",
          "px-4",
          (keyboardOpen || hidden) && "pointer-events-none"
        )}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: (keyboardOpen || hidden) ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)',
          WebkitTransform: (keyboardOpen || hidden) ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)',
          opacity: hidden ? 0 : 1,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
          WebkitTransition: '-webkit-transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
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
              height: '56px',
              minHeight: '56px',
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
                        {item.hasBadge && unreadCount > 0 && (
                          <span 
                            className={cn(
                              "absolute -top-1 -right-1",
                              "bg-primary text-primary-foreground",
                              "text-[10px] font-semibold leading-none",
                              "rounded-full min-w-[18px] h-[18px]",
                              "flex items-center justify-center px-1"
                            )}
                          >
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
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
            {maAccounts.map((account) => {
              const displayName = account.profile?.displayName ?? "Аккаунт";
              const username = account.profile?.username ?? "user";
              const avatar = account.profile?.avatarUrl ?? "https://i.pravatar.cc/150?img=32";
              const isActive = activeAccountId === account.accountId;
              return (
              <button
                key={account.accountId}
                onClick={() => handleSwitchAccount(account.accountId)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                  isActive 
                    ? "bg-primary/10" 
                    : "hover:bg-muted"
                )}
              >
                <img
                  src={avatar}
                  alt={displayName}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">{username}</p>
                  <p className="text-sm text-muted-foreground">{displayName}</p>
                </div>
                {isActive && (
                  <Check className="w-5 h-5 text-primary" />
                )}
              </button>
              );
            })}
            
            {/* Add Account Button */}
            <button
              onClick={handleAddAccount}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Plus className="w-6 h-6 text-foreground" />
              </div>
              <p className="font-medium text-foreground">Добавить аккаунт</p>
            </button>
          </div>
          
          {/* Safe area padding */}
          <div className="h-6" />
        </DrawerContent>
      </Drawer>
    </>
  );
});

BottomNav.displayName = "BottomNav";
