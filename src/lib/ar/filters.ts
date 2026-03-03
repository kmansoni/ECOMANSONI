export interface ARFilter {
  id: string;
  name: string;
  category: 'face' | 'background' | 'color' | 'fun' | 'beauty';
  thumbnail: string;
  apply: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

// --- Helper functions ---

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const copy = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const i = (ny * width + nx) * 4;
            r += copy[i]; g += copy[i + 1]; b += copy[i + 2];
            count++;
          }
        }
      }
      const idx = (y * width + x) * 4;
      data[idx] = r / count;
      data[idx + 1] = g / count;
      data[idx + 2] = b / count;
    }
  }
}

// --- Filter implementations ---

function smoothSkin(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  boxBlur(imageData.data, width, height, 2);
  ctx.putImageData(imageData, 0, 0);
}

function brightenFace(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] * 1.15 + 20);
    d[i + 1] = clamp(d[i + 1] * 1.15 + 20);
    d[i + 2] = clamp(d[i + 2] * 1.15 + 20);
  }
  ctx.putImageData(imageData, 0, 0);
}

function slimEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const temp = document.createElement('canvas');
  temp.width = width;
  temp.height = height;
  const tCtx = temp.getContext('2d')!;
  tCtx.drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, width, height);
  // Slim: draw slightly narrower in center
  ctx.drawImage(temp, width * 0.04, 0, width * 0.92, height, 0, 0, width, height);
}

function warmGlow(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + 30);      // R+
    d[i + 1] = clamp(d[i + 1] + 10); // G+
    d[i + 2] = clamp(d[i + 2] - 20); // B-
  }
  ctx.putImageData(imageData, 0, 0);
}

function coolTone(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] - 20);       // R-
    d[i + 1] = clamp(d[i + 1] + 5); // G+
    d[i + 2] = clamp(d[i + 2] + 30); // B+
  }
  ctx.putImageData(imageData, 0, 0);
}

function vintageFilm(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // Sepia
    d[i] = clamp(r * 0.393 + g * 0.769 + b * 0.189);
    d[i + 1] = clamp(r * 0.349 + g * 0.686 + b * 0.168);
    d[i + 2] = clamp(r * 0.272 + g * 0.534 + b * 0.131);
    // Noise
    const noise = (Math.random() - 0.5) * 20;
    d[i] = clamp(d[i] + noise);
    d[i + 1] = clamp(d[i + 1] + noise);
    d[i + 2] = clamp(d[i + 2] + noise);
  }
  ctx.putImageData(imageData, 0, 0);
  // Vignette
  const cx = width / 2, cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const grad = ctx.createRadialGradient(cx, cy, maxDist * 0.4, cx, cy, maxDist);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function neonNight(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // High contrast, purple shadows
    const avg = (r + g + b) / 3;
    const factor = 1.6;
    d[i] = clamp((r - avg) * factor + avg + 40);
    d[i + 1] = clamp((g - avg) * factor + avg - 20);
    d[i + 2] = clamp((b - avg) * factor + avg + 60);
  }
  ctx.putImageData(imageData, 0, 0);
}

function goldenHour(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] * 1.1 + 40);     // warm R
    d[i + 1] = clamp(d[i + 1] * 1.05 + 15); // warm G
    d[i + 2] = clamp(d[i + 2] * 0.85 - 10);  // reduce B
  }
  ctx.putImageData(imageData, 0, 0);
  // Soft top-down gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(255,180,50,0.15)');
  grad.addColorStop(1, 'rgba(255,100,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function cyberpunk(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // Duotone: dark=purple, light=cyan
    const t = lum / 255;
    d[i] = clamp(255 * (1 - t) * 0.8 + t * 0);     // R: high in shadows
    d[i + 1] = clamp(255 * (1 - t) * 0.0 + t * 255); // G: high in highlights
    d[i + 2] = clamp(255 * (1 - t) * 1.0 + t * 255); // B: always high
    // Boost contrast
    d[i] = clamp((d[i] - 128) * 1.5 + 128);
    d[i + 1] = clamp((d[i + 1] - 128) * 1.5 + 128);
    d[i + 2] = clamp((d[i + 2] - 128) * 1.5 + 128);
  }
  ctx.putImageData(imageData, 0, 0);
}

