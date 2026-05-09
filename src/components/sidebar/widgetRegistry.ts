// src/components/sidebar/widgetRegistry.ts
import { lazy } from 'react';

type WidgetId = string;

export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  icon: string; // lucide icon name
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  defaultSize: number;
  category: string;
}

// Lazy-loaded widgets — no crashes if a file is missing
export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  profile: {
    id: 'profile',
    title: 'Профиль',
    icon: 'User',
    component: lazy(() => import('./widgets/ProfileWidget')),
    defaultSize: 80,
    category: 'Личное',
  },
  quickActions: {
    id: 'quickActions',
    title: 'Быстрые действия',
    icon: 'Zap',
    component: lazy(() => import('./widgets/QuickActionsWidget')),
    defaultSize: 60,
    category: 'Утилиты',
  },
  chats: {
    id: 'chats',
    title: 'Чаты',
    icon: 'MessageCircle',
    component: lazy(() => import('./widgets/ChatsWidget')),
    defaultSize: 120,
    category: 'Общение',
  },
  music: {
    id: 'music',
    title: 'Музыка',
    icon: 'Music',
    component: lazy(() => import('./widgets/MusicWidget')),
    defaultSize: 70,
    category: 'Медиа',
  },
  taxi: {
    id: 'taxi',
    title: 'Такси',
    icon: 'Car',
    component: lazy(() => import('./widgets/TaxiWidget')),
    defaultSize: 70,
    category: 'Транспорт',
  },
  weather: {
    id: 'weather',
    title: 'Погода',
    icon: 'CloudSun',
    component: lazy(() => import('./widgets/WeatherWidget')),
    defaultSize: 60,
    category: 'Информация',
  },
  todo: {
    id: 'todo',
    title: 'Задачи',
    icon: 'CheckCircle',
    component: lazy(() => import('./widgets/TodoWidget')),
    defaultSize: 80,
    category: 'Продуктивность',
  },
  search: {
    id: 'search',
    title: 'Поиск',
    icon: 'Search',
    component: lazy(() => import('./widgets/SearchWidget')),
    defaultSize: 50,
    category: 'Утилиты',
  },
  recommendations: {
    id: 'recommendations',
    title: 'Рекомендации',
    icon: 'TrendingUp',
    component: lazy(() => import('./widgets/RecommendationsWidget')),
    defaultSize: 100,
    category: 'Открытия',
  },
  notes: {
    id: 'notes',
    title: 'Заметки',
    icon: 'FileText',
    component: lazy(() => import('./widgets/NotesWidget')),
    defaultSize: 80,
    category: 'Продуктивность',
  },
  settings: {
    id: 'settings',
    title: 'Настройки',
    icon: 'Settings',
    component: lazy(() => import('./widgets/SettingsWidget')),
    defaultSize: 60,
    category: 'Система',
  },
  support: {
    id: 'support',
    title: 'Поддержка',
    icon: 'HelpCircle',
    component: lazy(() => import('./widgets/SupportWidget')),
    defaultSize: 50,
    category: 'Система',
  },
};