/**
 * EditorState Model — Безопасное управление состоянием редактора
 * CRITICAL FIX #1: Перемещение состояния из TabEditor в Modal
 */

import type { Adjustments } from '@/components/editor/adjustmentsModel';
import type { PeopleTag } from './PeopleTagOverlay';
import { logger } from '@/lib/logger';

/**
 * Полное состояние редактора контента
 * Хранится в CreateContentModal, передается в TabContentEditor
 */
export interface EditorState {
  // Filters
  selectedFilterIdx: number;
  filterIntensity: number;

  // Adjustments
  adjustments: Adjustments;

  // People Tags
  peopleTags: PeopleTag[];

  // Schedule
  scheduledDate: Date | null;

  // Location
  location: {
    name: string;
    lat: number;
    lng: number;
  } | null;

  // Draft
  draftName: string;
  draftId: string | null;

  // Privacy
  hideLikes: boolean;
  commentsDisabled: boolean;
}

/**
 * Action для обновления EditorState
 * Безопасный способ обновления с валидацией
 */
export type EditorAction =
  | { type: 'SET_FILTER'; payload: { idx: number; intensity: number } }
  | { type: 'SET_ADJUSTMENTS'; payload: Adjustments }
  | { type: 'ADD_PEOPLE_TAG'; payload: PeopleTag }
  | { type: 'REMOVE_PEOPLE_TAG'; payload: string }
  | { type: 'SET_SCHEDULED_DATE'; payload: Date | null }
  | { type: 'SET_LOCATION'; payload: EditorState['location'] }
  | { type: 'SET_DRAFT'; payload: { name: string; id: string | null } }
  | { type: 'SET_HIDE_LIKES'; payload: boolean }
  | { type: 'SET_COMMENTS_DISABLED'; payload: boolean }
  | { type: 'CLEAR_ALL' };

/**
 * Reducer для EditorState
 * Гарантирует идемпотентность и безопасность
 */
export function editorStateReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_FILTER':
      // Валидация: idx 0-19, intensity 0-1
      return {
        ...state,
        selectedFilterIdx: Math.max(0, Math.min(19, action.payload.idx)),
        filterIntensity: Math.max(0, Math.min(1, action.payload.intensity)),
      };

    case 'SET_ADJUSTMENTS':
      return {
        ...state,
        adjustments: { ...action.payload },
      };

    case 'ADD_PEOPLE_TAG':
      // Не добавляем дубликаты (один user = один tag)
      if (state.peopleTags.some((t) => t.user_id === action.payload.user_id)) {
        return state;
      }
      return {
        ...state,
        peopleTags: [...state.peopleTags, action.payload],
      };

    case 'REMOVE_PEOPLE_TAG':
      return {
        ...state,
        peopleTags: state.peopleTags.filter((t) => t.user_id !== action.payload),
      };

    case 'SET_SCHEDULED_DATE':
      // Валидация: дата не может быть в прошлом
      if (action.payload && action.payload < new Date()) {
        logger.warn('[EditorState] Нельзя запланировать дату в прошлом');
        return state;
      }
      return {
        ...state,
        scheduledDate: action.payload,
      };

    case 'SET_LOCATION':
      return {
        ...state,
        location: action.payload,
      };

    case 'SET_DRAFT':
      return {
        ...state,
        draftName: action.payload.name,
        draftId: action.payload.id,
      };

    case 'SET_HIDE_LIKES':
      return { ...state, hideLikes: !!action.payload };

    case 'SET_COMMENTS_DISABLED':
      return { ...state, commentsDisabled: !!action.payload };

    case 'CLEAR_ALL':
      return getDefaultEditorState();

    default:
      return state;
  }
}

/**
 * Начальное состояние редактора
 */
export function getDefaultEditorState(adjustments?: Adjustments): EditorState {
  return {
    selectedFilterIdx: 0,
    filterIntensity: 1,
    adjustments: adjustments || {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      warmth: 0,
      shadows: 0,
      highlights: 0,
      vignette: 0,
      sharpness: 0,
      grain: 0,
    },
    peopleTags: [],
    scheduledDate: null,
    location: null,
    draftName: '',
    draftId: null,
    hideLikes: false,
    commentsDisabled: false,
  };
}

/**
 * Применение adjustments к CSS filter
 */
export function adjustmentsToFilterStyle(adj: Adjustments): React.CSSProperties {
  const brightness = 1 + adj.brightness / 100;
  const contrast = 1 + adj.contrast / 100;
  const saturate = 1 + adj.saturation / 100;
  const hueRotate = adj.warmth * 0.5;
  const shadowAdj = 1 + adj.shadows / 200;
  const highlightAdj = 1 + adj.highlights / 200;
  const totalBrightness = brightness * shadowAdj * highlightAdj;

  const filterParts = [
    `brightness(${totalBrightness.toFixed(2)})`,
    `contrast(${contrast.toFixed(2)})`,
    `saturate(${saturate.toFixed(2)})`,
    adj.warmth !== 0 ? `hue-rotate(${hueRotate.toFixed(0)}deg)` : null,
    adj.sharpness > 0 ? `drop-shadow(0 0 ${(adj.sharpness / 100).toFixed(2)}px rgba(0,0,0,0.5))` : null,
    adj.vignette > 0 ? `drop-shadow(0 0 ${adj.vignette}px rgba(0,0,0,${adj.vignette / 100}))` : null,
    adj.grain > 0 ? 'grayscale(0%)' : null, // Placeholder для grain эффекта
  ].filter(Boolean);

  return {
    filter: filterParts.join(' '),
  };
}

