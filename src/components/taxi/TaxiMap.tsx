import { useEffect, useRef, memo } from 'react';
import { Crosshair, ZoomIn, ZoomOut, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import { TARIFF_COLORS } from '@/lib/taxi/constants';

// ─── Leaflet импорт (только client-side) ──────────────────────────────────────
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
});

// ─── Типы ──────────────────────────────────────────────────────────────────────
interface NearbyDriver {
  id: string;
  location: LatLng;
  tariff: string;
}

interface TaxiMapProps {
  center: LatLng;
  zoom: number;
  pickupMarker?: LatLng | null;
  destinationMarker?: LatLng | null;
  driverPosition?: LatLng | null;
  driverHeading?: number;
  routePoints?: LatLng[];
  nearbyDrivers?: NearbyDriver[];
  userLocation?: LatLng | null;
  showNearbyDrivers?: boolean;
  onCenterOnUser?: () => void;
  onMapClick?: (latlng: LatLng) => void;
  className?: string;
}

// ─── Тайлы карт (Яндекс-стиль: тёмная тема) ─────────────────────────────────
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// ─── SVG-иконки маркеров (Яндекс Navigator стиль) ────────────────────────────
function createPickupIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="position:relative;width:40px;height:52px;">
        <svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="#4ADE80"/>
          <circle cx="20" cy="20" r="12" fill="#fff"/>
          <circle cx="20" cy="20" r="6" fill="#22c55e"/>
        </svg>
        <div style="position:absolute;top:12px;left:0;width:40px;text-align:center;font-size:11px;font-weight:700;color:#166534;">A</div>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    className: '',
  });
}

function createDestinationIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="position:relative;width:40px;height:52px;">
        <svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="#F43F5E"/>
          <circle cx="20" cy="20" r="12" fill="#fff"/>
          <circle cx="20" cy="20" r="6" fill="#ef4444"/>
        </svg>
        <div style="position:absolute;top:12px;left:0;width:40px;text-align:center;font-size:11px;font-weight:700;color:#991b1b;">B</div>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    className: '',
  });
}

function createDriverIcon(heading: number): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="width:48px;height:48px;position:relative;display:flex;align-items:center;justify-content:center;">
        <!-- Пульсирующий ореол -->
        <div style="
          position:absolute;inset:-4px;
          border-radius:50%;
          background:radial-gradient(circle,rgba(252,211,77,0.4) 0%,transparent 70%);
          animation:yandex-pulse 2s ease-in-out infinite;
        "></div>
        <!-- Машинка -->
        <div style="
          width:40px;height:40px;
          background:linear-gradient(135deg,#FBBF24,#F59E0B);
          border:3px solid #FDE68A;
          border-radius:50%;
          box-shadow:0 2px 12px rgba(245,158,11,0.5),0 0 20px rgba(251,191,36,0.3);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
          transform:rotate(${heading}deg);
        ">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#78350F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 17h14v-5l-2-5H7L5 12v5z"/>
            <circle cx="7.5" cy="17.5" r="1.5"/>
            <circle cx="16.5" cy="17.5" r="1.5"/>
            <path d="M5 12h14"/>
          </svg>
        </div>
        <!-- Стрелка направления -->
        <div style="
          position:absolute;top:-8px;left:50%;transform:translateX(-50%);
          width:0;height:0;
          border-left:7px solid transparent;
          border-right:7px solid transparent;
          border-bottom:12px solid #F59E0B;
          filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));
        "></div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    className: '',
  });
}

function createUserLocationIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="
        width:22px;height:22px;
        background:radial-gradient(circle,#60A5FA 0%,#3B82F6 100%);
        border:3px solid white;
        border-radius:50%;
        box-shadow:0 0 0 8px rgba(59,130,246,0.15),0 2px 8px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    className: '',
  });
}

