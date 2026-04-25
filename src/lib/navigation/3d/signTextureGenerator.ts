/**
 * Sign Texture Generator — runtime генерация текстур знаков через Canvas 2D.
 *
 * Преимущества vs внешний PNG-атлас:
 *   - 0 KB на старте (генерим on-demand)
 *   - Векторное качество на любом DPR
 *   - Кастомизируемое значение (60, 90, 120 для maxspeed)
 *
 * Атлас формируется лениво: при первом обращении к тегу.
 * Кэш Map<atlasKey, THREE.CanvasTexture>.
 */

import * as THREE from 'three';
import { classifySign } from '../infra/signClassifier';

const TEX_SIZE = 256;
const _textureCache = new Map<string, THREE.CanvasTexture>();

interface SignDrawSpec {
  /** Форма основы знака */
  shape: 'triangle' | 'circle' | 'square' | 'octagon' | 'inverted_triangle' | 'diamond' | 'rectangle';
  /** Цвет фона */
  bg: string;
  /** Цвет рамки */
  border: string;
  /** Толщина рамки */
  borderWidthRatio: number;
  /** Главный текст / число */
  text?: string;
  /** Цвет текста */
  textColor?: string;
  /** Иконка-глиф (символ) */
  glyph?: string;
}

/**
 * Возвращает (или создаёт) текстуру для тега знака.
 * Тег формата "RU:3.24" + опционально value (для скорости).
 */
export function getOrCreateSignTexture(tag: string, value?: string | number | null): THREE.CanvasTexture {
  const key = `${tag}|${value ?? ''}`;
  const cached = _textureCache.get(key);
  if (cached) return cached;

  const canvas = drawSign(tag, value);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  _textureCache.set(key, texture);
  return texture;
}

function drawSign(tag: string, value?: string | number | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const spec = pickSpec(tag, value);
  drawShape(ctx, spec);
  if (spec.text) drawText(ctx, spec.text, spec.textColor ?? '#000');
  if (spec.glyph) drawGlyph(ctx, spec.glyph, spec.textColor ?? '#000');

  return canvas;
}

function pickSpec(tag: string, value?: string | number | null): SignDrawSpec {
  const cls = classifySign(tag);
  const base = cls?.baseTag ?? tag;
  const valStr = value != null ? String(value) : (cls?.value != null ? String(cls.value) : undefined);

  // Конкретные знаки
  const SPECIAL: Record<string, () => SignDrawSpec> = {
    'RU:3.24': () => ({
      shape: 'circle', bg: '#ffffff', border: '#d32f2f', borderWidthRatio: 0.10,
      text: valStr ?? '60', textColor: '#000',
    }),
    'RU:3.27': () => ({ shape: 'circle', bg: '#1976d2', border: '#d32f2f', borderWidthRatio: 0.08, glyph: '×' }),
    'RU:3.28': () => ({ shape: 'circle', bg: '#1976d2', border: '#d32f2f', borderWidthRatio: 0.08, glyph: 'P̸' }),
    'RU:2.1':  () => ({ shape: 'diamond', bg: '#fdd835', border: '#000', borderWidthRatio: 0.05 }),
    'RU:2.4':  () => ({ shape: 'inverted_triangle', bg: '#ffffff', border: '#d32f2f', borderWidthRatio: 0.10 }),
    'RU:2.5':  () => ({ shape: 'octagon', bg: '#d32f2f', border: '#fff', borderWidthRatio: 0.05, text: 'STOP', textColor: '#fff' }),
    'RU:5.15.1': () => ({ shape: 'square', bg: '#1976d2', border: '#fff', borderWidthRatio: 0.05, glyph: '↑↑↑' }),
    'RU:5.15.2': () => ({ shape: 'square', bg: '#1976d2', border: '#fff', borderWidthRatio: 0.05, glyph: '↑' }),
    'RU:5.19.1': () => ({ shape: 'square', bg: '#1976d2', border: '#fff', borderWidthRatio: 0.05, glyph: '🚶' }),
    'RU:6.4':    () => ({ shape: 'square', bg: '#1976d2', border: '#fff', borderWidthRatio: 0.05, text: 'P', textColor: '#fff' }),
    'RU:1.22':   () => ({ shape: 'triangle', bg: '#ffffff', border: '#d32f2f', borderWidthRatio: 0.10, glyph: '🚶' }),
  };

  if (SPECIAL[base]) return SPECIAL[base]();

  // По категории
  if (!cls) {
    return { shape: 'square', bg: '#9e9e9e', border: '#000', borderWidthRatio: 0.05, text: '?', textColor: '#fff' };
  }
  switch (cls.category) {
    case 'warning':
      return { shape: 'triangle', bg: '#ffffff', border: '#d32f2f', borderWidthRatio: 0.10, text: valStr, textColor: '#000' };
    case 'priority':
      return { shape: 'diamond', bg: '#fdd835', border: '#000', borderWidthRatio: 0.05, text: valStr, textColor: '#000' };
    case 'prohibitory':
      return { shape: 'circle', bg: '#ffffff', border: '#d32f2f', borderWidthRatio: 0.10, text: valStr, textColor: '#000' };
    case 'mandatory':
      return { shape: 'circle', bg: '#1976d2', border: '#fff', borderWidthRatio: 0.05, text: valStr, textColor: '#fff' };
    case 'special':
      return { shape: 'square', bg: '#1976d2', border: '#fff', borderWidthRatio: 0.05, text: valStr, textColor: '#fff' };
    case 'information':
      return { shape: 'square', bg: '#1976d2', border: '#fff', borderWidthRatio: 0.04, text: valStr, textColor: '#fff' };
    case 'service':
      return { shape: 'square', bg: '#37474f', border: '#fff', borderWidthRatio: 0.04, text: valStr, textColor: '#fff' };
    case 'additional':
      return { shape: 'rectangle', bg: '#ffffff', border: '#000', borderWidthRatio: 0.04, text: valStr, textColor: '#000' };
  }
}

