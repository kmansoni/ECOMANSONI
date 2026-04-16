import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Locate, Loader2, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { usePostsMap } from '@/hooks/usePostsMap';
import type { MapBounds, MapPost } from '@/hooks/usePostsMap';
import { PostMapPreviewCard } from '@/components/feed/PostMapMarker';
import { logger } from '@/lib/logger';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const DEFAULT_CENTER: [number, number] = [55.7558, 37.6173]; // Москва
const DEFAULT_ZOOM = 12;

function createPostIcon(thumbnailUrl: string): L.DivIcon {
  const hasThumb = thumbnailUrl && thumbnailUrl.length > 0;
  const html = hasThumb
    ? `<div style="width:44px;height:44px;border-radius:8px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <img loading="lazy" src="${thumbnailUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />
       </div>`
    : `<div style="width:44px;height:44px;border-radius:8px;background:#6366f1;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
       </div>`;

  return L.divIcon({
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    className: '',
  });
}

export default function PostsMapPage() {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [bounds, setBounds] = useState<MapBounds | undefined>(undefined);
  const [selectedPost, setSelectedPost] = useState<MapPost | null>(null);
  const [locating, setLocating] = useState(false);

  const { posts, loading } = usePostsMap(bounds);

  // Инициализация карты
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    const updateBounds = () => {
      const b = map.getBounds();
      setBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };

    map.on('moveend', updateBounds);
    updateBounds();

    return () => {
      map.off('moveend', updateBounds);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Обновление маркеров
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    for (const post of posts) {
      const icon = createPostIcon(post.thumbnail_url);
      const marker = L.marker([post.latitude, post.longitude], { icon });

      marker.on('click', () => {
        setSelectedPost(post);
        mapInstanceRef.current?.panTo([post.latitude, post.longitude]);
      });

      marker.addTo(layer);
    }
  }, [posts]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapInstanceRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 14);
        setLocating(false);
      },
      (err) => {
        logger.error('[PostsMapPage] Geolocation ошибка', { error: err.message });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center gap-2 p-3 bg-gradient-to-b from-background/90 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="min-h-[44px] min-w-[44px] rounded-full bg-card/80 backdrop-blur-sm"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Карта публикаций</h1>
        <div className="flex-1" />
        {loading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
      </div>

      {/* Кнопка геолокации */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLocate}
        disabled={locating}
        className="absolute bottom-24 right-4 z-[1001] min-h-[44px] min-w-[44px] rounded-full bg-card/90 backdrop-blur-sm shadow-lg"
        aria-label="Найти моё местоположение"
      >
        {locating ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Locate className="w-5 h-5" />
        )}
      </Button>

      {/* Счётчик */}
      {posts.length > 0 && (
        <div className="absolute top-16 left-3 z-[1001] px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm text-xs text-muted-foreground shadow">
          <MapPin className="w-3 h-3 inline mr-1" />
          {posts.length} {posts.length === 1 ? 'пост' : 'постов'}
        </div>
      )}

      {/* Пустое состояние */}
      {!loading && posts.length === 0 && bounds && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001] text-center p-4 bg-card/90 backdrop-blur-sm rounded-xl shadow">
          <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Нет постов в этой области</p>
        </div>
      )}

      {/* Карта */}
      <div ref={mapContainerRef} className="flex-1 w-full" />

      {/* Превью выбранного поста */}
      <AnimatePresence>
        {selectedPost && (
          <PostMapPreviewCard
            postId={selectedPost.id}
            thumbnailUrl={selectedPost.thumbnail_url}
            content={selectedPost.content}
            createdAt={selectedPost.created_at}
            onClose={() => setSelectedPost(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
