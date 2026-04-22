/**
 * AmapMap — backward-compatible wrapper around OpenMap (Leaflet + OSM).
 * All Amap SDK dependencies have been removed.  The component keeps the same
 * props interface so existing consumers (NavigatorMap, MapExample, etc.)
 * continue to work without changes.
 */
import OpenMap from './OpenMap';
import type { OpenMapProps } from './OpenMap';
import type { MapCamera, MapMarker, MapRoute, UserLocation, LatLng } from '../types';

export interface AmapMapProps {
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

function AmapMap(props: AmapMapProps) {
  return <OpenMap {...(props as OpenMapProps)} />;
}

export default AmapMap;