/**
 * Валидация перед publish
 */
/**
 * Расширенный результат валидации
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Проверка файла перед загрузкой
 * Требуется вызвать перед publishe с файлом
 */
export function validateMediaFile(
  file: File | null,
  contentType: 'post' | 'story' | 'reel' | 'publications' | 'stories' | 'reels'
): ValidationResult {
  if (!file) {
    return { valid: false, error: 'Медиа-файл не выбран' };
  }

  // Размер файла (in bytes)
  const MAX_SIZE_POST = 50 * 1024 * 1024; // 50 MB
  const MAX_SIZE_STORY = 30 * 1024 * 1024; // 30 MB
  const MAX_SIZE_REEL = 100 * 1024 * 1024; // 100 MB

  const normalizedType =
    contentType === 'publications'
      ? 'post'
      : contentType === 'stories'
        ? 'story'
        : contentType === 'reels'
          ? 'reel'
          : contentType;

  const maxSize = normalizedType === 'post' ? MAX_SIZE_POST : normalizedType === 'story' ? MAX_SIZE_STORY : MAX_SIZE_REEL;

  if (file.size > maxSize) {
    const sizeInMB = Math.round(maxSize / 1024 / 1024);
    return { valid: false, error: `Файл слишком большой. Максимум ${sizeInMB} МБ` };
  }

  // Тип файла
  const validPostTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];

  if (normalizedType === 'post') {
    if (!validPostTypes.includes(file.type)) {
      return { valid: false, error: 'Поддерживаются только JPG, PNG, WebP' };
    }
  } else if (normalizedType === 'story') {
    if (file.type.startsWith('image/')) {
      if (!validPostTypes.includes(file.type)) {
        return { valid: false, error: 'Поддерживаются только JPG, PNG, WebP' };
      }
    } else if (file.type.startsWith('video/')) {
      if (!validVideoTypes.includes(file.type)) {
        return { valid: false, error: 'Поддерживаются только MP4, MOV, WebM' };
      }
    } else {
      return { valid: false, error: 'Выберите фото или видео' };
    }
  } else if (normalizedType === 'reel') {
    if (!file.type.startsWith('video/')) {
      return { valid: false, error: 'Для Reels требуется видеофайл' };
    }
    if (!validVideoTypes.includes(file.type)) {
      return { valid: false, error: 'Поддерживаются только MP4, MOV, WebM' };
    }
  }

  return { valid: true };
}

/**
 * Валидация состояния перед публикацией
 * CRITICAL FIX #6: Полная форма валидация
 */
export function validateEditorState(state: EditorState, activeTab: string): ValidationResult {
  const warnings: string[] = [];

  // Проверка scheduling
  if (state.scheduledDate) {
    const now = new Date();
    if (state.scheduledDate < now) {
      return { valid: false, error: 'Нельзя запланировать на прошедшее время' };
    }

    // Предупреждение: слишком далеко в будущее
    const maxFutureDate = new Date();
    maxFutureDate.setDate(maxFutureDate.getDate() + 365);
    if (state.scheduledDate > maxFutureDate) {
      warnings.push('Публикация запланирована более чем на год вперёд');
    }
  }

  // Проверка людей на фото (для publications)
  if (activeTab === 'publications' && state.peopleTags.length > 50) {
    warnings.push('Количество отметок превышает 50 человек');
  }

  // Проверка фильтра
  if (state.selectedFilterIdx < 0 || state.selectedFilterIdx > 19) {
    return { valid: false, error: 'Некорректный выбор фильтра' };
  }

  if (state.filterIntensity < 0 || state.filterIntensity > 1) {
    return { valid: false, error: 'Некорректная интенсивность фильтра' };
  }

  // Проверка корректности adjustments
  if (state.adjustments) {
    const adj = state.adjustments;
    if (adj.brightness < -100 || adj.brightness > 100) {
      return { valid: false, error: 'Яркость должна быть между -100 и 100' };
    }
    if (adj.contrast < -100 || adj.contrast > 100) {
      return { valid: false, error: 'Контрастность должна быть между -100 и 100' };
    }
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Сохранение EditorState в localStorage (для черновиков)
 */
export function saveDraftToStorage(key: string, state: EditorState): void {
  try {
    const serializable = {
      ...state,
      // Date не сериализуется, конвертируем в ISO string
      scheduledDate: state.scheduledDate?.toISOString() || null,
    };
    localStorage.setItem(`draft_editor_${key}`, JSON.stringify(serializable));
  } catch (e) {
    logger.error('[EditorState] Не удалось сохранить черновик', { error: e });
  }
}

/**
 * Восстановление EditorState из localStorage
 */
export function loadDraftFromStorage(key: string, defaultAdjustments?: Adjustments): EditorState {
  try {
    const stored = localStorage.getItem(`draft_editor_${key}`);
    if (!stored) return getDefaultEditorState(defaultAdjustments);

    const parsed = JSON.parse(stored);
    return {
      ...parsed,
      // Восстанавливаем Date объект
      scheduledDate: parsed.scheduledDate ? new Date(parsed.scheduledDate) : null,
    };
  } catch (e) {
    logger.error('[EditorState] Не удалось загрузить черновик', { error: e });
    return getDefaultEditorState(defaultAdjustments);
  }
}

/**
 * Очистка черновика из storage
 */
export function clearDraftFromStorage(key: string): void {
  try {
    localStorage.removeItem(`draft_editor_${key}`);
  } catch (e) {
    logger.error('[EditorState] Не удалось очистить черновик', { error: e });
  }
}
