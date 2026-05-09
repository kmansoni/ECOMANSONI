import React from 'react';
import { Search } from 'lucide-react';

export default function SearchWidget() {
  return (
    <div className="px-2 py-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input
          placeholder="Поиск по приложению..."
          className="w-full rounded-lg bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-white/20"
        />
      </div>
      <div className="mt-2 text-[10px] text-gray-500">
        Быстрый поиск по людям, постам, группам и местам
      </div>
    </div>
  );
}