function pastelDream(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    // Reduce saturation + brighten + soften contrast
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const avg = (r + g + b) / 3;
    d[i] = clamp(r * 0.6 + avg * 0.4 + 40);
    d[i + 1] = clamp(g * 0.6 + avg * 0.4 + 40);
    d[i + 2] = clamp(b * 0.6 + avg * 0.4 + 50);
  }
  ctx.putImageData(imageData, 0, 0);
}

function blurBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  boxBlur(imageData.data, width, height, 4);
  ctx.putImageData(imageData, 0, 0);
}

function gradientBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let y = 0; y < height; y++) {
    const t = y / height;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Blend with gradient
      d[i] = clamp(d[i] * 0.7 + (t * 120 + 30) * 0.3);
      d[i + 1] = clamp(d[i + 1] * 0.7 + (50 + t * 80) * 0.3);
      d[i + 2] = clamp(d[i + 2] * 0.7 + (200 - t * 100) * 0.3);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function glitchEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const shift = 8;
  const copy = new Uint8ClampedArray(d);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Shift red channel left, blue channel right
      const rSrcX = Math.min(width - 1, x + shift);
      const bSrcX = Math.max(0, x - shift);
      const rIdx = (y * width + rSrcX) * 4;
      const bIdx = (y * width + bSrcX) * 4;
      d[i] = copy[rIdx];       // R from right
      d[i + 1] = copy[i + 1]; // G unchanged
      d[i + 2] = copy[bIdx + 2]; // B from left
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function pixelateEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const size = 12;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      // Get avg color of block
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < size && y + dy < height; dy++) {
        for (let dx = 0; dx < size && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; count++;
        }
      }
      r /= count; g /= count; b /= count;
      for (let dy = 0; dy < size && y + dy < height; dy++) {
        for (let dx = 0; dx < size && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function mirrorEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const temp = document.createElement('canvas');
  temp.width = width;
  temp.height = height;
  const tCtx = temp.getContext('2d')!;
  tCtx.drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(temp, -width, 0);
  ctx.restore();
}

function vhsEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // First apply chromatic aberration (glitch-like)
  glitchEffect(ctx, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let y = 0; y < height; y++) {
    // Horizontal scanlines
    if (y % 4 === 0) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        d[i] = clamp(d[i] - 30);
        d[i + 1] = clamp(d[i + 1] - 30);
        d[i + 2] = clamp(d[i + 2] - 30);
      }
    }
    // Random noise lines
    if (Math.random() < 0.02) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const n = (Math.random() - 0.5) * 60;
        d[i] = clamp(d[i] + n);
        d[i + 1] = clamp(d[i + 1] + n);
        d[i + 2] = clamp(d[i + 2] + n);
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function comicEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  // Posterize (reduce to 4 levels)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / 64) * 64;
    d[i + 1] = Math.round(d[i + 1] / 64) * 64;
    d[i + 2] = Math.round(d[i + 2] / 64) * 64;
  }
  ctx.putImageData(imageData, 0, 0);
  // Edge overlay via composite
  const copy = ctx.getImageData(0, 0, width, height);
  const edges = ctx.createImageData(width, height);
  const ed = edges.data;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const iU = ((y - 1) * width + x) * 4;
      const iD = ((y + 1) * width + x) * 4;
      const iL = (y * width + x - 1) * 4;
      const iR = (y * width + x + 1) * 4;
      const gx = Math.abs(copy.data[iR] - copy.data[iL]);
      const gy = Math.abs(copy.data[iD] - copy.data[iU]);
      const edge = gx + gy > 80 ? 0 : 255;
      ed[i] = edge; ed[i + 1] = edge; ed[i + 2] = edge; ed[i + 3] = 255;
    }
  }
  ctx.globalCompositeOperation = 'multiply';
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width; tempCanvas.height = height;
  const tCtx = tempCanvas.getContext('2d')!;
  tCtx.putImageData(edges, 0, 0);
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

