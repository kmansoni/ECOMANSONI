/**
 * useMessageTranslation — translates message text using free translation API.
 *
 * Strategy:
 * 1. Primary: MyMemory Translation API (free, no key required, 5000 chars/day)
 * 2. Cache: sessionStorage to avoid re-translating same text
 * 3. Fallback: error message if API unavailable
 */

import { useState, useCallback } from "react";

const CACHE_PREFIX = "msg_translate_v1:";
const API_URL = "https://api.mymemory.translated.net/get";

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

function cacheKey(text: string, targetLang: string): string {
  return CACHE_PREFIX + targetLang + ":" + text.slice(0, 100);
}

function readCache(text: string, targetLang: string): string | null {
  try {
    return sessionStorage.getItem(cacheKey(text, targetLang));
  } catch { return null; }
}

function writeCache(text: string, targetLang: string, translated: string): void {
  try {
    sessionStorage.setItem(cacheKey(text, targetLang), translated);
  } catch {}
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
    // Check cache
    const cached = readCache(text, targetLang);
    if (cached) {
      const result: TranslationResult = {
        originalText: text,
        translatedText: cached,
        sourceLang: "auto",
        targetLang,
      };
      setTranslations(prev => new Map(prev).set(messageId, result));
      return result;
    }

    setTranslating(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: text.slice(0, 500), // API limit
        langpair: `autodetect|${targetLang}`,
      });

      const res = await fetch(`${API_URL}?${params}`, {
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      const data = await res.json();
      const translated = data?.responseData?.translatedText;

      if (!translated) throw new Error("Empty translation");

      writeCache(text, targetLang, translated);

      const result: TranslationResult = {
        originalText: text,
        translatedText: translated,
        sourceLang: data?.responseData?.detectedLanguage ?? "auto",
        targetLang,
      };

      setTranslations(prev => new Map(prev).set(messageId, result));
      return result;
    } catch (err) {
      setError("Не удалось перевести сообщение");
      return null;
    } finally {
      setTranslating(false);
    }
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
