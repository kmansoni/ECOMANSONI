import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { LocalMap } from '../components/LocalMap';
import { NavigateScreen } from '../screens/NavigateScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { RouteScreen } from '../screens/RouteScreen';
import type { LatLng, MapRoute } from '../types';
import type { NavRoute } from '../../../src/types/navigation';
import type { SearchResult } from '../types/navigation';

export type ScreenName = 'map' | 'search' | 'route' | 'navigate' | 'saved' | 'settings';

interface AppNavigatorContextType {
  navigate: (screen: ScreenName, params?: Record<string, unknown>) => void;
  goBack: () => void;
  currentScreen: ScreenName;
  params: Record<string, unknown>;
}

const AppNavigatorContext = createContext<AppNavigatorContextType | null>(null);

export function useAppNavigator() {
  const context = useContext(AppNavigatorContext);
  if (!context) {
    throw new Error('useAppNavigator must be used within AppNavigator');
  }
  return context;
}

interface AppNavigatorProps {
  children?: ReactNode;
}

export function AppNavigator({ children }: AppNavigatorProps) {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('map');
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [history, setHistory] = useState<ScreenName[]>(['map']);
  
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [activeRoute, setActiveRoute] = useState<NavRoute | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.warn('Geolocation error:', err),
        { enableHighAccuracy: true }
      );
    }
  }, []);
  
  const navigate = useCallback((screen: ScreenName, newParams: Record<string, unknown> = {}) => {
    setHistory(prev => [...prev, screen]);
    setCurrentScreen(screen);
    setParams(newParams);
  }, []);
  
  const goBack = useCallback(() => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop();
      const prevScreen = newHistory[newHistory.length - 1];
      setCurrentScreen(prevScreen);
      setHistory(newHistory);
      setParams({});
    }
  }, [history]);
  
  const handleSearchSelect = useCallback((result: SearchResult) => {
    setDestination(result.position);
    navigate('route', { destination: result.position });
  }, [navigate]);
  
  const handleStartNavigation = useCallback((route: NavRoute) => {
    setActiveRoute(route);
    navigate('navigate', { route });
  }, [navigate]);
  
  const handleSearchDestination = useCallback(() => {
    navigate('search', { mode: 'destination', onSelect: handleSearchSelect });
  }, [navigate, handleSearchSelect]);
  
  const handleCancelNavigation = useCallback(() => {
    setActiveRoute(null);
    setDestination(null);
    setHistory(['map']);
    setCurrentScreen('map');
  }, []);
  
  const mapRoutes: MapRoute[] = activeRoute?.geometry ? [{
    id: 'route',
    points: activeRoute.geometry,
    color: '#3B82F6',
    width: 5,
  }] : [];
  
  const screen = currentScreen;
  
  return (
    <AppNavigatorContext.Provider value={{ navigate, goBack, currentScreen, params }}>
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        {screen === 'map' && (
          <div className="flex-1 relative">
            <LocalMap
              center={userLocation || undefined}
              zoom={14}
              routes={mapRoutes}
              userLocation={userLocation}
              destination={destination}
              className="absolute inset-0"
            />
            
            <div className="absolute top-4 left-4 right-4">
              <button 
                onClick={() => navigate('search', {})}
                className="w-full bg-white shadow-lg rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-gray-400">Куда едем?</span>
              </button>
            </div>
            
            {destination && (
              <div className="absolute bottom-24 left-4 right-4">
                <button 
                  onClick={() => navigate('route', { destination })}
                  className="w-full py-4 bg-blue-500 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-600"
                >
                  Построить маршрут
                </button>
              </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t">
              <div className="flex items-center justify-around py-3">
                <button 
                  onClick={() => navigate('map')}
                  className={`flex flex-col items-center gap-1 ${screen === 'map' ? 'text-blue-500' : 'text-gray-500'}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span className="text-xs">Карта</span>
                </button>
                
                <button 
                  onClick={() => navigate('search', {})}
                  className={`flex flex-col items-center gap-1 ${screen === 'search' ? 'text-blue-500' : 'text-gray-500'}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="text-xs">Поиск</span>
                </button>
                
                <button 
                  onClick={() => navigate('saved')}
                  className={`flex flex-col items-center gap-1 ${screen === 'saved' ? 'text-blue-500' : 'text-gray-500'}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <span className="text-xs">Сохранённые</span>
                </button>
                
                <button 
                  onClick={() => navigate('settings')}
                  className={`flex flex-col items-center gap-1 ${screen === 'settings' ? 'text-blue-500' : 'text-gray-500'}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs">Настройки</span>
                </button>
              </div>
            </div>
          </div>
        )}
        
        {screen === 'search' && (
          <SearchScreen 
            onSelect={handleSearchSelect}
            onClose={goBack}
            userLocation={userLocation}
          />
        )}
        
        {screen === 'route' && (
          <RouteScreen
            startLocation={userLocation}
            onStartNavigation={handleStartNavigation}
            onSearchDestination={handleSearchDestination}
            onCancel={goBack}
          />
        )}
        
        {screen === 'navigate' && activeRoute && destination && (
          <NavigateScreen
            route={activeRoute}
            destination={destination}
            onCancel={handleCancelNavigation}
          />
        )}
        
        {screen === 'saved' && (
          <SavedPlacesScreen onSelect={handleSearchSelect} onBack={goBack} />
        )}
        
        {screen === 'settings' && (
          <SettingsScreen onBack={goBack} />
        )}
        
        {children}
      </div>
    </AppNavigatorContext.Provider>
  );
}

function SavedPlacesScreen({ onSelect, onBack }: { onSelect: (result: SearchResult) => void; onBack: () => void }) {
  const [favorites, setFavorites] = useState<SearchResult[]>([]);
  
  useEffect(() => {
    const stored = localStorage.getItem('navigation_favorites');
    if (stored) {
      setFavorites(JSON.parse(stored));
    }
  }, []);
  
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Сохранённые места</h1>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {favorites.length > 0 ? (
          favorites.map((place) => (
            <button
              key={place.id}
              onClick={() => onSelect(place)}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg"
            >
              <span className="text-2xl">⭐</span>
              <div className="flex-1 text-left">
                <div className="font-medium">{place.name}</div>
                <div className="text-sm text-gray-500">{place.address}</div>
              </div>
            </button>
          ))
        ) : (
          <div className="text-center text-gray-500 p-8">
            Нет сохранённых мест
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Настройки</h1>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔊</span>
              <div>
                <div className="font-medium">Голосовые подсказки</div>
                <div className="text-sm text-gray-500">Озвучивание манёвров</div>
              </div>
            </div>
            <button 
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`w-12 h-6 rounded-full transition-colors ${voiceEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${voiceEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🗺️</span>
            <div>
              <div className="font-medium">Тип карты</div>
              <div className="text-sm text-gray-500">Офлайн тайлы</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">📍</span>
            <div>
              <div className="font-medium">GPS точность</div>
              <div className="text-sm text-gray-500">Высокая точность</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppNavigator;