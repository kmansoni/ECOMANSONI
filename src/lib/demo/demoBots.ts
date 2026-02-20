import avatar1 from "@/assets/story-avatar-1.jpg";
import avatar2 from "@/assets/story-avatar-2.jpg";
import avatar3 from "@/assets/story-avatar-3.jpg";
import avatar4 from "@/assets/story-avatar-4.jpg";
import avatar5 from "@/assets/story-avatar-5.jpg";

import story1 from "@/assets/story-content-1.jpg";
import story2 from "@/assets/story-content-2.jpg";
import story3 from "@/assets/story-content-3.jpg";
import story4 from "@/assets/story-content-4.jpg";
import story5 from "@/assets/story-content-5.jpg";

const avatars = [avatar1, avatar2, avatar3, avatar4, avatar5];
const media = [story1, story2, story3, story4, story5];

function isoNowMinus(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function isoNowPlus(hours: number) {
  return new Date(Date.now() + hours * 60 * 60_000).toISOString();
}

export type DemoStory = {
  id: string;
  author_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
};

export type DemoUserWithStories = {
  user_id: string;
  display_name: string;
  avatar_url: string;
  verified: boolean;
  stories: DemoStory[];
  hasNew: boolean;
  isOwn: boolean;
};

export type DemoReel = {
  id: string;
  author_id: string;
  video_url: string;
  thumbnail_url?: string;
  description?: string;
  music_title?: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  saves_count?: number;
  reposts_count?: number;
  shares_count?: number;
  created_at: string;
  author?: {
    display_name: string;
    avatar_url: string;
    verified: boolean;
  };
  isLiked?: boolean;
  isSaved?: boolean;
  isReposted?: boolean;
};

const BOT_NAMES = [
  "Алина", "Илья", "Мария", "Дамир", "София",
  "Егор", "Диана", "Никита", "Карина", "Артём",
  "Ксения", "Роман", "Полина", "Тимур", "Виктория",
  "Максим", "Елена", "Сергей", "Дарья", "Руслан",
];

export function getDemoBotsUsersWithStories(): DemoUserWithStories[] {
  const expiresAt = isoNowPlus(24);
  return BOT_NAMES.map((name, idx) => {
    const botId = `demo_bot_${String(idx + 1).padStart(2, "0")}`;
    const avatarUrl = avatars[idx % avatars.length];

    const story: DemoStory = {
      id: `demo_story_${String(idx + 1).padStart(2, "0")}_01`,
      author_id: botId,
      media_url: media[idx % media.length],
      media_type: "image",
      caption: idx % 3 === 0 ? "Доброе утро ☕" : idx % 3 === 1 ? "День в движении" : "Немного красоты",
      created_at: isoNowMinus(10 + idx * 7),
      expires_at: expiresAt,
    };

    return {
      user_id: botId,
      display_name: `${name} · bot`,
      avatar_url: avatarUrl,
      verified: idx % 5 === 0,
      stories: [story],
      hasNew: true,
      isOwn: false,
    };
  });
}

export function getDemoBotsReels(): DemoReel[] {
  return BOT_NAMES.map((name, idx) => {
    const botId = `demo_bot_${String(idx + 1).padStart(2, "0")}`;
    const avatarUrl = avatars[idx % avatars.length];
    const imageUrl = media[(idx + 2) % media.length];

    return {
      id: `demo_reel_${String(idx + 1).padStart(2, "0")}`,
      author_id: botId,
      // В ReelsPage не-mp4 рендерится как <img>, поэтому можно безопасно использовать jpg.
      video_url: imageUrl,
      thumbnail_url: imageUrl,
      description: idx % 2 === 0 ? "Тестовый рилс (демо)" : "Короткий момент дня (демо)",
      music_title: idx % 3 === 0 ? "lofi beats" : undefined,
      likes_count: 20 + idx * 3,
      comments_count: 3 + (idx % 5),
      views_count: 150 + idx * 17,
      saves_count: 2 + (idx % 4),
      reposts_count: idx % 3,
      shares_count: idx % 2,
      created_at: isoNowMinus(60 + idx * 13),
      author: {
        display_name: `${name} · bot`,
        avatar_url: avatarUrl,
        verified: idx % 5 === 0,
      },
      isLiked: false,
      isSaved: false,
      isReposted: false,
    };
  });
}

export function isDemoId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith("demo_");
}
