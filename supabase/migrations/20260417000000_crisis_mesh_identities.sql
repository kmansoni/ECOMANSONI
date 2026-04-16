-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: crisis_mesh_identities
-- Online-directory публичных ключей пиров Crisis Mesh.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Назначение:
--   Когда устройства встречаются офлайн через BLE/Wi-Fi Direct/MultipeerConnectivity,
--   им нужна возможность верифицировать подпись Ed25519 пиров, которых они видят
--   впервые. Эта таблица — опциональный online-кэш соответствий peer_id ⇄ public_key,
--   который заполняется при любом онлайн-подключении.
--
--   Сама mesh-работа остаётся offline-first: этой таблицы может не быть и всё будет
--   работать, но TOFU-доверие к новым пирам ускоряется при наличии сети.
--
-- Модель безопасности (Zero-Trust):
--   INSERT: только владелец записи (user_id = auth.uid())
--   UPDATE: только владелец (обновление display_name / last_seen_at)
--   DELETE: только владелец
--   SELECT: любой authenticated (directory должен быть читаемым)
--
-- peer_id = base58 fingerprint первых 16 байт SHA-256 от публичного ключа.
-- public_key хранится как bytea (32 байта Ed25519).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.mesh_identities (
  peer_id        TEXT        PRIMARY KEY CHECK (char_length(peer_id) BETWEEN 8 AND 64),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key     BYTEA       NOT NULL CHECK (octet_length(public_key) = 32),
  display_name   TEXT        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
  device_type    TEXT        NOT NULL DEFAULT 'unknown'
                             CHECK (device_type IN ('android', 'ios', 'web', 'unknown')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- один user может иметь несколько устройств, но каждое со своим peer_id
  CONSTRAINT mesh_identities_user_peer_unique UNIQUE (user_id, peer_id)
);

CREATE INDEX IF NOT EXISTS idx_mesh_identities_user
  ON public.mesh_identities (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_mesh_identities_last_seen
  ON public.mesh_identities (last_seen_at DESC);

ALTER TABLE public.mesh_identities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "mesh_identities_select"
    ON public.mesh_identities
    FOR SELECT
    TO authenticated
    USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mesh_identities_insert_own"
    ON public.mesh_identities
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mesh_identities_update_own"
    ON public.mesh_identities
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mesh_identities_delete_own"
    ON public.mesh_identities
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.mesh_identities IS
  'Online directory of Crisis Mesh peer identities. Offline-first; таблица опциональна.';

COMMIT;
