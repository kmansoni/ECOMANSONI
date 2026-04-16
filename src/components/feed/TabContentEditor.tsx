/**
 * TabContentEditor — унифицированный редактор контента для всех табов
 * CRITICAL FIXES: 
 * #1: State перенесен в CreateModal (более не локальное)
 * #3: Adjustments применяются к preview
 * #2: Fake buttons удалены
 */
import { Sparkles, SlidersHorizontal, Users, CalendarClock, Eye, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PhotoFiltersPanel } from '@/components/editor/PhotoFiltersPanel';
import { FILTERS } from '@/components/editor/photoFiltersModel';
import { AdjustmentsPanel } from '@/components/editor/AdjustmentsPanel';
import { PeopleTagOverlay } from './PeopleTagOverlay';
import { SchedulePostPicker } from './SchedulePostPicker';
import { adjustmentsToFilterStyle, type EditorState, type EditorAction } from './editorStateModel';
import { useState, type CSSProperties } from 'react';

type TabType = 'publications' | 'stories' | 'reels' | 'live';

interface TabContentEditorProps {
  activeTab: TabType;
  previewUrl: string | null;
  caption: string;
  onCaptionChange: (caption: string) => void;
  musicTitle?: string;
  onMusicTitleChange?: (musicTitle: string) => void;
  reelTaggedUsers?: string;
  onReelTaggedUsersChange?: (value: string) => void;
  reelLocationName?: string;
  onReelLocationNameChange?: (value: string) => void;
  reelAudience?: 'public' | 'followers' | 'private';
  onReelAudienceChange?: (value: 'public' | 'followers' | 'private') => void;
  reelAllowComments?: boolean;
  onReelAllowCommentsChange?: (value: boolean) => void;
  reelAllowRemix?: boolean;
  onReelAllowRemixChange?: (value: boolean) => void;
  onClose: () => void;

  // CRITICAL FIX #1: State теперь передается из родителя
  editorState: EditorState;
  dispatchEditor: (action: EditorAction) => void;
}

