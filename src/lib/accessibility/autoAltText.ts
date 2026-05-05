import { computeSkinRatio } from '@/lib/ar/faceDetection';

export interface AltTextContext {
  username?: string;
  hasText?: boolean;
  hasFaces?: boolean;
  isAvatar?: boolean;
  isProduct?: boolean;
  productName?: string;
}

/**
 * Генерирует alt-text на основе контекста.
 */
export function generateAltText(context: AltTextContext = {}): string {
  if (context.isAvatar && context.username) {
    return `Фото профиля @${context.username}`;
  }

  if (context.isProduct && context.productName) {
    return `Товар: ${context.productName}`;
  }

  if (context.username && context.hasFaces) {
    return `Фото с людьми от @${context.username}`;
  }

  if (context.username && context.hasText) {
    return `Изображение с текстом от @${context.username}`;
  }

  if (context.username) {
    return `Фото от @${context.username}`;
  }

  if (context.hasFaces) {
    return 'Фото с людьми';
  }

  if (context.hasText) {
    return 'Изображение с текстом';
  }

  return 'Изображение';
}

/**
 * Анализирует изображение через Canvas для базового определения содержимого.
 * Заглушка для Vision API.
 */
export async function analyzeImage(
  imageElement: HTMLImageElement
): Promise<AltTextContext> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};

    canvas.width = 64;
    canvas.height = 64;
    ctx.drawImage(imageElement, 0, 0, 64, 64);

    const imageData = ctx.getImageData(0, 0, 64, 64);
    const skinRatio = computeSkinRatio(imageData);
    return { hasFaces: skinRatio > 0.1 };
  } catch {
    return {};
  }
}

/**
 * Генерирует alt-text для изображения автоматически.
 */
export async function autoAltText(
  imageElement: HTMLImageElement,
  context: AltTextContext = {}
): Promise<string> {
  const analyzed = await analyzeImage(imageElement);
  return generateAltText({ ...analyzed, ...context });
}
