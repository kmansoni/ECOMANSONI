---
name: slack-gif-creator
description: >-
  Создание анимированных GIF для Slack и мессенджеров. Python animation toolkit,
  текст, фигуры, fade/slide/bounce, валидация размера.
  Use when: GIF, анимация, Slack, animated banner, visual communication.
metadata:
  category: creative-media
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/slack-gif-creator
---

# Slack GIF Creator

Создание кастомных анимированных GIF через Python animation toolkit.

## Когда использовать

- Анимированные баннеры для Slack/мессенджеров
- Визуальные демо и иллюстрации
- Animated status updates
- Праздничные/событийные гифки
- Onboarding анимации

## Python Animation Toolkit

### Базовые примитивы
```python
from PIL import Image, ImageDraw, ImageFont
import math

def create_gif(frames, output='output.gif', duration=50, loop=0):
    frames[0].save(output, save_all=True, append_images=frames[1:],
                   duration=duration, loop=loop, optimize=True)
```

### Анимации

#### Fade In/Out
```python
def fade_in(img, alpha):
    """alpha: 0.0 → 1.0"""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    return Image.blend(overlay, img, alpha)
```

#### Slide
```python
def slide_in(img, frame, total, direction='left'):
    w, h = img.size
    if direction == 'left':
        offset = int(w * (1 - frame / total))
        canvas = Image.new('RGBA', (w, h))
        canvas.paste(img, (-offset, 0))
        return canvas
```

#### Bounce
```python
def bounce(frame, total, amplitude=20):
    t = frame / total
    y = int(abs(math.sin(t * math.pi * 2)) * amplitude)
    return y
```

#### Typewriter
```python
def typewriter(text, frame, total):
    chars = int(len(text) * frame / total)
    return text[:chars]
```

### Текст
```python
def draw_text(img, text, pos, font_size=24, color='white'):
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype('arial.ttf', font_size)
    draw.text(pos, text, fill=color, font=font)
    return img
```

## Валидация

### Slack ограничения
```python
def validate_gif(path):
    img = Image.open(path)
    size_mb = os.path.getsize(path) / (1024 * 1024)
    
    assert size_mb < 15, f'Слишком большой: {size_mb:.1f}MB (макс 15MB)'
    assert img.size[0] <= 1200, f'Слишком широкий: {img.size[0]}px'
    assert img.size[1] <= 800, f'Слишком высокий: {img.size[1]}px'
    
    n_frames = getattr(img, 'n_frames', 1)
    assert n_frames <= 300, f'Слишком много кадров: {n_frames}'
```

### Рекомендуемые размеры
```
Slack inline:   480×270 (16:9)
Slack sidebar:  360×360 (1:1)
Status GIF:     128×128
Full width:     800×400
```

## Workflow

```
1. Описание: что показать, стиль, размер
2. Раскадровка: ключевые кадры
3. Генерация: Python PIL/Pillow
4. Оптимизация: палитра, размер файла  
5. Валидация: ограничения платформы
6. Экспорт: output.gif
```

## Оптимизация размера

```python
def optimize_gif(path, max_colors=128):
    img = Image.open(path)
    frames = []
    for i in range(img.n_frames):
        img.seek(i)
        frame = img.copy().quantize(colors=max_colors)
        frames.append(frame.convert('RGBA'))
    create_gif(frames, path.replace('.gif', '_opt.gif'))
```

## Best Practices

✓ 15-30 FPS для плавности
✓ Зацикленные анимации (loop=0)
✓ Контрастный текст на фоне
✓ Простые анимации работают лучше
✓ Не больше 3-4 секунд длительности
✗ Не использовать мелкий текст (<16px)
✗ Избегать мерцания и строб-эффектов
