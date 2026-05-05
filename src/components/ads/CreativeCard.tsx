/**
 * CreativeCard — карточка креатива в списке кампании.
 *
 * Функции:
 * - Превью (иконка + заголовок)
 * - Статус модерации
 * - Действия: edit, delete, preview, submit for review
 */

import { MoreVertical, Edit, Trash2, Eye, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CreativeStatusBadge } from "./CreativeStatusBadge";
import { CreativePreview } from "./CreativePreview";
import type { AdCreative } from "@/lib/ads/types";

interface CreativeCardProps {
  creative: AdCreative;
  onEdit: (creative: AdCreative) => void;
  onDelete: (id: string) => void;
  onPreview: (creative: AdCreative) => void;
  onSubmitReview?: (creative: AdCreative) => void;
}

export function CreativeCard({
  creative,
  onEdit,
  onDelete,
  onPreview,
  onSubmitReview,
}: CreativeCardProps) {
  const canEdit = creative.status === 'draft' || creative.status === 'rejected';
  canSubmit = creative.status === 'draft' || creative.status === 'rejected';
  const canDelete = creative.status === 'draft' || creative.status === 'rejected';

  return (
    <Card className="overflow-hidden">
      {/* Preview thumbnail */}
      <div className="relative h-32 bg-muted">
        {creative.thumbnail_url ? (
          <img
            src={creative.thumbnail_url}
            alt={creative.headline}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs text-muted-foreground">
              {creative.type === 'video' ? '🎬' : creative.type === 'carousel' ? '📁' : '🖼️'}
            </span>
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-2 right-2">
          <CreativeStatusBadge status={creative.status} showIcon={false} />
        </div>

        {/* Actions dropdown */}
        <div className="absolute top-2 left-2">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              // Можно открыть меню действий
            }}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <CardContent className="p-3">
        <h4 className="font-medium text-sm line-clamp-2 mb-1">
          {creative.headline}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {creative.description || creative.call_to_action}
        </p>
      </CardContent>

      <CardFooter className="p-3 pt-0 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onPreview(creative)}
        >
          <Eye className="w-3 h-3 mr-1" />
          Превью
        </Button>

        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onEdit(creative)}
          >
            <Edit className="w-3 h-3 mr-1" />
            Редакт.
          </Button>
        )}

        {canSubmit && onSubmitReview && (
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onSubmitReview(creative)}
          >
            <Send className="w-3 h-3 mr-1" />
            На проверку
          </Button>
        )}

        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            className="px-2"
            onClick={() => onDelete(creative.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
