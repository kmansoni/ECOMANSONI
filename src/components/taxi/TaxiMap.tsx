import { useEffect, useRef, memo } from 'react';
import { MapPin, Navigation, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import { TARIFF_COLORS } from '@/lib/taxi/constants';

// ─── Leaflet импорт (только client-side) ──────────────────────────────────────
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Исправление стандартной проблемы с иконками Leaflet в Vite/Webpack
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

// ─── SVG-иконки для маркеров ──────────────────────────────────────────────────
function createPickupIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="
        width:36px;height:36px;
        background:#22c55e;
        border:3px solid white;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="transform:rotate(45deg);font-size:14px;color:white;font-weight:bold">A</div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    className: '',
  });
}

function createDestinationIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="
        width:36px;height:36px;
        background:#ef4444;
        border:3px solid white;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="transform:rotate(45deg);font-size:14px;color:white;font-weight:bold">B</div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    className: '',
  });
}

function createDriverIcon(heading: number): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="
        width:44px;height:44px;
        position:relative;
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="
          width:40px;height:40px;
          background:#3b82f6;
          border:3px solid white;
          border-radius:50%;
          box-shadow:0 2px 12px rgba(59,130,246,0.5);
          display:flex;align-items:center;justify-content:center;
          font-size:20px;
        ">🚖</div>
        <div style="
          position:absolute;top:-6px;left:50%;transform:translateX(-50%) rotate(${heading}deg);
          width:0;height:0;
          border-left:6px solid transparent;
          border-right:6px solid transparent;
          border-bottom:10px solid #3b82f6;
        "></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    className: '',
  });
}

function createUserLocationIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="
        width:20px;height:20px;
        background:#3b82f6;
        border:3px solid white;
        border-radius:50%;
        box-shadow:0 0 0 6px rgba(59,130,246,0.2);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    className: '',
  });
}

function createNearbyDriverIcon(tariff: string): L.DivIcon {
  const color = TARIFF_COLORS[tariff as keyof typeof TARIFF_COLORS] ?? '#6366f1';
  return L.divIcon({
    html: `
      <div style="
        width:28px;height:28px;
        background:${color};
        border:2px solid white;
        border-radius:50%;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        font-size:12px;
        opacity:0.85;
      ">🚗</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    className: '',
  });
}

// ─── Компонент карты ────────────────────────────────────────────────────────
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
  const nearbyLayerRef = useRef<L.LayerGroup | null>(null);

  // ─── Инициализация карты ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Обработчик клика по карте
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
        // Плавная анимация перемещения через setLatLng
        driverMarkerRef.current.setLatLng([driverPosition.lat, driverPosition.lng]);
        // Обновляем иконку с новым heading
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

  // ─── Маршрут (polyline) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    if (routePoints.length >= 2) {
      routePolylineRef.current = L.polyline(
        routePoints.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.8,
          smoothFactor: 2,
          dashArray: undefined,
        }
      ).addTo(mapRef.current);
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

  return (
    <div className={cn('relative w-full h-full', className)}>
      {/* Контейнер карты */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Кнопка «Моё местоположение» */}
      {onCenterOnUser && (
        <button
          onClick={onCenterOnUser}
          className={cn(
            'absolute bottom-4 right-4 z-[1000]',
            'w-10 h-10 rounded-full',
            'bg-white shadow-lg border border-gray-100',
            'flex items-center justify-center',
            'transition-transform active:scale-95',
            'hover:shadow-xl'
          )}
          aria-label="Моё местоположение"
        >
          <Crosshair className="h-5 w-5 text-blue-600" />
        </button>
      )}
    </div>
  );
});
