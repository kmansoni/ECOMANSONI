import React from 'react';
import { Compass, MapPin, Navigation2, BookmarkPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function QuickActionsWidget() {
  const nav = useNavigate();

  const actions = [
    { icon: <MapPin className="h-5 w-5" />, label: 'Адрес', action: () => nav('/search') },
    { icon: <Compass className="h-5 w-5" />, label: 'Поблизости', action: () => nav('/explore') },
    { icon: <Navigation2 className="h-5 w-5" />, label: 'Маршрут', action: () => nav('/navigation') },
    { icon: <BookmarkPlus className="h-5 w-5" />, label: 'Сохранить', action: () => console.log('save') },
  ];

  return (
    <div className="grid grid-cols-4 gap-1 p-2">
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={a.action}
          className="flex flex-col items-center gap-1 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white active:scale-95 transition-all"
        >
          {a.icon}
          <span className="text-[10px] font-medium leading-tight">{a.label}</span>
        </button>
      ))}
    </div>
  );
}