import { useRef, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { DesktopLayout } from "./DesktopLayout";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";
import { useIsMobile } from "@/hooks/use-mobile";
import { CreateContentModal } from "@/components/feed/CreateContentModal";
import { toast } from "sonner";
import type { ContentType } from "@/hooks/useMediaEditor";

const BOTTOM_NAV_BAR_HEIGHT_PX = 56;
const BOTTOM_NAV_OUTER_GAP_PX = 8;

export function AppLayout() {
  const isMobile = useIsMobile();

  // Desktop: use sidebar layout
  if (!isMobile) {
    return <DesktopLayout />;
  }

  // Mobile: original layout
  return <MobileLayout />;
}

function MobileLayout() {
  usePresence();

  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const { shouldHideBottomNav, setIsCreatingContent } = useChatOpen();
  const isFullWidthPage =
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/user/") ||
    location.pathname.startsWith("/contact/");

  // Hide bottom nav on creation pages
  const isCreationPage =
    location.pathname.startsWith("/create") ||
    location.pathname.startsWith("/create-surface");

  const [createOpen, setCreateOpen] = useState(false);

  // Sync createOpen state with context
  useEffect(() => {
    setIsCreatingContent(createOpen);
  }, [createOpen, setIsCreatingContent]);

  // Also hide when on creation pages
  const shouldHideMobile = shouldHideBottomNav || isCreationPage;

  return (
    <div
      className={cn(
        "AppShell h-full flex flex-col safe-area-left safe-area-right relative bg-transparent"
      )}
      style={{
        position: 'relative',
        overflow: 'hidden',
      }}
    >

      <ScrollContainerProvider value={mainRef}>
        <main
          ref={mainRef}
          className={cn(
            "flex-1 overflow-x-hidden w-full native-scroll relative z-10",
            isFullWidthPage ? "max-w-none" : "max-w-lg mx-auto",
            "overflow-y-auto"
          )}
          style={{
            WebkitOverflowScrolling: 'touch' as const,
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            isolation: 'isolate',
            paddingBottom: `calc(${BOTTOM_NAV_BAR_HEIGHT_PX + BOTTOM_NAV_OUTER_GAP_PX}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <Outlet />
        </main>
      </ScrollContainerProvider>

      <CreateContentModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(contentType: ContentType) => {
          toast.success('Контент готов к публикации');
          setCreateOpen(false);
        }}
      />

      <BottomNav
        hidden={shouldHideMobile}
        disableHideAnimation={false}
      />
      {/* Call UI is now handled globally by GlobalCallOverlay in App.tsx */}
    </div>
  );
}
