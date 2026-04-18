import { useState } from 'react';
import { AmapMap, useCurrentLocation, useRouteDrawing, usePOISearch } from '@mansoni/mobile-shell';
import type { LatLng } from '@mansoni/mobile-shell';

interface MapExampleProps {
  initialCenter?: LatLng;
  className?: string;
}

export function MapExample({ initialCenter, className }: MapExampleProps) {
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { location, startTracking, getCurrentPosition } = useCurrentLocation({
    autoStart: false,
    enableHighAccuracy: true,
  });
  
  const { currentRoute, drawRoute, clearRoute, isCalculating } = useRouteDrawing({
    onRouteCalculated: (route) => {
      console.log('Route calculated:', route.points.length, 'points');
    },
  });
  
  const { results: poiResults, search: searchPOI, isSearching } = usePOISearch();

  const handleMapClick = (latlng: LatLng) => {
    setDestination(latlng);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const pois = await searchPOI(searchQuery, location?.position);
    if (pois.length > 0) {
      setDestination(pois[0].position);
    }
  };

  const handleCalculateRoute = async () => {
    if (!location?.position || !destination) return;
    await drawRoute(location.position, destination, 'driving');
  };

  return (
    <div className={`map-example ${className || ''}`} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px', display: 'flex', gap: '8px', background: '#1f2937' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search POI..."
          style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #374151', background: '#111827', color: 'white' }}
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          {isSearching ? '...' : 'Search'}
        </button>
        <button
          onClick={() => startTracking()}
          style={{ padding: '8px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          GPS
        </button>
        <button
          onClick={handleCalculateRoute}
          disabled={!destination || isCalculating}
          style={{ padding: '8px 16px', background: destination ? '#f59e0b' : '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: destination ? 'pointer' : 'not-allowed' }}
        >
          {isCalculating ? '...' : 'Route'}
        </button>
        <button
          onClick={clearRoute}
          style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Clear
        </button>
      </div>
      
      {poiResults.length > 0 && (
        <div style={{ padding: '8px 12px', background: '#374151', maxHeight: '120px', overflowY: 'auto' }}>
          {poiResults.map((poi) => (
            <div
              key={poi.id}
              onClick={() => setDestination(poi.position)}
              style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid #4b5563', color: '#e5e7eb' }}
            >
              <strong>{poi.name}</strong>
              <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '8px' }}>{poi.type}</span>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ flex: 1, position: 'relative' }}>
        <AmapMap
          camera={{
            center: initialCenter ?? location?.position ?? { lat: 39.9042, lng: 116.4074 },
            zoom: 15,
          }}
          userLocation={location}
          route={currentRoute}
          showsUserLocation={true}
          mapType="standard"
          onMapClick={handleMapClick}
          onUserLocationChange={(loc) => console.log('Location:', loc)}
        />
        
        {destination && (
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '20px',
            zIndex: 1000,
            fontSize: '14px',
          }}>
            Destination: {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
          </div>
        )}
      </div>
    </div>
  );
}

export default MapExample;