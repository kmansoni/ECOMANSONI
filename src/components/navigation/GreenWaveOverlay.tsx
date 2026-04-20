/**
 * GreenWaveOverlay — shows recommended speed to catch green lights
 * Uses trafficLightTiming.calculateGreenWave() during active navigation.
 */

import { useEffect, useState, memo } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import type { NavRoute } from '@/types/navigation';
import {
  calculateGreenWave,
  getNearbyTrafficLights,
  type GreenWaveRecommendation,
} from '@/lib/navigation/trafficLightTiming';

interface GreenWaveOverlayProps {
  userPosition: LatLng | null;
  currentSpeed: number;
  route: NavRoute | null;
  isNavigating: boolean;
}

export const GreenWaveOverlay = memo(function GreenWaveOverlay({
  userPosition,
  currentSpeed,
  route,
  isNavigating,
}: GreenWaveOverlayProps) {
  const [recommendation, setRecommendation] = useState<GreenWaveRecommendation | null>(null);

  useEffect(() => {
    if (!isNavigating || !userPosition || !route) {
      setRecommendation(null);
      return;
    }

    let cancelled = false;

    async function update() {
      try {
        const lights = await getNearbyTrafficLights(userPosition!, 500);
        if (cancelled || lights.length === 0) {
          setRecommendation(null);
          return;
        }

        const rec = calculateGreenWave(
          userPosition!,
          currentSpeed,
          route!.geometry,
          lights,
        );

        if (!cancelled) setRecommendation(rec);
      } catch {
        if (!cancelled) setRecommendation(null);
      }
    }

    update();
    const id = setInterval(update, 8000); // refresh every 8s
    return () => { cancelled = true; clearInterval(id); };
  }, [isNavigating, userPosition?.lat, userPosition?.lng, currentSpeed, route]);

  if (!recommendation || !recommendation.suggestedSpeedKmh) return null;

  const diff = recommendation.suggestedSpeedKmh - currentSpeed;
  const shouldSpeedUp = diff > 5;
  const shouldSlowDown = diff < -5;
  const isGood = Math.abs(diff) <= 5;

  return (
    <div
      className={cn(
        'absolute top-14 left-1/2 -translate-x-1/2 z-[1001]',
        'flex items-center gap-2 px-3 py-1.5 rounded-full',
        'backdrop-blur-md border shadow-lg',
        'transition-all duration-500',
        isGood
          ? 'bg-green-500/20 border-green-400/40 text-green-300'
          : shouldSpeedUp
            ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
            : 'bg-amber-500/20 border-amber-400/40 text-amber-300',
      )}
    >
      <Zap className={cn('w-4 h-4', isGood ? 'text-green-400' : shouldSpeedUp ? 'text-blue-400' : 'text-amber-400')} />
      <span className="text-sm font-semibold">{recommendation.suggestedSpeedKmh} км/ч</span>
      <span className="text-xs opacity-70">
        {isGood ? '✓ зелёная волна' : recommendation.message}
      </span>
    </div>
  );
});
