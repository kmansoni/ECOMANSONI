import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng } from '../types';
import type { NavRoute, Maneuver } from '../../../src/types/navigation';
import type { NavigationInstruction } from '../types/navigation';
import { speakInstruction, stopSpeaking } from '../services/VoiceGuidance';

interface UseTurnByTurnResult {
  currentPosition: LatLng | null;
  currentHeading: number;
  currentInstruction: NavigationInstruction | null;
  nextInstruction: NavigationInstruction | null;
  distanceToNext: number;
  remainingDistance: number;
  remainingTime: number;
  eta: string;
  isActive: boolean;
  voiceEnabled: boolean;
  toggleVoice: () => void;
  updatePosition: (pos: LatLng, heading?: number) => void;
}

const VOICE_DISTANCE_THRESHOLDS = [500, 200, 100, 50];

function maneuverToInstruction(maneuver: Maneuver, distance: number): NavigationInstruction {
  const typeMap: Record<string, NavigationInstruction['type']> = {
    'depart': 'depart',
    'arrive': 'arrive',
    'turn-left': 'turn',
    'turn-right': 'turn',
    'turn-slight-left': 'turn',
    'turn-slight-right': 'turn',
    'turn-sharp-left': 'turn',
    'turn-sharp-right': 'turn',
    'uturn': 'uturn',
    'straight': 'continue',
    'roundabout': 'roundabout',
    'exit-roundabout': 'turn',
    'merge-left': 'merge',
    'merge-right': 'merge',
    'fork-left': 'turn',
    'fork-right': 'turn',
    'ramp-left': 'turn',
    'ramp-right': 'turn',
    'keep-left': 'turn',
    'keep-right': 'turn',
  };
  
  let modifier: NavigationInstruction['modifier'];
  if (maneuver.type.includes('left')) modifier = 'left';
  else if (maneuver.type.includes('right')) modifier = 'right';
  else if (maneuver.type.includes('slight-left')) modifier = 'slight-left';
  else if (maneuver.type.includes('slight-right')) modifier = 'slight-right';
  else if (maneuver.type.includes('sharp-left')) modifier = 'sharp-left';
  else if (maneuver.type.includes('sharp-right')) modifier = 'sharp-right';
  
  const text = generateInstructionText(maneuver, distance);
  
  return {
    type: typeMap[maneuver.type] || 'continue',
    modifier,
    text,
    distance,
    streetName: maneuver.streetName,
  };
}

function generateInstructionText(maneuver: Maneuver, distance: number): string {
  const distText = distance >= 1000 
    ? `${(distance / 1000).toFixed(1)} км`
    : `${Math.round(distance)} м`;
  
  switch (maneuver.type) {
    case 'depart':
      return `Начните движение по ${maneuver.streetName || 'дороге'}`;
    case 'arrive':
      return 'Вы прибыли';
    case 'turn-left':
      return `Через ${distText} поверните налево`;
    case 'turn-right':
      return `Через ${distText} поверните направо`;
    case 'turn-slight-left':
      return `Через ${distText} держитесь левее`;
    case 'turn-slight-right':
      return `Через ${distText} держитесь правее`;
    case 'turn-sharp-left':
      return `Через ${distText} резко налево`;
    case 'turn-sharp-right':
      return `Через ${distText} резко направо`;
    case 'uturn':
      return `Через ${distText} развернитесь`;
    case 'roundabout':
      return `Через ${distText} на кольце`;
    case 'exit-roundabout':
      return `Через ${distText} съезд с кольца`;
    case 'merge-left':
      return `Через ${distText} прижмитесь к левому краю`;
    case 'merge-right':
      return `Через ${distText} прижмитесь к правому краю`;
    case 'fork-left':
      return `Через ${distText} на развилке налево`;
    case 'fork-right':
      return `Через ${distText} на развилке направо`;
    case 'ramp-left':
      return `Через ${distText} съезд налево`;
    case 'ramp-right':
      return `Через ${distText} съезд направо`;
    case 'keep-left':
      return `Через ${distText} продолжайте левее`;
    case 'keep-right':
      return `Через ${distText} продолжайте правее`;
    default:
      return `Через ${distText} продолжите прямо`;
  }
}

