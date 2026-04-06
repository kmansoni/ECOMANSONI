# Full-Text Search Architect

## Описание

Полнотекстовый поиск в PostgreSQL: tsvector, tsquery, GIN-индексы, веса, ранжирование, поиск по русскому и английскому.

## Когда использовать

- Поиск по сообщениям в чате
- Поиск товаров в маркетплейсе
- Поиск объявлений недвижимости
- Поиск профилей по описанию
- Любой поиск "содержит текст" на > 10K записей

## Базовая настройка

### Колонка tsvector + триггер

```sql
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(category, '')), 'C')
  ) STORED;

CREATE INDEX idx_products_search ON products USING GIN (search_vector);
```

### Запрос с ранжированием

```sql
SELECT
  id, title, description,
  ts_rank_cd(search_vector, query) AS rank
FROM products, plainto_tsquery('russian', 'квартира центр') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

## Веса (A > B > C > D)

| Вес | Назначение | Множитель |
|-----|-----------|-----------|
| A   | Заголовок | 1.0       |
| B   | Описание  | 0.4       |
| C   | Категория | 0.2       |
| D   | Метаданные| 0.1       |

## Типы запросов

```sql
-- Простой поиск (разбивает на слова через AND)
plainto_tsquery('russian', 'купить квартиру')

-- Фразовый поиск (слова рядом)
phraseto_tsquery('russian', 'двухкомнатная квартира')

-- Websearch (поддерживает OR, -, "кавычки")
websearch_to_tsquery('russian', '"двухкомнатная квартира" -студия')

-- Ручной tsquery
to_tsquery('russian', 'квартир & (центр | район)')
```

## Мультиязычный поиск

```sql
-- Русский + английский
ALTER TABLE messages ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(content, '')) ||
    to_tsvector('english', coalesce(content, ''))
  ) STORED;
```

## Автокомплит (prefix search)

```sql
SELECT title
FROM products
WHERE search_vector @@ to_tsquery('russian', 'кварт:*')
LIMIT 10;
```

## Supabase RPC

```sql
CREATE OR REPLACE FUNCTION search_products(search_term text, max_results int DEFAULT 20)
RETURNS SETOF products
LANGUAGE sql STABLE
AS $$
  SELECT p.*
  FROM products p, websearch_to_tsquery('russian', search_term) q
  WHERE p.search_vector @@ q
  ORDER BY ts_rank_cd(p.search_vector, q) DESC
  LIMIT max_results;
$$;
```

```typescript
const { data, error } = await supabase
  .rpc('search_products', { search_term: query, max_results: 20 });
```

## Чеклист

1. **GIN индекс** — обязателен, без него full scan
2. **GENERATED ALWAYS** — не забывать обновлять tsvector
3. **Конфигурация языка** — `russian` для кириллицы, не `simple`
4. **Prefix search** — для автокомплита добавлять `:*`
5. **Limit** — всегда ограничивать результаты
6. **Debounce** — на фронте 300ms перед запросом

## Anti-patterns

- `LIKE '%текст%'` вместо FTS на больших таблицах — seq scan
- Забыть GIN индекс — поиск работает, но медленно
- `to_tsvector('simple', ...)` для русского — нет стемминга
- Пересоздание tsvector в каждом запросе вместо stored column
- Поиск без `LIMIT` — может вернуть миллионы строк
- Использование `ts_rank` без `ORDER BY` — бессмысленно
