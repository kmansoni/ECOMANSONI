/**
 * EditorToolbar.tsx — Верхняя панель редактора.
 * Undo/Redo, playback, zoom, export, настройки проекта.
 */

import React, { useCallback, useState } from 'react';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Download,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEditorStore } from '../stores/editor-store';
import { useTimelineStore } from '../stores/timeline-store';
import { useHistoryStore } from '../stores/history-store';
import { useUIStore } from '../stores/ui-store';
import { MIN_ZOOM, MAX_ZOOM } from '../constants';
import { TimeDisplay } from './shared/TimeDisplay';

export const EditorToolbar = React.memo(function EditorToolbar() {
  const project = useEditorStore((s) => s.project);
  const updateProjectLocal = useEditorStore((s) => s.updateProjectLocal);
  const getProjectDuration = useEditorStore((s) => s.getProjectDuration);

  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const currentTimeMs = useTimelineStore((s) => s.currentTimeMs);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const play = useTimelineStore((s) => s.play);
  const pause = useTimelineStore((s) => s.pause);
  const togglePlayback = useTimelineStore((s) => s.togglePlayback);
  const seek = useTimelineStore((s) => s.seek);
  const setZoomLevel = useTimelineStore((s) => s.setZoomLevel);
  const zoomInAction = useTimelineStore((s) => s.zoomIn);
  const zoomOutAction = useTimelineStore((s) => s.zoomOut);

  const undoStack = useHistoryStore((s) => s.undoStack);
  const redoStack = useHistoryStore((s) => s.redoStack);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const openRenderDialog = useUIStore((s) => s.openRenderDialog);
  const toggleProjectSettings = useUIStore((s) => s.toggleProjectSettings);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const projectDuration = getProjectDuration();

  const handleTitleDoubleClick = useCallback(() => {
    if (project) {
      setTitleDraft(project.title);
      setIsEditingTitle(true);
    }
  }, [project]);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== project?.title) {
      updateProjectLocal({ title: titleDraft.trim() });
    }
  }, [titleDraft, project?.title, updateProjectLocal]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'Escape') {
        setIsEditingTitle(false);
      }
    },
    [],
  );

  const handleSkipBack = useCallback(() => {
    seek(0);
  }, [seek]);

  const handleSkipForward = useCallback(() => {
    seek(projectDuration);
  }, [seek, projectDuration]);

  const handleZoomChange = useCallback(
    (values: number[]) => {
      setZoomLevel(values[0]);
    },
    [setZoomLevel],
  );

  const zoomPercent = Math.round((zoomLevel / 100) * 100);

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className="h-12 bg-[#111827] border-b border-slate-800 flex items-center px-3 gap-2 flex-shrink-0"
        role="toolbar"
        aria-label="Панель инструментов редактора"
      >
        {/* Back button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white"
              aria-label="Назад к проектам"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Назад к проектам</TooltipContent>
        </Tooltip>

        {/* Project title */}
        <div className="min-w-[120px] max-w-[200px]">
          {isEditingTitle ? (
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="h-7 bg-[#1f2937] border-slate-600 text-sm"
              autoFocus
              aria-label="Название проекта"
            />
          ) : (
            <button
              type="button"
              className="text-sm text-slate-200 truncate hover:text-white cursor-text px-2 py-1 rounded hover:bg-slate-800 transition-colors w-full text-left"
              onDoubleClick={handleTitleDoubleClick}
              title="Двойной клик для редактирования"
            >
              {project?.title ?? 'Новый проект'}
            </button>
          )}
        </div>

        <Separator orientation="vertical" className="h-6 bg-slate-700" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white relative"
                onClick={undo}
                disabled={undoStack.length === 0}
                aria-label={`Отменить (${undoStack.length})`}
              >
                <Undo2 className="h-4 w-4" />
                {undoStack.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-indigo-600 text-white rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {undoStack.length}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Отменить (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white relative"
                onClick={redo}
                disabled={redoStack.length === 0}
                aria-label={`Повторить (${redoStack.length})`}
              >
                <Redo2 className="h-4 w-4" />
                {redoStack.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-indigo-600 text-white rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {redoStack.length}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Повторить (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6 bg-slate-700" />

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={handleSkipBack}
                aria-label="В начало"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>В начало</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-indigo-600"
                onClick={togglePlayback}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isPlaying ? 'Пауза' : 'Воспроизведение'} (Пробел)
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={handleSkipForward}
                aria-label="В конец"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>В конец</TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-1 ml-1">
            <TimeDisplay timeMs={currentTimeMs} className="text-xs" />
            <span className="text-xs text-slate-600">/</span>
            <TimeDisplay timeMs={projectDuration} className="text-xs text-slate-500" />
          </div>
        </div>

        <Separator orientation="vertical" className="h-6 bg-slate-700" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-white"
                onClick={zoomOutAction}
                aria-label="Уменьшить масштаб"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Уменьшить масштаб (−)</TooltipContent>
          </Tooltip>

          <Slider
            value={[zoomLevel]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={1}
            onValueChange={handleZoomChange}
            className="w-24"
            aria-label="Масштаб таймлайна"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-white"
                onClick={zoomInAction}
                aria-label="Увеличить масштаб"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Увеличить масштаб (+)</TooltipContent>
          </Tooltip>

          <span className="text-xs text-slate-500 font-mono w-10 text-center">
            {zoomPercent}%
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={toggleProjectSettings}
                aria-label="Настройки проекта"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Настройки проекта</TooltipContent>
          </Tooltip>

          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 h-8"
            onClick={openRenderDialog}
          >
            <Download className="h-3.5 w-3.5" />
            Экспорт
          </Button>
        </div>
      </header>
    </TooltipProvider>
  );
});
