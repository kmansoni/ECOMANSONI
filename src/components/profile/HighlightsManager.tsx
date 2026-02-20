import { useState } from "react";
import { Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHighlights, StoryHighlight } from "@/hooks/useHighlights";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

interface HighlightsManagerProps {
  userId: string;
  isOwnProfile: boolean;
}

export function HighlightsManager({ userId, isOwnProfile }: HighlightsManagerProps) {
  const { highlights, loading, createHighlight, updateHighlight, deleteHighlight } = useHighlights(userId);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<StoryHighlight | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [newPrivacy, setNewPrivacy] = useState<"public" | "followers" | "private">("public");

  const handleCreate = async () => {
    if (!newTitle.trim() || !newCoverUrl.trim()) {
      toast.error("Заполните все поля");
      return;
    }

    try {
      await createHighlight(newTitle, newCoverUrl, newPrivacy);
      toast.success("Актуальное создано");
      setShowCreateDialog(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error("Не удалось создать актуальное");
    }
  };

  const handleUpdate = async () => {
    if (!editingHighlight) return;

    try {
      await updateHighlight(editingHighlight.id, {
        title: newTitle,
        cover_url: newCoverUrl,
        privacy_level: newPrivacy
      });
      toast.success("Актуальное обновлено");
      setEditingHighlight(null);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error("Не удалось обновить актуальное");
    }
  };

  const handleDelete = async (highlightId: string) => {
    if (!confirm("Удалить это актуальное?")) return;

    try {
      await deleteHighlight(highlightId);
      toast.success("Актуальное удалено");
    } catch (error) {
      console.error(error);
      toast.error("Не удалось удалить актуальное");
    }
  };

  const handleToggleVisibility = async (highlight: StoryHighlight) => {
    try {
      await updateHighlight(highlight.id, {
        is_visible: !highlight.is_visible
      });
      toast.success(highlight.is_visible ? "Актуальное скрыто" : "Актуальное показано");
    } catch (error) {
      console.error(error);
      toast.error("Не удалось изменить видимость");
    }
  };

  const openEditDialog = (highlight: StoryHighlight) => {
    setEditingHighlight(highlight);
    setNewTitle(highlight.title);
    setNewCoverUrl(highlight.cover_url);
    setNewPrivacy(highlight.privacy_level);
  };

  const resetForm = () => {
    setNewTitle("");
    setNewCoverUrl("");
    setNewPrivacy("public");
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingHighlight(null);
    resetForm();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      {isOwnProfile && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Актуальное</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Создать
          </Button>
        </div>
      )}

      {/* Список highlights */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {highlights.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {isOwnProfile ? "У вас пока нет актуального" : "Пока нет актуального"}
          </p>
        ) : (
          highlights.map((highlight) => (
            <div key={highlight.id} className="flex flex-col items-center gap-2 min-w-[80px]">
              <div className="relative group">
                <Avatar className="w-16 h-16 ring-2 ring-primary cursor-pointer">
                  <AvatarImage src={highlight.cover_url} />
                  <AvatarFallback>{highlight.title[0]}</AvatarFallback>
                </Avatar>

                {/* Действия при наведении (только для своего профиля) */}
                {isOwnProfile && (
                  <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                      onClick={() => openEditDialog(highlight)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    >
                      <Edit className="w-3 h-3 text-white" />
                    </button>
                    <button
                      onClick={() => handleToggleVisibility(highlight)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    >
                      {highlight.is_visible ? (
                        <Eye className="w-3 h-3 text-white" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-white" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(highlight.id)}
                      className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-center truncate max-w-[80px]">
                {highlight.title}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Диалог создания/редактирования */}
      <Dialog open={showCreateDialog || editingHighlight !== null} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingHighlight ? "Редактировать актуальное" : "Создать актуальное"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Название</Label>
              <Input
                id="title"
                placeholder="Путешествия, Работа, Хобби..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="cover">URL обложки</Label>
              <Input
                id="cover"
                placeholder="https://..."
                value={newCoverUrl}
                onChange={(e) => setNewCoverUrl(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="privacy">Приватность</Label>
              <Select value={newPrivacy} onValueChange={(v: any) => setNewPrivacy(v)}>
                <SelectTrigger id="privacy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Публичное</SelectItem>
                  <SelectItem value="followers">Только подписчики</SelectItem>
                  <SelectItem value="private">Только я</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={closeDialog} className="flex-1">
                Отмена
              </Button>
              <Button
                onClick={editingHighlight ? handleUpdate : handleCreate}
                className="flex-1"
              >
                {editingHighlight ? "Сохранить" : "Создать"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
