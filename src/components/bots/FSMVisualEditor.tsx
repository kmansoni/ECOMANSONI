/**
 * FSMVisualEditor — визуальный редактор FSM-состояний бота.
 * Позволяет создавать/редактировать ноды и переходы в удобном виде.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FSMNodeEditor } from './FSMNodeEditor';

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

interface FSMFlow {
  nodes: FSMNode[];
  transitions: FSMTransition[];
}

interface FSMVisualEditorProps {
  flow: FSMFlow;
  onChange: (flow: FSMFlow) => void;
  initialState?: string;
  onInitialStateChange?: (state: string) => void;
}

const NODE_COLORS: Record<FSMNode['type'], { bg: string; border: string; text: string }> = {
  message: { bg: 'bg-blue-50/10', border: 'border-blue-400/50', text: 'text-blue-300' },
  action:   { bg: 'bg-green-50/10', border: 'border-green-400/50', text: 'text-green-300' },
  condition: { bg: 'bg-yellow-50/10', border: 'border-yellow-400/50', text: 'text-yellow-300' },
  end:      { bg: 'bg-red-50/10', border: 'border-red-400/50', text: 'text-red-300' },
};

const NEW_NODE_ID_PREFIX = 'new_node_';

export function FSMVisualEditor({ flow, onChange, initialState, onInitialStateChange }: FSMVisualEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingTransition, setEditingTransition] = useState<{ from: string; to: string } | null>(null);
  const [transitionCondition, setTransitionCondition] = useState('');
  const [addingNodeId, setAddingNodeId] = useState('');
  const [addingNodeType, setAddingNodeType] = useState<FSMNode['type']>('message');

  const selectedNode = useMemo(
    () => flow.nodes.find((n) => n.id === selectedNodeId),
    [flow.nodes, selectedNodeId]
  );

  // Сгенерировать уникальный ID для новой ноды
  const generateNodeId = useCallback(() => {
    let idx = flow.nodes.length + 1;
    while (flow.nodes.some((n) => n.id === `${NEW_NODE_ID_PREFIX}${idx}`)) idx++;
    return `${NEW_NODE_ID_PREFIX}${idx}`;
  }, [flow.nodes]);

  // ── Добавление ноды ──────────────────────────────────────────
  const handleAddNode = () => {
    if (!addingNodeId.trim()) return;
    if (flow.nodes.some((n) => n.id === addingNodeId.trim())) {
      alert('Нода с таким ID уже существует');
      return;
    }

    const newNode: FSMNode = { id: addingNodeId.trim(), type: addingNodeType };

    if (addingNodeType === 'message') newNode.content = { text: '', response: { method: 'sendMessage', params: { text: '' } } };
    if (addingNodeType === 'action') newNode.content = { action: '', action_data: '' };
    if (addingNodeType === 'condition') newNode.content = { variable: '', operator: 'equals', value: '' };

    onChange({ ...flow, nodes: [...flow.nodes, newNode] });
    setAddingNodeId('');
    setAddingNodeType('message');
    setSelectedNodeId(newNode.id);
  };

  // ── Удаление ноды ────────────────────────────────────────────
  const handleRemoveNode = (nodeId: string) => {
    const newNodes = flow.nodes.filter((n) => n.id !== nodeId);
    const newTransitions = flow.transitions.filter((t) => t.from !== nodeId && t.to !== nodeId);
    const nextFlow = { nodes: newNodes, transitions: newTransitions };
    onChange(nextFlow);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (initialState === nodeId && onInitialStateChange) onInitialStateChange(newNodes[0]?.id || '');
  };

  // ── Обновление ноды ───────────────────────────────────────────
  const handleUpdateNode = (updated: FSMNode) => {
    const newNodes = flow.nodes.map((n) => (n.id === updated.id ? updated : n));
    onChange({ ...flow, nodes: newNodes });
  };

  // ── Добавление перехода ───────────────────────────────────────
  const handleAddTransition = () => {
    if (!editingTransition) return;
    if (!editingTransition.from || !editingTransition.to) return;

    const exists = flow.transitions.some(
      (t) => t.from === editingTransition.from && t.to === editingTransition.to
    );
    if (exists) {
      alert('Переход уже существует');
      return;
    }

    onChange({
      ...flow,
      transitions: [...flow.transitions, { ...editingTransition, condition: transitionCondition }],
    });
    setEditingTransition(null);
    setTransitionCondition('');
  };

  // ── Удаление перехода ─────────────────────────────────────────
  const handleRemoveTransition = (from: string, to: string) => {
    onChange({
      ...flow,
      transitions: flow.transitions.filter((t) => !(t.from === from && t.to === to)),
    });
  };

  // ── Определяем позиции нод (горизонтальный слой) ───────────────
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    // Слои по типу: message → condition → action → end
    const typeLayer: Record<FSMNode['type'], number> = { message: 0, condition: 1, action: 2, end: 3 };
    const layers: Record<number, FSMNode[]> = { 0: [], 1: [], 2: [], 3: [] };

    flow.nodes.forEach((n) => {
      layers[typeLayer[n.type]]?.push(n);
    });

    const nodeWidth = 180;
    const nodeHeight = 80;
    const gapX = 50;
    const gapY = 120;
    const startX = 160;
    const startY = 40;

    Object.entries(layers).forEach(([layer, nodes]) => {
      const totalWidth = nodes.length * (nodeWidth + gapX) - gapX;
      const startXOffset = startX + (500 - totalWidth) / 2;

      nodes.forEach((n, i) => {
        positions[n.id] = {
          x: startXOffset + i * (nodeWidth + gapX),
          y: startY + parseInt(layer) * (nodeHeight + gapY),
        };
      });
    });

    return positions;
  }, [flow.nodes]);

  // ── SVG стрелок ───────────────────────────────────────────────
  const renderArrows = () => {
    return flow.transitions.map((t) => {
      const fromPos = nodePositions[t.from];
      const toPos = nodePositions[t.to];
      if (!fromPos || !toPos) return null;

      const nodeW = 180;
      const nodeH = 80;

      // Вычисляем точки: из правого края from → в левый край to
      let x1 = fromPos.x + nodeW;
      let y1 = fromPos.y + nodeH / 2;
      let x2 = toPos.x;
      let y2 = toPos.y + nodeH / 2;

      // Если ноды на одной Y-координате, делаем изгиб
      const midX = (x1 + x2) / 2;

      // Проверяем: если from и to на одном уровне, делаем кривую вниз
      let path;
      if (Math.abs(y1 - y2) < 20) {
        const curveDown = Math.max(y1, y2) + 40;
        path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${curveDown}, ${midX} ${curveDown}, ${midX} ${y2}, ${x2} ${y2}`;
      } else {
        // Разные уровни — прямая с изгибом
        path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      }

      return (
        <g key={`${t.from}-${t.to}`} className="arrow-group">
          <defs>
            <marker id={`arrowhead-${t.from}-${t.to}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
          </defs>
          <path
            d={path}
            fill="none"
            stroke="#64748b"
            strokeWidth={editingTransition?.from === t.from && editingTransition?.to === t.to ? 3 : 2}
            className="transition-path"
            markerEnd={`url(#arrowhead-${t.from}-${t.to})`}
          />
          {/* Текст условия */}
          {t.condition && (
            <text
              x={midX}
              y={(y1 + y2) / 2 - 8}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="10"
              fontFamily="monospace"
            >
              {t.condition}
            </text>
          )}
          {/* Кнопка удаления перехода */}
          <circle
            cx={midX}
            cy={(y1 + y2) / 2}
            r="10"
            fill="#475569"
            stroke="#64748b"
            strokeWidth="1"
            className="cursor-pointer hover:fill-red-500/50 transition-colors"
            onClick={() => handleRemoveTransition(t.from, t.to)}
          >
            <title>Удалить переход</title>
          </circle>
          <text
            x={midX}
            y={(y1 + y2) / 2 + 3.5}
            textAnchor="middle"
            fill="white"
            fontSize="10"
            fontWeight="bold"
            pointerEvents="none"
          >
            ✕
          </text>
        </g>
      );
    });
  };

  // ── Добавление перехода — формы выбора ───────────────────────
  const renderTransitionAdder = () => {
    const nodeOptions = flow.nodes.filter((n) => n.type !== 'end');

    if (editingTransition) {
      return (
        <div className="bg-secondary/50 border border-border rounded-xl p-4 mt-4">
          <p className="text-sm font-medium mb-2">Добавить переход</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={editingTransition.from}
              onChange={(e) => setEditingTransition({ ...editingTransition, from: e.target.value })}
              className="h-8 rounded-lg border bg-background px-2 text-xs"
            >
              <option value="">От...</option>
              {nodeOptions.map((n) => (
                <option key={n.id} value={n.id}>{n.id}</option>
              ))}
            </select>
            <span className="text-muted-foreground">→</span>
            <select
              value={editingTransition.to}
              onChange={(e) => setEditingTransition({ ...editingTransition, to: e.target.value })}
              className="h-8 rounded-lg border bg-background px-2 text-xs"
            >
              <option value="">К...</option>
              {flow.nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id}</option>
              ))}
            </select>
            <input
              value={transitionCondition}
              onChange={(e) => setTransitionCondition(e.target.value)}
              placeholder="Условие (опц.)"
              className="h-8 rounded-lg border bg-background px-2 text-xs flex-1 min-w-[100px]"
            />
            <button onClick={handleAddTransition} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
              Добавить
            </button>
            <button onClick={() => setEditingTransition(null)} className="h-8 px-2 rounded-lg border text-xs">
              Отмена
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => {
            setEditingTransition({ from: '', to: '' });
            setTransitionCondition('');
          }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 17l5-5-5-5" /><path d="M14 17l5-5-5-5" />
          </svg>
          Добавить переход
        </button>
        {flow.transitions.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({flow.transitions.length} переходов)
          </span>
        )}
      </div>
    );
  };

  // ── Canvas ─────────────────────────────────────────────────────
  const canvasW = 660;
  const canvasH = Math.max(200, (flow.nodes.length > 0 ? Math.max(...Object.values(nodePositions).map(p => p.y)) + 140 : 200));

  return (
    <div className={cn("space-y-4")}>
      {/* Визуальный холст */}
      <div className={cn(
        "relative rounded-xl border border-border/50 bg-card overflow-hidden",
        "min-h-[200px]"
      )}>
        <svg
          width={canvasW}
          height={canvasH}
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          className="w-full"
          style={{ minHeight: canvasH }}
        >
          {/* Сетка */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width={canvasW} height={canvasH} fill="url(#grid)" />

          {/* Стрелки переходов */}
          {renderArrows()}

          {/* Ноды */}
          {flow.nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            const colors = NODE_COLORS[node.type];
            const isSelected = selectedNodeId === node.id;
            const isInitial = initialState === node.id;
            const nodeW = 180;

            return (
              <g
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
                className="cursor-pointer node-group"
              >
                {/* Тень */}
                <rect
                  x={pos.x + 2}
                  y={pos.y + 3}
                  width={nodeW}
                  height={78}
                  rx={8}
                  fill="black"
                  opacity={0.15}
                />

                {/* Фон ноды */}
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={nodeW}
                  height={78}
                  rx={8}
                  fill={isSelected ? '#334155' : '#1e293b'}
                  stroke={isSelected ? colors.border.replace('/50', '') : 'hsl(var(--border))'}
                  strokeWidth={isSelected ? 2 : 1}
                  className="node-rect transition-all duration-150"
                />

                {/* Индикатор начального состояния */}
                {isInitial && (
                  <g>
                    <circle cx={pos.x - 8} cy={pos.y + 39} r="5" fill="#22c55e" />
                    <line x1={pos.x - 3} y1={pos.y + 39} x2={pos.x} y2={pos.y + 39} stroke="#22c55e" strokeWidth={2} />
                  </g>
                )}

                {/* Тип ноды — цветная полоса сверху */}
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={nodeW}
                  height="4"
                  rx={4}
                  className={colors.bg}
                />

                {/* Тип ноды — иконка */}
                <text x={pos.x + 12} y={pos.y + 18} fill="#94a3b8" fontSize="10" fontFamily="monospace">
                  {node.type.toUpperCase()}
                </text>

                {/* ID */}
                <text
                  x={pos.x + nodeW / 2}
                  y={pos.y + 40}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="12"
                  fontWeight="bold"
                  fontFamily="monospace"
                  className="pointer-events-none"
                >
                  {node.id}
                </text>

                {/* Предпросмотр контента */}
                <text
                  x={pos.x + nodeW / 2}
                  y={pos.y + 58}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                  className="pointer-events-none"
                >
                  {node.type === 'message' && (node.content?.text as string)?.slice(0, 24) + '...' ||
                   node.type === 'action' && (node.content?.action as string)?.slice(0, 20) ||
                   node.type === 'condition' && 'if ' + (node.content?.variable as string || '?') ||
                   node.type === 'end' && 'END'}
                </text>
              </g>
            );
          })}

          {/* Текст "Нет нод" */}
          {flow.nodes.length === 0 && (
            <text
              x={canvasW / 2}
              y={canvasH / 2}
              textAnchor="middle"
              fill="#64748b"
              fontSize="14"
              fontFamily="system-ui"
            >
              Создайте первую ноду для начала построения FSM
            </text>
          )}
        </svg>

        {/* Легенда */}
        <div className="absolute top-2 right-2 flex gap-3 text-[10px]">
          {Object.entries(NODE_COLORS).map(([type, c]) => (
            <span key={type} className="flex items-center gap-1 opacity-60">
              <span className={cn("w-2.5 h-2.5 rounded-sm inline-block", c.bg.replace('/10', ''))} />
              {type}
            </span>
          ))}
          <span className="flex items-center gap-1 opacity-60">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            start
          </span>
        </div>
      </div>

      {/* Панель управления */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Добавление ноды */}
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Добавить ноду</p>
          <div className="flex gap-2">
            <input
              value={addingNodeId}
              onChange={(e) => setAddingNodeId(e.target.value.replace(/\s+/g, '_'))}
              placeholder="node_id (напр. greet)"
              className="flex-1 h-8 rounded-lg border bg-background px-2 text-xs font-mono"
            />
            <select
              value={addingNodeType}
              onChange={(e) => setAddingNodeType(e.target.value as FSMNode['type'])}
              className="h-8 rounded-lg border bg-background px-1 text-xs"
            >
              <option value="message">msg</option>
              <option value="action">action</option>
              <option value="condition">if</option>
              <option value="end">end</option>
            </select>
            <button
              onClick={handleAddNode}
              disabled={!addingNodeId.trim()}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
            >
              + Нода
            </button>
          </div>
        </div>

        {/* Установка начального состояния */}
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Начальное состояние</p>
          <div className="flex gap-2">
            <select
              value={initialState || ''}
              onChange={(e) => onInitialStateChange?.(e.target.value)}
              className="flex-1 h-8 rounded-lg border bg-background px-2 text-xs"
            >
              <option value="">— выберите ноду —</option>
              {flow.nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id}</option>
              ))}
            </select>
            {initialState && (
              <span className="flex items-center text-xs text-green-500">
                <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" /></svg>
                Установлен
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Редактор переходов */}
      {renderTransitionAdder()}

      {/* Выбранная нода — редактор */}
      {selectedNode && (
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">
              Редактирование: <code className="bg-background px-1.5 py-0.5 rounded text-xs font-mono">{selectedNode.id}</code>
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  if (nodePositions[selectedNode.id]) {
                    const pos = nodePositions[selectedNode.id];
                    // Прокрутка к ноде
                    const el = document.querySelector('.fsm-canvas');
                    if (el) el.scrollTo({ left: pos.x - 50, behavior: 'smooth' });
                  }
                }}
                className="p-1.5 rounded-lg border text-xs hover:bg-accent transition-colors"
              >
                Найти на холсте
              </button>
            </div>
          </div>
          <FSMNodeEditor
            node={selectedNode}
            onChange={handleUpdateNode}
            onRemove={() => handleRemoveNode(selectedNode.id)}
            isFirst={initialState === selectedNode.id}
          />
        </div>
      )}
    </div>
  );
}