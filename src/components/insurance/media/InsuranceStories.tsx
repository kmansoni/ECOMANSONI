import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface InsuranceStoryItem {
  id: string;
  imageUrl?: string;
  title: string;
  description: string;
  ctaText?: string;
  ctaLink?: string;
  backgroundColor: string;
  createdAt: string;
  expiresAt: string;
  isSponsored: boolean;
  price?: number;
}

export interface InsuranceStory {
  id: string;
  companyId: string;
  companyName: string;
  companyLogo: string;
  isVerified: boolean;
  type: "company" | "agent" | "broker";
  stories: InsuranceStoryItem[];
  hasUnviewed: boolean;
}

const MOCK_STORIES: InsuranceStory[] = [
  {
    id: "s1",
    companyId: "tinkoff",
    companyName: "Тинькофф",
    companyLogo: "",
    isVerified: true,
    type: "company",
    hasUnviewed: true,
    stories: [
      {
        id: "s1-1",
        title: "ОСАГО за 5 минут",
        description: "Оформите полис ОСАГО онлайн без визита в офис. Скидка 10% до конца марта!",
        backgroundColor: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        ctaText: "Оформить сейчас",
        ctaLink: "/insurance/osago",
        createdAt: "2026-03-01T10:00:00Z",
        expiresAt: "2026-03-08T10:00:00Z",
        isSponsored: true,
        price: 5000,
      },
    ],
  },
  {
    id: "s2",
    companyId: "ingosstrakh",
    companyName: "Ингосстрах",
    companyLogo: "",
    isVerified: true,
    type: "company",
    hasUnviewed: true,
    stories: [
      {
        id: "s2-1",
        title: "Новый продукт: ДМС Премиум",
        description: "Расширенная программа ДМС со стоматологией и вызовом врача на дом. Первый месяц бесплатно.",
        backgroundColor: "linear-gradient(135deg, #0d1117 0%, #1a1a2e 50%, #2d1b69 100%)",
        ctaText: "Узнать подробности",
        ctaLink: "/insurance/dms",
        createdAt: "2026-03-01T09:00:00Z",
        expiresAt: "2026-03-08T09:00:00Z",
        isSponsored: true,
        price: 8000,
      },
    ],
  },
  {
    id: "s3",
    companyId: "sogaz",
    companyName: "СОГАЗ",
    companyLogo: "",
    isVerified: true,
    type: "company",
    hasUnviewed: true,
    stories: [
      {
        id: "s3-1",
        title: "Страхование путешествий",
        description: "Лучшие тарифы на страхование выезжающих за рубеж. Покрытие до €1 000 000.",
        backgroundColor: "linear-gradient(135deg, #0a0a0a 0%, #1a3a5c 100%)",
        ctaText: "Рассчитать стоимость",
        ctaLink: "/insurance/travel",
        createdAt: "2026-03-01T08:00:00Z",
        expiresAt: "2026-03-07T08:00:00Z",
        isSponsored: false,
      },
    ],
  },
  {
    id: "s4",
    companyId: "alfa",
    companyName: "Альфа",
    companyLogo: "",
    isVerified: true,
    type: "company",
    hasUnviewed: false,
    stories: [
      {
        id: "s4-1",
        title: "Советы по КАСКО",
        description: "5 вещей, которые нужно знать перед выбором КАСКО. Читайте в нашем блоге.",
        backgroundColor: "linear-gradient(135deg, #1a0a0a 0%, #3d1515 100%)",
        createdAt: "2026-03-01T07:00:00Z",
        expiresAt: "2026-03-08T07:00:00Z",
        isSponsored: false,
      },
    ],
  },
  {
    id: "s5",
    companyId: "rosgosstrakh",
    companyName: "Росгосстрах",
    companyLogo: "",
    isVerified: true,
    type: "company",
    hasUnviewed: true,
    stories: [
      {
        id: "s5-1",
        title: "Акция: ОСАГО + КАСКО",
        description: "При оформлении ОСАГО и КАСКО одновременно — скидка 15% на оба полиса!",
        backgroundColor: "linear-gradient(135deg, #0a1a0a 0%, #1a3a1a 100%)",
        ctaText: "Воспользоваться акцией",
        ctaLink: "/insurance/kasko",
        createdAt: "2026-03-01T06:00:00Z",
        expiresAt: "2026-03-15T06:00:00Z",
        isSponsored: true,
        price: 5000,
      },
    ],
  },
  {
    id: "s6",
    companyId: "sber",
    companyName: "СберСтрах",
    companyLogo: "",
    isVerified: true,
    type: "company",
    hasUnviewed: true,
    stories: [
      {
        id: "s6-1",
        title: "Ипотечное страхование",
        description: "Обязательное страхование при ипотеке. Расчёт за 2 минуты, оплата онлайн.",
        backgroundColor: "linear-gradient(135deg, #0a1515 0%, #1a4a2e 100%)",
        ctaText: "Рассчитать",
        ctaLink: "/insurance/mortgage",
        createdAt: "2026-03-01T05:00:00Z",
        expiresAt: "2026-03-08T05:00:00Z",
        isSponsored: true,
        price: 8000,
      },
    ],
  },
  {
    id: "s7",
    companyId: "agent_ivan",
    companyName: "Иван А.",
    companyLogo: "",
    isVerified: true,
    type: "agent",
    hasUnviewed: true,
    stories: [
      {
        id: "s7-1",
        title: "Консультация бесплатно",
        description: "Лицензированный страховой агент. Помогу подобрать оптимальный полис. Звоните!",
        backgroundColor: "linear-gradient(135deg, #1a1a0a 0%, #3a3a1a 100%)",
        ctaText: "Написать",
        ctaLink: "/messages",
        createdAt: "2026-03-01T04:00:00Z",
        expiresAt: "2026-03-08T04:00:00Z",
        isSponsored: false,
      },
    ],
  },
  {
    id: "s8",
    companyId: "broker_max",
    companyName: "БрокерМакс",
    companyLogo: "",
    isVerified: true,
    type: "broker",
    hasUnviewed: false,
    stories: [
      {
        id: "s8-1",
        title: "Сравниваем за вас",
        description: "Страховой брокер. Подберём лучший полис из 50+ компаний. Без переплат.",
        backgroundColor: "linear-gradient(135deg, #0a0a1a 0%, #1a1a4a 100%)",
        ctaText: "Оставить заявку",
        ctaLink: "/insurance",
        createdAt: "2026-03-01T03:00:00Z",
        expiresAt: "2026-03-08T03:00:00Z",
        isSponsored: false,
      },
    ],
  },
];

