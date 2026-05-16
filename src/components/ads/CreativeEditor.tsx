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
import type {
  AdCreative,
  AdCreativeInsert,
  AdCreativeStatus,
  AdCreativeType,
  CallToAction,
} from "@/lib/ads/types";

interface CreativeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AdCreativeInsert) => Promise<void>;
  initialData?: AdCreative | null;
  submitLabel?: string;
}

type CreativeFormData = Omit<AdCreativeInsert, "campaign_id" | "creative_hash"> & {
  description: string;
  frequency_cap: number;
  priority_order: number;
};

const DEFAULT_FORM_DATA: CreativeFormData = {
  type: "image",
  media_url: "",
  headline: "",
  description: "",
  call_to_action: "learn_more",
  destination_url: "",
  frequency_cap: 3,
  priority_order: 0,
};

const CREATIVE_TYPES: AdCreativeType[] = ["image", "video", "carousel", "story"];
const CTA_VALUES: CallToAction[] = ["learn_more", "shop_now", "sign_up", "contact_us", "download", "get_quote", "apply_now"];

function isCreativeType(value: string): value is AdCreativeType {
  return CREATIVE_TYPES.includes(value as AdCreativeType);
}

function isCallToAction(value: string): value is CallToAction {
  return CTA_VALUES.includes(value as CallToAction);
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
  const [formData, setFormData] = useState<CreativeFormData>(DEFAULT_FORM_DATA);

  // Сброс при открытии/изменении initialData
  useEffect(() => {
    if (open) {
      setFormData({
        type: (initialData?.type ?? 'image') as AdCreativeType,
        media_url: initialData?.media_url ?? '',
        headline: initialData?.headline ?? '',
        description: initialData?.description ?? '',
        call_to_action: (initialData?.call_to_action ?? 'learn_more') as CallToAction,
        destination_url: initialData?.destination_url ?? '',
        frequency_cap: initialData?.frequency_cap ?? 3,
        priority_order: initialData?.priority_order ?? 0,
      });
      setServerError(null);
    }
  }, [open, initialData]);

  const handleChange = <K extends keyof CreativeFormData>(field: K, value: CreativeFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const previewCreative: AdCreative = {
    id: initialData?.id ?? "preview",
    campaign_id: initialData?.campaign_id ?? "preview-campaign",
    type: formData.type,
    media_url: formData.media_url,
    thumbnail_url: initialData?.thumbnail_url ?? null,
    headline: formData.headline,
    description: formData.description || null,
    call_to_action: formData.call_to_action,
    destination_url: formData.destination_url,
    status: initialData?.status ?? ("draft" as AdCreativeStatus),
    moderation_reason: initialData?.moderation_reason ?? null,
    moderated_at: initialData?.moderated_at ?? null,
    moderated_by: initialData?.moderated_by ?? null,
    moderation_metadata: initialData?.moderation_metadata ?? null,
    updated_at: initialData?.updated_at ?? new Date().toISOString(),
    updated_by: initialData?.updated_by ?? null,
    deleted_at: initialData?.deleted_at ?? null,
    creative_hash: initialData?.creative_hash ?? "preview",
    frequency_cap: formData.frequency_cap,
    priority_order: formData.priority_order,
    media_duration_sec: initialData?.media_duration_sec ?? null,
    media_width: initialData?.media_width ?? null,
    media_height: initialData?.media_height ?? null,
    file_size_bytes: initialData?.file_size_bytes ?? null,
    aspect_ratio: initialData?.aspect_ratio ?? null,
    created_at: initialData?.created_at ?? new Date().toISOString(),
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
      setFormData(DEFAULT_FORM_DATA);
      onOpenChange(false);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Ошибка сохранения');
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
                onValueChange={(value) => {
                  if (isCreativeType(value)) {
                    handleChange('type', value);
                  }
                }}
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
                onValueChange={(value) => {
                  if (isCallToAction(value)) {
                    handleChange('call_to_action', value);
                  }
                }}
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
                creative={previewCreative}
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
