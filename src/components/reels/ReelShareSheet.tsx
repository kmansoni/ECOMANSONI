import { useState, useEffect } from "react";
import { Search, Loader2, Send, Users, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useConversations } from "@/hooks/useChat";
import { useGroupChats } from "@/hooks/useGroupChats";
import { useChannels } from "@/hooks/useChannels";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface ReelShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  reelId: string;
}

interface ShareTarget {
  id: string;
  type: "dm" | "group" | "channel";
  name: string;
  avatar?: string;
}

export function ReelShareSheet({
  isOpen,
  onClose,
  reelId,
}: ReelShareSheetProps) {
  const { user } = useAuth();
  const { conversations, loading: dmsLoading } = useConversations();
  const { groups, loading: groupsLoading } = useGroupChats();
  const { channels, loading: channelsLoading } = useChannels();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // Reset selection when sheet opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedTargets(new Set());
      setSearchQuery("");
    }
  }, [isOpen]);

  const loading = dmsLoading || groupsLoading || channelsLoading;

  // Build unified list of share targets
  const targets: ShareTarget[] = [];

  // Add DM conversations
  conversations.forEach((conv) => {
    const other = conv.participants.find((p) => p.user_id !== user?.id);
    if (other?.profile) {
      targets.push({
        id: `dm:${conv.id}`,
        type: "dm",
        name: other.profile.display_name || "Пользователь",
        avatar: other.profile.avatar_url || undefined,
      });
    }
  });

  // Add groups
  groups.forEach((group) => {
    targets.push({
      id: `group:${group.id}`,
      type: "group",
      name: group.name,
      avatar: group.avatar_url || undefined,
    });
  });

  // Add channels where user can post
  channels.forEach((channel) => {
    if (channel.owner_id === user?.id) {
      targets.push({
        id: `channel:${channel.id}`,
        type: "channel",
        name: channel.name,
        avatar: channel.avatar_url || undefined,
      });
    }
  });

  // Filter by search
  const filteredTargets = targets.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleTarget = (id: string) => {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleShare = async () => {
    if (selectedTargets.size === 0 || !user) return;
    
    setSending(true);
    
    try {
      const promises: Promise<void>[] = [];

      for (const targetId of selectedTargets) {
        const [type, id] = targetId.split(":");
        
        if (type === "dm") {
          // Send to DM conversation with shared reel
          const sendDm = async () => {
            const clientMsgId = crypto.randomUUID();
            const { error } = await supabase
              .from("messages")
              .upsert(
                {
                  conversation_id: id,
                  sender_id: user.id,
                  content: "🎬 Поделился Reels",
                  shared_reel_id: reelId,
                  client_msg_id: clientMsgId,
                },
                {
                  onConflict: "conversation_id,sender_id,client_msg_id",
                  ignoreDuplicates: true,
                }
              );
            if (error) throw error;

            try {
              await (supabase as any).from("reel_shares").insert({
                reel_id: reelId,
                user_id: user.id,
                target_type: "dm",
                target_id: id,
              });
            } catch {
              // ignore share analytics errors
            }
          };
          promises.push(sendDm());
        } else if (type === "group") {
          // Send to group chat with shared reel
          const sendGroup = async () => {
            const { error } = await supabase.from("group_chat_messages").insert({
              group_id: id,
              sender_id: user.id,
              content: "🎬 Поделился Reels",
              shared_reel_id: reelId,
            });
            if (error) throw error;
            await supabase
              .from("group_chats")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", id);

            try {
              await (supabase as any).from("reel_shares").insert({
                reel_id: reelId,
                user_id: user.id,
                target_type: "group",
                target_id: id,
              });
            } catch {
              // ignore share analytics errors
            }
          };
          promises.push(sendGroup());
        } else if (type === "channel") {
          // Send to channel with shared reel
          const sendChannel = async () => {
            const { error } = await supabase.from("channel_messages").insert({
              channel_id: id,
              sender_id: user.id,
              content: "🎬 Поделился Reels",
              shared_reel_id: reelId,
            });
            if (error) throw error;
            await supabase
              .from("channels")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", id);

            try {
              await (supabase as any).from("reel_shares").insert({
                reel_id: reelId,
                user_id: user.id,
                target_type: "channel",
                target_id: id,
              });
            } catch {
              // ignore share analytics errors
            }
          };
          promises.push(sendChannel());
        }
      }

      await Promise.all(promises);
      
      toast.success(`Reel отправлен в ${selectedTargets.size} чат${selectedTargets.size > 1 ? "ов" : ""}`);
      
      onClose();
    } catch (err) {
      console.error("Failed to share reel:", err);
      toast.error("Не удалось поделиться Reels");
    } finally {
      setSending(false);
    }
  };

  const getIcon = (type: ShareTarget["type"]) => {
    switch (type) {
      case "group":
        return <Users className="w-4 h-4 text-muted-foreground" />;
      case "channel":
        return <Radio className="w-4 h-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="h-[70dvh] max-h-[70dvh] mt-0 flex flex-col">
        <DrawerHeader className="border-b border-border pb-3 flex-shrink-0">
          <DrawerTitle className="text-center">Поделиться Reels</DrawerTitle>
        </DrawerHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted border-0 rounded-lg"
            />
          </div>
        </div>

        {/* Targets List */}
        <div className="flex-1 overflow-y-auto native-scroll">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTargets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-base">Нет доступных чатов</p>
              <p className="text-sm mt-1">Начните переписку, чтобы делиться</p>
            </div>
          ) : (
            <div className="py-2">
              {filteredTargets.map((target) => {
                const isSelected = selectedTargets.has(target.id);
                return (
                  <button
                    key={target.id}
                    onClick={() => toggleTarget(target.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={target.avatar} />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {target.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{target.name}</span>
                        {getIcon(target.type)}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Send Button */}
        {selectedTargets.size > 0 && (
          <div className="p-4 border-t border-border safe-area-bottom">
            <Button
              onClick={handleShare}
              disabled={sending}
              className="w-full h-12 text-base font-semibold"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Send className="w-5 h-5 mr-2" />
              )}
              Отправить ({selectedTargets.size})
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
