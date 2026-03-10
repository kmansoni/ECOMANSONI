/**
 * EditorLayout.tsx — Главный layout редактора.
 * 3 зоны: left sidebar, center (preview), right sidebar + bottom timeline.
 * Resizable panels, toggleable sidebars через ui-store.
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeft, PanelRight, Film, Music, Sticker, Sparkles, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUIStore, type MediaTab, type InspectorTab } from '../stores/ui-store';
import { MIN_BOTTOM_PANEL_HEIGHT, MAX_BOTTOM_PANEL_HEIGHT } from '../constants';
import { EditorToolbar } from './EditorToolbar';
import { Timeline } from './timeline/Timeline';
import { PreviewCanvas } from './preview/PreviewCanvas';
import { PreviewControls } from './preview/PreviewControls';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { FiltersPanel } from './panels/FiltersPanel';
import { TransitionsPanel } from './panels/TransitionsPanel';
import { KeyframesPanel } from './panels/KeyframesPanel';
import { RenderDialog } from './dialogs/RenderDialog';
import { ProjectSettingsDialog } from './dialogs/ProjectSettingsDialog';

const LEFT_SIDEBAR_TABS: Array<{ value: MediaTab; icon: React.ElementType; label: string }> = [
  { value: 'media', icon: Film, label: 'Медиа' },
  { value: 'music', icon: Music, label: 'Музыка' },
  { value: 'stickers', icon: Sticker, label: 'Стикеры' },
  { value: 'templates', icon: Sparkles, label: 'Шаблоны' },
  { value: 'text', icon: Type, label: 'Текст' },
];

const RIGHT_SIDEBAR_TABS: Array<{ value: InspectorTab; label: string }> = [
  { value: 'properties', label: 'Свойства' },
  { value: 'effects', label: 'Эффекты' },
  { value: 'keyframes', label: 'Кейфреймы' },
];

const SIDEBAR_ANIMATION = {
  initial: { width: 0, opacity: 0 },
  animate: { width: 'auto', opacity: 1 },
  exit: { width: 0, opacity: 0 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
};

export const EditorLayout = React.memo(function EditorLayout() {
  const leftPanelOpen = useUIStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useUIStore((s) => s.rightPanelOpen);
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const bottomPanelHeight = useUIStore((s) => s.bottomPanelHeight);
  const setBottomPanelHeight = useUIStore((s) => s.setBottomPanelHeight);
  const activeMediaTab = useUIStore((s) => s.activeMediaTab);
  const setActiveMediaTab = useUIStore((s) => s.setActiveMediaTab);
  const activeInspectorTab = useUIStore((s) => s.activeInspectorTab);
  const setActiveInspectorTab = useUIStore((s) => s.setActiveInspectorTab);

  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Resize bottom panel via drag
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      resizeRef.current = { startY: e.clientY, startHeight: bottomPanelHeight };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [bottomPanelHeight],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - e.clientY;
      const newHeight = Math.max(
        MIN_BOTTOM_PANEL_HEIGHT,
        Math.min(MAX_BOTTOM_PANEL_HEIGHT, resizeRef.current.startHeight + delta),
      );
      setBottomPanelHeight(newHeight);
    },
    [setBottomPanelHeight],
  );

  const handleResizePointerUp = useCallback(() => {
    resizeRef.current = null;
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen w-screen flex flex-col bg-[#0a0a1a] text-white overflow-hidden">
        {/* Top Toolbar */}
        <EditorToolbar />

        {/* Main Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar Toggle */}
          <div className="flex flex-col bg-[#0d0d20] border-r border-slate-800 w-10 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-10 w-10 rounded-none',
                    leftPanelOpen ? 'text-indigo-400' : 'text-slate-500 hover:text-white',
                  )}
                  onClick={toggleLeftPanel}
                  aria-label={leftPanelOpen ? 'Скрыть левую панель' : 'Показать левую панель'}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {leftPanelOpen ? 'Скрыть' : 'Показать'} панель
              </TooltipContent>
            </Tooltip>

            {LEFT_SIDEBAR_TABS.map((tab) => (
              <Tooltip key={tab.value}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-10 w-10 rounded-none',
                      activeMediaTab === tab.value && leftPanelOpen
                        ? 'text-indigo-400 bg-indigo-600/10'
                        : 'text-slate-500 hover:text-white',
                    )}
                    onClick={() => setActiveMediaTab(tab.value)}
                    aria-label={tab.label}
                  >
                    <tab.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{tab.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Left Sidebar Content */}
          <AnimatePresence>
            {leftPanelOpen && (
              <motion.div
                {...SIDEBAR_ANIMATION}
                className="border-r border-slate-800 bg-[#111827] overflow-hidden flex-shrink-0"
                style={{ minWidth: 240, maxWidth: 400, width: 280 }}
                role="complementary"
                aria-label="Левая панель"
              >
                <div className="h-full w-[280px]">
                  {/* Content rendered based on activeMediaTab — parent provides the actual panel */}
                  <div className="h-full flex items-center justify-center text-slate-600 p-4">
                    <div className="text-center">
                      <p className="text-xs">Панель: {activeMediaTab}</p>
                      <p className="text-[10px] mt-1 text-slate-700">
                        Подключи MediaPanel, MusicPanel и т.д.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center Area (Preview + Timeline) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Preview Area */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <PreviewCanvas />
              <PreviewControls />
            </div>

            {/* Resize handle */}
            <div
              className="h-1.5 bg-[#0a0a1a] cursor-row-resize hover:bg-indigo-600/30 transition-colors flex-shrink-0 flex items-center justify-center"
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Изменить размер таймлайна"
            >
              <div className="w-8 h-0.5 bg-slate-700 rounded-full" />
            </div>

            {/* Timeline */}
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{ height: `${bottomPanelHeight}px` }}
            >
              <Timeline />
            </div>
          </div>

          {/* Right Sidebar Content */}
          <AnimatePresence>
            {rightPanelOpen && (
              <motion.div
                {...SIDEBAR_ANIMATION}
                className="border-l border-slate-800 bg-[#111827] overflow-hidden flex-shrink-0"
                style={{ minWidth: 280, maxWidth: 400, width: 300 }}
                role="complementary"
                aria-label="Правая панель"
              >
                <div className="h-full w-[300px] flex flex-col">
                  <Tabs
                    value={activeInspectorTab}
                    onValueChange={(v) => setActiveInspectorTab(v as InspectorTab)}
                    className="flex flex-col h-full"
                  >
                    <TabsList className="bg-[#0a0a1a] rounded-none border-b border-slate-800 h-9 flex-shrink-0">
                      {RIGHT_SIDEBAR_TABS.map((tab) => (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          className="flex-1 text-[10px] data-[state=active]:bg-[#1f2937]"
                        >
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    <TabsContent value="properties" className="flex-1 m-0 overflow-hidden">
                      <PropertiesPanel />
                    </TabsContent>
                    <TabsContent value="effects" className="flex-1 m-0 overflow-hidden">
                      <EffectsPanel />
                    </TabsContent>
                    <TabsContent value="keyframes" className="flex-1 m-0 overflow-hidden">
                      <KeyframesPanel />
                    </TabsContent>
                  </Tabs>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Sidebar Toggle */}
          <div className="flex flex-col bg-[#0d0d20] border-l border-slate-800 w-10 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-10 w-10 rounded-none',
                    rightPanelOpen ? 'text-indigo-400' : 'text-slate-500 hover:text-white',
                  )}
                  onClick={toggleRightPanel}
                  aria-label={rightPanelOpen ? 'Скрыть правую панель' : 'Показать правую панель'}
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {rightPanelOpen ? 'Скрыть' : 'Показать'} панель
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Dialogs */}
        <RenderDialog />
        <ProjectSettingsDialog />
      </div>
    </TooltipProvider>
  );
});
