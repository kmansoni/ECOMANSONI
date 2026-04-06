# Data Visualization

## Описание

Скилл для создания визуализаций данных: графики, дашборды, real-time обновления. Recharts для стандартных кейсов, D3 для кастомных визуализаций.

## Когда использовать

- Дашборды с метриками (CRM, аналитика, финансы)
- Графики: line, bar, area, pie, scatter
- Real-time данные (трафик, торговля, мониторинг)
- Кастомные визуализации (heatmap, treemap, sankey)
- Responsive charts для мобильных

## Стек

- `recharts` — декларативные React-графики (90% кейсов)
- `d3` — кастомные визуализации, вычисления
- `d3-scale`, `d3-shape` — отдельные утилиты без DOM-манипуляций

## Чеклист

- [ ] `ResponsiveContainer` — обязательная обёртка для recharts
- [ ] Формат чисел: `toLocaleString()` для осей и tooltip
- [ ] Цвета из design tokens, не hardcoded hex
- [ ] Dark mode: palette переключается через CSS variables
- [ ] Mobile: убрать legend внизу, tooltip по тапу, упростить оси
- [ ] Пустое состояние: "Нет данных за период" с иллюстрацией
- [ ] Loading: skeleton с формой графика
- [ ] Большие датасеты (>1000 точек): sampling или aggregation

## Пример: responsive line chart

```tsx
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

function RevenueChart({ data }: { data: ChartPoint[] }) {
  if (!data.length) {
    return <EmptyState message="Нет данных за выбранный период" />
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
        <XAxis
          dataKey="date"
          tickFormatter={d => new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
          fontSize={12}
        />
        <YAxis
          tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
          fontSize={12}
          width={45}
        />
        <Tooltip
          formatter={(val: number) => [val.toLocaleString('ru') + ' ₽', 'Выручка']}
          labelFormatter={d => new Date(d).toLocaleDateString('ru')}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

## Паттерн: real-time обновление

```tsx
function useRealtimeChart(channel: string) {
  const [points, setPoints] = useState<ChartPoint[]>([])
  const maxPoints = 60 // последние 60 значений

  useEffect(() => {
    const sub = supabase.channel(channel)
      .on('broadcast', { event: 'metric' }, ({ payload }) => {
        setPoints(prev => [...prev.slice(-(maxPoints - 1)), payload as ChartPoint])
      })
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [channel])

  return points
}
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| `<LineChart width={800} height={400}>` | Не адаптируется к экрану | `ResponsiveContainer` обёртка |
| 10 000 точек без sampling | Тормозит рендер, неразличимо визуально | Агрегация: среднее за интервал |
| D3 `.select().append()` в React | Конфликт с React DOM | D3 для вычислений, React для рендера |
| Цвета `#FF6384` в компоненте | Не работает с dark mode | CSS variables: `hsl(var(--chart-1))` |
| Tooltip с 15 полями | Нечитаемо на мобильных | Макс 3-4 поля, остальные в детальном view |
| График без empty state | Пустая область — пользователь думает баг | Сообщение + CTA (изменить фильтр / период) |
