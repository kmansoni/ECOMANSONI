import React from 'react';
import { TrendingUp, Flame, Star } from 'lucide-react';

const recommendations = [
  { title: 'Группа: Москва на карте', members: '12.4K', type: 'Группа', icon: <Flame className="h-4 w-4 text-orange-400" /> },
  { title: 'Лента: Навигация в городе', members: '3.1K', type: 'Лента', icon: <TrendingUp className="h-4 w-4 text-cyan-400" /> },
  { title: 'Чат: Таксисты Москвы', members: '890', type: 'Чат', icon: <Star className="h-4 w-4 text-amber-400" /> },
];

export default function RecommendationsWidget() {
  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-1 mb-2">
        <TrendingUp className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-semibold text-white">Рекомендации</span>
      </div>
      {recommendations.map((item, i) => (
        <button
          key={i}
          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
        >
          {item.icon}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-white truncate">{item.title}</div>
            <div className="text-[10px] text-gray-500">{item.type} · {item.members}</div>
          </div>
        </button>
      ))}
      <button className="mt-2 w-full text-center text-[10px] text-cyan-400 hover:underline">
        Показать ещё →
      </button>
    </div>
  );
}