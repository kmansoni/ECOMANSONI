-- =============================================================================
-- ECOMANSONI Livestream Platform — Расширения PostgreSQL
-- Миграция: 20260308000001_livestream_extensions.sql
-- Назначение: Подключение необходимых pg-расширений для livestream-подсистемы
-- =============================================================================

-- pg_trgm: trigram similarity — полнотекстовый поиск и fuzzy-матчинг в чате,
--          поиск по названиям стримов и тегам
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gist: составные индексы с GiST — нужен для exclusion constraints
--             (например, одновременно активный стрим у пользователя)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- uuid-ossp: дополнительный генератор UUID (gen_random_uuid() уже встроен в pg 14+,
--            но uuid-ossp нужен для совместимости со старыми RPC-функциями)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_stat_statements: мониторинг slow queries в production;
--                     необходим для observability SLA стрим-системы
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Комментарий на схему расширений
COMMENT ON EXTENSION pg_trgm IS 'Trigram fulltext search — livestream chat & stream discovery';
