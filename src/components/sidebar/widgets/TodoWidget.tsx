import React, { useState } from 'react';
import { CheckCircle, Plus, Trash2 } from 'lucide-react';

export default function TodoWidget() {
  const [todos, setTodos] = useState([
    { id: 1, text: 'Купить продукты', done: false },
    { id: 2, text: 'Звонок маме', done: false },
    { id: 3, text: 'Прочитать документацию', done: true },
  ]);
  const [input, setInput] = useState('');

  const toggle = (id: number) => {
    setTodos(t => t.map(todo => todo.id === id ? { ...todo, done: !todo.done } : todo));
  };

  const add = () => {
    if (!input.trim()) return;
    setTodos(t => [...t, { id: Date.now(), text: input.trim(), done: false }]);
    setInput('');
  };

  const remove = (id: number) => {
    setTodos(t => t.filter(todo => todo.id !== id));
  };

  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-1 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Новая задача..."
          className="flex-1 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-white/20"
        />
        <button onClick={add} className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto">
        {todos.map(todo => (
          <div key={todo.id} className="flex items-center gap-2 py-1.5 group">
            <button onClick={() => toggle(todo.id)} className="shrink-0">
              <CheckCircle
                className={`h-4 w-4 transition-colors ${todo.done ? 'text-green-400' : 'text-gray-500 group-hover:text-white/60'}`}
                fill={todo.done ? 'currentColor' : 'none'}
              />
            </button>
            <span className={`text-xs flex-1 truncate ${todo.done ? 'text-gray-500 line-through' : 'text-white/80'}`}>
              {todo.text}
            </span>
            <button onClick={() => remove(todo.id)} className="shrink-0 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {todos.length === 0 && (
          <div className="text-center text-[11px] text-gray-500 py-4">Задач пока нет</div>
        )}
      </div>
    </div>
  );
}