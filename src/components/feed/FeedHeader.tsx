import { useState, useMemo } from "react";
import { Plus, Loader2, User } from "lucide-react";
import { useScrollCollapse } from "@/hooks/useScrollCollapse";
import { ServicesMenu } from "@/components/layout/ServicesMenu";
import { cn } from "@/lib/utils";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { StoryViewer } from "./StoryViewer";
import { useStories, type UserWithStories } from "@/hooks/useStories";

// Animation constants - moved outside for performance
const EXPANDED_AVATAR_SIZE = 64;
const COLLAPSED_AVATAR_SIZE = 32;
const EXPANDED_GAP = 16;
const COLLAPSED_OVERLAP = 10;
const MAX_VISIBLE_IN_STACK = 4;
const EXPANDED_ROW_HEIGHT = 88;
const HEADER_HEIGHT = 52;
const PADDING_LEFT = 16;
const MENU_BUTTON_WIDTH = 40;
const COLLAPSED_START_X = PADDING_LEFT + MENU_BUTTON_WIDTH + 8;

// Precomputed values for animation
const SIZE_DIFF = EXPANDED_AVATAR_SIZE - COLLAPSED_AVATAR_SIZE;
const COLLAPSED_Y = (HEADER_HEIGHT - COLLAPSED_AVATAR_SIZE) / 2;
const Y_DIFF = COLLAPSED_Y - HEADER_HEIGHT;

export function FeedHeader() {
  const { collapseProgress } = useScrollCollapse(100);
  const scrollContainerRef = useScrollContainer();
  const { usersWithStories, loading } = useStories();
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);

  // Handle story click - either scroll to top or open viewer
  const handleStoryClick = (index: number, user: UserWithStories) => {
    if (collapseProgress > 0.1 && scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else if (user.stories.length > 0) {
      setSelectedStoryIndex(index);
      setStoryViewerOpen(true);
    }
  };

  // Memoize story styles calculation - only recalculate when users or progress changes
  const storyStyles = useMemo(() => {
    return usersWithStories.map((_, index) => {
      const progress = collapseProgress;
      
      // Use scale instead of width/height for GPU acceleration
      const scale = 1 - ((SIZE_DIFF / EXPANDED_AVATAR_SIZE) * progress);
      
      // Expanded X position
      const expandedX = PADDING_LEFT + index * (EXPANDED_AVATAR_SIZE + EXPANDED_GAP);
      
      // Collapsed X position
      const isInStack = index < MAX_VISIBLE_IN_STACK;
      const collapsedX = isInStack
        ? COLLAPSED_START_X + index * COLLAPSED_OVERLAP
        : COLLAPSED_START_X + (MAX_VISIBLE_IN_STACK - 1) * COLLAPSED_OVERLAP;
      
      // Interpolate positions
      const x = expandedX + (collapsedX - expandedX) * progress;
      const y = HEADER_HEIGHT + Y_DIFF * progress;
      
      // Opacity for items outside stack
      const opacity = isInStack ? 1 : Math.max(0, 1 - progress * 2);
      
      // Z-index
      const zIndex = isInStack ? MAX_VISIBLE_IN_STACK - index + 10 : 1;
      
      // Name visibility
      const nameOpacity = Math.max(0, 1 - progress * 1.5);

      return { scale, x, y, opacity, zIndex, nameOpacity, isInStack };
    });
  }, [usersWithStories, collapseProgress]);

  // Container height
  const containerHeight = HEADER_HEIGHT + EXPANDED_ROW_HEIGHT * (1 - collapseProgress);

  return (
    <div 
      className="sticky top-0 z-30 bg-card/70 backdrop-blur-md overflow-hidden will-change-auto border-b border-border/40"
      style={{ height: `${containerHeight}px` }}
    >
      {/* Header row with menu */}
      <div 
        className="absolute top-0 left-0 right-0 flex items-center px-4"
        style={{ height: `${HEADER_HEIGHT}px` }}
      >
        <ServicesMenu />
      </div>

      {/* Loading state */}
      {loading && usersWithStories.length === 0 && (
        <div 
          className="absolute flex items-center justify-center"
          style={{ 
            left: PADDING_LEFT, 
            top: HEADER_HEIGHT,
            height: EXPANDED_AVATAR_SIZE 
          }}
        >
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Stories - GPU-accelerated transforms */}
      {usersWithStories.map((user, index) => {
        const styles = storyStyles[index];
        if (!styles) return null;
        
        const hasStories = user.stories.length > 0;
        const showPlusIcon = user.isOwn && !hasStories && collapseProgress < 0.5;

        return (
          <button
            key={user.user_id}
            onClick={() => handleStoryClick(index, user)}
            className="story-avatar-btn absolute flex flex-col items-center cursor-pointer"
            style={{
              left: 0,
              top: 0,
              transform: `translate3d(${styles.x}px, ${styles.y}px, 0)`,
              opacity: styles.opacity,
              zIndex: styles.zIndex,
              pointerEvents: styles.opacity < 0.3 ? 'none' : 'auto',
            }}
          >
            {/* Avatar with border - using transform scale for GPU */}
            <div
              className={cn(
                "story-avatar rounded-full flex-shrink-0 relative",
                user.isOwn && !hasStories
                  ? "p-0.5 bg-muted"
                  : user.hasNew
                    ? "p-[2.5px] bg-gradient-to-tr from-primary via-accent to-primary"
                    : hasStories
                      ? "p-0.5 bg-muted-foreground/30"
                      : "p-0.5 bg-muted"
              )}
              style={{
                width: `${EXPANDED_AVATAR_SIZE}px`,
                height: `${EXPANDED_AVATAR_SIZE}px`,
                transform: `scale(${styles.scale})`,
                transformOrigin: 'top left',
              }}
            >
              <div className="w-full h-full rounded-full bg-background p-[2px]">
                <div className="w-full h-full rounded-full overflow-hidden bg-muted flex items-center justify-center">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.display_name || ''}
                      className="w-full h-full object-cover rounded-full"
                      loading="lazy"
                    />
                  ) : (
                    <User className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
              </div>
              {/* Plus icon - use CSS class for transition */}
              {showPlusIcon && (
                <div 
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center story-avatar"
                  style={{ 
                    opacity: collapseProgress < 0.5 ? 1 : 0,
                  }}
                >
                  <Plus className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </div>

            {/* Name - CSS handles transition */}
            <span
              className="story-name text-xs text-foreground font-medium max-w-16 truncate overflow-hidden"
              style={{
                opacity: styles.nameOpacity,
                height: styles.nameOpacity > 0.1 ? '20px' : '0px',
                marginTop: styles.nameOpacity > 0.1 ? '4px' : '0px',
              }}
            >
              {user.isOwn ? 'Вы' : user.display_name}
            </span>
          </button>
        );
      })}

      {/* Story Viewer */}
      <StoryViewer
        usersWithStories={usersWithStories}
        initialUserIndex={selectedStoryIndex}
        isOpen={storyViewerOpen}
        onClose={() => setStoryViewerOpen(false)}
      />
    </div>
  );
}
