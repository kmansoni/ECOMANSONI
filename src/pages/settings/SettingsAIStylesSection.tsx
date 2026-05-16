/**
 * src/pages/settings/SettingsAIStylesSection.tsx
 *
 * Управление пользовательскими AI-стилями (Custom AI Styles).
 * Аналог Telegram Custom AI Styles (апдейт 7 мая 2026).
 * Собственная реализация, не зависит от Telegram.
 *
 * Экран: "ai_styles"
 */

import { useState, useCallback } from "react";
import { Wand2, Plus, Sparkles, Trash2, Edit, Share2, Check, X, Loader2, Lightbulb, FileText } from "lucide-react";
import { botApi } from "@/lib/bots/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────

interface AIStyle {
  style_id: string;
  user_id: string;
  name: string;
  description?: string;
  system_prompt: string;
  is_default: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface AIStylesSectionProps {
  isDark: boolean;
  onNavigate: (screen: string) => void;
  onBack: () => void;
}

const EMPTY_STYLE = {
  name: "",
  description: "",
  system_prompt: "",
};

// ── Component ──────────────────────────────────────────────────

export function SettingsAIStylesSection({ isDark, onNavigate, onBack }: AIStylesSectionProps) {
  const { user } = useAuth();
  const [styles, setStyles] = useState<AIStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingStyle, setEditingStyle] = useState<AIStyle | null>(null);
  const [formData, setFormData] = useState(EMPTY_STYLE);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load styles on mount
  const loadStyles = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const result = await botApi.listAIStyles(user.id);
      setStyles(result.styles || []);
    } catch (err) {
      toast.error("Не удалось загрузить стили");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Create or update style
  const handleSave = useCallback(async () => {
    if (!user?.id || !formData.name.trim() || !formData.system_prompt.trim()) {
      toast.error("Заполните название и системный промпт");
      return;
    }

    try {
      if (editingStyle) {
        // Update (not implemented in API yet)
        toast.error("Редактирование стилей пока не поддерживается");
        return;
      } else {
        const result = await botApi.createAIStyle({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          system_prompt: formData.system_prompt.trim(),
          user_id: user.id,
        });
        toast.success("Стиль создан");
        setFormData(EMPTY_STYLE);
        setShowEditor(false);
        loadStyles();
      }
    } catch (err) {
      toast.error("Не удалось сохранить стиль");
    }
  }, [user?.id, formData, editingStyle, loadStyles]);

  // Apply style to text
  const handleApply = useCallback(async (style: AIStyle, text: string) => {
    if (!text.trim()) {
      toast.error("Введите текст для преобразования");
      return;
    }

    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const result = await botApi.applyAIStyle(style.style_id, text, "ru");
      setPreviewResult(result.result_text);
    } catch (err) {
      toast.error("Не удалось применить стиль");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Delete style
  const handleDelete = useCallback(async (styleId: string) => {
    if (!confirm("Удалить этот стиль?")) return;
    // Not yet in API stub
    toast.info("Удаление стилей будет добавлено в следующих версиях");
  }, []);

  return (
    <>
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-semibold text-white">AI-стили</h2>
          <p className="text-xs text-white/50 mt-0.5">Создавайте и используйте собственные стили редактирования текста</p>
        </div>
        <button
          onClick={() => { setEditingStyle(null); setFormData(EMPTY_STYLE); setShowEditor(true); loadStyles(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-sm font-medium border border-cyan-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" /> Создать стиль
        </button>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : styles.length === 0 ? (
          <div className="text-center py-12">
            <Wand2 className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40 text-sm mb-2">У вас пока нет стилей</p>
            <button
              onClick={() => { setEditingStyle(null); setFormData(EMPTY_STYLE); setShowEditor(true); }}
              className="text-cyan-400 hover:text-cyan-300 text-sm font-medium"
            >
              Создать первый стиль
            </button>
          </div>
        ) : (
          styles.map((style) => (
            <div
              key={style.style_id}
              className={`p-4 rounded-2xl border transition-all ${
                isDark
                  ? "bg-zinc-900/80 border-white/10"
                  : "bg-white/70 border-black/10"
              } ${style.is_default ? "ring-1 ring-cyan-500/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white truncate">{style.name}</h3>
                    {style.is_public && (
                      <Share2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" title="Публичный" />
                    )}
                    {style.is_default && (
                      <span className="text-[10px] text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded-full shrink-0">По умолчанию</span>
                    )}
                  </div>
                  {style.description && (
                    <p className="text-sm text-white/50 mt-1 line-clamp-1">{style.description}</p>
                  )}
                  <p className="text-xs text-white/30 mt-2 line-clamp-1">{style.system_prompt}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleApply(style, "Пример текста для стиля")}
                    className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-cyan-400 transition-colors"
                    title="Применить"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { handleDelete(style.style_id); }}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-white/50 hover:text-red-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Style Modal */}
      {showEditor && (
        <CreateStyleModal
          isDark={isDark}
          editingStyle={editingStyle}
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditingStyle(null); setFormData(EMPTY_STYLE); setPreviewResult(null); }}
          previewResult={previewResult}
          previewLoading={previewLoading}
          onPreview={async () => {
            if (!editingStyle && !formData.system_prompt.trim()) {
              toast.error("Сначала заполните системный промпт");
              return;
            }
            const style = editingStyle || ({
              style_id: "preview",
              name: formData.name || "Новый стиль",
              system_prompt: formData.system_prompt,
              user_id: user?.id || "",
              is_default: false,
              is_public: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as AIStyle);
            await handleApply(style, "Это пример текста, чтобы посмотреть как работает новый стиль редактирования.");
          }}
        />
      )}
    </>
  );
}

// ── Create/Edit Style Modal ─────────────────────────────────────

interface CreateStyleModalProps {
  isDark: boolean;
  editingStyle: AIStyle | null;
  formData: { name: string; description: string; system_prompt: string; };
  setFormData: (data: { name: string; description: string; system_prompt: string; }) => void;
  onSave: () => void;
  onClose: () => void;
  previewResult: string | null;
  previewLoading: boolean;
  onPreview: () => void;
}

function CreateStyleModal({
  isDark,
  editingStyle,
  formData,
  setFormData,
  onSave,
  onClose,
  previewResult,
  previewLoading,
  onPreview,
}: CreateStyleModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg mx-4 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${
          isDark ? "bg-zinc-900 border border-white/10" : "bg-white border border-black/10"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">{editingStyle ? "Редактировать стиль" : "Новый AI-стиль"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Название</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Например, Коротко и по делу"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                isDark
                  ? "bg-black/30 border-white/10 text-white placeholder:text-white/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                  : "bg-white border-black/10 text-black placeholder:text-black/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
              } focus:outline-none`}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Описание (необязательно)</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Краткое описание для чего используется этот стиль"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                isDark
                  ? "bg-black/30 border-white/10 text-white placeholder:text-white/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                  : "bg-white border-black/10 text-black placeholder:text-black/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
              } focus:outline-none`}
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Системный промпт</label>
            <textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              placeholder="Опишите, как должен редактироваться текст. Например:&#10;Перефразируй текст в стиле старшего инженера: точный, без воды, только суть."
              rows={5}
              className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors resize-none ${
                isDark
                  ? "bg-black/30 border-white/10 text-white placeholder:text-white/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                  : "bg-white border-black/10 text-black placeholder:text-black/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
              } focus:outline-none`}
            />
          </div>

          {/* Preview Result */}
          {previewResult && (
            <div className={`p-3 rounded-xl border ${isDark ? "bg-cyan-500/10 border-cyan-500/20" : "bg-cyan-50 border-cyan-200"}`}>
              <p className="text-xs font-medium text-cyan-300 mb-1.5">Результат:</p>
              <p className="text-sm text-white/80">{previewResult}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onPreview}
              disabled={previewLoading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
              Предпросмотр
            </button>
            <button
              onClick={onSave}
              disabled={!formData.name.trim() || !formData.system_prompt.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Check className="w-4 h-4" />
              {editingStyle ? "Сохранить" : "Создать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
