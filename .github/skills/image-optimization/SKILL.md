---
name: image-optimization
description: "Оптимизация изображений: WebP, srcset, lazy loading, blur placeholder, CDN. Use when: медленная загрузка, большие изображения, оптимизация LCP."
argument-hint: "[страница или компонент с изображениями]"
user-invocable: true
---

# Image Optimization — Оптимизация изображений

Скилл для оптимизации загрузки и отображения изображений. Цель: быстрый LCP, минимальный трафик, плавный UX.

## Когда использовать

- Страница с каталогом/галереей (маркетплейс, недвижимость, лента)
- LCP > 2.5s из-за hero-изображения
- Большой размер бандла из-за изображений
- Мобильный трафик — экономия данных

## Протокол

1. **Аудит текущих изображений** — размеры файлов, форматы, количество
2. **Конвертируй в WebP** — Supabase Storage transformations или build-time
3. **Responsive srcset** — разные размеры для разных viewport
4. **Lazy loading** — `loading="lazy"` для below-the-fold
5. **Blur placeholder** — LQIP (Low Quality Image Placeholder)
6. **Размеры заданы** — `width` + `height` для предотвращения CLS
7. **CDN** — Supabase Storage с cache headers
8. **Preload hero** — `<link rel="preload">` для LCP-изображения

## Компонент OptimizedImage

```typescript
import { useState, useCallback } from 'react'

interface OptimizedImageProps {
  src: string
  alt: string
  width: number
  height: number
  className?: string
  priority?: boolean
  sizes?: string
}

export function OptimizedImage({
  src, alt, width, height, className, priority, sizes
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState(false)

  const handleLoad = useCallback(() => setLoaded(true), [])
  const handleError = useCallback(() => setErr(true), [])

  if (err) {
    return (
      <div
        className={cn('flex items-center justify-center bg-muted', className)}
        style={{ width, height }}
      >
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse bg-muted"
          style={{ aspectRatio: `${width}/${height}` }}
        />
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        onLoad={handleLoad}
        onError={handleError}
        sizes={sizes || '100vw'}
        className={cn(
          'transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}
```

## Supabase Storage — трансформации

```typescript
function getImageUrl(path: string, w: number, q = 80): string {
  const { data } = supabase.storage
    .from('images')
    .getPublicUrl(path, {
      transform: { width: w, quality: q, format: 'webp' },
    })
  return data.publicUrl
}

// Использование в srcset
function getSrcSet(path: string): string {
  return [320, 640, 1024, 1440]
    .map(w => `${getImageUrl(path, w)} ${w}w`)
    .join(', ')
}
```

## Preload для LCP

```typescript
// В head страницы — для hero-изображения
<link
  rel="preload"
  as="image"
  href={heroImageUrl}
  fetchPriority="high"
/>
```

## Чеклист

- [ ] Все изображения в WebP (fallback на JPEG)
- [ ] `width` и `height` заданы (нет CLS)
- [ ] Below-the-fold: `loading="lazy"`
- [ ] Hero/LCP: `loading="eager"` + preload
- [ ] Error state — placeholder при ошибке загрузки
- [ ] Skeleton при загрузке, не пустое место
- [ ] Размер файла < 200KB для карточек, < 500KB для hero
- [ ] `alt` текст заполнен на каждом `<img>`

## Anti-patterns

- **Без width/height** — CLS при загрузке, страница прыгает
- **PNG для фото** — 3MB вместо 200KB WebP. Только для иконок с прозрачностью
- **Eager всё** — загружать 50 картинок сразу. Только hero — eager
- **Original size** — 4000px картинка в 200px контейнере. Resize через transform
- **Без error state** — сломанная иконка вместо placeholder
- **Base64 inline** — большие картинки в base64 раздувают HTML
