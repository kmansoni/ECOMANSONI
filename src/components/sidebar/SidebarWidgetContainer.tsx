import React, { Suspense, useState } from 'react';
import { useSidebarWidgets } from '@/stores/sidebarWidgetsStore';
import { WIDGET_REGISTRY } from './widgetRegistry';
import { SidebarGroup, SidebarGroupContent, SidebarSeparator } from '@/components/ui/sidebar';
import { IconRenderer } from './iconRenderer';
import { WidgetConfigPanel } from './WidgetConfigPanel';

function WidgetWrapper({
  id,
  collapsed,
  onToggleCollapse,
}: {
  id: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const def = WIDGET_REGISTRY[id as keyof typeof WIDGET_REGISTRY];
  if (!def) return null;

  if (collapsed) {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-b-0">
        <span className="text-xs font-medium text-white/60">{def.title}</span>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-transform transition-colors"
        >
          <IconRenderer
            name="ChevronDown"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="px-3 py-4 text-xs text-gray-500">Загрузка...</div>}>
      <div className="px-3 py-2">
        <def.component />
      </div>
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-center w-full p-1 mt-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors text-[10px]"
      >
        <IconRenderer name="ChevronUp" className="h-3 w-3 mr-1" />
        Свернуть
      </button>
    </Suspense>
  );
}

export function SidebarWidgetContainer() {
  const { order, visible } = useSidebarWidgets();
  const [configOpen, setConfigOpen] = useState(false);
  const [collapsedWidgets, setCollapsedWidgets] = useState<Set<string>>(new Set());

  const visibleWidgets = order.filter((id) => visible.includes(id));

  const toggleCollapse = (id: string) => {
    setCollapsedWidgets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (visibleWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm p-4 gap-3">
        <IconRenderer name="Settings" className="h-10 w-10 text-gray-700" />
        <p className="text-center">Панель пуста</p>
        <p className="text-[10px] text-center text-gray-600">Настройте виджеты</p>
        <button
          onClick={() => setConfigOpen(true)}
          className="mt-2 rounded-lg bg-white/10 px-4 py-1.5 text-xs text-white/70 hover:bg-white/20 hover:text-white transition-colors"
        >
          Добавить виджеты
        </button>
        <WidgetConfigPanel open={configOpen} onOpenChange={setConfigOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Панель</span>
        <button
          onClick={() => setConfigOpen(true)}
          className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          title="Настройка виджетов"
        >
          <IconRenderer name="Settings" className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700/50 scrollbar-track-transparent">
        <div className="p-1.5 space-y-0.5">
          {visibleWidgets.map((id, index) => (
            <React.Fragment key={id}>
              <WidgetWrapper
                id={id}
                collapsed={collapsedWidgets.has(id)}
                onToggleCollapse={() => toggleCollapse(id)}
              />
              {index < visibleWidgets.length - 1 && <SidebarSeparator className="my-0.5" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <WidgetConfigPanel open={configOpen} onOpenChange={setConfigOpen} />
    </div>
  );
}
