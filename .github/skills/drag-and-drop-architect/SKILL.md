# Drag and Drop Architect

## Описание

Скилл для реализации DnD-интерфейсов: sortable списки, kanban-доски, drag-to-reorder, constraints. Основной инструмент — dnd-kit (легковесный, accessible, touch-friendly).

## Когда использовать

- Сортировка элементов перетаскиванием (задачи, карточки, медиа)
- Kanban-доски с перемещением между колонками
- Drag-to-upload файлов
- Reorder табов, меню, виджетов
- Ограниченный drag (sliders, crop areas)

## Стек

- `@dnd-kit/core` — базовый DnD engine
- `@dnd-kit/sortable` — sortable контейнеры
- `@dnd-kit/utilities` — CSS transform утилиты
- Touch sensors для мобильных устройств

## Чеклист

- [ ] `TouchSensor` + `PointerSensor` с `activationConstraint` (distance: 8px)
- [ ] `DragOverlay` для визуального фидбека (не клонировать DOM-ноду)
- [ ] Keyboard accessibility: `useSortable` даёт `aria-*` из коробки
- [ ] Optimistic update при drop + откат при ошибке сервера
- [ ] `restrictToParentElement` modifier для ограниченных зон
- [ ] `animateLayoutChanges` для плавного сдвига соседей
- [ ] Cancel drag: Escape key handler
- [ ] Throttle `onDragOver` при межконтейнерном перемещении

## Пример: sortable список

```tsx
import {
  DndContext, closestCenter, DragEndEvent,
  PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

function TaskList({ tasks, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  function handleDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    const oldIdx = tasks.findIndex(t => t.id === active.id)
    const newIdx = tasks.findIndex(t => t.id === over.id)
    onReorder(arrayMove(tasks, oldIdx, newIdx))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map(task => (
          <SortableItem key={task.id} id={task.id}>
            <TaskCard task={task} />
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}
```

## Паттерн: kanban межколоночный drag

```tsx
function handleDragOver(ev: DragOverEvent) {
  const { active, over } = ev
  if (!over) return
  const activeCol = findColumn(active.id)
  const overCol = findColumn(over.id) ?? over.id // over может быть колонкой
  if (activeCol === overCol) return
  moveItemBetweenColumns(active.id, activeCol, overCol)
}
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| `onMouseDown` + `onMouseMove` вручную | Нет touch, нет keyboard, нет a11y | dnd-kit с сенсорами |
| Drag без `activationConstraint` | Перехватывает клики и скролл | `distance: 8` или `delay: 200` |
| DOM clone как drag preview | Тяжёлый, артефакты, z-index проблемы | `DragOverlay` с отдельным рендером |
| Сохранение порядка только на клиенте | Потеря при перезагрузке | Optimistic update + persist на сервер |
| Без keyboard navigation | Accessibility fail | `useSortable` даёт keyboard из коробки |
| `onDragOver` без throttle | 100+ вызовов в секунду при быстром движении | Throttle или проверка `if (overCol !== prevCol)` |
