/**
 * useMessageTranslation — translates message text using free translation APIs.
 *
 * Strategy:
 * 1. Primary: MyMemory Translation API (free, no key required, 5000 chars/day)
 * 2. Fallback: Lingva Translate (open-source Google Translate proxy)
 * 3. Cache: sessionStorage to avoid re-translating same text
 * 4. Retry: automatic fallback to second provider on failure
 */

import { useState, useCallback } from "react";
import { logger } from "@/lib/logger";

const CACHE_PREFIX = "msg_translate_v1:";
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const LINGVA_URL = "https://lingva.ml/api/v1";
const MAX_TEXT_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 8000;

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: "mymemory" | "lingva";
}

function cacheKey(text: string, targetLang: string): string {
  return CACHE_PREFIX + targetLang + ":" + text.slice(0, 100);
}

function readCache(text: string, targetLang: string): string | null {
  try {
    return sessionStorage.getItem(cacheKey(text, targetLang));
  } catch (error) {
    logger.warn("[useMessageTranslation] Failed to read cache", { targetLang, error });
    return null;
  }
}

function writeCache(text: string, targetLang: string, translated: string): void {
  try {
    sessionStorage.setItem(cacheKey(text, targetLang), translated);
  } catch (error) {
    logger.warn("[useMessageTranslation] Failed to write cache", { targetLang, error });
  }
}

async function translateViaMyMemory(
  text: string,
  targetLang: string
): Promise<{ translated: string; sourceLang: string }> {
  const params = new URLSearchParams({
    q: text.slice(0, MAX_TEXT_LENGTH),
    langpair: `autodetect|${targetLang}`,
  });

  const res = await fetch(`${MYMEMORY_URL}?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`MyMemory API ${res.status}`);

  const data = await res.json();

  // Проверяем лимит запросов MyMemory
  if (data?.responseStatus === 429 || data?.responseStatus === 403) {
    throw new Error("MyMemory rate limit exceeded");
  }

  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error("Empty translation from MyMemory");

  return {
    translated,
    sourceLang: data?.responseData?.detectedLanguage ?? "auto",
  };
}

async function translateViaLingva(
  text: string,
  targetLang: string
): Promise<{ translated: string; sourceLang: string }> {
  const encodedText = encodeURIComponent(text.slice(0, MAX_TEXT_LENGTH));
  const res = await fetch(`${LINGVA_URL}/auto/${targetLang}/${encodedText}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Lingva API ${res.status}`);

  const data = await res.json();
  const translated = data?.translation;
  if (!translated) throw new Error("Empty translation from Lingva");

  return {
    translated,
    sourceLang: data?.info?.detectedSource ?? "auto",
  };
}

export function useMessageTranslation() {
  const [translating, setTranslating] = useState(false);
  const [translations, setTranslations] = useState<Map<string, TranslationResult>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const translate = useCallback(async (
    messageId: string,
    text: string,
    targetLang: string = "ru"
  ): Promise<TranslationResult | null> => {
    // Проверяем кэш
    const cached = readCache(text, targetLang);
    if (cached) {
      const result: TranslationResult = {
        originalText: text,
        translatedText: cached,
        sourceLang: "auto",
        targetLang,
        provider: "mymemory",
      };
      setTranslations(prev => new Map(prev).set(messageId, result));
      return result;
    }

    setTranslating(true);
    setError(null);

    // Провайдеры с автоматическим fallback
    const providers = [
      { name: "mymemory" as const, fn: translateViaMyMemory },
      { name: "lingva" as const, fn: translateViaLingva },
    ];

    for (const provider of providers) {
      try {
        const { translated, sourceLang } = await provider.fn(text, targetLang);

        writeCache(text, targetLang, translated);

        const result: TranslationResult = {
          originalText: text,
          translatedText: translated,
          sourceLang,
          targetLang,
          provider: provider.name,
        };

        setTranslations(prev => new Map(prev).set(messageId, result));
        setTranslating(false);
        return result;
      } catch (err) {
        logger.warn(`[useMessageTranslation] ${provider.name} failed, trying next`, {
          error: err instanceof Error ? err.message : String(err),
          targetLang,
          textLength: text.length,
        });
        // Продолжаем к следующему провайдеру
      }
    }

    // Все провайдеры не сработали
    logger.error("[useMessageTranslation] All providers failed", {
      targetLang,
      textLength: text.length,
    });
    setError("Не удалось перевести сообщение");
    setTranslating(false);
    return null;
  }, []);

  const getTranslation = useCallback((messageId: string): TranslationResult | null => {
    return translations.get(messageId) ?? null;
  }, [translations]);

  const clearTranslation = useCallback((messageId: string) => {
    setTranslations(prev => {
      const next = new Map(prev);
      next.delete(messageId);
      return next;
    });
  }, []);

  return { translate, translating, getTranslation, clearTranslation, error };
}
