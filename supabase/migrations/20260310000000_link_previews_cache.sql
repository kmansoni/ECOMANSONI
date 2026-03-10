-- Link preview server-side cache table.
-- Edge Function `link-preview` upserts rows; authenticated users never write directly.
-- TTL is enforced by expires_at; a periodic CRON or the edge function evicts stale rows.

CREATE TABLE IF NOT EXISTS public.link_previews (
  url_hash TEXT PRIMARY KEY CHECK (char_length(url_hash) = 64),
  url TEXT NOT NULL UNIQUE CHECK (char_length(url) BETWEEN 1 AND 2048),
  domain TEXT NOT NULL CHECK (char_length(domain) BETWEEN 1 AND 255),
  title TEXT NULL CHECK (title IS NULL OR char_length(title) <= 300),
  description TEXT NULL CHECK (description IS NULL OR char_length(description) <= 1000),
  image TEXT NULL CHECK (image IS NULL OR char_length(image) <= 2048),
  favicon TEXT NULL CHECK (favicon IS NULL OR char_length(favicon) <= 2048),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_link_previews_expires_at
  ON public.link_previews (expires_at);

CREATE INDEX IF NOT EXISTS idx_link_previews_domain_expires_at
  ON public.link_previews (domain, expires_at DESC);

ALTER TABLE public.link_previews ENABLE ROW LEVEL SECURITY;

-- Only service_role (edge function) touches this table.
REVOKE ALL ON TABLE public.link_previews FROM PUBLIC;
REVOKE ALL ON TABLE public.link_previews FROM anon;
REVOKE ALL ON TABLE public.link_previews FROM authenticated;
