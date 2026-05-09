import React from 'react';
import { Car, Navigation2, Clock, MapPin } from 'lucide-react';

export default function TaxiWidget() {
  const hasActiveRide = false;

  if (hasActiveRide) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Car className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">Активная поездка</span>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Водитель</span>
            <span className="text-white font-medium">Алексей П.</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">ETA</span>
            <span className="text-white font-medium">3 мин</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Стоимость</span>
            <span className="text-white font-medium">320 ₽</span>
          </div>
        </div>
        <button className="mt-3 w-full rounded-lg bg-red-500/20 text-red-400 px-3 py-2 text-xs font-medium hover:bg-red-500/30 transition-colors">
          Отменить поездку
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <Car className="h-4 w-4 text-white/60" />
        <span className="text-xs font-semibold text-white/60">Такси</span>
      </div>
      <button className="w-full rounded-lg bg-cyan-500/20 text-cyan-400 px-3 py-2 text-xs font-medium hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2">
        <Navigation2 className="h-3.5 w-3.5" />
        Вызвать такси
      </button>
    </div>
  );
}