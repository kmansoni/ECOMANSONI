import { useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";
import { Plus } from "lucide-react";
import { CreateMenu } from "@/components/feed/CreateMenu";
import { useNavigate } from "react-router-dom";

export function AppLayout() {
  usePresence();

  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { shouldHideBottomNav, isCreatingContent } = useChatOpen();
  const isReelsPage = location.pathname === "/reels";
  const [createOpen, setCreateOpen] = useState(false);

  const showGlobalCreate =
    !isCreatingContent &&
    location.pathname !== "/" &&
    location.pathname !== "/create" &&
    location.pathname !== "/reels";

  return (
    <div 
      className={cn(
        "h-full flex flex-col safe-area-top safe-area-left safe-area-right relative bg-transparent"
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
            "flex-1 overflow-x-hidden max-w-lg mx-auto w-full native-scroll relative z-10",
            isReelsPage ? "overflow-hidden" : "overflow-y-auto",
            !isReelsPage && "pb-20"
          )}
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            isolation: 'isolate',
          }}
        >
          <Outlet />
        </main>
      </ScrollContainerProvider>

      {showGlobalCreate && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={cn(
            "fixed z-40",
            "top-3 right-3",
            "safe-area-top safe-area-right",
            "w-11 h-11 rounded-full",
            "bg-card/80 backdrop-blur border border-border",
            "flex items-center justify-center",
            "hover:bg-card active:bg-card/90",
          )}
          aria-label="Создать"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      <CreateMenu
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSelect={(type) => {
          navigate(`/create?tab=${encodeURIComponent(type)}&auto=1`);
        }}
      />

      <BottomNav hidden={shouldHideBottomNav} />
      {/* Call UI is now handled globally by GlobalCallOverlay in App.tsx */}
    </div>
  );
}
