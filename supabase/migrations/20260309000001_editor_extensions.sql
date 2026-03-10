-- Migration: Расширения PostgreSQL для видеоредактора (CapCut-style)
-- Устанавливаем необходимые расширения: uuid-ossp (fallback), pg_trgm для полнотекстового поиска

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- End migration
