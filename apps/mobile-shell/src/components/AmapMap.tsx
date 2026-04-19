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

declare global {
  interface Window {
    AMap: any;
    AMapUI: any;
  }
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
    let amapLoaded = false;
    
    const mapTypeMap: Record<string, string> = {
      standard: 'normal',
      satellite: 'satellite',
      night: 'night',
      navigation: 'normal',
    };
    
    const initMap = async () => {
      try {
        // Load Amap JS API
        const amapKey = process.env.AMAP_WEB_KEY || 'YOUR_AMAP_KEY';
        
        if (!window.AMap) {
          const script = document.createElement('script');
          script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
          script.async = true;
          
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        
        amapLoaded = true;
        const AMap = window.AMap;
        
        const mapContainer = containerRef.current;
        if (!mapContainer) return;
        
        map = new AMap.Map(mapContainer, {
          center: [currentCamera.center.lng, currentCamera.center.lat],
          zoom: currentCamera.zoom,
          mapStyle: `amap://styles/${mapTypeMap[mapType] || 'normal'}`,
          showCompass: showsCompass,
          showScale: showsScale,
          pitch: 0,
          rotation: 0,
          viewMode: '2D',
          zoomEnable: true,
          dragEnable: true,
          keyboardEnable: false,
        });
        
        // Create layers
        markersLayerRef.current = new AMap.LabelsLayer({
          zIndex: 100,
          collision: false,
        });
        map.add(markersLayerRef.current);
        
        routeLayerRef.current = new AMap.LabelsLayer({
          zIndex: 50,
          collision: false,
        });
        map.add(routeLayerRef.current);
        
        map.on('click', (e: any) => {
          if (onMapClick) {
            onMapClick({ lat: e.lnglat.getLat(), lng: e.lnglat.getLng() });
          }
        });
        
        mapRef.current = map;
        setIsMapReady(true);
        
        if (showsUserLocation && !propUserLocation && navigator.geolocation) {
          startGeolocation(map, AMap);
        }
      } catch (err) {
        console.error('[AmapMap] Failed to initialize map:', err);
        // Fallback to simple initialization
        initFallback();
      }
    };
    
    const initFallback = () => {
      // Fallback if Amap fails - create placeholder
      const container = containerRef.current;
      if (container) {
        container.innerHTML = `
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#666;">
            <div style="text-align:center;">
              <div style="font-size:48px;margin-bottom:16px;">🗺️</div>
              <div style="font-size:16px;">Amap Map</div>
              <div style="font-size:12px;color:#999;margin-top:8px;">${currentCamera.center.lat.toFixed(4)}, ${currentCamera.center.lng.toFixed(4)}</div>
            </div>
          </div>
        `;
      }
      setIsMapReady(true);
    };
    
    initMap();
    
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [currentCamera.center.lat, currentCamera.center.lng, currentCamera.zoom, mapType, propUserLocation, showsCompass, showsScale, showsUserLocation]);

  const startGeolocation = useCallback((map: any, AMap: any) => {
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
        
        // Update or create marker
        const lnglat = new AMap.LngLat(location.position.lng, location.position.lat);
        
        if (userMarkerRef.current) {
          userMarkerRef.current.setPosition(lnglat);
        } else {
          const markerContent = document.createElement('div');
          markerContent.className = 'amap-user-marker';
          markerContent.innerHTML = `
            <div style="
              width: 24px;
              height: 24px;
              background: #3B82F6;
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              position: relative;
            ">
              <div style="
                position: absolute;
                top: -8px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-bottom: 8px solid #3B82F6;
              "></div>
            </div>
          `;
          
          userMarkerRef.current = new AMap.Marker({
            position: lnglat,
            content: markerContent,
            offset: new AMap.Pixel(-12, -12),
            zIndex: 200,
          });
          map.add(userMarkerRef.current);
        }
        
        if (isTracking && mapRef.current) {
          mapRef.current.setCenter(lnglat);
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
    
    const AMap = window.AMap;
    if (!AMap) return;
    
    mapRef.current.setCenter(
      new AMap.LngLat(currentCamera.center.lng, currentCamera.center.lat)
    );
    mapRef.current.setZoom(currentCamera.zoom);
  }, [currentCamera, isMapReady]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !markersLayerRef.current) return;
    
    const AMap = window.AMap;
    if (!AMap) return;
    
    markersLayerRef.current.removeAll();
    
    for (const marker of propMarkers) {
      const markerContent = document.createElement('div');
      markerContent.className = 'amap-marker';
      markerContent.innerHTML = marker.icon || `
        <div style="
          width: 32px;
          height: 32px;
          background: #F43F5E;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 12px;height: 12px;background: white;border-radius: 50%;"></div>
        </div>
      `;
      
      const amapMarker = new AMap.Marker({
        position: new AMap.LngLat(marker.position.lng, marker.position.lat),
        content: markerContent,
        offset: new AMap.Pixel(-16, -32),
        zIndex: 100,
      });
      
      // Add click handler
      if (marker.onPress || onMarkerPress) {
        amapMarker.on('click', () => {
          if (marker.onPress) marker.onPress();
          if (onMarkerPress) onMarkerPress(marker);
        });
      }
      
      // Add info window if title or subtitle
      if (marker.title || marker.subtitle) {
        const infoWindow = new AMap.InfoWindow({
          content: `
            <div style="padding: 8px; max-width: 200px;">
              ${marker.title ? `<div style="font-weight: bold; margin-bottom: 4px;">${marker.title}</div>` : ''}
              ${marker.subtitle ? `<div style="color: #666;">${marker.subtitle}</div>` : ''}
            </div>
          `,
          offset: new AMap.Pixel(0, -30),
        });
        amapMarker.on('mouseover', () => {
          infoWindow.open(mapRef.current, amapMarker.getPosition());
        });
      }
      
      markersLayerRef.current.add(amapMarker);
    }
  }, [propMarkers, isMapReady, onMarkerPress]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !routeLayerRef.current) return;
    
    const AMap = window.AMap;
    routeLayerRef.current.removeAll();
    if (!AMap || !propRoute || propRoute.points.length < 2) return;
    
    const path = propRoute.points.map(p => new AMap.LngLat(p.lng, p.lat));
    const color = propRoute.color || '#3B82F6';
    const width = propRoute.width || 6;
    
    const polyline = new AMap.Polyline({
      path,
      strokeColor: color,
      strokeWeight: width,
      strokeOpacity: 0.9,
      strokeStyle: 'solid',
      strokeDasharray: [],
      lineJoin: 'round',
      lineCap: 'round',
    });
    
    routeLayerRef.current.add(polyline);
    
    // Fit bounds to route
    if (propRoute.points.length >= 2) {
      mapRef.current.setFitView([polyline], true, [50, 50, 50, 50], 16);
    }
  }, [propRoute, isMapReady]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !showsUserLocation) return;

    const AMap = window.AMap;
    if (!AMap) return;

    const location = propUserLocation ?? internalUserLocation;
    if (!location) {
      if (userMarkerRef.current) {
        mapRef.current.remove(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      return;
    }

    const lnglat = new AMap.LngLat(location.position.lng, location.position.lat);

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(lnglat);
    } else {
      const markerContent = document.createElement('div');
      markerContent.className = 'amap-user-marker';
      markerContent.innerHTML = `
        <div style="
          width: 24px;
          height: 24px;
          background: #3B82F6;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          position: relative;
        ">
          <div style="
            position: absolute;
            top: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 8px solid #3B82F6;
          "></div>
        </div>
      `;

      userMarkerRef.current = new AMap.Marker({
        position: lnglat,
        content: markerContent,
        offset: new AMap.Pixel(-12, -12),
        zIndex: 200,
      });
      mapRef.current.add(userMarkerRef.current);
    }

    if (isTracking) {
      mapRef.current.setCenter(lnglat);
    }
  }, [internalUserLocation, isMapReady, isTracking, propUserLocation, showsUserLocation]);

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