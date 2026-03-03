import { useAccessibility, type FontSize, type ColorFilter } from '@/hooks/useAccessibility';
import { Type, Contrast, Zap, Volume2, Eye } from 'lucide-react';

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'sm', label: 'Маленький' },
  { value: 'md', label: 'Обычный' },
  { value: 'lg', label: 'Большой' },
  { value: 'xl', label: 'Очень большой' },
];

const COLOR_FILTERS: { value: ColorFilter; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'protanopia', label: 'Протанопия' },
  { value: 'deuteranopia', label: 'Дейтеранопия' },
  { value: 'tritanopia', label: 'Тританопия' },
];

interface ToggleRowProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ id, icon, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
          {icon}
        </div>
        <div>
          <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
            {label}
          </label>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-shrink-0 ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export function AccessibilitySettings() {
  const { settings, updateSettings } = useAccessibility();

  return (
    <main id="main-content" className="max-w-lg mx-auto px-4 py-6" aria-labelledby="a11y-settings-heading">
      <h1 id="a11y-settings-heading" className="text-xl font-bold text-foreground mb-6">
        Доступность
      </h1>

      {/* Размер текста */}
      <section aria-labelledby="font-size-heading" className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Type className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="font-size-heading" className="text-sm font-semibold text-foreground">Размер текста</h2>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="font-size-heading"
          className="grid grid-cols-2 gap-2"
        >
          {FONT_SIZES.map((fs) => (
            <button
              key={fs.value}
              role="radio"
              aria-checked={settings.fontSize === fs.value}
              onClick={() => void updateSettings({ fontSize: fs.value })}
              className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                settings.fontSize === fs.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {fs.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2 ml-1" aria-live="polite">
          Предпросмотр: <span style={{ fontSize: `calc(1rem * var(--font-scale, 1))` }}>Пример текста</span>
        </p>
      </section>

      {/* Переключатели */}
      <section aria-labelledby="toggles-heading" className="mb-6 bg-card rounded-xl border border-border px-4">
        <h2 id="toggles-heading" className="sr-only">Настройки отображения</h2>

        <ToggleRow
          id="high-contrast-toggle"
          icon={<Contrast className="w-4 h-4 text-primary" />}
          label="Высокий контраст"
          description="Усиливает границы и тени для лучшей читаемости"
          checked={settings.highContrast}
          onChange={(v) => void updateSettings({ highContrast: v })}
        />

        <ToggleRow
          id="reduce-motion-toggle"
          icon={<Zap className="w-4 h-4 text-primary" />}
          label="Уменьшить анимации"
          description="Отключает переходы и анимации"
          checked={settings.reducedMotion}
          onChange={(v) => void updateSettings({ reducedMotion: v })}
        />

        <ToggleRow
          id="screen-reader-toggle"
          icon={<Volume2 className="w-4 h-4 text-primary" />}
          label="Озвучивание действий"
          description="Объявляет важные изменения для программ чтения экрана"
          checked={settings.screenReaderAnnounce}
          onChange={(v) => void updateSettings({ screenReaderAnnounce: v })}
        />
      </section>

      {/* Цветовые фильтры */}
      <section aria-labelledby="color-filter-heading" className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="color-filter-heading" className="text-sm font-semibold text-foreground">Цветовые фильтры</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Для людей с нарушением цветового восприятия</p>
        <div
          role="radiogroup"
          aria-labelledby="color-filter-heading"
          className="grid grid-cols-2 gap-2"
        >
          {COLOR_FILTERS.map((cf) => (
            <button
              key={cf.value}
              role="radio"
              aria-checked={settings.colorFilter === cf.value}
              onClick={() => void updateSettings({ colorFilter: cf.value })}
              className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                settings.colorFilter === cf.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {cf.label}
            </button>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground text-center">
        Настройки сохраняются автоматически
      </p>
    </main>
  );
}
