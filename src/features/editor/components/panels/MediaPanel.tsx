/**
 * MediaPanel.tsx — Левая панель: медиа-файлы пользователя.
 * Upload, grid/list view, drag to timeline.
 */

import React, { useCallback, useState, useMemo } from 'react';
import { Upload, Film, Image, Music, Grid, List, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { EditorAsset, AssetType } from '../../types';

interface MediaPanelProps {
  assets: EditorAsset[];
  onUpload: (files: FileList) => void;
  onAssetDragStart: (asset: EditorAsset) => void;
  onDeleteAsset: (assetId: string) => void;
}

const ASSET_TYPE_ICONS: Record<AssetType, React.ElementType> = {
  video: Film,
  image: Image,
  audio: Music,
  font: List,
};

const FILTER_OPTIONS: Array<{ value: AssetType | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'video', label: 'Видео' },
  { value: 'image', label: 'Фото' },
  { value: 'audio', label: 'Аудио' },
];

export const MediaPanel = React.memo(function MediaPanel({
  assets,
  onUpload,
  onAssetDragStart,
  onDeleteAsset,
}: MediaPanelProps) {
  const [filterType, setFilterType] = useState<AssetType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredAssets = useMemo(() => {
    let result = assets;
    if (filterType !== 'all') {
      result = result.filter((a) => a.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) => a.name.toLowerCase().includes(q));
    }
    return result;
  }, [assets, filterType, searchQuery]);

  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,image/*,audio/*';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) onUpload(files);
    };
    input.click();
  }, [onUpload]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        onUpload(e.dataTransfer.files);
      }
    },
    [onUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  function formatDuration(ms: number | null): string {
    if (!ms) return '';
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    return `${min}:${String(sec % 60).padStart(2, '0')}`;
  }

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Медиа файлы">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Медиа</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', viewMode === 'grid' ? 'text-white' : 'text-slate-500')}
              onClick={() => setViewMode('grid')}
              aria-label="Сетка"
            >
              <Grid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', viewMode === 'list' ? 'text-white' : 'text-slate-500')}
              onClick={() => setViewMode('list')}
              aria-label="Список"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск..."
            className="h-7 pl-7 bg-[#1f2937] border-slate-700 text-xs"
            aria-label="Поиск медиа"
          />
        </div>

        <div className="flex gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 text-[10px] px-2',
                filterType === opt.value
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-slate-500 hover:text-white',
              )}
              onClick={() => setFilterType(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Upload zone */}
      <div
        className="mx-3 mt-3 mb-2 border-2 border-dashed border-slate-700 rounded-lg p-3 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-500/5 transition-colors"
        onClick={handleUploadClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        role="button"
        aria-label="Загрузить файлы"
      >
        <Upload className="h-5 w-5 mx-auto mb-1 text-slate-500" />
        <p className="text-xs text-slate-500">Нажмите или перетащите файлы</p>
      </div>

      {/* Assets */}
      <ScrollArea className="flex-1 px-3">
        {filteredAssets.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <p className="text-xs">Нет медиа-файлов</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2 pb-3">
            {filteredAssets.map((asset) => {
              const Icon = ASSET_TYPE_ICONS[asset.type];
              return (
                <div
                  key={asset.id}
                  className="group relative bg-[#1f2937] rounded-lg overflow-hidden cursor-grab hover:ring-1 hover:ring-indigo-500 transition-all"
                  draggable
                  onDragStart={() => onAssetDragStart(asset)}
                  role="listitem"
                  aria-label={asset.name}
                >
                  {asset.thumbnail_url ? (
                    <img loading="lazy"
                      src={asset.thumbnail_url}
                      alt={asset.name}
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-video flex items-center justify-center bg-slate-800">
                      <Icon className="h-6 w-6 text-slate-600" />
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="text-[10px] text-slate-300 truncate">{asset.name}</p>
                    <p className="text-[9px] text-slate-500">
                      {formatFileSize(asset.file_size)}
                      {asset.duration_ms ? ` · ${formatDuration(asset.duration_ms)}` : ''}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="absolute top-1 right-1 h-5 w-5 bg-black/60 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id); }}
                        aria-label={`Удалить ${asset.name}`}
                      >
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Удалить</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-3">
            {filteredAssets.map((asset) => {
              const Icon = ASSET_TYPE_ICONS[asset.type];
              return (
                <div
                  key={asset.id}
                  className="flex items-center gap-2 p-2 bg-[#1f2937] rounded hover:bg-slate-700 cursor-grab"
                  draggable
                  onDragStart={() => onAssetDragStart(asset)}
                  role="listitem"
                  aria-label={asset.name}
                >
                  <Icon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-300 truncate">{asset.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {formatFileSize(asset.file_size)}
                      {asset.duration_ms ? ` · ${formatDuration(asset.duration_ms)}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});