function createNearbyDriverIcon(tariff: string): L.DivIcon {
  const color = TARIFF_COLORS[tariff as keyof typeof TARIFF_COLORS] ?? '#6366f1';
  return L.divIcon({
    html: `
      <div style="
        width:30px;height:30px;
        background:${color};
        border:2px solid rgba(255,255,255,0.9);
        border-radius:50%;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        opacity:0.9;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
          <path d="M5 17h14v-5l-2-5H7L5 12v5z"/>
          <circle cx="7.5" cy="17.5" r="1.5"/>
          <circle cx="16.5" cy="17.5" r="1.5"/>
        </svg>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    className: '',
  });
}

// ─── Компонент карты (Яндекс Navigator стиль) ─────────────────────────────────
export const TaxiMap = memo(function TaxiMap({
  center,
  zoom,
  pickupMarker,
  destinationMarker,
  driverPosition,
  driverHeading = 0,
  routePoints = [],
  nearbyDrivers = [],
  userLocation,
  showNearbyDrivers = true,
  onCenterOnUser,
  onMapClick,
  className,
}: TaxiMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const routeShadowRef = useRef<L.Polyline | null>(null);
  const nearbyLayerRef = useRef<L.LayerGroup | null>(null);

  // ─── Инициализация карты ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    // Тёмная тема тайлов (как Яндекс Навигатор ночью)
    L.tileLayer(DARK_TILE_URL, {
      attribution: DARK_TILE_ATTR,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);



    if (onMapClick) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

    mapRef.current = map;
    nearbyLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Обновление центра/зума ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center, zoom]);

  // ─── Маркер подачи ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }
    if (pickupMarker) {
      pickupMarkerRef.current = L.marker([pickupMarker.lat, pickupMarker.lng], {
        icon: createPickupIcon(),
      }).addTo(mapRef.current);
    }
  }, [pickupMarker]);

  // ─── Маркер назначения ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }
    if (destinationMarker) {
      destinationMarkerRef.current = L.marker(
        [destinationMarker.lat, destinationMarker.lng],
        { icon: createDestinationIcon() }
      ).addTo(mapRef.current);
    }
  }, [destinationMarker]);

  // ─── Маркер водителя (с анимацией) ───────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (driverPosition) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverPosition.lat, driverPosition.lng]);
        driverMarkerRef.current.setIcon(createDriverIcon(driverHeading));
      } else {
        driverMarkerRef.current = L.marker([driverPosition.lat, driverPosition.lng], {
          icon: createDriverIcon(driverHeading),
          zIndexOffset: 1000,
        }).addTo(mapRef.current);
      }
    } else {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.remove();
        driverMarkerRef.current = null;
      }
    }
  }, [driverPosition, driverHeading]);

  // ─── Маркер геопозиции пользователя ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation) {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: createUserLocationIcon(),
        zIndexOffset: 500,
      }).addTo(mapRef.current);
    }
  }, [userLocation]);

  // ─── Маршрут (Яндекс-стиль: толстая линия с тенью) ──────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    if (routeShadowRef.current) {
      routeShadowRef.current.remove();
      routeShadowRef.current = null;
    }
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    if (routePoints.length >= 2) {
      const latlngs = routePoints.map((p) => [p.lat, p.lng] as [number, number]);

      // Тень маршрута
      routeShadowRef.current = L.polyline(latlngs, {
        color: '#000000',
        weight: 10,
        opacity: 0.15,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapRef.current);

      // Основная линия (Яндекс жёлто-зелёный градиент имитация)
      routePolylineRef.current = L.polyline(latlngs, {
        color: '#FBBF24',
        weight: 6,
        opacity: 0.95,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapRef.current);
    }
  }, [routePoints]);

  // ─── Водители рядом ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !nearbyLayerRef.current) return;
    nearbyLayerRef.current.clearLayers();

    if (showNearbyDrivers) {
      nearbyDrivers.forEach((driver) => {
        L.marker([driver.location.lat, driver.location.lng], {
          icon: createNearbyDriverIcon(driver.tariff),
        }).addTo(nearbyLayerRef.current!);
      });
    }
  }, [nearbyDrivers, showNearbyDrivers]);

  // ─── Zoom helpers ──────────────────────────────────────────────────────────
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div className={cn('relative w-full h-full', className)}>
      {/* Контейнер карты */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Яндекс-стиль: правая панель кнопок */}
      <div className="absolute bottom-24 right-3 z-[1000] flex flex-col gap-2">
        {/* Zoom In */}
        <button
          onClick={handleZoomIn}
          className={cn(
            'w-11 h-11 rounded-xl',
            'bg-gray-900/80 backdrop-blur-md border border-white/10',
            'flex items-center justify-center',
            'transition-all active:scale-95 hover:bg-gray-800/90',
            'shadow-lg shadow-black/30'
          )}
          aria-label="Приблизить"
        >
          <ZoomIn className="h-5 w-5 text-white" />
        </button>

        {/* Zoom Out */}
        <button
          onClick={handleZoomOut}
          className={cn(
            'w-11 h-11 rounded-xl',
            'bg-gray-900/80 backdrop-blur-md border border-white/10',
            'flex items-center justify-center',
            'transition-all active:scale-95 hover:bg-gray-800/90',
            'shadow-lg shadow-black/30'
          )}
          aria-label="Отдалить"
        >
          <ZoomOut className="h-5 w-5 text-white" />
        </button>

        {/* Моё местоположение */}
        {onCenterOnUser && (
          <button
            onClick={onCenterOnUser}
            className={cn(
              'w-11 h-11 rounded-xl',
              'bg-gray-900/80 backdrop-blur-md border border-white/10',
              'flex items-center justify-center',
              'transition-all active:scale-95 hover:bg-gray-800/90',
              'shadow-lg shadow-black/30'
            )}
            aria-label="Моё местоположение"
          >
            <Crosshair className="h-5 w-5 text-blue-400" />
          </button>
        )}
      </div>

      {/* CSS анимации для пульсации водителя */}
      <style>{`
        @keyframes yandex-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 0.1; }
        }
      `}</style>
    </div>
  );
});
