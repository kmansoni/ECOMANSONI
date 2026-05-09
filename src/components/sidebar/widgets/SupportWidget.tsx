import React from 'react';
import { HelpCircle, MessageCircle, Phone } from 'lucide-react';

export default function SupportWidget() {
  const contacts = [
    { icon: <MessageCircle className="h-4 w-4" />, label: 'Чат поддержки', action: () => {} },
    { icon: <Phone className="h-4 w-4" />, label: 'Позвонить', action: () => {} },
    { icon: <HelpCircle className="h-4 w-4" />, label: 'FAQ / Помощь', action: () => {} },
  ];

  return (
    <div className="px-2 py-1">
      {contacts.map((c, i) => (
        <button
          key={i}
          onClick={c.action}
          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
        >
          <span className="text-white/40 group-hover:text-cyan-400 transition-colors">{c.icon}</span>
          <span className="text-xs text-gray-300 group-hover:text-white transition-colors">{c.label}</span>
        </button>
      ))}
    </div>
  );
}