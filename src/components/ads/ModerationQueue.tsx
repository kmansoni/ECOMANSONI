/**
 * ModerationQueue — очередь креативов на модерацию.
 *
 * Показывает список креативов со статусом pending_review.
 * Действия: approve, reject (с причиной), view details.
 */

import { useState } from "react";
import { CheckCircle, XCircle, Eye, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CreativeStatusBadge } from "./CreativeStatusBadge";
import { CreativePreview } from "./CreativePreview";
import { useAdCreatives } from "@/hooks/useAdCreatives";
import { toast } from "sonner";
import type { AdCreative } from "@/lib/ads/types";

interface ModerationQueueProps {
  campaignId?: string; // если передано — фильтруем по кампании, иначе все pending
}

export function ModerationQueue({ campaignId }: ModerationQueueProps) {
  const { creatives, updateCreative } = useAdCreatives(campaignId || '');
  const [selectedCreative, setSelectedCreative] = useState<AdCreative | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Фильтруем только pending_review
  const pendingCreatives = creatives.filter(c => c.status === 'pending_review');

  const handleApprove = async (creative: AdCreative) => {
    setProcessing(true);
    try {
      await updateCreative(creative.id, { status: 'approved' });
      toast.success('Креатив одобрен');
    } catch {
      toast.error('Не удалось одобрить');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCreative) return;
    setProcessing(true);
    try {
      await updateCreative(selectedCreative.id, {
        status: 'rejected',
        moderation_reason: rejectReason || 'Не соответствует правилам',
      });
      toast.success('Креатив отклонён');
      setShowRejectDialog(false);
      setRejectReason('');
      setSelectedCreative(null);
    } catch {
      toast.error('Не удалось отклонить');
    } finally {
      setProcessing(false);
    }
  };

  if (pendingCreatives.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Очередь модерации
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Нет креативов, ожидающих проверки.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Очередь модерации ({pendingCreatives.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Креатив</TableHead>
                <TableHead>Кампания</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingCreatives.map((creative) => (
                <TableRow key={creative.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={creative.thumbnail_url || creative.media_url}
                        alt=""
                        className="w-12 h-12 object-cover rounded"
                      />
                      <div>
                        <p className="font-medium line-clamp-1">{creative.headline}</p>
                        <p className="text-xs text-muted-foreground">{creative.type}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{creative.campaign_id.slice(0, 8)}...</Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(creative.created_at).toLocaleDateString('ru-RU')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedCreative(creative)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="icon"
                        onClick={() => handleApprove(creative)}
                        disabled={processing}
                      >
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => {
                          setSelectedCreative(creative);
                          setShowRejectDialog(true);
                        }}
                        disabled={processing}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!selectedCreative} onOpenChange={(open) => !open && setSelectedCreative(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Просмотр креатива</DialogTitle>
            <DialogDescription>
              Проверьте креатив перед принятием решения
            </DialogDescription>
          </DialogHeader>
          {selectedCreative && (
            <div className="space-y-4">
              <CreativePreview creative={selectedCreative} format="feed" />
              <div className="text-sm space-y-1">
                <p><strong>CTA:</strong> {selectedCreative.call_to_action}</p>
                <p><strong>URL:</strong> {selectedCreative.destination_url}</p>
                <p><strong>Создан:</strong> {new Date(selectedCreative.created_at).toLocaleString('ru-RU')}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить креатив</DialogTitle>
            <DialogDescription>
              Укажите причину отклонения (необязательно)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Например: не соответствует политике, низкое качество изображения..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              Отклонить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
