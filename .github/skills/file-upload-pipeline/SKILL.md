---
name: file-upload-pipeline
description: "Пайплайн загрузки файлов: Supabase Storage, progress tracking, image optimization, chunked upload, preview. Use when: загрузка файлов, file upload, Supabase Storage, progress bar, загрузка изображений, аватар, медиафайлы."
argument-hint: "[тип: image | video | audio | file | all]"
---

# File Upload Pipeline — Загрузка файлов

---

## Базовая загрузка в Supabase Storage

```typescript
// src/hooks/useFileUpload.ts
export function useFileUpload(bucket: string) {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  async function upload(file: File, path: string): Promise<string> {
    setIsUploading(true);
    setProgress(0);

    try {
      // Проверить перед загрузкой
      validateFile(file);

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,         // Не перезаписывать
          contentType: file.type,
        });

      if (error) throw error;

      // Получить публичный URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      return publicUrl;
    } finally {
      setIsUploading(false);
    }
  }

  return { upload, progress, isUploading };
}

// Валидация файла
function validateFile(file: File) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (file.size > MAX_SIZE) {
    throw new Error(`Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB`);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Недопустимый тип файла: ${file.type}`);
  }
}
```

---

## Оптимизация изображений перед загрузкой

```typescript
// Ресайз и сжатие на клиенте (уменьшает размер загрузки)
async function compressImage(file: File, maxWidth = 1920, quality = 0.85): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await new Promise(res => { img.onload = res; });
  URL.revokeObjectURL(url);

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise(res =>
    canvas.toBlob(blob => res(blob!), 'image/webp', quality)
  );
}

// Использование
async function uploadAvatar(file: File) {
  const compressed = await compressImage(file, 400, 0.9); // Аватар: max 400px
  const { upload } = useFileUpload('avatars');
  return upload(new File([compressed], 'avatar.webp', { type: 'image/webp' }),
    `${userId}/avatar-${Date.now()}.webp`);
}
```

---

## Preview до загрузки

```typescript
function AvatarUpload() {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Локальный preview (не загружаем ещё)
    const url = URL.createObjectURL(file);
    setPreview(url);
    // Очистить при unmount
  }

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  return (
    <div>
      {preview && <img src={preview} className="w-20 h-20 rounded-full object-cover" alt="Preview" />}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <button onClick={() => inputRef.current?.click()}>Выбрать фото</button>
    </div>
  );
}
```

---

## Уникальные пути в Storage

```typescript
// Предотвратить коллизии при загрузке
function generateStoragePath(userId: string, type: 'avatar' | 'media' | 'attachment', ext: string) {
  // Структура: {type}/{userId}/{timestamp}-{random}.{ext}
  const random = Math.random().toString(36).slice(2, 8);
  return `${type}/${userId}/${Date.now()}-${random}.${ext}`;
}
```

---

## Чеклист

- [ ] Валидация типа и размера файла ДО загрузки (не только на сервере)
- [ ] Сжатие изображений на клиенте (< 1MB для аватаров)
- [ ] Preview через URL.createObjectURL (с cleanup)
- [ ] Уникальные пути (timestamp + random)
- [ ] Удаление старого файла при замене (upsert: false + ручное удаление)
- [ ] Loading state во время загрузки
- [ ] Ошибки загрузки показываются пользователю (toast)
