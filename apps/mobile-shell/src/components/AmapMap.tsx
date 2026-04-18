import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { MapCamera, MapMarker, MapRoute, UserLocation, LatLng } from '../types';

interface AmapMapProps {
  camera?: MapCamera;
  userLocation?: UserLocation | null;
  isTracking?: boolean;
  markers?: MapMarker[];
  route?: MapRoute | null;
  showsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  mapType?: 'standard' | 'satellite' | 'night' | 'navigation';
  onMapClick?: (latlng: LatLng) => void;
  onUserLocationChange?: (location: UserLocation) => void;
  onMarkerPress?: (marker: MapMarker) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

interface InternalMarker {
  id: string;
  position: LatLng;
  title?: string;
  subtitle?: string;
  icon?: string;
  onPress?: () => void;
  element?: HTMLDivElement | null;
}

function AmapMap({
  camera: propCamera,
  userLocation: propUserLocation,
  isTracking = false,
  markers: propMarkers = [],
  route: propRoute,
  showsUserLocation = true,
  showsCompass = true,
  showsScale = true,
  mapType = 'standard',
  onMapClick,
  onUserLocationChange,
  onMarkerPress,
  className = '',
  style,
  children,
}: AmapMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  
  const [isMapReady, setIsMapReady] = useState(false);
  const [internalUserLocation, setInternalUserLocation] = useState<UserLocation | null>(null);
  
  const defaultCenter = useMemo(() => ({ lat: 39.9042, lng: 116.4074 }), []);
  const defaultZoom = 15;
  
  const currentCamera = useMemo(() => ({
    center: propCamera?.center ?? defaultCenter,
    zoom: propCamera?.zoom ?? defaultZoom,
  }), [propCamera, defaultCenter, defaultZoom]);

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;
    
    let map: any = null;
    let L: any = null;
    let maplibregl: any = null;
    
    const initMap = async () => {
      try {
        const linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(linkEl);
        
        const LModule = await import('leaflet');
        L = LModule.default || LModule;
        
        const mapContainer = containerRef.current;
        if (!mapContainer) return;
        
        map = L.map(mapContainer, {
          center: [currentCamera.center.lat, currentCamera.center.lng],
          zoom: currentCamera.zoom,
          zoomControl: false,
          attributionControl: false,
        });
        
        const tileUrls: Record<string, string> = {
          standard: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          night: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          navigation: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        };
        
        const tileUrl = tileUrls[mapType] || tileUrls.standard;
        const tileLayer = L.tileLayer(tileUrl, {
          maxZoom: 19,
          subdomains: mapType === 'standard' ? 'abcd' : undefined,
        });
        
        tileLayer.addTo(map);
        
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
        
        map.on('click', (e: any) => {
          if (onMapClick) {
            onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
          }
        });
        
        markersLayerRef.current = L.layerGroup().addTo(map);
        routeLayerRef.current = L.layerGroup().addTo(map);
        
        mapRef.current = map;
        setIsMapReady(true);
        
        if (showsUserLocation && navigator.geolocation) {
          startGeolocation();
        }
      } catch (err) {
        console.error('[AmapMap] Failed to initialize map:', err);
      }
    };
    
    initMap();
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const startGeolocation = useCallback(() => {
    if (!navigator.geolocation) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location: UserLocation = {
          position: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          heading: position.coords.heading || undefined,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        
        setInternalUserLocation(location);
        
        if (onUserLocationChange) {
          onUserLocationChange(location);
        }
        
        if (userMarkerRef.current && mapRef.current) {
          userMarkerRef.current.setLatLng([location.position.lat, location.position.lng]);
        } else if (mapRef.current) {
          const icon = L.divIcon({
            html: `<div style="width:24px;height:24px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            className: '',
          });
          userMarkerRef.current = L.marker([location.position.lat, location.position.lng], { icon })
            .addTo(mapRef.current);
        }
        
        if (isTracking && mapRef.current) {
          mapRef.current.setView([location.position.lat, location.position.lng], mapRef.current.getZoom());
        }
      },
      (error) => {
        console.warn('[AmapMap] Geolocation error:', error.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isTracking, onUserLocationChange]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    
    mapRef.current.setView(
      [currentCamera.center.lat, currentCamera.center.lng],
      currentCamera.zoom,
      { animate: true }
    );
  }, [currentCamera, isMapReady]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();
    
    const L = (window as any).L;
    if (!L) return;
    
    for (const marker of propMarkers) {
      const el = document.createElement('div');
      el.className = 'amap-marker';
      el.innerHTML = marker.icon || `<div style="width:32px;height:32px;background:#F43F5E;border:2px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`;
      
      const icon = L.divIcon({
        html: el.innerHTML,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: '',
      });
      
      const leafletMarker = L.marker([marker.position.lat, marker.position.lng], { icon });
      
      if (marker.title || marker.subtitle) {
        leafletMarker.bindPopup(`<b>${marker.title || ''}</b><br/>${marker.subtitle || ''}`);
      }
      
      if (marker.onPress) {
        leafletMarker.on('click', marker.onPress);
      }
      
      if (onMarkerPress) {
        leafletMarker.on('click', () => onMarkerPress(marker));
      }
      
      leafletMarker.addTo(markersLayerRef.current);
    }
  }, [propMarkers, isMapReady, onMarkerPress]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();
    
    const L = (window as any).L;
    if (!L || !propRoute || propRoute.points.length < 2) return;
    
    const latlngs = propRoute.points.map(p => [p.lat, p.lng] as [number, number]);
    const color = propRoute.color || '#3B82F6';
    const width = propRoute.width || 6;
    
    L.polyline(latlngs, {
      color,
      weight: width,
      opacity: 0.9,
      smoothFactor: 2,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayerRef.current);
    
    if (propRoute.points.length >= 2) {
      const bounds = L.latLngBounds(latlngs);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [propRoute, isMapReady]);

  return (
    <div
      ref={containerRef}
      className={`amap-map ${className}`}
      style={{
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default AmapMap;
export type { AmapMapProps };