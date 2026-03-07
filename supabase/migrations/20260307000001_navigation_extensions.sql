-- =============================================================================
-- ECOMANSONI Navigation Platform — Расширения PostgreSQL
-- Миграция: 20260307000001_navigation_extensions.sql
-- =============================================================================

-- PostGIS: геопространственные данные, GEOMETRY типы, spatial индексы
CREATE EXTENSION IF NOT EXISTS postgis;

-- PostGIS Topology: для топологических операций с картографическими данными
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- pg_trgm: trigram similarity для fuzzy search по адресам и POI названиям
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gist: составные exclusion constraints, например для временных интервалов
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- uuid-ossp: альтернативный генератор UUID (gen_random_uuid() уже в pg 13+)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_stat_statements: мониторинг slow queries в production
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
