---
name: file-upload-security
description: "Безопасность загрузки файлов: валидация типа, MIME type checking, Storage RLS, path traversal защита, вирусное сканирование, превью. Use when: безопасность загрузки файлов, file upload security, RLS Storage, path traversal, MIME validation."
argument-hint: "[контекст: avatar | media | attachments | all]"
---

# File Upload Security — Безопасность загрузки

---

## Supabase Storage RLS

```sql
-- Политики для bucket 'avatars'
-- Читать могут все аутентифицированные
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Загружать только свой файл в свою папку
CREATE POLICY "avatars_user_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text  -- Папка = user ID
  );

-- Обновлять только свой файл
CREATE POLICY "avatars_user_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Удалять только свой
CREATE POLICY "avatars_user_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## MIME Type валидация (не доверять расширению)

```typescript
// Проверить реальный тип файла через сигнатуру (magic bytes)
// НЕ доверять: file.type (устанавливается браузером)
// НЕ доверять: file.name расширение

const MAGIC_BYTES: Record<string, Uint8Array> = {
  'image/jpeg': new Uint8Array([0xFF, 0xD8, 0xFF]),
  'image/png':  new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
  'image/gif':  new Uint8Array([0x47, 0x49, 0x46]),
  'image/webp': new Uint8Array([0x52, 0x49, 0x46, 0x46]),
};

async function verifyFileType(file: File): Promise<string | null> {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  for (const [mimeType, magic] of Object.entries(MAGIC_BYTES)) {
    if (magic.every((byte, i) => bytes[i] === byte)) {
      return mimeType;
    }
  }
  return null; // Неизвестный тип — отклонить
}

// Использование
async function uploadSafe(file: File) {
  const detectedType = await verifyFileType(file);
  if (!detectedType) throw new Error('Недопустимый тип файла');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(detectedType)) {
    throw new Error(`Тип ${detectedType} не разрешён`);
  }
  // Продолжить загрузку...
}
```

---

## Path Traversal защита

```typescript
// Sanitize имя файла (предотвратить ../../../etc/passwd)
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Только безопасные символы
    .replace(/^\.+/, '')               // Нет ведущих точек
    .slice(0, 100);                    // Ограничить длину
}

// Путь в Storage — всегда через userId
function buildSafePath(userId: string, fileName: string, prefix: string): string {
  const safe = sanitizeFileName(fileName);
  const ext = safe.split('.').pop()?.toLowerCase() ?? 'bin';
  // Структура: prefix/userId/timestamp-random.ext
  return `${prefix}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}
```

---

## Supabase Storage bucket конфигурация

```sql
-- Разрешённые MIME типы на уровне bucket (через Dashboard или SQL)
-- Dashboard → Storage → Edit Bucket → Allowed MIME types
-- Или через Management API:
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'avatars';

-- Максимальный размер файла (в байтах)
UPDATE storage.buckets
SET file_size_limit = 5242880  -- 5MB
WHERE id = 'avatars';
```

---

## SVG — специальная опасность

```typescript
// ❌ SVG может содержать XSS через встроенный JavaScript!
const DANGEROUS_SVG_PATTERNS = [/<script/i, /javascript:/i, /onload=/i, /onerror=/i];

function isSafeSVG(content: string): boolean {
  return !DANGEROUS_SVG_PATTERNS.some(pattern => pattern.test(content));
}

// НЕ разрешать SVG загрузку от пользователей
// Или: использовать DOMPurify для санитизации перед хранением
```

---

## Чеклист

- [ ] Storage bucket с explicit allowed MIME types
- [ ] Storage RLS: пользователь пишет только в свою папку (`foldername = userId`)
- [ ] Magic bytes верификация (не только браузерный file.type)
- [ ] Sanitize имена файлов (нет path traversal)
- [ ] file_size_limit установлен в bucket
- [ ] SVG от пользователей запрещены или санитизированы
- [ ] Загруженные файлы НЕ выполняются как код (Content-Type принудительно)
