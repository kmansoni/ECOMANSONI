import { useState } from "react";
import { Users, Megaphone, Camera } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateChannel } from "@/hooks/useChannels";
import { useCreateGroup } from "@/hooks/useGroupChats";
import { toast } from "sonner";

interface CreateChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChannelCreated?: (channelId: string) => void;
  onGroupCreated?: (groupId: string) => void;
}

type CreateMode = "select" | "channel" | "group";

export function CreateChatSheet({ open, onOpenChange, onChannelCreated, onGroupCreated }: CreateChatSheetProps) {
  const [mode, setMode] = useState<CreateMode>("select");
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  
  const { createChannel } = useCreateChannel();
  const { createGroup } = useCreateGroup();

  const handleClose = () => {
    setMode("select");
    setChannelName("");
    setChannelDescription("");
    setGroupName("");
    onOpenChange(false);
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      toast.error("Введите название канала");
      return;
    }

    setLoading(true);
    try {
      const channelId = await createChannel(channelName.trim(), channelDescription.trim());
      if (channelId) {
        toast.success("Канал создан!");
        onChannelCreated?.(channelId);
        handleClose();
      } else {
        toast.error("Не удалось создать канал");
      }
    } catch (error) {
      toast.error("Ошибка при создании канала");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error("Введите название группы");
      return;
    }

    setLoading(true);
    try {
      const groupId = await createGroup(groupName.trim());
      if (groupId) {
        toast.success("Группа создана!");
        onGroupCreated?.(groupId);
        handleClose();
      } else {
        toast.error("Не удалось создать группу");
      }
    } catch (error) {
      toast.error("Ошибка при создании группы");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent 
        side="top" 
        className="rounded-b-3xl border-b border-border shadow-lg p-0 bg-card"
        hideCloseButton
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
        
        <div className="px-6 pb-6">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-foreground flex items-center">
              {mode === "select" && "Создать"}
              {mode === "channel" && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setMode("select")} className="text-muted-foreground hover:text-foreground">
                    ←
                  </button>
                  Новый канал
                </div>
              )}
              {mode === "group" && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setMode("select")} className="text-muted-foreground hover:text-foreground">
                    ←
                  </button>
                  Новая группа
                </div>
              )}
            </SheetTitle>
          </SheetHeader>

          {mode === "select" && (
            <div className="space-y-1">
              <button
                onClick={() => setMode("channel")}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-muted transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-foreground">Новый канал</div>
                  <div className="text-sm text-muted-foreground">Создайте канал для публикаций</div>
                </div>
              </button>
              
              <button
                onClick={() => setMode("group")}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-muted transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="font-medium text-foreground">Новая группа</div>
                  <div className="text-sm text-muted-foreground">Создайте групповой чат</div>
                </div>
              </button>
            </div>
          )}

          {mode === "channel" && (
            <div className="space-y-4">
              {/* Avatar placeholder */}
              <div className="flex justify-center">
                <button className="w-20 h-20 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Camera className="w-8 h-8 text-muted-foreground" />
                </button>
              </div>
              
              <div className="space-y-3">
                <Input
                  placeholder="Название канала"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="h-12 rounded-xl"
                />
                <Textarea
                  placeholder="Описание (необязательно)"
                  value={channelDescription}
                  onChange={(e) => setChannelDescription(e.target.value)}
                  className="rounded-xl resize-none"
                  rows={3}
                />
              </div>
              
              <Button 
                onClick={handleCreateChannel}
                disabled={loading || !channelName.trim()}
                className="w-full h-12 rounded-xl"
              >
                {loading ? "Создание..." : "Создать канал"}
              </Button>
            </div>
          )}

          {mode === "group" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <button className="w-20 h-20 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Camera className="w-8 h-8 text-muted-foreground" />
                </button>
              </div>
              
              <div className="space-y-3">
                <Input
                  placeholder="Название группы"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="h-12 rounded-xl"
                />
                <p className="text-center text-muted-foreground text-sm">
                  После создания вы сможете добавить участников
                </p>
              </div>
              
              <Button 
                onClick={handleCreateGroup}
                disabled={loading || !groupName.trim()}
                className="w-full h-12 rounded-xl"
              >
                {loading ? "Создание..." : "Создать группу"}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
