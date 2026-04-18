import { useState, useEffect, useCallback } from 'react';
import type { LatLng } from '../types';
import type { NavRoute } from '../../../src/types/navigation';
import type { SearchResult } from '../types/navigation';

interface RouteScreenProps {
  startLocation?: LatLng | null;
  onStartNavigation: (route: NavRoute) => void;
  onSearchDestination: () => void;
  onSearchWaypoint?: () => void;
  onCancel?: () => void;
}

interface RoutePoint {
  id: string;
  type: 'start' | 'waypoint' | 'end';
  location: LatLng | null;
  name?: string;
}

export function RouteScreen({ 
  startLocation, 
  onStartNavigation, 
  onSearchDestination,
  onCancel 
}: RouteScreenProps) {
  const [points, setPoints] = useState<RoutePoint[]>([
    { id: 'start', type: 'start', location: startLocation || null, name: 'Текущее местоположение' },
    { id: 'end', type: 'end', location: null },
  ]);
  const [waypoints, setWaypoints] = useState<RoutePoint[]>([]);
  const [transportMode, setTransportMode] = useState<'car' | 'walk' | 'bike'>('car');
  const [routes, setRoutes] = useState<NavRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (points[0].location) {
      calculateRoutes();
    }
  }, [points, transportMode]);
  
  const calculateRoutes = useCallback(async () => {
    const start = points[0].location;
    const end = points[1].location;
    
    if (!start || !end) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { fetchRoute } = await import('../../../src/lib/navigation/routing');
      const result = await fetchRoute(start, end, true);
      
      const allRoutes = result.alternatives.length > 0 
        ? [result.main, ...result.alternatives]
        : [result.main];
      
      setRoutes(allRoutes);
      setSelectedRouteIndex(0);
    } catch (e) {
      console.error('Route calculation error:', e);
      setError('Не удалось построить маршрут');
    } finally {
      setIsLoading(false);
    }
  }, [points]);
  
  const handleDestinationSelect = useCallback((result: SearchResult) => {
    setPoints(prev => [
      prev[0],
      { ...prev[1], location: result.position, name: result.name }
    ]);
  }, []);
  
  const addWaypoint = useCallback(() => {
    const newWaypoint: RoutePoint = {
      id: `waypoint-${Date.now()}`,
      type: 'waypoint',
      location: null,
    };
    setWaypoints(prev => [...prev, newWaypoint]);
  }, []);
  
  const removeWaypoint = useCallback((id: string) => {
    setWaypoints(prev => prev.filter(w => w.id !== id));
  }, []);
  
  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} м`;
    return `${(meters / 1000).toFixed(1)} км`;
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.ceil(seconds / 60);
    if (mins < 60) return `${mins} мин`;
    const hours = Math.floor(mins / 60);
    const minsLeft = mins % 60;
    return `${hours} ч ${minsLeft} мин`;
  };
  
  const selectedRoute = routes[selectedRouteIndex];
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white p-4 border-b">
        <div className="flex items-center gap-3">
          {onCancel && (
            <button onClick={onCancel} className="p-2 -ml-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <h1 className="text-lg font-semibold">Маршрут</h1>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <div className="w-0.5 h-8 bg-gray-300" />
              <div className="w-3 h-3 bg-red-500 rounded-full" />
            </div>
            
            <div className="flex-1 space-y-2">
              <button 
                onClick={() => {}}
                className="w-full text-left p-2 hover:bg-gray-50 rounded-lg"
              >
                <div className="text-sm text-gray-500">Откуда</div>
                <div className="font-medium">
                  {points[0].name || (points[0].location 
                    ? `${points[0].location.lat.toFixed(4)}, ${points[0].location.lng.toFixed(4)}`
                    : 'Выбрать на карте')}
                </div>
              </button>
              
              <button 
                onClick={onSearchDestination}
                className="w-full text-left p-2 hover:bg-gray-50 rounded-lg border-t"
              >
                <div className="text-sm text-gray-500">Куда</div>
                <div className="font-medium text-gray-400">
                  {points[1].name || 'Выбрать точку назначения'}
                </div>
              </button>
            </div>
          </div>
          
          {waypoints.map((wp, idx) => (
            <div key={wp.id} className="flex items-center gap-3 pl-6">
              <button onClick={() => removeWaypoint(wp.id)} className="p-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button className="flex-1 text-left p-2 hover:bg-gray-50 rounded-lg border-t">
                <div className="text-sm text-gray-500">Промежуточная точка {idx + 1}</div>
                <div className="font-medium text-gray-400">Добавить</div>
              </button>
            </div>
          ))}
          
          <button 
            onClick={addWaypoint}
            className="w-full flex items-center gap-2 p-2 text-blue-500 hover:bg-blue-50 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Добавить промежуточную точку</span>
          </button>
        </div>
        
        <div className="bg-white rounded-xl p-4">
          <div className="text-sm font-medium text-gray-500 mb-3">Способ передвижения</div>
          <div className="flex gap-2">
            <button
              onClick={() => setTransportMode('car')}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border ${
                transportMode === 'car' 
                  ? 'border-blue-500 bg-blue-50 text-blue-600' 
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl">🚗</span>
              <span>Авто</span>
            </button>
            <button
              onClick={() => setTransportMode('walk')}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border ${
                transportMode === 'walk' 
                  ? 'border-blue-500 bg-blue-50 text-blue-600' 
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl">🚶</span>
              <span>Пешком</span>
            </button>
            <button
              onClick={() => setTransportMode('bike')}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border ${
                transportMode === 'bike' 
                  ? 'border-blue-500 bg-blue-50 text-blue-600' 
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl">🚴</span>
              <span>Велосипед</span>
            </button>
          </div>
        </div>
        
        {isLoading && (
          <div className="bg-white rounded-xl p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
            <div className="text-gray-500">Поиск маршрута...</div>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 rounded-xl p-4 text-red-600">
            {error}
          </div>
        )}
        
        {selectedRoute && !isLoading && (
          <div className="space-y-3">
            {routes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {routes.map((route, idx) => (
                  <button
                    key={route.id}
                    onClick={() => setSelectedRouteIndex(idx)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm ${
                      idx === selectedRouteIndex
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 border'
                    }`}
                  >
                    {idx === 0 ? 'Лучший' : `Вариант ${idx}`}
                  </button>
                ))}
              </div>
            )}
            
            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-2xl font-bold">
                    {formatDistance(selectedRoute.totalDistanceMeters)}
                  </div>
                  <div className="text-gray-500">
                    {formatTime(selectedRoute.totalDurationSeconds)}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <div>Манёвров: {selectedRoute.maneuvers.length}</div>
                  <div>Сегментов: {selectedRoute.segments.length}</div>
                </div>
              </div>
              
              <button
                onClick={() => onStartNavigation(selectedRoute)}
                className="w-full py-4 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition-colors"
              >
                Начать навигацию
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RouteScreen;