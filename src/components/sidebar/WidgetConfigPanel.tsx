// src/components/sidebar/WidgetConfigPanel.tsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { WIDGET_REGISTRY } from './widgetRegistry';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';
import { IconRenderer } from './iconRenderer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DraggableItem({
  id, title, category, icon, visible, onToggle, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
}: {
  id: string;
  title: string;
  category: string;
  icon: string;
  visible: boolean;
  onToggle: (id: string, v: boolean) => void;
  onRemove: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}) {
  const categoryColors: Record<string, string> = {
    'Личное': 'text-blue-400',
    'Утилиты': 'text-green-400',
    'Общение': 'text-purple-400',
    'Медиа': 'text-pink-400',
    'Транспорт': 'text-orange-400',
    'Информация': 'text-yellow-400',
    'Продуктивность': 'text-cyan-400',
    'Открытия': 'text-emerald-400',
    'Система': 'text-red-400',
  };
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, id)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, id)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${isDragOver ? 'bg-cyan-500/10 border border-cyan-400/30' : 'bg-white/5 hover:bg-white/10 border-transparent'}`}
    >
      <button className="cursor-grab active:cursor-grabbing" aria-label="Перетащить">
        <IconRenderer name="GripVertical" className="h-4 w-4 text-white/30" />
      </button>
      <div className="flex-1 flex items-center gap-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${categoryColors[category] || 'text-white/40'} bg-white/5`}>
          <IconRenderer name={icon} className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="text-[10px] text-gray-500">{category}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {visible && (
          <button onClick={() => onRemove(id)} className="text-gray-500 hover:text-red-400 transition-colors">
            <IconRenderer name="Trash2" className="h-3.5 w-3.5" />
          </button>
        )}
        <Switch checked={visible} onCheckedChange={(v) => onToggle(id, v as boolean)} />
      </div>
    </div>
  );
}

export function WidgetConfigPanel({ open, onOpenChange }: Props) {
  const { sidebarWidgets, setSidebarWidgetOrder, setSidebarWidgetVisible } = useNavigatorSettings(
    (s) => ({
      sidebarWidgets: s.sidebarWidgets,
      setSidebarWidgetOrder: s.setSidebarWidgetOrder,
      setSidebarWidgetVisible: s.setSidebarWidgetVisible,
    }),
  );

  const { order = [], visible = [] } = sidebarWidgets || {};
  const [dragId, setDragId] = useState<string | null>(null);
  const allWidgetIds = Object.keys(WIDGET_REGISTRY) as (keyof typeof WIDGET_REGISTRY)[];

  const handleDragStart = (_e: React.DragEvent, id: string) => {
    setDragId(id);
    if (_e.dataTransfer) {
      _e.dataTransfer.effectAllowed = 'move';
      _e.dataTransfer.setData('text/plain', id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (_e: React.DragEvent, targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const fromIdx = order.indexOf(dragId);
    const toIdx = order.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...order];
    const [removed] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, removed);
    setSidebarWidgetOrder(newOrder);
  };

  const handleDragEnd = () => { setDragId(null); };

  const toggleVisible = (id: string, checked: boolean) => {
    if (checked) {
      if (!visible.includes(id)) setSidebarWidgetVisible([...visible, id]);
      if (!order.includes(id)) {
        const def = WIDGET_REGISTRY[id];
        const sameCategory = order.filter((oid) => WIDGET_REGISTRY[oid]?.category === def?.category);
        if (sameCategory.length > 0) {
          const insertIdx = order.indexOf(sameCategory[sameCategory.length - 1]) + 1;
          const newOrder = [...order];
          newOrder.splice(insertIdx, 0, id);
          setSidebarWidgetOrder(newOrder);
        } else {
          setSidebarWidgetOrder([...order, id]);
        }
      }
    } else {
      setSidebarWidgetVisible(visible.filter((v) => v !== id));
    }
  };

  const addWidget = (id: string) => {
    const newOrder = order.includes(id) ? order : [...order, id];
    setSidebarWidgetOrder(newOrder);
    if (!visible.includes(id)) setSidebarWidgetVisible([...visible, id]);
  };

  const handleReset = () => {
    setSidebarWidgetOrder(['profile', 'quickActions', 'chats', 'music', 'taxi', 'weather', 'todo', 'search', 'recommendations', 'notes', 'settings', 'support']);
    setSidebarWidgetVisible(['profile', 'quickActions', 'chats', 'music', 'taxi', 'weather', 'todo', 'search', 'recommendations', 'notes', 'settings', 'support']);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col dark:bg-[rgba(35,35,42,0.45)] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-[0_0_0_1px_rgba(15,69,255,0.10)_inset,0_0_24px_rgba(15,69,255,0.10),0_0_24px_rgba(106,54,255,0.08)]">
        <DialogHeader>
          <DialogTitle>Настройка панели</DialogTitle>
          <DialogDescription>Перетаскивайте для смены порядка, переключайте видимость</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <p className="text-[11px] text-gray-500 mb-2 uppercase tracking-wider">Активные виджеты</p>

          {order.length > 0 ? (
            <div className="space-y-1">
              {order.map((id) => {
                const def = WIDGET_REGISTRY[id];
                if (!def) return null;
                return (
                  <DraggableItem
                    key={id}
                    id={id}
                    title={def.title}
                    category={def.category}
                    icon={def.icon}
                    visible={visible.includes(id)}
                    onToggle={toggleVisible}
                    onRemove={(wid: string) => setSidebarWidgetVisible(visible.filter((v) => v !== wid))}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    isDragOver={false}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-sm py-8">Нет активных виджетов</div>
          )}

          <Separator className="my-4" />

          <p className="text-[11px] text-gray-500 mb-2 uppercase tracking-wider">Доступные виджеты</p>
          <div className="space-y-1">
            {allWidgetIds
              .filter((id) => !order.includes(id))
              .map((id) => {
                const def = WIDGET_REGISTRY[id];
                if (!def) return null;
                return (
                  <button
                    key={id}
                    onClick={() => addWidget(id)}
                    className="flex items-center gap-3 w-full p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-white/50 bg-white/5">
                      <IconRenderer name={def.icon} className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-white/80">{def.title}</div>
                      <div className="text-[10px] text-gray-500">{def.category}</div>
                    </div>
                    <IconRenderer name="Plus" className="h-4 w-4 text-cyan-400" />
                  </button>
                );
              })}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleReset}>Сбросить</Button>
          <Button onClick={() => onOpenChange(false)}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}