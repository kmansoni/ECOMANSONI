import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, ImagePlus, X } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const GRADIENTS = [
  { id: "g1", label: "Ночной синий", value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" },
  { id: "g2", label: "Фиолетовый", value: "linear-gradient(135deg, #2d1b69 0%, #11998e 100%)" },
  { id: "g3", label: "Закат", value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  { id: "g4", label: "Изумруд", value: "linear-gradient(135deg, #0a7a4a 0%, #1a4a2e 100%)" },
  { id: "g5", label: "Тёмный красный", value: "linear-gradient(135deg, #3d1515 0%, #1a0a0a 100%)" },
  { id: "g6", label: "Сапфир", value: "linear-gradient(135deg, #1a3a5c 0%, #0a0a0a 100%)" },
  { id: "g7", label: "Янтарный", value: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" },
  { id: "g8", label: "Космос", value: "linear-gradient(135deg, #0d1117 0%, #2d1b69 50%, #1a3a5c 100%)" },
];

const DURATION_PRICING: Record<string, { label: string; price: number }> = {
  "24h": { label: "24 часа", price: 5000 },
  "48h": { label: "48 часов", price: 8000 },
  "7d": { label: "7 дней", price: 25000 },
};

interface CreateInsuranceStorySheetProps {
  children?: React.ReactNode;
}

export function CreateInsuranceStorySheet({ children }: CreateInsuranceStorySheetProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS[0].value);
  const [ctaText, setCtaText] = useState("");
  const [ctaLink, setCtaLink] = useState("");
  const [duration, setDuration] = useState("24h");
  const [loading, setLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      // Проверяем роль из метаданных пользователя
      const role = user?.user_metadata?.role as string | undefined;
      setIsVerified(role === "company" || role === "agent" || role === "broker");
    });
  }, []);

  const pricing = DURATION_PRICING[duration];

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Введите заголовок");
      return;
    }
    setLoading(true);
    // Таблицы insurance_stories пока нет в БД
    toast.info("Публикация историй пока в разработке");
    setLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children ?? (
          <Button className="bg-violet-600 hover:bg-violet-500 w-full">
            Создать Story
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="bg-zinc-950 border-white/10 text-white rounded-t-2xl max-h-[92vh] overflow-y-auto"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-white">Создать Story</SheetTitle>
        </SheetHeader>

        {!isVerified ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
              <Shield className="w-8 h-8 text-white/30" />
            </div>
            <p className="text-white/60 text-sm leading-relaxed max-w-xs">
              Создание историй доступно верифицированным компаниям и агентам
            </p>
            <Button variant="outline" className="border-white/20 text-white/60" onClick={() => setOpen(false)}>
              Закрыть
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Заголовок */}
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Заголовок *</Label>
              <Input
                placeholder="Например: Скидка 15% на ОСАГО"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            {/* Описание */}
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Описание</Label>
              <Textarea
                placeholder="Подробное описание акции или продукта..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
                rows={3}
              />
            </div>

            {/* Фон */}
            <div className="space-y-2">
              <Label className="text-white/70 text-xs">Фоновый градиент</Label>
              <div className="grid grid-cols-4 gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGradient(g.value)}
                    className={cn(
                      "h-12 rounded-lg border-2 transition-all",
                      selectedGradient === g.value
                        ? "border-white scale-95"
                        : "border-transparent hover:border-white/30"
                    )}
                    style={{ background: g.value }}
                    title={g.label}
                  />
                ))}
              </div>
            </div>

            {/* Превью */}
            <div
              className="w-full h-24 rounded-xl flex items-center justify-center"
              style={{ background: selectedGradient }}
            >
              <p className="text-white font-bold text-sm px-4 text-center">
                {title || "Заголовок Story"}
              </p>
            </div>

            {/* Загрузка изображения */}
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Изображение (опционально)</Label>
              <label className="flex items-center gap-2 border border-white/10 border-dashed rounded-lg p-3 cursor-pointer hover:border-white/20 transition-colors">
                <ImagePlus className="w-4 h-4 text-white/40" />
                <span className="text-xs text-white/40">Нажмите для загрузки</span>
                <input type="file" accept="image/*" className="hidden" />
              </label>
            </div>

            <Separator className="bg-white/[0.06]" />

            {/* CTA */}
            <div className="space-y-2">
              <Label className="text-white/70 text-xs">Кнопка действия (опционально)</Label>
              <Input
                placeholder="Текст кнопки, например: Оформить"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
              <Input
                placeholder="Ссылка (https://...)"
                value={ctaLink}
                onChange={(e) => setCtaLink(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            {/* Длительность */}
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Длительность показа</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                  {Object.entries(DURATION_PRICING).map(([key, { label, price }]) => (
                    <SelectItem key={key} value={key}>
                      {label} — {new Intl.NumberFormat("ru-RU").format(price)} ₽
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Итоговая стоимость */}
            <motion.div
              key={duration}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/60 mb-0.5">Стоимость размещения</p>
                  <p className="text-xs text-white/40">{pricing.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-violet-400">
                    {new Intl.NumberFormat("ru-RU").format(pricing.price)} ₽
                  </p>
                  <Badge className="bg-violet-500/20 text-violet-300 border-0 text-[10px]">Реклама</Badge>
                </div>
              </div>
            </motion.div>

            <Button
              className="w-full bg-violet-600 hover:bg-violet-500 font-semibold"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Отправка..." : `Опубликовать и оплатить ${new Intl.NumberFormat("ru-RU").format(pricing.price)} ₽`}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
