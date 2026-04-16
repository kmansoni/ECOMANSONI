import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { GripVertical, Check, X, Loader2, Grid3X3, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGridReorder } from '@/hooks/useGridReorder';
import type { GridPosition } from '@/hooks/useGridReorder';
import type { ProfileGridItem } from './ProfileGrid';

interface EditableProfileGridProps {
  items: ProfileGridItem[];
  userId: string;
  onReorderComplete?: () => void;
}

const wobbleAnimation = {
  animate: {
    rotate: [-0.8, 0.8, -0.8],
    transition: { repeat: Infinity, duration: 0.3 },
  },
};

function GridThumbnail({ item }: { item: ProfileGridItem }) {
  const media = item.post_media?.[0];
  const url = item.thumbnail_url ?? media?.media_url ?? '';
  const isVideo = media?.media_type === 'video';

  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-800">
        <Grid3X3 className="w-5 h-5 text-white/40" />
      </div>
    );
  }

  return (
    <>
      <img loading="lazy" src={url}
        alt=""
        
        className="w-full h-full object-cover"
      />
      {isVideo && (
        <div className="absolute top-1 right-1">
          <Play className="w-3 h-3 text-white fill-white drop-shadow-lg" />
        </div>
      )}
    </>
  );
}

export function EditableProfileGrid({ items, userId, onReorderComplete }: EditableProfileGridProps) {
  const { isEditing, startEditing, stopEditing, reorder, loading } = useGridReorder(userId);
  const [orderedItems, setOrderedItems] = useState<ProfileGridItem[]>([]);

  const handleStartEditing = useCallback(() => {
    setOrderedItems([...items]);
    startEditing();
  }, [items, startEditing]);

  const handleSave = useCallback(async () => {
    const positions: GridPosition[] = orderedItems.map((item, index) => ({
      post_id: item.id ?? '',
      sort_order: index,
    })).filter((p) => p.post_id);

    await reorder(positions);
    onReorderComplete?.();
  }, [orderedItems, reorder, onReorderComplete]);

  const handleCancel = useCallback(() => {
    setOrderedItems([]);
    stopEditing();
  }, [stopEditing]);

  const itemIds = useMemo(
    () => orderedItems.map((item) => item.id ?? ''),
    [orderedItems]
  );

  if (!isEditing) {
    return (
      <div className="flex justify-center py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleStartEditing}
          className="min-h-[44px]"
          aria-label="Редактировать порядок постов"
        >
          <GripVertical className="w-4 h-4 mr-2" />
          Редактировать сетку
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Панель управления */}
      <div className="flex items-center justify-between px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={loading}
          className="min-h-[44px]"
          aria-label="Отменить редактирование"
        >
          <X className="w-4 h-4 mr-1" />
          Отмена
        </Button>
        <span className="text-sm text-muted-foreground">Перетащите для перестановки</span>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={loading}
          className="min-h-[44px]"
          aria-label="Сохранить порядок"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-1" />
          )}
          Готово
        </Button>
      </div>

      {/* Reorder grid */}
      <Reorder.Group
        axis="y"
        values={itemIds}
        onReorder={(newIds: string[]) => {
          const idToItem = new Map(orderedItems.map((item) => [item.id ?? '', item]));
          setOrderedItems(newIds.map((id) => idToItem.get(id)).filter(Boolean) as ProfileGridItem[]);
        }}
        className="grid grid-cols-3 gap-[2px]"
      >
        <AnimatePresence>
          {orderedItems.map((item) => {
            const key = item.id ?? '';
            return (
              <Reorder.Item
                key={key}
                value={key}
                className="relative aspect-square overflow-hidden bg-muted cursor-grab active:cursor-grabbing"
                whileDrag={{ scale: 1.05, zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.3)' }}
                {...wobbleAnimation}
              >
                <GridThumbnail item={item} />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                  <GripVertical className="w-6 h-6 text-white drop-shadow-lg" />
                </div>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>
    </div>
  );
}
