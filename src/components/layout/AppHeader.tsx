import { useState } from "react";
import { Bell } from "lucide-react";
import { ServicesMenu } from "./ServicesMenu";
import { Button } from "@/components/ui/button";
import { NotificationsDrawer } from "@/components/notifications/NotificationsDrawer";
import { useNotifications } from "@/hooks/useNotifications";

interface AppHeaderProps {
  title?: string;
  showLogo?: boolean;
}

export function AppHeader({ title, showLogo = true }: AppHeaderProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <>
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between h-12 px-4 max-w-lg mx-auto">
          <div className="w-10" />
          <ServicesMenu />
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setNotificationsOpen(true)}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </div>
      </header>
      <NotificationsDrawer
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      />
    </>
  );
}
