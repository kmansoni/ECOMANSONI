-- Group DM Profile: кастомное имя и аватар для групповых бесед

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS group_avatar_url TEXT;