function calculateDistanceToPoint(from: LatLng, to: LatLng): number {
  const R = 6371000;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findClosestPointOnRoute(position: LatLng, geometry: LatLng[]): { index: number; distance: number } {
  let minDist = Infinity;
  let closestIdx = 0;
  
  for (let i = 0; i < geometry.length; i++) {
    const dist = calculateDistanceToPoint(position, geometry[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }
  
  return { index: closestIdx, distance: minDist };
}

export function useTurnByTurn(route: NavRoute | null, initialPosition: LatLng | null = null): UseTurnByTurnResult {
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(initialPosition);
  const [currentHeading, setCurrentHeading] = useState(0);
  const [currentManeuverIndex, setCurrentManeuverIndex] = useState(0);
  const [distanceToNext, setDistanceToNext] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [spokenThresholds, setSpokenThresholds] = useState<Set<number>>(new Set());
  
  const lastManeuverRef = useRef(0);
  const speedRef = useRef(10);
  
  useEffect(() => {
    if (route && currentPosition) {
      setIsActive(true);
      setRemainingDistance(route.totalDistanceMeters);
      setRemainingTime(route.totalDurationSeconds);
    }
  }, [route, currentPosition]);
  
  const updatePosition = useCallback((pos: LatLng, heading?: number) => {
    if (!route) return;
    
    setCurrentPosition(pos);
    if (heading !== undefined) {
      setCurrentHeading(heading);
      speedRef.current = 10;
    }
    
    const { index: closestIdx } = findClosestPointOnRoute(pos, route.geometry);
    
    let distToNext = 0;
    let totalDist = 0;
    let maneuverIdx = 0;
    
    if (closestIdx < route.geometry.length - 1) {
      distToNext = calculateDistanceToPoint(pos, route.geometry[closestIdx + 1]);
    }
    
    for (let i = closestIdx; i < route.geometry.length - 1; i++) {
      totalDist += calculateDistanceToPoint(route.geometry[i], route.geometry[i + 1]);
    }
    
    for (let i = 0; i < route.maneuvers.length; i++) {
      const maneuver = route.maneuvers[i];
      const maneuverDist = calculateDistanceToPoint(pos, maneuver.location);
      if (maneuverDist < 50 || distToNext < maneuver.distanceMeters) {
        maneuverIdx = i;
      }
    }
    
    setDistanceToNext(distToNext);
    setRemainingDistance(Math.max(0, totalDist));
    
    const timeRemaining = totalDist / (speedRef.current * 1000 / 3600);
    setRemainingTime(Math.max(0, timeRemaining));
    
    if (maneuverIdx !== lastManeuverRef.current) {
      lastManeuverRef.current = maneuverIdx;
      setCurrentManeuverIndex(maneuverIdx);
      setSpokenThresholds(new Set());
    }
    
    if (voiceEnabled) {
      for (const threshold of VOICE_DISTANCE_THRESHOLDS) {
        if (distToNext <= threshold && !spokenThresholds.has(threshold)) {
          const maneuver = route.maneuvers[maneuverIdx];
          if (maneuver) {
            const instruction = maneuverToInstruction(maneuver, distToNext);
            speakInstruction(instruction.text);
            setSpokenThresholds(prev => new Set([...prev, threshold]));
          }
          break;
        }
      }
    }
  }, [route, voiceEnabled, spokenThresholds]);
  
  const toggleVoice = useCallback(() => {
    setVoiceEnabled(prev => {
      if (prev) {
        stopSpeaking();
      }
      return !prev;
    });
  }, []);
  
  const currentManeuver = route?.maneuvers[currentManeuverIndex] || null;
  const nextManeuver = route?.maneuvers[currentManeuverIndex + 1] || null;
  
  const currentInstruction = currentManeuver 
    ? maneuverToInstruction(currentManeuver, distanceToNext)
    : null;
  const nextInstruction = nextManeuver
    ? maneuverToInstruction(nextManeuver, nextManeuver.distanceMeters)
    : null;
  
  const now = new Date();
  const etaDate = new Date(now.getTime() + remainingTime * 1000);
  const eta = etaDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  
  return {
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
    updatePosition,
  };
}

export default useTurnByTurn;