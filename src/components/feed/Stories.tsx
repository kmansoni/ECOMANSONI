import { useState, useRef } from "react";
import { Plus, Loader2 } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useScrollCollapse } from "@/hooks/useScrollCollapse";
import { useStories, type UserWithStories } from "@/hooks/useStories";
import { StoryViewer } from "./StoryViewer";

interface StoriesProps {
  onOpenStory?: (userIndex: number) => void;
}

export function Stories({ onOpenStory }: StoriesProps) {
  const { collapseProgress } = useScrollCollapse(100);
  const { usersWithStories, loading, uploadStory } = useStories();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Telegram-style: stack to the left
  const maxVisibleInStack = 4;
  const stackOverlap = 16;
  const expandedAvatarSize = 64;
  const collapsedAvatarSize = 44;
  const expandedGap = 16;
  const expandedItemWidth = expandedAvatarSize + expandedGap;

  // Calculate current avatar size
  const avatarSize = expandedAvatarSize - (collapseProgress * (expandedAvatarSize - collapsedAvatarSize));
  
  // Name opacity fades out
  const nameOpacity = 1 - collapseProgress;
  const nameHeight = 20 * (1 - collapseProgress);

  // Calculate position for each story
  const getStoryStyle = (index: number) => {
    const originalX = index * expandedItemWidth;
    const isInStack = index < maxVisibleInStack;
    const targetX = isInStack ? index * stackOverlap : (maxVisibleInStack - 1) * stackOverlap;
    const currentX = originalX - (collapseProgress * (originalX - targetX));
    const zIndex = usersWithStories.length - index;
    const isHidden = !isInStack && collapseProgress > 0.5;
    const hiddenProgress = Math.max(0, (collapseProgress - 0.5) * 2);
    const itemOpacity = isInStack ? 1 : 1 - hiddenProgress;
    const itemScale = isInStack ? 1 : 1 - (hiddenProgress * 0.3);

    return {
      transform: `translateX(${currentX - (index * expandedItemWidth)}px) scale(${itemScale})`,
      zIndex,
      opacity: itemOpacity,
    };
  };

  const handleStoryClick = (index: number, user: UserWithStories) => {
    if (user.isOwn && user.stories.length === 0) {
      // Open file picker to add story
      fileInputRef.current?.click();
    } else if (user.stories.length > 0) {
      setSelectedUserIndex(index);
      setViewerOpen(true);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadStory(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading && usersWithStories.length === 0) {
    return (
      <div className="sticky top-0 z-30 bg-card/65 backdrop-blur-xl py-4 flex items-center justify-center border-b border-border/40">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      
      <div 
        className="sticky top-0 z-30 bg-card/65 backdrop-blur-xl transition-all duration-150 border-b border-border/40"
        style={{ 
          paddingTop: `${12 - collapseProgress * 4}px`,
          paddingBottom: `${12 - collapseProgress * 8}px`,
        }}
      >
        <ScrollArea className="w-full">
          <div 
            className="flex px-4 transition-all duration-150"
            style={{ gap: `${expandedGap}px` }}
          >
            {usersWithStories.map((user, index) => {
              const storyStyle = getStoryStyle(index);
              const hasStories = user.stories.length > 0;
              
              return (
                <div 
                  key={user.user_id} 
                  className="flex flex-col items-center flex-shrink-0 transition-all duration-200 ease-out cursor-pointer"
                  style={{
                    ...storyStyle,
                    pointerEvents: storyStyle.opacity < 0.3 ? 'none' : 'auto',
                  }}
                  onClick={() => handleStoryClick(index, user)}
                >
                  <div
                    className={`relative rounded-full transition-all duration-200 ${
                      user.hasNew
                        ? "bg-gradient-to-tr from-primary via-accent to-primary"
                        : user.isOwn && !hasStories
                        ? ""
                        : hasStories
                        ? "bg-muted-foreground/30"
                        : "bg-muted"
                    }`}
                    style={{
                      width: `${avatarSize + 4}px`,
                      height: `${avatarSize + 4}px`,
                      padding: '2px',
                    }}
                  >
                    {user.isOwn && !hasStories ? (
                      <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
                        <div 
                          className="rounded-full bg-secondary flex items-center justify-center transition-all duration-200"
                          style={{
                            width: `${avatarSize - 4}px`,
                            height: `${avatarSize - 4}px`,
                          }}
                        >
                          <Plus 
                            className="text-primary transition-all duration-200" 
                            style={{ 
                              width: `${Math.max(avatarSize * 0.4, 14)}px`,
                              height: `${Math.max(avatarSize * 0.4, 14)}px`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-full bg-card p-0.5">
                        <img
                          src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.user_id}`}
                          alt={user.display_name || ''}
                          className="w-full h-full rounded-full object-cover"
                        />
                      </div>
                    )}
                    {user.hasNew && (
                      <div 
                        className="absolute left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-primary text-primary-foreground text-[9px] font-semibold rounded-full transition-all duration-200"
                        style={{
                          bottom: '-2px',
                          opacity: nameOpacity,
                          transform: `translateX(-50%) scale(${1 - collapseProgress * 0.5})`,
                        }}
                      >
                        NEW
                      </div>
                    )}
                  </div>
                  <span 
                    className="text-xs text-foreground font-medium max-w-16 truncate transition-all duration-200 overflow-hidden"
                    style={{
                      opacity: nameOpacity,
                      height: `${nameHeight}px`,
                      marginTop: nameOpacity > 0.1 ? '6px' : '0px',
                    }}
                  >
                    {user.isOwn ? 'Вы' : user.display_name}
                  </span>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      <StoryViewer
        usersWithStories={usersWithStories}
        initialUserIndex={selectedUserIndex}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}
