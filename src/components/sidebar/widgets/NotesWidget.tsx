import React, { useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';

export default function NotesWidget() {
  const [notes, setNotes] = useState([
    { id: 1, text: 'Важно: забрать документы из офиса' },
    { id: 2, text: 'Купить подарок на ДР' },
  ]);
  const [input, setInput] = useState('');

  const add = () => {
    if (!input.trim()) return;
    setNotes(n => [...n, { id: Date.now(), text: input.trim() }]);
    setInput('');
  };

  const remove = (id: number) => {
    setNotes(n => n.filter(note => note.id !== id));
  };

  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-1 mb-2">
        <FileText className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-semibold text-white">Заметки</span>
      </div>
      <div className="flex gap-1 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Новая заметка..."
          className="flex-1 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-white/20"
        />
        <button onClick={add} className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors">
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="max-h-36 overflow-y-auto space-y-1">
        {notes.map(note => (
          <div key={note.id} className="group flex items-center gap-2 p-1.5 rounded bg-white/5 text-[11px] text-gray-300">
            <span className="flex-1 truncate">{note.text}</span>
            <button onClick={() => remove(note.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {notes.length === 0 && (
          <div className="text-center text-[10px] text-gray-500 py-3">Заметок пока нет</div>
        )}
      </div>
    </div>
  );
}