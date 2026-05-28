import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface TaxiComparisonPanelProps {
  pickup: LatLng;
  destination: LatLng;
  viaPoints: LatLng[];
  onSelectDirect?: () => void;
  onSelectViaPoint?: (index: number) => void;
  className?: string;
}

export const TaxiComparisonPanel = memo(function TaxiComparisonPanel({
  pickup,
  destination,
  viaPoints,
  onSelectDirect,
  onSelectViaPoint,
  className,
}: TaxiComparisonPanelProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  void pickup;
  void destination;
  void viaPoints;
  void onSelectDirect;
  void onSelectViaPoint;

  return (
    <div className={cn('p-3 rounded-xl bg-gray-900/60 border border-white/5', className)}>
      <p className="text-xs font-medium text-gray-400">{navText('Такси отключено', 'Taxi removed', languageCode)}</p>
    </div>
  );
});
