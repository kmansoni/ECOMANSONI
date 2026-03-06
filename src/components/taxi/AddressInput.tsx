import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Home, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AddressSuggestion, FavoriteAddress } from '@/types/taxi';
import { searchAddresses, getFavoriteAddresses } from '@/lib/taxi/api';

interface AddressInputProps {
  label: string;
  value: string;
  placeholder?: string;
  icon?: React.ReactNode;
  iconColor?: string;
  onSelect: (suggestion: AddressSuggestion) => void;
  className?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

// ─── Иконка по типу ──────────────────────────────────────────────────────────
function AddressTypeIcon({ type, icon }: { type: AddressSuggestion['type']; icon?: string }) {
  if (icon) return <span className="text-base">{icon}</span>;
  if (type === 'favorite') return <Home className="h-4 w-4 text-blue-500" />;
  if (type === 'place') return <MapPin className="h-4 w-4 text-rose-500" />;
  return <Clock className="h-4 w-4 text-slate-400" />;
}

// ─── Portal-dropdown: рендерится в body, position:fixed — обходит overflow ──
interface DropdownPortalProps {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

function DropdownPortal({ anchorRef, children }: DropdownPortalProps) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        maxHeight: 288,
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

  return createPortal(
    <div style={style}>
      {children}
    </div>,
    document.body
  );
}

export function AddressInput({
  label,
  value,
  placeholder = 'Куда едем?',
  icon,
  iconColor = 'text-slate-400',
  onSelect,
  className,
  autoFocus = false,
  onFocus,
  onBlur,
}: AddressInputProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [favorites, setFavorites] = useState<FavoriteAddress[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Синхронизация внешнего value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Загрузить избранные адреса
  useEffect(() => {
    getFavoriteAddresses().then(setFavorites);
  }, []);

  // autoFocus
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // ─── Обработка ввода с debounce 300ms ────────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchAddresses(val);
        setSuggestions(results);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }, []);

  // ─── Выбор адреса ────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (suggestion: AddressSuggestion) => {
      setQuery(suggestion.address);
      setSuggestions([]);
      setIsOpen(false);
      onSelect(suggestion);
      inputRef.current?.blur();
    },
    [onSelect]
  );

  // ─── Выбор избранного адреса ──────────────────────────────────────────────
  const handleFavoriteSelect = useCallback(
    (fav: FavoriteAddress) => {
      const suggestion: AddressSuggestion = {
        id: fav.id,
        address: fav.address,
        shortAddress: fav.label,
        coordinates: fav.coordinates,
        type: 'favorite',
        icon: fav.icon,
      };
      handleSelect(suggestion);
    },
    [handleSelect]
  );

  // ─── Очистить поле ────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }, []);

  // ─── Закрыть dropdown при клике вне ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Проверяем клик и на containerRef, и на сам дропдаун через closest
      const target = e.target as Node;
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Видимые подсказки
  const showDropdown = isOpen && (suggestions.length > 0 || (!query && favorites.length > 0) || (query.trim().length > 0));

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Поле ввода */}
      <div className="relative flex items-center">
        {/* Левая иконка (цветная точка) */}
        <div className={cn('absolute left-3 flex-shrink-0', iconColor)}>
          {icon ?? <MapPin className="h-4 w-4" />}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            setIsOpen(true);
            onFocus?.();
          }}
          onBlur={onBlur}
          placeholder={placeholder}
          className={cn(
            'w-full pl-9 pr-8 py-3',
            'text-sm bg-transparent',
            'border-0 outline-none',
            'placeholder:text-muted-foreground'
          )}
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />

        {/* Кнопка очистки */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Очистить"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Индикатор загрузки */}
        {isLoading && (
          <div className="absolute right-3">
            <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown — через Portal, вне overflow-hidden контейнера */}
      {showDropdown && (
        <DropdownPortal anchorRef={containerRef}>
          <div className={cn(
            'bg-background border border-border rounded-xl',
            'shadow-2xl overflow-hidden',
            'max-h-72 overflow-y-auto'
          )}>
            {/* Избранные адреса (только когда поле пустое) */}
            {!query && favorites.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Сохранённые
                  </span>
                </div>
                {favorites.map((fav) => (
                  <button
                    key={fav.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                    onMouseDown={(e) => {
                      e.preventDefault(); // предотвращаем blur на input
                      handleFavoriteSelect(fav);
                    }}
                  >
                    <span className="text-base flex-shrink-0">{fav.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{fav.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{fav.address}</div>
                    </div>
                  </button>
                ))}
                {suggestions.length > 0 && (
                  <div className="mx-3 my-1 border-t border-border" />
                )}
              </>
            )}

            {/* Результаты поиска */}
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(s);
                }}
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <AddressTypeIcon type={s.type} icon={s.icon} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.shortAddress}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.address}</div>
                </div>
              </button>
            ))}

            {/* Пустой результат поиска */}
            {query.trim().length > 0 && suggestions.length === 0 && !isLoading && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Адрес не найден. Попробуйте другой запрос.
              </div>
            )}
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}
