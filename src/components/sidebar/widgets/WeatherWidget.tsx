import React from 'react';
import { CloudSun, Droplets, Wind, Thermometer } from 'lucide-react';

export default function WeatherWidget() {
  const temp = 18;
  const condition = 'Переменная облачность';
  const wind = 12;
  const humidity = 65;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <CloudSun className="h-4 w-4 text-yellow-400" />
        <span className="text-xs font-semibold text-white">Погода</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold text-white">{temp}°</div>
        <div className="text-sm text-gray-400">{condition}</div>
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-gray-400">
        <div className="flex items-center gap-1">
          <Wind className="h-3 w-3" />
          <span>{wind} м/с</span>
        </div>
        <div className="flex items-center gap-1">
          <Droplets className="h-3 w-3" />
          <span>{humidity}%</span>
        </div>
      </div>
    </div>
  );
}