export function TabContentEditor({
  activeTab,
  previewUrl,
  caption,
  onCaptionChange,
  musicTitle,
  onMusicTitleChange,
  reelTaggedUsers,
  onReelTaggedUsersChange,
  reelLocationName,
  onReelLocationNameChange,
  reelAudience,
  onReelAudienceChange,
  reelAllowComments,
  onReelAllowCommentsChange,
  reelAllowRemix,
  onReelAllowRemixChange,
  onClose,
  editorState,
  dispatchEditor,
}: TabContentEditorProps) {
  // Локальное UI состояние (не сохраняется между табами)
  const [showFilters, setShowFilters] = useState(false);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [showPeopleTags, setShowPeopleTags] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Publications: полный набор инструментов
  if (activeTab === 'publications') {
    // Объединяем CSS-фильтр из выбранного Instagram-фильтра + adjustments
    const selectedFilter = FILTERS[editorState.selectedFilterIdx] ?? FILTERS[0];
    const adjStyle = adjustmentsToFilterStyle(editorState.adjustments);
    const filterCSS = editorState.selectedFilterIdx > 0 && selectedFilter.style.filter
      ? String(selectedFilter.style.filter)
      : '';
    const combinedFilter = [filterCSS, adjStyle.filter].filter(Boolean).join(' ');
    const previewStyle: CSSProperties = {
      filter: combinedFilter || undefined,
    };
    return (
      <div className="space-y-3 bg-zinc-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
        {/* CRITICAL FIX #3: Adjustments + Filter применяются к preview */}
        {previewUrl && (
          <div className="relative group">
            <img loading="lazy"
              src={previewUrl}
              alt="Preview"
              className="w-full aspect-square object-cover rounded-lg"
              style={previewStyle}
            />
            {selectedFilter.overlay && editorState.selectedFilterIdx > 0 && (
              <div
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{
                  backgroundColor: selectedFilter.overlay.color,
                  mixBlendMode: selectedFilter.overlay.blendMode as CSSProperties['mixBlendMode'],
                  opacity: selectedFilter.overlay.opacity * editorState.filterIntensity,
                }}
              />
            )}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 flex items-center justify-center gap-2 rounded-lg">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowFilters(!showFilters)}
                className="text-white hover:bg-white/20"
                title="Фильтры"
              >
                <Sparkles className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAdjustments(!showAdjustments)}
                className="text-white hover:bg-white/20"
                title="Редактирование"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowPeopleTags(!showPeopleTags)}
                className="text-white hover:bg-white/20"
                title="Отметить людей"
              >
                <Users className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Editing Tools */}
        <div className="space-y-3">
          {showFilters && (
            <div className="bg-zinc-800 rounded-lg p-3">
              <PhotoFiltersPanel
                imageUrl={previewUrl || ''}
                selected={editorState.selectedFilterIdx}
                intensity={editorState.filterIntensity}
                onSelectFilter={(idx) =>
                  dispatchEditor({
                    type: 'SET_FILTER',
                    payload: { idx, intensity: editorState.filterIntensity },
                  })
                }
                onChangeIntensity={(intensity) =>
                  dispatchEditor({
                    type: 'SET_FILTER',
                    payload: { idx: editorState.selectedFilterIdx, intensity },
                  })
                }
              />
            </div>
          )}

          {showAdjustments && (
            <div className="bg-zinc-800 rounded-lg p-3">
              <AdjustmentsPanel
                adjustments={editorState.adjustments}
                onChange={(adj) =>
                  dispatchEditor({ type: 'SET_ADJUSTMENTS', payload: adj })
                }
              />
            </div>
          )}

          {showPeopleTags && previewUrl && (
            <div className="bg-zinc-800 rounded-lg p-3">
              <PeopleTagOverlay
                tags={editorState.peopleTags}
                mediaIndex={0}
                onAddTag={(tag) =>
                  dispatchEditor({ type: 'ADD_PEOPLE_TAG', payload: tag })
                }
                onRemoveTag={(userId) =>
                  dispatchEditor({ type: 'REMOVE_PEOPLE_TAG', payload: userId })
                }
              />
            </div>
          )}
        </div>

        {/* Schedule - no fake buttons, only working features */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSchedule(!showSchedule)}
            className="flex-1 gap-2"
          >
            <CalendarClock className="w-4 h-4" />
            {editorState.scheduledDate
              ? new Date(editorState.scheduledDate).toLocaleDateString('ru')
              : 'Запланировать'}
          </Button>
        </div>

        {/* Schedule picker */}
        {showSchedule && (
          <SchedulePostPicker
            value={editorState.scheduledDate}
            onChange={(date) =>
              dispatchEditor({ type: 'SET_SCHEDULED_DATE', payload: date })
            }
            onClose={() => setShowSchedule(false)}
          />
        )}

        {/* Caption */}
        <Textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Добавить подпись... (до 2200 символов)"
          maxLength={2200}
          className="text-sm"
        />

        {/* Расширенные настройки */}
        <div className="space-y-2">
          <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
            <span>Скрыть количество лайков</span>
            <input
              type="checkbox"
              checked={Boolean(editorState.hideLikes)}
              onChange={(e) => dispatchEditor({ type: 'SET_HIDE_LIKES', payload: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
            <span>Отключить комментарии</span>
            <input
              type="checkbox"
              checked={Boolean(editorState.commentsDisabled)}
              onChange={(e) => dispatchEditor({ type: 'SET_COMMENTS_DISABLED', payload: e.target.checked })}
            />
          </label>
        </div>
      </div>
    );
  }

  // Stories: минимальный набор
  if (activeTab === 'stories') {
    return (
      <div className="space-y-3 bg-zinc-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
        {previewUrl && (
          <img loading="lazy"
            src={previewUrl}
            alt="Preview"
            className="w-full aspect-square object-cover rounded-lg"
          />
        )}
        <div className="text-sm text-white/60 space-y-2">
          <p>✨ Стикеры, текст и рисование доступны в редакторе</p>
          <p>👥 Отметить людей: нажмите на фото</p>
        </div>
      </div>
    );
  }

  // Reels: видео + описание
  if (activeTab === 'reels') {
    return (
      <div className="space-y-3 bg-zinc-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
        {previewUrl && (
          <video
            src={previewUrl}
            controls
            className="w-full aspect-video object-cover rounded-lg bg-black"
          />
        )}
        <Textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Описание видео..."
          maxLength={2200}
          rows={3}
          className="text-sm"
        />
        <p className="text-right text-xs text-white/50">{caption.length}/2200</p>
        <Input
          value={musicTitle || ''}
          onChange={(e) => onMusicTitleChange?.(e.target.value)}
          placeholder="Музыка (опционально)"
          maxLength={100}
          className="text-sm"
        />

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-white/50">Параметры публикации</div>
          <div className="grid gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <Users className="w-4 h-4 text-white/70" />
              <Input
                value={reelTaggedUsers || ''}
                onChange={(e) => onReelTaggedUsersChange?.(e.target.value)}
                placeholder="Отметить людей: username1, username2"
                className="h-8 border-0 bg-transparent p-0 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <MapPin className="w-4 h-4 text-white/70" />
              <Input
                value={reelLocationName || ''}
                onChange={(e) => onReelLocationNameChange?.(e.target.value)}
                placeholder="Местоположение"
                maxLength={120}
                className="h-8 border-0 bg-transparent p-0 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <Eye className="w-4 h-4 text-white/70" />
              <label className="text-sm text-white/80">Аудитория</label>
              <select
                value={reelAudience || 'public'}
                onChange={(e) => onReelAudienceChange?.(e.target.value as 'public' | 'followers' | 'private')}
                className="ml-auto rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white"
              >
                <option value="public">Публично</option>
                <option value="followers">Подписчики</option>
                <option value="private">Только я</option>
              </select>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
              <span>Разрешить комментарии</span>
              <input
                type="checkbox"
                checked={Boolean(reelAllowComments)}
                onChange={(e) => onReelAllowCommentsChange?.(e.target.checked)}
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
              <span>Разрешить ремиксы</span>
              <input
                type="checkbox"
                checked={Boolean(reelAllowRemix)}
                onChange={(e) => onReelAllowRemixChange?.(e.target.checked)}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  // Live: категория трансляции
  if (activeTab === 'live') {
    return (
      <div className="space-y-3 bg-zinc-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-sm text-red-400">🔴 ПРЯМОЙ ЭФИР</p>
        </div>
      </div>
    );
  }

  return null;
}
