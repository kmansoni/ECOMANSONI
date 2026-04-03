/**
 * IntermediateStops — компонент для добавления промежуточных точек маршрута такси.
 *
 * Паттерн Uber/Bolt: до 5 промежуточных остановок с перестановкой.
 */

import { useCallback } from 'react';
import { Plus, GripVertical, Trash2, ChevronUp, ChevronDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TaxiAddress, AddressSuggestion } from '@/types/taxi';
import { AddressInput } from './AddressInput';

// ─── Типы ────────────────────────────────────────────────────────────────────

interface IntermediateStopsProps {
  stops: TaxiAddress[];
  onAddStop: (address: TaxiAddress) => void;
  onRemoveStop: (index: number) => void;
  onReorder: (stops: TaxiAddress[]) => void;
  maxStops?: number;
  className?: string;
}

const DEFAULT_MAX_STOPS = 5;

function suggestionToAddress(s: AddressSuggestion): TaxiAddress {
  return {
    id: s.id,
    address: s.address,
    shortAddress: s.shortAddress,
    coordinates: s.coordinates,
  };
}

// ─── Элемент остановки ───────────────────────────────────────────────────────

interface StopItemProps {
  stop: TaxiAddress;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function StopItem({ stop, index, total, onRemove, onMoveUp, onMoveDown }: StopItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-white/6 rounded-xl px-3 py-2',
        'border border-white/5 group transition-colors hover:bg-white/8'
      )}
    >
      {/* Иконка с номером */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <GripVertical className="w-4 h-4 text-white/20" aria-hidden="true" />
        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
          <span className="text-xs font-bold text-amber-400">{index + 1}</span>
        </div>
      </div>

      {/* Адрес */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate">{stop.address}</p>
        {stop.shortAddress && (
          <p className="text-xs text-white/40 truncate">{stop.shortAddress}</p>
        )}
      </div>

      {/* Кнопки перестановки */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className={cn(
            'p-0.5 rounded transition-colors min-w-[28px] min-h-[22px]',
            'flex items-center justify-center',
            index === 0
              ? 'text-white/10 cursor-not-allowed'
              : 'text-white/40 hover:text-white hover:bg-white/10'
          )}
          aria-label={`Переместить остановку ${index + 1} вверх`}
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className={cn(
            'p-0.5 rounded transition-colors min-w-[28px] min-h-[22px]',
            'flex items-center justify-center',
            index === total - 1
              ? 'text-white/10 cursor-not-allowed'
              : 'text-white/40 hover:text-white hover:bg-white/10'
          )}
          aria-label={`Переместить остановку ${index + 1} вниз`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Удаление */}
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'p-1.5 rounded-lg transition-colors min-w-[32px] min-h-[32px]',
          'flex items-center justify-center',
          'text-white/30 hover:text-red-400 hover:bg-red-500/10'
        )}
        aria-label={`Удалить остановку ${index + 1}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Основной компонент ──────────────────────────────────────────────────────

export function IntermediateStops({
  stops,
  onAddStop,
  onRemoveStop,
  onReorder,
  maxStops = DEFAULT_MAX_STOPS,
  className,
}: IntermediateStopsProps) {
  const canAdd = stops.length < maxStops;

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    const next = [...stops];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    onReorder(next);
  }, [stops, onReorder]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= stops.length - 1) return;
    const next = [...stops];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    onReorder(next);
  }, [stops, onReorder]);

  const handleAddressSuggestion = useCallback((suggestion: AddressSuggestion) => {
    onAddStop(suggestionToAddress(suggestion));
  }, [onAddStop]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Заголовок */}
      {stops.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <MapPin className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-medium text-white/50">
            Промежуточные остановки ({stops.length}/{maxStops})
          </span>
        </div>
      )}

      {/* Список остановок */}
      {stops.map((stop, index) => (
        <StopItem
          key={stop.id}
          stop={stop}
          index={index}
          total={stops.length}
          onRemove={() => onRemoveStop(index)}
          onMoveUp={() => handleMoveUp(index)}
          onMoveDown={() => handleMoveDown(index)}
        />
      ))}

      {/* Добавить остановку */}
      {canAdd && (
        <div className="bg-white/4 rounded-xl border border-dashed border-white/10 overflow-hidden">
          <AddressInput
            label=""
            value=""
            placeholder="Добавить остановку..."
            icon={<Plus className="h-4 w-4 text-amber-400" />}
            iconColor="text-amber-400"
            onSelect={handleAddressSuggestion}
          />
        </div>
      )}

      {/* Максимум достигнут */}
      {!canAdd && (
        <p className="text-xs text-zinc-500 text-center py-1">
          Максимум {maxStops} промежуточных остановок
        </p>
      )}
    </div>
  );
}
