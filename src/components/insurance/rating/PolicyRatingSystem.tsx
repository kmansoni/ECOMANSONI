import { useState } from "react";
import { Star, Plus, X, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RatingCriteria {
  id: string;
  label: string;
  value: number;
}

const DEFAULT_CRITERIA: RatingCriteria[] = [
  { id: "speed", label: "Скорость оформления", value: 0 },
  { id: "clarity", label: "Понятность условий", value: 0 },
  { id: "price", label: "Цена / качество", value: 0 },
  { id: "payout", label: "Скорость выплат", value: 0 },
  { id: "overall", label: "Общее впечатление", value: 0 },
];

interface PolicyRatingSystemProps {
  policyId?: string;
  companyName?: string;
  mode?: "submit" | "view";
  onSubmit?: (data: { criteria: RatingCriteria[]; review: string; pros: string[]; cons: string[]; recommend: string }) => void;
}

function StarRow({ label, value, onChange }: { label: string; value: number; onChange?: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/60 flex-1">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(s)}
            onMouseEnter={() => onChange && setHovered(s)}
            onMouseLeave={() => onChange && setHovered(0)}
            className="disabled:cursor-default"
          >
            <Star
              className={cn(
                "w-5 h-5 transition-colors",
                s <= (hovered || value)
                  ? "text-yellow-400 fill-yellow-400"
                  : "text-white/20"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PolicyRatingSystem({ policyId: _policyId, companyName = "компании", mode = "submit", onSubmit }: PolicyRatingSystemProps) {
  const [criteria, setCriteria] = useState<RatingCriteria[]>(DEFAULT_CRITERIA);
  const [review, setReview] = useState("");
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [newPro, setNewPro] = useState("");
  const [newCon, setNewCon] = useState("");
  const [recommend, setRecommend] = useState("yes");
  const [submitted, setSubmitted] = useState(false);

  const setStarValue = (id: string, value: number) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, value } : c)));
  };

  const addPro = () => {
    if (newPro.trim()) {
      setPros([...pros, newPro.trim()]);
      setNewPro("");
    }
  };

  const addCon = () => {
    if (newCon.trim()) {
      setCons([...cons, newCon.trim()]);
      setNewCon("");
    }
  };

  const avgRating = criteria.reduce((s, c) => s + c.value, 0) / criteria.length;

  const handleSubmit = () => {
    if (criteria.some((c) => c.value === 0)) {
      toast.error("Пожалуйста, оцените все критерии");
      return;
    }
    onSubmit?.({ criteria, review, pros, cons, recommend });
    toast.info("Рейтинги пока в разработке");
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3 py-8 text-center"
      >
        <CheckCircle className="w-12 h-12 text-emerald-400" />
        <p className="text-base font-semibold text-white">Оценка отправлена!</p>
        <p className="text-sm text-white/50">Спасибо, что помогаете другим выбрать страховку</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Average */}
      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold text-white">
          {avgRating > 0 ? avgRating.toFixed(1) : "—"}
        </div>
        <div>
          <p className="text-xs text-white/50 mb-1">Средний рейтинг</p>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={cn("w-3.5 h-3.5", s <= Math.round(avgRating) ? "text-yellow-400 fill-yellow-400" : "text-white/20")}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Criteria */}
      <Card className="bg-white/[0.02] border-white/[0.06]">
        <CardContent className="p-4 space-y-3">
          {criteria.map((c) => (
            <StarRow
              key={c.id}
              label={c.label}
              value={c.value}
              onChange={mode === "submit" ? (v) => setStarValue(c.id, v) : undefined}
            />
          ))}
        </CardContent>
      </Card>

      {mode === "submit" && (
        <>
          {/* Review */}
          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Отзыв о {companyName}</Label>
            <Textarea
              placeholder="Расскажите о своём опыте..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
              rows={3}
            />
          </div>

          {/* Pros */}
          <div className="space-y-2">
            <Label className="text-emerald-400 text-xs">Плюсы</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Добавить плюс..."
                value={newPro}
                onChange={(e) => setNewPro(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPro()}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-xs"
              />
              <Button size="sm" variant="outline" className="border-white/10 text-white px-2" onClick={addPro}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <AnimatePresence>
              {pros.map((p, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                  className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span className="flex-1">{p}</span>
                  <button onClick={() => setPros(pros.filter((_, ii) => ii !== i))}>
                    <X className="w-3 h-3 text-white/30 hover:text-white/60" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Cons */}
          <div className="space-y-2">
            <Label className="text-red-400 text-xs">Минусы</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Добавить минус..."
                value={newCon}
                onChange={(e) => setNewCon(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCon()}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-xs"
              />
              <Button size="sm" variant="outline" className="border-white/10 text-white px-2" onClick={addCon}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <AnimatePresence>
              {cons.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                  className="flex items-center gap-2 text-xs text-red-400">
                  <X className="w-3 h-3 flex-shrink-0" />
                  <span className="flex-1">{c}</span>
                  <button onClick={() => setCons(cons.filter((_, ii) => ii !== i))}>
                    <X className="w-3 h-3 text-white/30 hover:text-white/60" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <Separator className="bg-white/[0.06]" />

          {/* Recommend */}
          <div className="space-y-2">
            <Label className="text-white/70 text-xs">Рекомендуете ли эту компанию?</Label>
            <RadioGroup value={recommend} onValueChange={setRecommend} className="flex gap-4">
              {[
                { value: "yes", label: "Да" },
                { value: "no", label: "Нет" },
                { value: "unsure", label: "Затрудняюсь" },
              ].map((opt) => (
                <div key={opt.value} className="flex items-center gap-1.5">
                  <RadioGroupItem value={opt.value} id={`rec-${opt.value}`} className="border-white/30 text-violet-400" />
                  <Label htmlFor={`rec-${opt.value}`} className="text-xs text-white/70 cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <Button className="w-full bg-violet-600 hover:bg-violet-500" onClick={handleSubmit}>
            Отправить оценку
          </Button>
        </>
      )}
    </div>
  );
}
