---
name: youtube-downloader
description: >-
  Загрузка видео с YouTube через yt-dlp: выбор качества, форматы,
  аудио-извлечение, субтитры, плейлисты.
  Use when: скачать видео, YouTube, yt-dlp, аудио, субтитры, видео-контент.
metadata:
  category: media-tools
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/youtube-downloader
---

# YouTube Downloader

Загрузка видео с YouTube и других платформ через yt-dlp.

## Когда использовать

- Скачивание видео для анализа / обучения
- Извлечение аудио (подкасты, музыка)
- Скачивание субтитров
- Плейлисты и каналы
- Конвертация форматов

## Быстрый старт

### Установка
```bash
pip install yt-dlp
# или
brew install yt-dlp
```

### Базовое использование
```bash
# Лучшее качество
yt-dlp "https://youtube.com/watch?v=VIDEO_ID"

# Конкретное качество
yt-dlp -f "bestvideo[height<=1080]+bestaudio" URL

# Только аудио
yt-dlp -x --audio-format mp3 URL

# С субтитрами
yt-dlp --write-subs --sub-lang ru,en URL
```

## Форматы и качество

### Просмотр доступных форматов
```bash
yt-dlp -F URL
```

### Выбор формата
```bash
# Лучшее видео + аудио (merge)
yt-dlp -f "bv*+ba/b" URL

# 720p максимум
yt-dlp -f "bestvideo[height<=720]+bestaudio" URL

# Только 480p
yt-dlp -f "bestvideo[height=480]+bestaudio" URL

# MP4 only
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]" --merge-output-format mp4 URL
```

### Аудио-извлечение
```bash
# MP3
yt-dlp -x --audio-format mp3 --audio-quality 0 URL

# WAV (для обработки)
yt-dlp -x --audio-format wav URL

# FLAC (lossless)
yt-dlp -x --audio-format flac URL
```

## Субтитры

```bash
# Список доступных субтитров
yt-dlp --list-subs URL

# Скачать автосгенерированные
yt-dlp --write-auto-subs --sub-lang ru URL

# SRT формат
yt-dlp --write-subs --sub-format srt --sub-lang en URL

# Встроить в видео
yt-dlp --embed-subs --sub-lang ru URL
```

## Плейлисты и каналы

```bash
# Весь плейлист
yt-dlp PLAYLIST_URL

# Диапазон видео
yt-dlp --playlist-start 5 --playlist-end 10 PLAYLIST_URL

# Канал — последние 20
yt-dlp --playlist-end 20 CHANNEL_URL

# Каждое видео в свою папку
yt-dlp -o "%(playlist)s/%(playlist_index)s - %(title)s.%(ext)s" URL
```

## Именование файлов

```bash
# По умолчанию
yt-dlp -o "%(title)s.%(ext)s" URL

# С датой
yt-dlp -o "%(upload_date)s_%(title)s.%(ext)s" URL

# Структурированно
yt-dlp -o "%(channel)s/%(title)s [%(id)s].%(ext)s" URL
```

## Продвинутые опции

```bash
# Ограничение скорости
yt-dlp --limit-rate 5M URL

# Использование cookies (для приватных видео)
yt-dlp --cookies cookies.txt URL

# Метаданные
yt-dlp --write-info-json --write-thumbnail URL

# Resumable download
yt-dlp --no-overwrites -c URL

# Архив (пропускать уже скачанные)
yt-dlp --download-archive archive.txt URL
```

## Best Practices

✓ Уважай авторские права
✓ Используй только для личных/образовательных целей
✓ Не распространяй чужой контент
✓ Проверяй лицензию (Creative Commons и т.д.)
✓ Используй `--download-archive` для идемпотентности
✗ Не скачивай protected/DRM контент
✗ Не автоматизируй массовое скачивание коммерческого контента
