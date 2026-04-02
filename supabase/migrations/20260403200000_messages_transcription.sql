-- Добавить поле для хранения транскрипции голосовых сообщений
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcription_text TEXT;

-- Индекс не нужен: поле используется только при чтении конкретного сообщения
