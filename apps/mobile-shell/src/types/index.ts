export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker {
  id: string;
  position: LatLng;
  title?: string;
  subtitle?: string;
  icon?: string;
  onPress?: () => void;
}

export interface MapRoute {
  id: string;
  points: LatLng[];
  color?: string;
  width?: number;
}

export interface MapCamera {
  center: LatLng;
  zoom: number;
  heading?: number;
  tilt?: number;
}

export interface UserLocation {
  position: LatLng;
  heading?: number;
  accuracy?: number;
  timestamp?: number;
}

export interface POI {
  id: string;
  name: string;
  address?: string;
  position: LatLng;
  type?: string;
  distance?: number;
}

export type MapProvider = 'amap' | 'maplibre' | 'leaflet';

export interface MapProviderConfig {
  provider: MapProvider;
  androidKey?: string;
  iosKey?: string;
  styleUrl?: string;
  tileUrl?: string;
}

export interface IMapContext {
  provider: MapProvider;
  camera: MapCamera;
  userLocation: UserLocation | null;
  isTracking: boolean;
  setCamera: (camera: MapCamera) => void;
  setUserTracking: (track: boolean) => void;
  addMarker: (marker: MapMarker) => string;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  setRoute: (route: MapRoute | null) => void;
  searchPOI: (query: string, near?: LatLng) => Promise<POI[]>;
}