-- Добавляем поле grid_sort_order для перестановки постов в сетке профиля
ALTER TABLE posts ADD COLUMN IF NOT EXISTS grid_sort_order INTEGER;

-- Индекс для быстрой сортировки по grid_sort_order при отображении сетки
CREATE INDEX IF NOT EXISTS idx_posts_grid_sort_order ON posts(author_id, grid_sort_order NULLS LAST);
