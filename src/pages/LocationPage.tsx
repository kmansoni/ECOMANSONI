import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LocationData {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  category?: string;
  posts_count: number;
}

interface Post {
  id: string;
  image_url?: string;
  caption?: string;
}

export default function LocationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [{ data: loc }, { data: postsData }] = await Promise.all([
          (supabase as any).from("locations").select("*").eq("id", id).single(),
          (supabase as any).from("posts").select("id, image_url, caption").eq("location_id", id).order("created_at", { ascending: false }).limit(30),
        ]);
        setLocation(loc);
        setPosts(postsData ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (!location) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
      <MapPin className="w-12 h-12 text-muted-foreground" />
      <p className="text-muted-foreground">Локация не найдена</p>
      <button onClick={() => navigate(-1)} className="text-primary text-sm">Назад</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-foreground font-semibold flex-1 truncate">{location.name}</h1>
      </div>

      {/* Location info */}
      <div className="px-4 py-4 space-y-3">
        <div className="bg-muted rounded-2xl p-4 flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-6 h-6 text-pink-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground font-semibold">{location.name}</p>
            {location.address && <p className="text-muted-foreground text-sm mt-0.5">{location.address}</p>}
            {location.category && <p className="text-muted-foreground text-xs mt-1">{location.category}</p>}
            <p className="text-muted-foreground text-xs mt-1">{location.posts_count} публикаций</p>
          </div>
          <a
            href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary flex-shrink-0"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>

        {/* Static map */}
        <div className="bg-muted rounded-2xl h-40 flex items-center justify-center overflow-hidden">
          <a
            href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 text-muted-foreground"
          >
            <MapPin className="w-10 h-10 text-pink-400" />
            <span className="text-sm">Открыть карту</span>
            <span className="text-xs text-muted-foreground/60">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
          </a>
        </div>
      </div>

      {/* Posts grid */}
      <div className="px-4">
        <h2 className="text-foreground font-semibold text-sm mb-3">Публикации</h2>
        {posts.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Нет публикаций для этой локации</p>
        ) : (
          <div className="grid grid-cols-3 gap-px">
            {posts.map(post => (
              <div key={post.id} className="aspect-square bg-muted overflow-hidden">
                {post.image_url && (
                  <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
