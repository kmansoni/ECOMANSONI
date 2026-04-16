/**
 * @file src/components/stories/StoryStickers.tsx
 * @description Рендер стикеров поверх медиа по координатам (x, y, rotation, scale).
 * Поддерживает: text, mention, hashtag, location, gif, link, music,
 * poll, question, quiz, emoji_slider, countdown.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MapPin, Music, Hash, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StoryPollWidget } from "@/components/feed/StoryPollWidget";
import { StoryQuestionWidget } from "@/components/feed/StoryQuestionWidget";
import { StoryCountdownWidget } from "@/components/feed/StoryCountdownWidget";
import { StoryQuizWidget } from "@/components/feed/StoryQuizWidget";
import { StoryEmojiSlider } from "@/components/feed/StoryEmojiSlider";
import { StoryLinkSticker } from "@/components/feed/StoryLinkSticker";
import { StoryMention } from "@/components/feed/StoryMention";
import { useStoryPolls } from "@/hooks/useStoryPolls";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export type StickerType =
  | "text"
  | "mention"
  | "hashtag"
  | "location"
  | "gif"
  | "link"
  | "music"
  | "poll"
  | "question"
  | "quiz"
  | "emoji_slider"
  | "countdown";

interface StickerData {
  id: string;
  type: StickerType;
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
  data: Record<string, unknown>;
}

interface StoryStickersProps {
  storyId: string;
}

// ---------------------------------------------------------------------------
// Позиционирование стикера
// ---------------------------------------------------------------------------

function StickerWrapper({
  sticker,
  children,
}: {
  sticker: StickerData;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className="absolute pointer-events-auto"
      style={{
        left: `${sticker.position_x * 100}%`,
        top: `${sticker.position_y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation ?? 0}deg) scale(${sticker.scale ?? 1})`,
      }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Текстовый стикер
// ---------------------------------------------------------------------------

function TextSticker({ data }: { data: Record<string, unknown> }) {
  const text = String(data.text ?? "");
  const color = String(data.color ?? "#ffffff");
  const font = String(data.font ?? "font-sans");
  const background = Boolean(data.background);

  return (
    <div
      className={`px-3 py-1.5 rounded-lg text-lg ${font} ${
        background ? "bg-black/60 backdrop-blur-sm" : ""
      }`}
      style={{ color }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Хэштег стикер
// ---------------------------------------------------------------------------

function HashtagSticker({ data }: { data: Record<string, unknown> }) {
  const tag = String(data.tag ?? data.text ?? "");
  return (
    <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5">
      <Hash className="w-4 h-4 text-white" />
      <span className="text-white text-sm font-semibold">{tag}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Локация стикер
// ---------------------------------------------------------------------------

function LocationSticker({ data }: { data: Record<string, unknown> }) {
  const name = String(data.name ?? data.location ?? "");
  return (
    <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5">
      <MapPin className="w-4 h-4 text-white" />
      <span className="text-white text-sm font-medium">{name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GIF стикер
// ---------------------------------------------------------------------------

function GifSticker({ data, scale }: { data: Record<string, unknown>; scale: number }) {
  const url = String(data.url ?? "");
  const previewUrl = String(data.previewUrl ?? url);
  if (!url) return null;

  const isVideo = url.endsWith(".mp4") || url.endsWith(".webm");
  const width = Math.max(80, Math.min(180, 120 * scale));

  return (
    <div style={{ width: `${width}px` }}>
      {isVideo ? (
        <video
          src={url}
          poster={previewUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-auto rounded-xl shadow-md"
        />
      ) : (
        <img loading="lazy"
          src={previewUrl}
          alt="GIF"
          className="w-full h-auto rounded-xl shadow-md"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Музыка стикер
// ---------------------------------------------------------------------------

function MusicSticker({ data }: { data: Record<string, unknown> }) {
  const title = String(data.title ?? "Музыка");
  const artist = String(data.artist ?? "");
  return (
    <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-3 py-2">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
        <Music className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-white text-xs font-semibold truncate max-w-[120px]">{title}</p>
        {artist && (
          <p className="text-white/60 text-[10px] truncate max-w-[120px]">{artist}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

export function StoryStickers({ storyId }: StoryStickersProps) {
  const [stickers, setStickers] = useState<StickerData[]>([]);
  const [questions, setQuestions] = useState<Record<string, unknown>[]>([]);
  const [countdowns, setCountdowns] = useState<Record<string, unknown>[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, unknown>[]>([]);
  const [sliders, setSliders] = useState<Record<string, unknown>[]>([]);

  const { polls, vote, getPollResults } = useStoryPolls(storyId);

  // Загрузка стикеров и виджетов
  useEffect(() => {
    if (!storyId) return;
    let ignore = false;

    (async () => {
      try {
        const [stRes, qRes, cRes, qzRes, slRes] = await Promise.allSettled([
          supabase
            .from("story_stickers")
            .select("*")
            .eq("story_id", storyId)
            .limit(50),
          supabase
            .from("story_questions")
            .select("*")
            .eq("story_id", storyId)
            .limit(10),
          supabase
            .from("story_countdowns")
            .select("*")
            .eq("story_id", storyId)
            .limit(10),
          supabase
            .from("story_quizzes")
            .select("*")
            .eq("story_id", storyId)
            .limit(10),
          supabase
            .from("story_emoji_sliders")
            .select("*")
            .eq("story_id", storyId)
            .limit(10),
        ]);

        if (ignore) return;

        if (stRes.status === "fulfilled") {
          setStickers((stRes.value.data ?? []) as unknown as StickerData[]);
        }
        if (qRes.status === "fulfilled") {
          setQuestions((qRes.value.data ?? []) as unknown as Record<string, unknown>[]);
        }
        if (cRes.status === "fulfilled") {
          setCountdowns((cRes.value.data ?? []) as unknown as Record<string, unknown>[]);
        }
        if (qzRes.status === "fulfilled") {
          setQuizzes((qzRes.value.data ?? []) as unknown as Record<string, unknown>[]);
        }
        if (slRes.status === "fulfilled") {
          setSliders((slRes.value.data ?? []) as unknown as Record<string, unknown>[]);
        }
      } catch (err) {
        if (!ignore) {
          logger.error("[StoryStickers] Ошибка загрузки стикеров", { error: err });
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [storyId]);

  // Разделение стикеров по типам
  const textStickers = stickers.filter((s) => s.type === "text");
  const mentionStickers = stickers.filter((s) => s.type === "mention");
  const hashtagStickers = stickers.filter((s) => s.type === "hashtag");
  const locationStickers = stickers.filter((s) => s.type === "location");
  const gifStickers = stickers.filter((s) => s.type === "gif");
  const linkStickers = stickers.filter((s) => s.type === "link");
  const musicStickers = stickers.filter((s) => s.type === "music");

  if (
    stickers.length === 0 &&
    polls.length === 0 &&
    questions.length === 0 &&
    countdowns.length === 0 &&
    quizzes.length === 0 &&
    sliders.length === 0
  ) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Текстовые стикеры */}
      {textStickers.map((s) => (
        <StickerWrapper key={s.id} sticker={s}>
          <TextSticker data={s.data} />
        </StickerWrapper>
      ))}

      {/* Упоминания */}
      {mentionStickers.map((s) => (
        <StickerWrapper key={s.id} sticker={s}>
          <StoryMention
            userId={String(s.data.userId ?? "")}
            username={String(s.data.username ?? "user")}
            avatarUrl={s.data.avatarUrl as string | undefined}
          />
        </StickerWrapper>
      ))}

      {/* Хэштеги */}
      {hashtagStickers.map((s) => (
        <StickerWrapper key={s.id} sticker={s}>
          <HashtagSticker data={s.data} />
        </StickerWrapper>
      ))}

      {/* Локации */}
      {locationStickers.map((s) => (
        <StickerWrapper key={s.id} sticker={s}>
          <LocationSticker data={s.data} />
        </StickerWrapper>
      ))}

      {/* GIF */}
      {gifStickers.map((s) => (
        <StickerWrapper key={s.id} sticker={s}>
          <GifSticker data={s.data} scale={s.scale} />
        </StickerWrapper>
      ))}

      {/* Ссылки */}
      {linkStickers.map((s) => (
        <StickerWrapper key={s.id} sticker={s}>
          <StoryLinkSticker
            url={String(s.data.url ?? "#")}
            text={s.data.text as string | undefined}
          />
        </StickerWrapper>
      ))}

      {/* Музыка */}
      {musicStickers.map((s) => (
        <StickerWrapper key={s.id} sticker={s}>
          <MusicSticker data={s.data} />
        </StickerWrapper>
      ))}

      {/* Интерактивные виджеты (абсолютно внизу) */}
      <div className="absolute left-0 right-0 bottom-20 px-4 flex flex-col gap-3 pointer-events-auto">
        {polls.map((poll) => (
          <StoryPollWidget
            key={poll.id}
            poll={poll}
            results={getPollResults(poll.id)}
            onVote={(idx, val) => vote(poll.id, idx, val)}
          />
        ))}
        {questions.map((q) => (
          <StoryQuestionWidget
            key={String(q.id)}
            question={{
              id: String(q.id),
              story_id: String(q.story_id ?? ""),
              question_text: String(q.question_text ?? q.question ?? ""),
              is_anonymous: Boolean(q.is_anonymous),
            }}
          />
        ))}
        {countdowns.map((c) => (
          <StoryCountdownWidget
            key={String(c.id)}
            countdown={{
              id: String(c.id),
              story_id: String(c.story_id ?? ""),
              title: String(c.title ?? ""),
              end_time: String(c.end_time ?? ""),
            }}
          />
        ))}
        {quizzes.map((qz) => (
          <StoryQuizWidget
            key={String(qz.id)}
            quizId={String(qz.id)}
            question={String(qz.question ?? "")}
            options={qz.options as string[]}
            correctIndex={Number(qz.correct_index ?? 0)}
          />
        ))}
        {sliders.map((sl) => (
          <StoryEmojiSlider
            key={String(sl.id)}
            sliderId={String(sl.id)}
            emoji={String(sl.emoji ?? "😍")}
            prompt={String(sl.prompt ?? "")}
          />
        ))}
      </div>
    </div>
  );
}
