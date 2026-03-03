import { motion } from "framer-motion";
import { MessageSquare, LayoutDashboard, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CreateInsuranceStorySheet } from "./CreateInsuranceStorySheet";
import { toast } from "sonner";

const TARIFFS = [
  {
    category: "Story",
    icon: "📸",
    items: [
      { name: "Story 24 часа", price: 5000, highlight: false },
      { name: "Story 48 часов", price: 8000, highlight: true },
      { name: "Story 7 дней", price: 25000, highlight: false },
    ],
  },
  {
    category: "Reels",
    icon: "🎬",
    items: [
      { name: "Reel в топе (1 неделя)", price: 15000, highlight: false },
      { name: "Reel в топе (1 месяц)", price: 50000, highlight: true },
    ],
  },
  {
    category: "Баннер",
    icon: "🖼️",
    items: [
      { name: "Баннер на главной (1 неделя)", price: 30000, highlight: false },
    ],
  },
];

export function InsuranceAdPricing() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Megaphone className="w-4 h-4 text-violet-400" />
        </div>
        <h2 className="text-base font-semibold text-white">Рекламные возможности</h2>
      </div>

      <div className="space-y-3">
        {TARIFFS.map((group, gi) => (
          <motion.div
            key={group.category}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.08 }}
          >
            <Card className="bg-white/[0.02] border-white/[0.06]">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm text-white/80 flex items-center gap-2">
                  <span>{group.icon}</span>
                  {group.category}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-0">
                {group.items.map((item, ii) => (
                  <div key={item.name}>
                    {ii > 0 && <Separator className="bg-white/[0.04] my-2" />}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/70">{item.name}</span>
                        {item.highlight && (
                          <Badge className="bg-violet-500/20 text-violet-300 border-0 text-[9px] h-4">
                            Популярно
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {new Intl.NumberFormat("ru-RU").format(item.price)}&nbsp;₽
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 border-white/10 text-white/70 hover:text-white text-xs"
          onClick={() => toast.info("Открываем чат с менеджером...")}
        >
          <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
          Связаться с менеджером
        </Button>
        <CreateInsuranceStorySheet>
          <Button className="flex-1 bg-violet-600 hover:bg-violet-500 text-xs">
            <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
            Оформить размещение
          </Button>
        </CreateInsuranceStorySheet>
      </div>
    </div>
  );
}
