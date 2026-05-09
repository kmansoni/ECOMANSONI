import React from 'react';
import { Settings2, SlidersHorizontal, Palette, Bell } from 'lucide-react';

export default function SettingsWidget() {
  const options = [
    { icon: <SlidersHorizontal className="h-4 w-4" />, label: 'Настройки маршрута' },
    { icon: <Palette className="h-4 w-4" />, label: 'Оформление' },
    { icon: <Bell className="h-4 w-4" />, label: 'Уведомления' },
  ];

  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-1 mb-2">
        <Settings2 className="h-4 w-4 text-white/60" />
        <span className="text-xs font-semibold text-white/60">Быстрые настройки</span>
      </div>
      {options.map((opt, i) => (
        <button
          key={i}
          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
        >
          <span className="text-white/50">{opt.icon}</span>
          <span className="text-xs text-gray-300">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}