import React from 'react';
import { MessageCircle, Plus, Search } from 'lucide-react';

const recentChats = [
  { name: 'Алиса', lastMsg: 'Привет, когда приедешь?', time: '2 мин', unread: true, avatar: 'А' },
  { name: 'Борис', lastMsg: 'Файлы готовы', time: '1 ч', unread: false, avatar: 'Б' },
  { name: 'Группа навигации', lastMsg: 'Новый маршрут!', time: '3 ч', unread: true, avatar: 'Г' },
  { name: 'Кирилл', lastMsg: 'Спасибо за помощь', time: '5 ч', unread: false, avatar: 'К' },
];

export default function ChatsWidget() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 pb-2">
        <button className="text-xs font-medium text-cyan-400 hover:underline">Все чаты →</button>
        <Plus className="h-4 w-4 text-white/40 cursor-pointer hover:text-white transition-colors" />
      </div>
      {recentChats.map((chat, i) => (
        <button
          key={i}
          className="flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 rounded-lg transition-colors"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-600 text-[11px] font-bold text-white">
            {chat.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-white truncate">{chat.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{chat.time}</span>
            </div>
            <div className="text-[11px] text-gray-400 truncate">{chat.lastMsg}</div>
          </div>
          {chat.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400" />}
        </button>
      ))}
    </div>
  );
}