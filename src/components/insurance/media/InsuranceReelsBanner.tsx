import { motion } from "framer-motion";
import { Play, Eye, Heart, Clock, BadgeCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export interface InsuranceReel {
  id: string;
  companyId: string;
  companyName: string;
  companyLogo: string;
  isVerified: boolean;
  thumbnailUrl: string;
  title: string;
  views: number;
  likes: number;
  duration: number;
  isSponsored: boolean;
  sponsorPrice?: number;
  createdAt: string;
}

const MOCK_REELS: InsuranceReel[] = [
  {
    id: "r1",
    companyId: "tinkoff",
    companyName: "Тинькофф",
    companyLogo: "",
    isVerified: true,
    thumbnailUrl: "",
    title: "Как оформить ОСАГО за 5 минут",
    views: 12400,
    likes: 843,
    duration: 60,
    isSponsored: true,
    sponsorPrice: 15000,
    createdAt: "2026-03-01",
  },
  {
    id: "r2",
    companyId: "ingosstrakh",
    companyName: "Ингосстрах",
    companyLogo: "",
    isVerified: true,
    thumbnailUrl: "",
    title: "Топ-5 ошибок при оформлении КАСКО",
    views: 8900,
    likes: 562,
    duration: 90,
    isSponsored: false,
    createdAt: "2026-03-01",
  },
  {
    id: "r3",
    companyId: "sogaz",
    companyName: "СОГАЗ",
    companyLogo: "",
    isVerified: true,
    thumbnailUrl: "",
    title: "ДМС для сотрудников: всё что нужно знать",
    views: 5300,
    likes: 341,
    duration: 120,
    isSponsored: true,
    sponsorPrice: 15000,
    createdAt: "2026-02-28",
  },
  {
    id: "r4",
    companyId: "sber",
    companyName: "СберСтрах",
    companyLogo: "",
    isVerified: true,
    thumbnailUrl: "",
    title: "Страхование ипотеки: пошагово",
    views: 7100,
    likes: 489,
    duration: 75,
    isSponsored: false,
    createdAt: "2026-02-27",
  },
  {
    id: "r5",
    companyId: "alfa",
    companyName: "Альфа",
    companyLogo: "",
    isVerified: true,
    thumbnailUrl: "",
    title: "Выплата по страховому случаю: реальный опыт",
    views: 15600,
    likes: 1240,
    duration: 180,
    isSponsored: true,
    sponsorPrice: 50000,
    createdAt: "2026-02-26",
  },
  {
    id: "r6",
    companyId: "rosgosstrakh",
    companyName: "Росгосстрах",
    companyLogo: "",
    isVerified: true,
    thumbnailUrl: "",
    title: "Путешествие без страховки: риски и последствия",
    views: 9800,
    likes: 712,
    duration: 95,
    isSponsored: false,
    createdAt: "2026-02-25",
  },
];

function formatViews(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const GRADIENT_COLORS = [
  "from-violet-900 to-violet-700",
  "from-blue-900 to-blue-700",
  "from-emerald-900 to-emerald-700",
  "from-orange-900 to-orange-700",
  "from-pink-900 to-pink-700",
  "from-cyan-900 to-cyan-700",
];

interface InsuranceReelsBannerProps {
  filterCompanyId?: string;
}

export function InsuranceReelsBanner({ filterCompanyId }: InsuranceReelsBannerProps) {
  const navigate = useNavigate();

  const reels = filterCompanyId
    ? MOCK_REELS.filter((r) => r.companyId === filterCompanyId)
    : MOCK_REELS;

  if (reels.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-4">
        <h2 className="text-base font-semibold text-white">Рекомендуемые видео</h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-violet-400 text-xs h-7 px-2"
          onClick={() => navigate("/reels")}
        >
          Все видео
        </Button>
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-3 px-4 pb-2">
          {reels.map((reel, idx) => (
            <motion.button
              key={reel.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/reels")}
              className="flex-shrink-0 w-36 text-left"
            >
              <div className={`relative w-36 h-52 rounded-xl bg-gradient-to-b ${GRADIENT_COLORS[idx % GRADIENT_COLORS.length]} overflow-hidden mb-2`}>
                {/* Play icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>

                {/* Duration */}
                <div className="absolute bottom-2 right-2">
                  <span className="text-[10px] text-white/80 bg-black/40 px-1.5 py-0.5 rounded">
                    <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                    {formatDuration(reel.duration)}
                  </span>
                </div>

                {/* Sponsored badge */}
                {reel.isSponsored && (
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-orange-500/90 text-white border-0 text-[9px] h-4 px-1">
                      Промо
                    </Badge>
                  </div>
                )}
              </div>

              <p className="text-xs text-white font-medium leading-tight mb-1.5 line-clamp-2">
                {reel.title}
              </p>

              <div className="flex items-center gap-1.5">
                <Avatar className="w-4 h-4">
                  <AvatarFallback className="text-[8px] bg-violet-500/20 text-violet-300">
                    {reel.companyName[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-white/50 truncate max-w-[70px]">{reel.companyName}</span>
                {reel.isVerified && <BadgeCheck className="w-3 h-3 text-blue-400 flex-shrink-0" />}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-white/40 flex items-center gap-0.5">
                  <Eye className="w-2.5 h-2.5" />
                  {formatViews(reel.views)}
                </span>
                <span className="text-[10px] text-white/40 flex items-center gap-0.5">
                  <Heart className="w-2.5 h-2.5" />
                  {formatViews(reel.likes)}
                </span>
              </div>
            </motion.button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </div>
  );
}
