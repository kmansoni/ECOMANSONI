import { useEffect, useRef, useState, useCallback } from 'react';
import type { LatLng, MapRoute, MapCamera } from '../types';

interface LocalTileConfig {
  tileDir: string;
  minZoom: number;
  maxZoom: number;
}

interface LocalMapProps {
  center?: LatLng;
  zoom?: number;
  rotation?: number;
  routes?: MapRoute[];
  userLocation?: LatLng | null;
  destination?: LatLng | null;
  onLocationUpdate?: (pos: LatLng) => void;
  tileConfig?: LocalTileConfig;
  className?: string;
}

const DEFAULT_CENTER: LatLng = { lat: 55.7558, lng: 37.6173 };
const DEFAULT_ZOOM = 14;
const TILE_SIZE = 256;

export function LocalMap({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  rotation = 0,
  routes = [],
  userLocation = null,
  destination = null,
  onLocationUpdate,
  tileConfig = { tileDir: '/tiles', minZoom: 1, maxZoom: 17 },
  className = '',
}: LocalMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<MapCamera>({ center, zoom, heading: rotation });
  const [loadedTiles, setLoadedTiles] = useState<Map<string, HTMLImageElement>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const getTileUrl = useCallback((z: number, x: number, y: number): string => {
    return `${tileConfig.tileDir}/${z}/${x}/${y}.png`;
  }, [tileConfig]);

  const latLngToPixel = useCallback((lat: number, lng: number): { x: number, y: number } => {
    const n = Math.pow(2, camera.zoom);
    const x = ((lng + 180) / 360) * n * TILE_SIZE;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * TILE_SIZE;
    return { x, y };
  }, [camera.zoom]);

  const pixelToLatLng = useCallback((x: number, y: number): LatLng => {
    const n = Math.pow(2, camera.zoom);
    const lng = x / TILE_SIZE / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / TILE_SIZE / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lng };
  }, [camera.zoom]);

  const getVisibleTiles = useCallback(() => {
    const container = containerRef.current;
    if (!container) return [];
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const centerPx = latLngToPixel(camera.center.lat, camera.center.lng);
    
    const z = camera.zoom;
    const n = Math.pow(2, z);
    
    const startX = Math.floor((centerPx.x - width / 2) / TILE_SIZE);
    const endX = Math.ceil((centerPx.x + width / 2) / TILE_SIZE);
    const startY = Math.floor((centerPx.y - height / 2) / TILE_SIZE);
    const endY = Math.ceil((centerPx.y + height / 2) / TILE_SIZE);
    
    const tiles = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const tx = ((x % n) + n) % n;
        const ty = ((y % n) + n) % n;
        if (y >= 0 && y < n) {
          tiles.push({ x: tx, y: ty, z });
        }
      }
    }
    return tiles;
  }, [camera, latLngToPixel]);

  useEffect(() => {
    const loadTile = async (z: number, x: number, y: number): Promise<HTMLImageElement | null> => {
      const key = `${z}/${x}/${y}`;
      if (loadedTiles.has(key)) {
        return loadedTiles.get(key) || null;
      }
      
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const handleLoad = () => {
          setLoadedTiles(prev => {
            const next = new Map(prev);
            next.set(key, img);
            return next;
          });
          resolve(img);
        };
        
        const handleError = () => {
          console.warn(`Failed to load tile: ${z}/${x}/${y}`);
          resolve(null);
        };
        
        img.onload = handleLoad;
        img.onerror = handleError;
        img.src = getTileUrl(z, x, y);
      });
    };

    const loadTiles = async () => {
      const tiles = getVisibleTiles();
      if (tiles.length === 0) return;
      
      setIsLoading(true);
      await Promise.all(tiles.map(t => loadTile(t.z, t.x, t.y)));
      setIsLoading(false);
    };

    loadTiles();
  }, [getVisibleTiles, getTileUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    const centerPx = latLngToPixel(camera.center.lat, camera.center.lng);
    const offsetX = width / 2 - centerPx.x;
    const offsetY = height / 2 - centerPx.y;

    const tiles = getVisibleTiles();
    for (const tile of tiles) {
      const key = `${tile.z}/${tile.x}/${tile.y}`;
      const img = loadedTiles.get(key);
      
      if (img) {
        const tx = tile.x * TILE_SIZE + offsetX;
        const ty = tile.y * TILE_SIZE + offsetY;
        ctx.drawImage(img, tx, ty);
      }
    }

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-camera.heading * Math.PI / 180);
    ctx.translate(-width / 2, -height / 2);

    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const route of routes) {
      if (route.points.length < 2) continue;
      
      ctx.beginPath();
      const start = latLngToPixel(route.points[0].lat, route.points[0].lng);
      ctx.moveTo(start.x + offsetX, start.y + offsetY);
      
      for (let i = 1; i < route.points.length; i++) {
        const pt = latLngToPixel(route.points[i].lat, route.points[i].lng);
        ctx.lineTo(pt.x + offsetX, pt.y + offsetY);
      }
      ctx.stroke();
    }

    if (userLocation) {
      const pos = latLngToPixel(userLocation.lat, userLocation.lng);
      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(pos.x + offsetX, pos.y + offsetY, 10, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(pos.x + offsetX, pos.y + offsetY, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (destination) {
const pos = latLngToPixel(destination.lat, destination.lng);
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.moveTo(pos.x + offsetX, pos.y + offsetY - 15);
      ctx.lineTo(pos.x + offsetX + 15, pos.y + offsetY + 15);
      ctx.lineTo(pos.x + offsetX - 15, pos.y + offsetY + 15);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

  }, [camera, routes, userLocation, destination, loadedTiles, latLngToPixel, getVisibleTiles]);

  const handlePan = useCallback((dx: number, dy: number) => {
    const newCenter = pixelToLatLng(
      camera.center.lng * Math.pow(2, camera.zoom) * TILE_SIZE / 360 - dx,
      camera.center.lat * Math.pow(2, camera.zoom) * TILE_SIZE / 360 - dy
    );
    setCamera(prev => ({ ...prev, center: newCenter }));
  }, [pixelToLatLng]);

  const handleZoom = useCallback((delta: number) => {
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(tileConfig.minZoom, Math.min(tileConfig.maxZoom, prev.zoom + delta))
    }));
  }, [tileConfig]);

  useEffect(() => {
    setCamera({ center, zoom, heading: rotation });
  }, [center, zoom, rotation]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ background: '#E5E7EB' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />
      
      {isLoading && (
        <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full">
          <span className="text-white text-sm">Loading tiles...</span>
        </div>
      )}

      <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-2 rounded-lg">
        <div className="text-white text-xs">
          <div>Lat: {camera.center.lat.toFixed(4)}</div>
          <div>Lng: {camera.center.lng.toFixed(4)}</div>
          <div>Zoom: {camera.zoom}</div>
        </div>
      </div>

      <div className="absolute right-4 bottom-4 flex flex-col gap-2">
        <button 
          onClick={() => handleZoom(1)}
          className="w-10 h-10 bg-white rounded-lg shadow-lg flex items-center justify-center"
        >
          <span className="text-xl">+</span>
        </button>
        <button 
          onClick={() => handleZoom(-1)}
          className="w-10 h-10 bg-white rounded-lg shadow-lg flex items-center justify-center"
        >
          <span className="text-xl">−</span>
        </button>
      </div>
    </div>
  );
}

export default LocalMap;