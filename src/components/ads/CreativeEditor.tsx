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
 * Валидация на лету.
 * Preview в реальном времени.
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CreativePreview } from "./CreativePreview";
import { validateCreativeInput } from "@/lib/validators";
import type { AdCreative, AdCreativeInsert } from "@/lib/ads/types";

const creativeSchema = z.object({
  type: z.enum(['image', 'video', 'carousel', 'story']),
  media_url: z.string().url('Введите корректный HTTPS URL'),
  headline: z.string().min(1, 'Заголовок обязателен').max(100, 'Слишком длинный заголовок'),
  description: z.string().max(300, 'Слишком длинное описание').optional().nullable(),
  call_to_action: z.enum([
    'learn_more', 'shop_now', 'sign_up', 'contact_us', 'download', 'get_quote', 'apply_now'
  ]),
  destination_url: z.string().url('Введите корректный HTTPS URL'),
  frequency_cap: z.number().min(1).max(100).default(3),
  priority_order: z.number().min(0).default(0),
});

type CreativeFormData = z.infer<typeof creativeSchema>;

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

  const form = useForm<CreativeFormData>({
    resolver: zodResolver(creativeSchema),
    defaultValues: {
      type: initialData?.type ?? 'image',
      media_url: initialData?.media_url ?? '',
      headline: initialData?.headline ?? '',
      description: initialData?.description ?? '',
      call_to_action: (initialData?.call_to_action as any) ?? 'learn_more',
      destination_url: initialData?.destination_url ?? '',
      frequency_cap: initialData?.frequency_cap ?? 3,
      priority_order: initialData?.priority_order ?? 0,
    },
  });

  // Сброс при открытии/изменении initialData
  useEffect(() => {
    if (open) {
      form.reset({
        type: initialData?.type ?? 'image',
        media_url: initialData?.media_url ?? '',
        headline: initialData?.headline ?? '',
        description: initialData?.description ?? '',
        call_to_action: (initialData?.call_to_action as any) ?? 'learn_more',
        destination_url: initialData?.destination_url ?? '',
        frequency_cap: initialData?.frequency_cap ?? 3,
        priority_order: initialData?.priority_order ?? 0,
      });
      setServerError(null);
    }
  }, [open, initialData, form]);

  const onSubmitHandler = form.handleSubmit(async (data) => {
    setServerError(null);

    // Доп. валидация (URL HTTPS, длины)
    const errors = validateCreativeInput(data);
    if (errors.length > 0) {
      setServerError(errors[0]);
      return;
    }

    try {
      const success = editingCreative
        ? await onSubmit({ ...data, description: data.description || null } as AdCreativeUpdate)
        : await onSubmit({ ...data, description: data.description || null } as AdCreativeInsert);

      if (success) {
        form.reset();
        onOpenChange(false);
      }
    } catch (e: any) {
      setServerError(e.message || 'Ошибка сохранения');
    }
  });

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
          <Form {...form}>
            <form onSubmit={onSubmitHandler} className="space-y-4">
              {/* Тип креатива */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Тип</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите тип" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Изображение</SelectItem>
                        <SelectItem value="video">Видео</SelectItem>
                        <SelectItem value="carousel">Карабель</SelectItem>
                        <SelectItem value="story">История</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Media URL */}
              <FormField
                control={form.control}
                name="media_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL медиа (HTTPS)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Headline */}
              <FormField
                control={form.control}
                name="headline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Заголовок (1-100 символов)</FormLabel>
                    <FormControl>
                      <Input placeholder="Краткий заголовок" {...field} />
                    </FormControl>
                    <div className="text-xs text-muted-foreground text-right">
                      {field.value.length}/100
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание (до 300 символов)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Дополнительное описание"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <div className="text-xs text-muted-foreground text-right">
                      {(field.value?.length || 0)}/300
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Call to Action */}
              <FormField
                control={form.control}
                name="call_to_action"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Призыв к действию</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Destination URL */}
              <FormField
                control={form.control}
                name="destination_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ссылка назначения (HTTPS)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Frequency Cap */}
              <FormField
                control={form.control}
                name="frequency_cap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Частотный лимит (показов на пользователя в день): {field.value}</FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={100}
                        step={1}
                        value={[field.value]}
                        onValueChange={([val]) => field.onChange(val)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Priority Order */}
              <FormField
                control={form.control}
                name="priority_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Приоритет (0-мин)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
          </Form>

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
                creative={form.getValues() as any}
                format={previewFormat}
              />
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Преiew — как креатив будет выглядеть в ленте/историях/reels
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
