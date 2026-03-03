import React from 'react';
import { ExternalLink } from 'lucide-react';

interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

type InlineKeyboardRow = InlineKeyboardButton[];

interface InlineKeyboardProps {
  rows: InlineKeyboardRow[];
  onCallback?: (callbackData: string) => void;
}

export const InlineKeyboard: React.FC<InlineKeyboardProps> = ({ rows, onCallback }) => {
  const handleClick = (btn: InlineKeyboardButton) => {
    if (btn.url) {
      window.open(btn.url, '_blank', 'noopener,noreferrer');
    } else if (btn.callback_data && onCallback) {
      onCallback(btn.callback_data);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {row.map((btn, btnIndex) => (
            <button
              key={btnIndex}
              onClick={() => handleClick(btn)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-300 text-sm font-medium hover:bg-blue-500/20 hover:border-blue-500/60 active:scale-95 transition-all duration-150"
            >
              <span>{btn.text}</span>
              {btn.url && <ExternalLink size={12} className="flex-shrink-0 opacity-60" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
