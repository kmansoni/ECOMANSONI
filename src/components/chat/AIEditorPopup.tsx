/**
 * src/components/chat/AIEditorPopup.tsx
 *
 * AI Editor — аналог Telegram AI Editor (апдейт 31 марта 2026).
 * Позволяет исправить грамматику, перефразировать, перевести и настроить тон сообщения
 * прямо в поле ввода чата, без зависимостей от Telegram.
 */

import React, { useState, useCallback } from "react";
import {
  Wand2,
  Check,
  X,
  Languages,
  Sparkles,
  PenLine,
  Lightbulb,
  ArrowRightLeft,
  Loader2,
} from "lucide-react";
import { callAnthropicStreaming, isAnthropicConfigured } from "@/lib/ai/anthropic-client";
import { toast } from "sonner";

interface AIEditorPopupProps {
  originalText: string;
  onApply: (text: string) => void;
  onClose: () => void;
}

type AIAction =
  | "fix_grammar"
  | "rewrite_formal"
  | "rewrite_casual"
  | "rewrite_short"
  | "rewrite_expand"
  | "translate_en"
  | "translate_ru"
  | "translate_de"
  | "translate_fr"
  | "translate_es"
  | "make_friendly"
  | "make_professional";

interface AIActionOption {
  id: AIAction;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const AI_ACTIONS: AIActionOption[] = [
  {
    id: "fix_grammar",
    label: "Исправить грамматику",
    icon: <PenLine className="w-4 h-4" />,
    description: "Автоматическое исправление ошибок и опечаток",
  },
  {
    id: "rewrite_formal",
    label: "Официальный стиль",
    icon: <Sparkles className="w-4 h-4" />,
    description: "Перефразировать в официальном стиле",
  },
  {
    id: "rewrite_casual",
    label: "Неформальный",
    icon: <Lightbulb className="w-4 h-4" />,
    description: "Сделать текст более простым и дружелюбным",
  },
  {
    id: "rewrite_short",
    label: "Сократить",
    icon: <ArrowRightLeft className="w-4 h-4" />,
    description: "Сделать текст короче, без потери смысла",
  },
  {
    id: "rewrite_expand",
    label: "Развернуть",
    icon: <ArrowRightLeft className="w-4 h-4" />,
    description: "Добавить деталей и уточнить",
  },
  {
    id: "translate_en",
    label: "Перевести на английский",
    icon: <Languages className="w-4 h-4" />,
    description: "Перевести текст на английский",
  },
  {
    id: "translate_ru",
    label: "Перевести на русский",
    icon: <Languages className="w-4 h-4" />,
    description: "Перевести текст на русский",
  },
  {
    id: "translate_de",
    label: "Перевести на немецкий",
    icon: <Languages className="w-4 h-4" />,
    description: "Перевести текст на немецкий",
  },
  {
    id: "translate_fr",
    label: "Перевести на французский",
    icon: <Languages className="w-4 h-4" />,
    description: "Перевести текст на французский",
  },
  {
    id: "translate_es",
    label: "Перевести на испанский",
    icon: <Languages className="w-4 h-4" />,
    description: "Перевести текст на испанский",
  },
  {
    id: "make_friendly",
    label: "Дружелюбный тон",
    icon: <Sparkles className="w-4 h-4" />,
    description: "Сделать тон более теплым и открытым",
  },
  {
    id: "make_professional",
    label: "Профессиональный тон",
    icon: <PenLine className="w-4 h-4" />,
    description: "Сделать тон более деловым и точным",
  },
];

const SYSTEM_PROMPTS: Record<AIAction, string> = {
  fix_grammar:
    "Ты — редактор текста. Исправь грамматику, пунктуацию и опечатки в тексте пользователя. Сохрани исходный смысл, стиль и все детали. В ответе верни только исправленный текст, без комментариев.",
  rewrite_formal:
    "Ты — редактор текста. Перефразируй текст в официальном стиле, делая его более формальным и вежливым. Сохрани исходный смысл. В ответе верни только перефразированный текст, без комментариев.",
  rewrite_casual:
    "Ты — редактор текста. Перефразируй текст в неформальном, простом стиле, как в разговоре с другом. Сохрани исходный смысл. В ответе верни только перефразированный текст, без комментариев.",
  rewrite_short:
    "Ты — редактор текста. Сделай текст короче, сохранив основной смысл и важные детали. Убери лишнее, оставь только самое важное. В ответе верни только сокращённый текст, без комментариев.",
  rewrite_expand:
    "Ты — редактор текста. Разверни текст, добавь детали и уточнения, сделай его более полным и информативным, сохрани исходный смысл. В ответе верни только развернутый текст, без комментариев.",
  translate_en:
    "Переведи текст на английский. Сохрани тон и смысл. В ответе верни только перевод, без комментариев и пояснений.",
  translate_ru:
    "Переведи текст на русский. Сохрани тон и смысл. В ответе верни только перевод, без комментариев и пояснений.",
  translate_de:
    "Переведи текст на немецкий. Сохрани тон и смысл. В ответе верни только перевод, без комментариев и пояснений.",
  translate_fr:
    "Переведи текст на французский. Сохрани тон и смысл. В ответе верни только перевод, без комментариев и пояснений.",
  translate_es:
    "Переведи текст на испанский. Сохрани тон и смысл. В ответе верни только перевод, без комментариев и пояснений.",
  make_friendly:
    "Ты — редактор текста. Сделай тон текста более дружелюбным, теплым и открытым. Добавь эмпатии, если это уместно. Сохрани исходный смысл. В ответе верни только изменённый текст, без комментариев.",
  make_professional:
    "Ты — редактор текста. Сделай тон текста более деловым, точным и профессиональным. Сохрани исходный смысл. В ответе верни только изменённый текст, без комментариев.",
};

export function AIEditorPopup({
  originalText,
  onApply,
  onClose,
}: AIEditorPopupProps) {
  const [selectedAction, setSelectedAction] = useState<AIAction | null>(null);
  const [processedText, setProcessedText] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const isConfigured = isAnthropicConfigured();

  const handleAction = useCallback(
    async (action: AIAction) => {
      if (!originalText.trim()) {
        toast.error("Введите текст для обработки");
        return;
      }

      if (!isConfigured) {
        toast.error("AI-редактор не настроен. Обратитесь к администратору.");
        return;
      }

      setIsProcessing(true);
      setSelectedAction(action);
      setProcessedText(null);
      setShowResult(false);

      try {
        const systemPrompt = SYSTEM_PROMPTS[action];
        const result = await callAnthropicStreaming(
          [{ role: "user", content: originalText }],
          systemPrompt,
          (chunk) => {
            setProcessedText((prev) => (prev ?? "") + chunk);
          }
        );
        setProcessedText(result);
        setShowResult(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка обработки текста";
        toast.error(msg);
      } finally {
        setIsProcessing(false);
      }
    },
    [originalText, isConfigured]
  );

  const handleApply = useCallback(() => {
    if (processedText) {
      onApply(processedText);
      onClose();
    }
  }, [processedText, onApply, onClose]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isConfigured) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 p-4 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl z-50">
        <div className="flex items-center gap-3 text-amber-400">
          <Wand2 className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            AI-редактор не настроен. Добавьте ANTHROPIC_API_KEY в настройки администратора.
          </p>
        </div>
        <button
          onClick={handleCancel}
          className="mt-3 w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors"
        >
          Закрыть
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 p-4 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl z-50 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">AI-редактор</h3>
        </div>
        <button
          onClick={handleCancel}
          className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Original text preview */}
      <div className="mb-3 p-2 rounded-xl bg-black/40 border border-white/5">
        <p className="text-xs text-white/40 mb-1">Исходный текст:</p>
        <p className="text-sm text-white/80 line-clamp-2">
          {originalText || "(пусто)"}
        </p>
      </div>

      {!showResult ? (
        /* Action buttons grid */
        <div className="grid grid-cols-2 gap-2">
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              disabled={isProcessing}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border transition-all ${
                selectedAction === action.id
                  ? "bg-cyan-500/20 border-cyan-400/40"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-cyan-300">{action.icon}</span>
                <span className="text-sm font-medium text-white">{action.label}</span>
              </div>
              <span className="text-xs text-white/50">{action.description}</span>
            </button>
          ))}
        </div>
      ) : (
        /* Result view */
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-400/20">
            <p className="text-xs text-cyan-300 mb-2">
              {AI_ACTIONS.find((a) => a.id === selectedAction)?.label}:
            </p>
            <p className="text-sm text-white leading-relaxed">
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Обработка...
                </span>
              ) : (
                processedText || "Пустой результат"
              )}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={!processedText || isProcessing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Check className="w-4 h-4" />
              Применить
            </button>
            <button
              onClick={() => {
                setShowResult(false);
                setProcessedText(null);
                setSelectedAction(null);
              }}
              disabled={isProcessing}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-colors"
            >
              Ещё
            </button>
            <button
              onClick={handleCancel}
              disabled={isProcessing}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