function duotoneEffect(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  // Dark color: deep purple (30, 0, 60), Light color: amber (255, 200, 50)
  const darkR = 30, darkG = 0, darkB = 60;
  const lightR = 255, lightG = 200, lightB = 50;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    d[i] = clamp(darkR + (lightR - darkR) * lum);
    d[i + 1] = clamp(darkG + (lightG - darkG) * lum);
    d[i + 2] = clamp(darkB + (lightB - darkB) * lum);
  }
  ctx.putImageData(imageData, 0, 0);
}

// --- Filter catalog ---

export const AR_FILTERS: ARFilter[] = [
  // Beauty
  {
    id: 'smooth',
    name: 'Гладкая кожа',
    category: 'beauty',
    thumbnail: '✨',
    apply: smoothSkin,
  },
  {
    id: 'brighten',
    name: 'Сияние',
    category: 'beauty',
    thumbnail: '☀️',
    apply: brightenFace,
  },
  {
    id: 'slim',
    name: 'Стройность',
    category: 'beauty',
    thumbnail: '💎',
    apply: slimEffect,
  },
  // Color
  {
    id: 'warm_glow',
    name: 'Тёплое сияние',
    category: 'color',
    thumbnail: '🌅',
    apply: warmGlow,
  },
  {
    id: 'cool_tone',
    name: 'Холодный тон',
    category: 'color',
    thumbnail: '❄️',
    apply: coolTone,
  },
  {
    id: 'vintage_film',
    name: 'Винтажная плёнка',
    category: 'color',
    thumbnail: '📽️',
    apply: vintageFilm,
  },
  {
    id: 'neon_night',
    name: 'Неоновая ночь',
    category: 'color',
    thumbnail: '🌃',
    apply: neonNight,
  },
  {
    id: 'golden_hour',
    name: 'Золотой час',
    category: 'color',
    thumbnail: '🌇',
    apply: goldenHour,
  },
  {
    id: 'cyberpunk',
    name: 'Киберпанк',
    category: 'color',
    thumbnail: '🤖',
    apply: cyberpunk,
  },
  {
    id: 'pastel_dream',
    name: 'Пастельная мечта',
    category: 'color',
    thumbnail: '🌸',
    apply: pastelDream,
  },
  // Background
  {
    id: 'blur_bg',
    name: 'Размытый фон',
    category: 'background',
    thumbnail: '🌫️',
    apply: blurBackground,
  },
  {
    id: 'gradient_bg',
    name: 'Градиент',
    category: 'background',
    thumbnail: '🌈',
    apply: gradientBackground,
  },
  // Fun
  {
    id: 'glitch',
    name: 'Глитч',
    category: 'fun',
    thumbnail: '⚡',
    apply: glitchEffect,
  },
  {
    id: 'pixelate',
    name: 'Пиксели',
    category: 'fun',
    thumbnail: '🎮',
    apply: pixelateEffect,
  },
  {
    id: 'mirror',
    name: 'Зеркало',
    category: 'fun',
    thumbnail: '🪞',
    apply: mirrorEffect,
  },
  {
    id: 'vhs',
    name: 'VHS',
    category: 'fun',
    thumbnail: '📼',
    apply: vhsEffect,
  },
  {
    id: 'comic',
    name: 'Комикс',
    category: 'fun',
    thumbnail: '💥',
    apply: comicEffect,
  },
  {
    id: 'duotone',
    name: 'Дуотон',
    category: 'fun',
    thumbnail: '🎨',
    apply: duotoneEffect,
  },
];

export const AR_FILTER_CATEGORIES = [
  { id: 'all', label: 'Все' },
  { id: 'beauty', label: 'Красота' },
  { id: 'color', label: 'Цвет' },
  { id: 'background', label: 'Фон' },
  { id: 'fun', label: 'Эффекты' },
] as const;
