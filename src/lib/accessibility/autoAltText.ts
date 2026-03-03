/**
 * Автогенерация alt-text для изображений.
 * Использует контекстные правила и fallback на Vision API (заглушка).
 */

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
  // TODO: интеграция с Vision API (Google Cloud Vision / Azure Computer Vision)
  // Fallback: простой анализ через Canvas
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};

    canvas.width = 64;
    canvas.height = 64;
    ctx.drawImage(imageElement, 0, 0, 64, 64);

    // Простая эвристика: если много телесных оттенков → вероятно люди
    const imageData = ctx.getImageData(0, 0, 64, 64);
    const data = imageData.data;
    let skinPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Приближённый диапазон телесных тонов
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
        skinPixels++;
      }
    }

    const skinRatio = skinPixels / (64 * 64);
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
