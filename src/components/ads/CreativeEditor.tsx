/**
 * CreativeEditor — форма создания/редактирования креатива.
 *
 * Поля:
 * - type (select)
 * - media_url (input + preview)
 * - headline (text)
 * - description (textarea)
 * - call_to_action (select)
 * - destination_url (input)
 * - frequency_cap (slider)
 * - priority_order (number)
 *
 * Валидация на лету через validators.ts.
 * Preview в реальном времени.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { CreativePreview } from "./CreativePreview";
import { validateCreativeInput } from "@/lib/validators";
import type { AdCreative, AdCreativeInsert } from "@/lib/ads/types";

interface CreativeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AdCreativeInsert) => Promise<void>;
  initialData?: AdCreative | null;
  submitLabel?: string;
}

export function CreativeEditor({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  submitLabel = "Сохранить",
}: CreativeEditorProps) {
  const [previewFormat, setPreviewFormat] = useState<'feed' | 'story' | 'reels'>('feed');
  const [serverError, setServerError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'image' as const,
    media_url: '',
    headline: '',
    description: '',
    call_to_action: 'learn_more' as const,
    destination_url: '',
    frequency_cap: 3,
    priority_order: 0,
  });

  // Сброс при открытии/изменении initialData
  useEffect(() => {
    if (open) {
      setFormData({
        type: initialData?.type ?? 'image',
        media_url: initialData?.media_url ?? '',
        headline: initialData?.headline ?? '',
        description: initialData?.description ?? '',
        call_to_action: initialData?.call_to_action ?? 'learn_more',
        destination_url: initialData?.destination_url ?? '',
        frequency_cap: initialData?.frequency_cap ?? 3,
        priority_order: initialData?.priority_order ?? 0,
      });
      setServerError(null);
    }
  }, [open, initialData]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    // Валидация
    const errors = validateCreativeInput(formData);
    if (errors.length > 0) {
      setServerError(errors[0]);
      return;
    }

    try {
      await onSubmit({
        ...formData,
        description: formData.description || null,
      } as AdCreativeInsert);
      setFormData({
        type: 'image',
        media_url: '',
        headline: '',
        description: '',
        call_to_action: 'learn_more',
        destination_url: '',
        frequency_cap: 3,
        priority_order: 0,
      });
      onOpenChange(false);
    } catch (err: any) {
      setServerError(err.message || 'Ошибка сохранения');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? 'Редактировать креатив' : 'Новый креатив'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Форма */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Тип креатива */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Тип</label>
              <Select
                value={formData.type}
                onValueChange={(value: any) => handleChange('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Изображение</SelectItem>
                  <SelectItem value="video">Видео</SelectItem>
                  <SelectItem value="carousel">Караousel</SelectItem>
                  <SelectItem value="story">История</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Media URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">URL медиа (HTTPS)</label>
              <Input
                placeholder="https://..."
                value={formData.media_url}
                onChange={(e) => handleChange('media_url', e.target.value)}
              />
            </div>

            {/* Headline */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Заголовок (1-100 символов)</label>
              <Input
                placeholder="Краткий заголовок"
                value={formData.headline}
                onChange={(e) => handleChange('headline', e.target.value)}
                maxLength={100}
              />
              <div className="text-xs text-muted-foreground text-right">
                {formData.headline.length}/100
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Описание (до 300 символов)</label>
              <Textarea
                placeholder="Дополнительное описание"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                maxLength={300}
              />
              <div className="text-xs text-muted-foreground text-right">
                {formData.description.length}/300
              </div>
            </div>

            {/* Call to Action */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Призыв к действию</label>
              <Select
                value={formData.call_to_action}
                onValueChange={(value: any) => handleChange('call_to_action', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите CTA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="learn_more">Узнать больше</SelectItem>
                  <SelectItem value="shop_now">Купить сейчас</SelectItem>
                  <SelectItem value="sign_up">Зарегистрироваться</SelectItem>
                  <SelectItem value="contact_us">Связаться</SelectItem>
                  <SelectItem value="download">Скачать</SelectItem>
                  <SelectItem value="get_quote">Получить расчёт</SelectItem>
                  <SelectItem value="apply_now">Подать заявку</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Destination URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Ссылка назначения (HTTPS)</label>
              <Input
                placeholder="https://..."
                value={formData.destination_url}
                onChange={(e) => handleChange('destination_url', e.target.value)}
              />
            </div>

            {/* Frequency Cap */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Частотный лимит (показов на пользователя в день): {formData.frequency_cap}
              </label>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[formData.frequency_cap]}
                onValueChange={([val]) => handleChange('frequency_cap', val)}
              />
            </div>

            {/* Priority Order */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Приоритет (0-мин)</label>
              <Input
                type="number"
                min={0}
                value={formData.priority_order}
                onChange={(e) => handleChange('priority_order', parseInt(e.target.value) || 0)}
              />
            </div>

            {serverError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {serverError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit">{submitLabel}</Button>
            </DialogFooter>
          </form>

          {/* Preview */}
          <div className="space-y-4">
            <div className="flex gap-2 justify-center">
              <Button
                variant={previewFormat === 'feed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewFormat('feed')}
              >
                Лента
              </Button>
              <Button
                variant={previewFormat === 'story' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewFormat('story')}
              >
                История
              </Button>
              <Button
                variant={previewFormat === 'reels' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewFormat('reels')}
              >
                Reels
              </Button>
            </div>

            <div className="flex justify-center p-4 border rounded-lg bg-muted/20">
              <CreativePreview
                creative={formData as any}
                format={previewFormat}
              />
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Преview — как креатив будет выглядеть в ленте/историях/reels
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
