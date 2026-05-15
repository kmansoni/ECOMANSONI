/**
 * FSMNodeEditor — форма редактирования одной ноды FSM-состояния
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface FSMNode {
  id: string;
  type: 'message' | 'action' | 'condition' | 'end';
  content?: Record<string, unknown>;
}

interface FSMTransition {
  from: string;
  to: string;
  condition?: string;
}

interface FSMNodeEditorProps {
  node: FSMNode;
  onChange: (node: FSMNode) => void;
  onRemove: () => void;
  isFirst?: boolean;
}

const NODE_TYPES: Array<{ value: FSMNode['type']; label: string; color: string }> = [
  { value: 'message', label: 'Сообщение', color: 'bg-blue-500' },
  { value: 'action', label: 'Действие', color: 'bg-green-500' },
  { value: 'condition', label: 'Условие', color: 'bg-yellow-500' },
  { value: 'end', label: 'Конец', color: 'bg-red-500' },
];

export function FSMNodeEditor({ node, onChange, onRemove, isFirst }: FSMNodeEditorProps) {
  const handleTypeChange = (type: FSMNode['type']) => {
    const next = { ...node, type };
    if (type === 'message' && !next.content?.text) {
      next.content = { text: '' };
    }
    if (type === 'action' && !next.content?.action) {
      next.content = { action: '' };
    }
    if (type === 'condition' && !next.content?.variable) {
      next.content = { variable: '', operator: 'equals', value: '' };
    }
    onChange(next);
  };

  const updateContent = (key: string, value: string) => {
    onChange({ ...node, content: { ...(node.content || {}), [key]: value } });
  };

  return (
    <div className={cn(
      "p-4 rounded-xl border-2 transition-colors",
      NODE_TYPES.find(n => n.value === node.type)?.color.replace('bg-', 'border-') || 'border-border',
      "bg-card"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isFirst && (
            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
              НАЧАЛО
            </span>
          )}
          <select
            value={node.type}
            onChange={(e) => handleTypeChange(e.target.value as FSMNode['type'])}
            className="text-sm font-medium bg-background border rounded px-2 py-0.5"
          >
            {NODE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onRemove}
          className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Удалить ноду"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ID */}
      <div className="mb-3">
        <label className="text-xs text-muted-foreground block mb-1">ID ноды</label>
        <input
          value={node.id}
          onChange={(e) => onChange({ ...node, id: e.target.value })}
          className="w-full h-8 rounded-lg border bg-background px-2 text-xs font-mono"
          placeholder="node_id"
        />
      </div>

      {/* Content editor based on type */}
      {node.type === 'message' && (
        <div className="mb-2">
          <label className="text-xs text-muted-foreground block mb-1">Текст сообщения</label>
          <textarea
            value={(node.content?.text as string) || ''}
            onChange={(e) => updateContent('text', e.target.value)}
            placeholder="Привет! Чем могу помочь?"
            rows={2}
            className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm resize-none"
          />
        </div>
      )}

      {node.type === 'message' && (
        <div className="mb-2">
          <label className="text-xs text-muted-foreground block mb-1">Ответ (JSON)</label>
          <textarea
            value={JSON.stringify(node.content?.response || {}, null, 2)}
            onChange={(e) => {
              try {
                updateContent('response', JSON.parse(e.target.value));
              } catch {}
            }}
            rows={2}
            className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs font-mono resize-none"
            placeholder='{"method": "sendMessage", "params": {"text": "..."}}'
          />
        </div>
      )}

      {node.type === 'action' && (
        <div className="mb-2">
          <label className="text-xs text-muted-foreground block mb-1">Действие</label>
          <input
            value={(node.content?.action as string) || ''}
            onChange={(e) => updateContent('action', e.target.value)}
            placeholder="set_variable, notify_admin, ... "
            className="w-full h-8 rounded-lg border bg-background px-2 text-sm"
          />
          <input
            value={(node.content?.action_data as string) || ''}
            onChange={(e) => updateContent('action_data', e.target.value)}
            placeholder="Данные действия (JSON)"
            className="w-full h-8 rounded-lg border bg-background px-2 text-sm mt-1 text-xs"
          />
        </div>
      )}

      {node.type === 'condition' && (
        <div className="space-y-2 mb-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Переменная</label>
            <input
              value={(node.content?.variable as string) || ''}
              onChange={(e) => updateContent('variable', e.target.value)}
              placeholder="user_status"
              className="w-full h-8 rounded-lg border bg-background px-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Оператор</label>
              <select
                value={(node.content?.operator as string) || 'equals'}
                onChange={(e) => updateContent('operator', e.target.value)}
                className="w-full h-8 rounded-lg border bg-background px-2 text-sm"
              >
                <option value="equals">Равно</option>
                <option value="not_equals">Не равно</option>
                <option value="contains">Содержит</option>
                <option value="greater_than">Больше</option>
                <option value="less_than">Меньше</option>
                <option value="exists">Существует</option>
                <option value="not_exists">Не существует</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Значение</label>
              <input
                value={(node.content?.value as string) || ''}
                onChange={(e) => updateContent('value', e.target.value)}
                placeholder="ожидаемое значение"
                className="w-full h-8 rounded-lg border bg-background px-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {node.type === 'end' && (
        <div className="text-sm text-muted-foreground italic">
          Конечное состояние — диалог завершается.
        </div>
      )}
    </div>
  );
}