interface StoryViewerProps {
  stories: InsuranceStory[];
  initialIndex: number;
  onClose: () => void;
}

function InsuranceStoryViewerModal({ stories, initialIndex, onClose }: StoryViewerProps) {
  const [currentStoryIdx, setCurrentStoryIdx] = useState(initialIndex);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);

  const current = stories[currentStoryIdx];
  const item = current?.stories[currentItemIdx];

  const goNext = () => {
    if (currentItemIdx < current.stories.length - 1) {
      setCurrentItemIdx(currentItemIdx + 1);
    } else if (currentStoryIdx < stories.length - 1) {
      setCurrentStoryIdx(currentStoryIdx + 1);
      setCurrentItemIdx(0);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentItemIdx > 0) {
      setCurrentItemIdx(currentItemIdx - 1);
    } else if (currentStoryIdx > 0) {
      setCurrentStoryIdx(currentStoryIdx - 1);
      setCurrentItemIdx(0);
    }
  };

  if (!current || !item) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="relative w-full max-w-sm h-[85vh] rounded-2xl overflow-hidden"
        style={{ background: item.backgroundColor }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-10">
          {current.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div className={`h-full bg-white rounded-full ${i < currentItemIdx ? "w-full" : i === currentItemIdx ? "animate-progress-fill" : "w-0"}`} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-8 left-3 right-3 z-10 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
            {current.companyName[0]}
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-white">{current.companyName}</p>
            <p className="text-[10px] text-white/60">
              {current.type === "company" ? "Страховая компания" : current.type === "agent" ? "Агент" : "Брокер"}
            </p>
          </div>
          {item.isSponsored && (
            <Badge className="bg-white/20 text-white border-0 text-[10px]">Реклама</Badge>
          )}
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
          <h2 className="text-lg font-bold text-white mb-2">{item.title}</h2>
          <p className="text-sm text-white/80 leading-relaxed mb-4">{item.description}</p>
          {item.ctaText && item.ctaLink && (
            <Button size="sm" className="w-full bg-white text-black hover:bg-white/90 font-semibold" asChild>
              <a href={item.ctaLink}>
                {item.ctaText}
                <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
            </Button>
          )}
        </div>

        {/* Navigation areas */}
        <button className="absolute left-0 top-0 w-1/3 h-full z-20" onClick={goPrev} />
        <button className="absolute right-0 top-0 w-1/3 h-full z-20" onClick={goNext} />
      </motion.div>
    </motion.div>
  );
}

interface InsuranceStoriesProps {
  filterCompanyId?: string;
}

export function InsuranceStories({ filterCompanyId }: InsuranceStoriesProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const stories = filterCompanyId
    ? MOCK_STORIES.filter((s) => s.companyId === filterCompanyId)
    : MOCK_STORIES;

  if (stories.length === 0) return null;

  const handleOpen = (idx: number) => {
    setSelectedIdx(idx);
    setViewerOpen(true);
  };

  return (
    <>
      <ScrollArea className="w-full">
        <div className="flex gap-4 px-4 py-2">
          {stories.map((story, idx) => (
            <motion.button
              key={story.id}
              whileTap={{ scale: 0.93 }}
              onClick={() => handleOpen(idx)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div
                className={`p-0.5 rounded-full ${
                  story.hasUnviewed
                    ? "bg-gradient-to-tr from-violet-500 via-pink-500 to-orange-400"
                    : "bg-white/20"
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-zinc-900 border-2 border-zinc-900 flex items-center justify-center">
                  <Avatar className="w-full h-full rounded-full">
                    <AvatarFallback className="rounded-full bg-violet-500/20 text-violet-300 text-base font-bold">
                      {story.companyName[0]}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <span className="text-[10px] text-white/60 max-w-[60px] truncate text-center leading-tight">
                {story.companyName}
              </span>
            </motion.button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      <AnimatePresence>
        {viewerOpen && (
          <InsuranceStoryViewerModal
            stories={stories}
            initialIndex={selectedIdx}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
