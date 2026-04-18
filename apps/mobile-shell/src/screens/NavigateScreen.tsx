import { useState, useEffect, useCallback } from 'react';
import { LocalMap } from './LocalMap';
import { NavigationInstructions } from './NavigationInstructions';
import { useTurnByTurn } from '../hooks/useTurnByTurn';
import type { LatLng, MapRoute } from '../types';
import type { NavRoute } from '../../../src/types/navigation';

interface NavigateScreenProps {
  route: NavRoute;
  destination: LatLng;
  onCancel?: () => void;
  onSettings?: () => void;
}

export function NavigateScreen({ route, destination, onCancel, onSettings }: NavigateScreenProps) {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  
  const {
    currentPosition,
    currentHeading,
    currentInstruction,
    nextInstruction,
    distanceToNext,
    remainingDistance,
    remainingTime,
    eta,
    isActive,
    voiceEnabled,
    toggleVoice,
  } = useTurnByTurn(route, userLocation);
  
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.warn('Geolocation error:', err),
        { enableHighAccuracy: true }
      );
      
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        undefined,
        { enableHighAccuracy: true }
      );
      
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);
  
  const mapRoutes: MapRoute[] = route?.geometry ? [{
    id: 'route',
    points: route.geometry,
    color: '#3B82F6',
    width: 5,
  }] : [];
  
  const formatTime = (seconds: number): string => {
    const mins = Math.ceil(seconds / 60);
    if (mins < 60) return `${mins} мин`;
    const hours = Math.floor(mins / 60);
    const minsLeft = mins % 60;
    return `${hours} ч ${minsLeft} мин`;
  };
  
  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} м`;
    return `${(meters / 1000).toFixed(1)} км`;
  };
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 relative">
        <LocalMap
          center={currentPosition || route.geometry?.[0] || { lat: 55.7558, lng: 37.6173 }}
          zoom={17}
          rotation={currentHeading}
          routes={mapRoutes}
          userLocation={currentPosition}
          destination={destination}
          className="absolute inset-0"
        />
        
        <div className="absolute top-0 left-0 right-0 p-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onCancel}
              className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="bg-white px-4 py-2 rounded-full shadow-lg">
              <span className="font-medium">{eta}</span>
            </div>
            
            <button 
              onClick={onSettings || toggleVoice}
              className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center ${
                voiceEnabled ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-8">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4">
              <NavigationInstructions
                current={currentInstruction}
                next={nextInstruction}
                distance={distanceToNext}
              />
            </div>
            
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Осталось</span>
                <span className="font-semibold">{formatDistance(remainingDistance)}</span>
              </div>
              
              <div className="h-8 w-px bg-gray-300" />
              
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Время</span>
                <span className="font-semibold">{formatTime(remainingTime)}</span>
              </div>
              
              <div className="h-8 w-px bg-gray-300" />
              
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Прибытие</span>
                <span className="font-semibold">{eta}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NavigateScreen;