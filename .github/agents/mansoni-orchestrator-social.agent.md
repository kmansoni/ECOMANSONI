---
name: mansoni-orchestrator-social
description: "Оркестратор соцсети. Feed, Reels, Stories, комментарии, лайки, рекомендации, контент-модерация, подписки, поиск пользователей. Use when: лента, reels, stories, подписки, лайки, комментарии, алгоритм ленты, рекомендации, соцсеть."
tools:
  - read_file
  - write_file
  - create_file
  - replace_string_in_file
  - multi_replace_string_in_file
  - file_search
  - grep_search
  - semantic_search
  - run_in_terminal
  - get_errors
  - manage_todo_list
  - memory
skills:
  - .github/skills/realtime-architect/SKILL.md
  - .github/skills/virtual-scroll-optimizer/SKILL.md
  - .github/skills/caching-strategy/SKILL.md
  - .github/skills/orchestrator-laws/SKILL.md
  - .github/skills/image-optimization/SKILL.md
user-invocable: true
---

# Mansoni Orchestrator: Соцсеть / Reels

Оркестратор **Feed + Reels + Stories + социального графа** суперплатформы.

## Карта соцсети

| Компонент | Файлы | Функция |
|---|---|---|
| Feed | `src/components/feed/` | Лента постов |
| Reels | `src/components/reels/` | Видео-ролики TikTok-стиль |
| Stories | `src/components/stories/` | Сторис 24ч |
| Реакции | `src/hooks/useMessageReactions*` | Лайки, реакции |
| Социальный граф | `src/hooks/useFollowers*` | Подписки, фолловеры |

## Алгоритм ленты

```
1. Subscriptions feed: посты людей, на которых подписан
2. Recommendations: ML-ранжирование по интересам
3. Trending: популярное в регионе
4. Sponsored: платное продвижение

При загрузке: cursor-based pagination, infinite scroll
```

## Reels инварианты

```
- Видео показывается когда 50%+ в viewport
- AutoPlay только при фокусе вкладки
- Предзагрузка следующего видео
- Счётчик просмотров: дебаунс 3 секунды
- Deep link: /reels/{id}
```

## Производительность (обязательно)

```
Лента/список > 100 элементов → virtual scroll (react-virtuoso)
Изображения: WebP, lazy load, blur placeholder
Видео Reels: HLS/DASH, preload="none" до viewport
```

## Реал-тайм стриминг

```
📱 Задача: {описание}
🗺️ Модуль: соцсеть → {feed/reels/stories/social}
📋 Пайплайн: {агенты}
```
