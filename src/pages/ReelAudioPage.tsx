import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Music2, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  cover_url: string;
  audio_url: string;
  duration_seconds: number;
  reels_count: number;
}

interface ReelItem {
  id: string;
  video_url: string;
  thumbnail_url: string;
  views_count: number;
  author: {
    username: string;
    avatar_url: string;
  };
}

export default function ReelAudioPage() {
  const { audioId } = useParams<{ audioId: string }>();
  const navigate = useNavigate();
  const [audio, setAudio] = useState<AudioTrack | null>(null);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [audioEl] = useState(() => new Audio());

  useEffect(() => {
    if (!audioId) return;
    (async () => {
      const { data: a } = await (supabase as any)
        .from("reel_audios")
        .select("*")
        .eq("id", audioId)
        .single();
      if (a) {
        setAudio(a);
        audioEl.src = a.audio_url;
      }
      const { data: r } = await (supabase as any)
        .from("reels")
        .select(`
          id, video_url, thumbnail_url, views_count,
          profiles:user_id (username, avatar_url)
        `)
        .eq("audio_id", audioId)
        .order("views_count", { ascending: false })
        .limit(30);
      if (r) {
        setReels(
          r.map((reel: any) => ({
            id: reel.id,
            video_url: reel.video_url,
            thumbnail_url: reel.thumbnail_url,
            views_count: reel.views_count ?? 0,
            author: {
              username: reel.profiles?.username ?? "user",
              avatar_url: reel.profiles?.avatar_url || "",
            },
          }))
        );
      }
    })();
    return () => { audioEl.pause(); };
  }, [audioId]);

  const togglePlay = () => {
    if (playing) {
      audioEl.pause();
      setPlaying(false);
    } else {
      audioEl.play().catch(() => {});
      setPlaying(true);
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!audio) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold text-foreground">Аудио</span>
      </div>

      {/* Audio info */}
      <div className="px-4 py-6 flex items-center gap-4">
        {audio.cover_url ? (
          <img src={audio.cover_url} alt={audio.title} className="w-20 h-20 rounded-2xl object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Music2 className="w-8 h-8 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-lg truncate">{audio.title}</p>
          {audio.artist && <p className="text-muted-foreground text-sm truncate">{audio.artist}</p>}
          <p className="text-muted-foreground text-xs mt-1">
            {audio.reels_count} рилсов · {formatDuration(audio.duration_seconds)}
          </p>
        </div>
        <button
          onClick={togglePlay}
          className="w-12 h-12 bg-primary rounded-full flex items-center justify-center flex-shrink-0"
        >
          {playing ? (
            <div className="flex gap-0.5">
              <div className="w-1 h-4 bg-white rounded-full" />
              <div className="w-1 h-4 bg-white rounded-full" />
            </div>
          ) : (
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          )}
        </button>
      </div>

      {/* Reels grid */}
      <div className="px-1">
        <p className="px-3 pb-3 text-sm font-semibold text-foreground">
          Рилсы с этим треком
        </p>
        <div className="grid grid-cols-3 gap-0.5">
          {reels.map((reel) => (
            <button
              key={reel.id}
              onClick={() => navigate(`/reels?id=${reel.id}`)}
              className="relative aspect-[9/16] bg-zinc-900 overflow-hidden"
            >
              {reel.thumbnail_url ? (
                <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={reel.video_url} className="w-full h-full object-cover" muted playsInline />
              )}
              <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
                <Play className="w-3 h-3 text-white fill-white" />
                <span className="text-white text-xs">{reel.views_count}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
