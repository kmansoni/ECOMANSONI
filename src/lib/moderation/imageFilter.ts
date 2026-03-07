/**
 * imageFilter — NSFW-детекция изображений через NSFWJS (TensorFlow.js)
 * Lazy-load модели при первом вызове
 */

export interface NSFWResult {
  safe: boolean;
  confidence: number;
  categories: {
    porn: number;
    sexy: number;
    hentai: number;
    neutral: number;
    drawing: number;
  };
}

let nsfwjs: any = null;
let model: any = null;

async function loadModel() {
  if (model) return model;

  // Динамический импорт для lazy-load
  try {
    // @ts-expect-error -- optional dependency may not have local type declarations
    const nsfwModule = await import("nsfwjs");
    nsfwjs = nsfwModule.default || nsfwModule;
    model = await nsfwjs.load();
    return model;
  } catch (err) {
    console.warn("NSFWJS не доступен, NSFW проверка отключена:", err);
    return null;
  }
}

export async function checkImage(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): Promise<NSFWResult> {
  const fallback: NSFWResult = {
    safe: true,
    confidence: 1,
    categories: { porn: 0, sexy: 0, hentai: 0, neutral: 1, drawing: 0 },
  };

  try {
    const m = await loadModel();
    if (!m) return fallback;

    const predictions = await m.classify(imageElement);
    const result: Record<string, number> = {};

    for (const p of predictions) {
      result[p.className.toLowerCase()] = Math.round(p.probability * 100) / 100;
    }

    const categories = {
      porn: result["porn"] ?? 0,
      sexy: result["sexy"] ?? 0,
      hentai: result["hentai"] ?? 0,
      neutral: result["neutral"] ?? 0,
      drawing: result["drawing"] ?? 0,
    };

    const unsafeScore = categories.porn + categories.hentai;
    const safe = unsafeScore < 0.6;

    return {
      safe,
      confidence: safe ? categories.neutral + categories.drawing : unsafeScore,
      categories,
    };
  } catch (err) {
    console.error("Ошибка NSFW проверки:", err);
    return fallback;
  }
}

export async function checkImageUrl(url: string): Promise<NSFWResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => checkImage(img).then(resolve);
    img.onerror = () => resolve({
      safe: true,
      confidence: 1,
      categories: { porn: 0, sexy: 0, hentai: 0, neutral: 1, drawing: 0 },
    });
    img.src = url;
  });
}