function drawShape(ctx: CanvasRenderingContext2D, spec: SignDrawSpec): void {
  const s = TEX_SIZE;
  const cx = s / 2;
  const cy = s / 2;
  const margin = s * 0.06;
  const r = s / 2 - margin;
  const bw = s * spec.borderWidthRatio;

  ctx.clearRect(0, 0, s, s);

  ctx.lineJoin = 'round';
  ctx.fillStyle = spec.bg;
  ctx.strokeStyle = spec.border;
  ctx.lineWidth = bw;

  switch (spec.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(cx, cy, r - bw / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case 'triangle': {
      const h = (r * 2) * 0.92;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h / 2);
      ctx.lineTo(cx + h / 2, cy + h / 2);
      ctx.lineTo(cx - h / 2, cy + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'inverted_triangle': {
      const h = (r * 2) * 0.92;
      ctx.beginPath();
      ctx.moveTo(cx - h / 2, cy - h / 2);
      ctx.lineTo(cx + h / 2, cy - h / 2);
      ctx.lineTo(cx, cy + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'square': {
      const sz = r * 1.7;
      ctx.beginPath();
      ctx.rect(cx - sz / 2, cy - sz / 2, sz, sz);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'rectangle': {
      const w = r * 1.8;
      const h = r * 1.4;
      ctx.beginPath();
      ctx.rect(cx - w / 2, cy - h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'diamond': {
      const d = r * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'octagon': {
      const oR = r * 0.92;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const x = cx + Math.cos(a) * oR;
        const y = cy + Math.sin(a) * oR;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
}

function drawText(ctx: CanvasRenderingContext2D, text: string, color: string): void {
  if (!text) return;
  const s = TEX_SIZE;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Auto fit: размер зависит от длины
  const fontSize = text.length <= 2 ? s * 0.45
                : text.length <= 4 ? s * 0.32
                : s * 0.22;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(text, s / 2, s / 2 + fontSize * 0.05);
}

function drawGlyph(ctx: CanvasRenderingContext2D, glyph: string, color: string): void {
  const s = TEX_SIZE;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${s * 0.5}px system-ui, sans-serif`;
  ctx.fillText(glyph, s / 2, s / 2);
}

/** Очистить кэш текстур (например, при отключении HD-режима) */
export function disposeSignTextureCache(): void {
  for (const tex of _textureCache.values()) {
    tex.dispose();
  }
  _textureCache.clear();
}
