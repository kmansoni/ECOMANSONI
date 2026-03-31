import React, { useState } from 'react';
import { Sparkles, Loader, AlertCircle, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface OptimizationResult {
  original: string;
  optimized: string;
  improvement_score: number;
  changes: string[];
  reasoning: string;
}

interface PromptOptimizerProps {
  prompt: string;
  onOptimize: (optimizedPrompt: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  agentType?: string;
}

export const PromptOptimizer: React.FC<PromptOptimizerProps> = ({
  prompt,
  onOptimize,
  onCancel,
  disabled = false,
  agentType = 'general',
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOptimize = async () => {
    setIsOptimizing(true);
    setError(null);

    try {
      // Вызов Supabase Edge Function через клиент (автоматически добавляет JWT)
      const { data, error: fnError } = await supabase.functions.invoke('optimize-prompt', {
        body: { prompt, agent_type: agentType },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to optimize');

      setResult(data as OptimizationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Состояние: Кнопка "Улучшить"
  if (!result) {
    return (
      <div className="flex gap-2 items-center">
        <button
          onClick={handleOptimize}
          disabled={disabled || isOptimizing || !prompt.trim()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium
                     bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600
                     text-white rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed
                     shadow-sm hover:shadow-md"
          title="Автоматически улучшить запрос перед отправкой"
        >
          {isOptimizing ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Анализирую...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Улучшить запрос
            </>
          )}
        </button>

        {error && (
          <div className="flex items-center gap-1 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>
    );
  }

  // Состояние: Результаты оптимизации
  return (
    <div className="w-full bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <h3 className="font-semibold text-slate-900">Запрос оптимизирован</h3>
        </div>
        <div className="text-xs font-medium text-slate-600">
          📈 Улучшение: {(result.improvement_score * 100).toFixed(0)}%
        </div>
      </div>

      {/* Reasonin */}
      <div className="bg-white rounded border border-slate-200 p-3">
        <p className="text-xs text-slate-600 whitespace-pre-wrap">
          {result.reasoning}
        </p>
      </div>

      {/* Changes */}
      {result.changes.length > 0 && (
        <div className="bg-white rounded border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-700 mb-2">Внесённые изменения:</p>
          <ul className="space-y-1">
            {result.changes.map((change, idx) => (
              <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Original vs Optimized */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-medium text-slate-700 mb-1">Исходный:</p>
          <div className="bg-white rounded border border-slate-200 p-2 max-h-24 overflow-y-auto">
            <p className="text-xs text-slate-600 line-clamp-4">
              {result.original}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-700 mb-1">Оптимизированный:</p>
          <div className="bg-white rounded border border-blue-200 p-2 max-h-24 overflow-y-auto">
            <p className="text-xs text-slate-600 line-clamp-4">
              {result.optimized}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
        <button
          onClick={() => {
            setResult(null);
            onCancel?.();
          }}
          className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200
                     rounded transition-colors"
        >
          Отменить
        </button>
        <button
          onClick={() => {
            onOptimize(result.optimized);
            setResult(null);
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium
                     bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
        >
          <Check className="w-4 h-4" />
          Отправить улучшенный
        </button>
      </div>

      {/* Debug Info */}
      <details className="text-xs text-slate-500 cursor-pointer">
        <summary>📋 Детальная информация</summary>
        <pre className="mt-2 p-2 bg-white border border-slate-200 rounded overflow-auto max-h-40 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
};

// Hook для интеграции в ChatHeader
export const usePromptOptimizer = () => {
  const [optimizedPrompt, setOptimizedPrompt] = useState<string | null>(null);

  return {
    optimizedPrompt,
    setOptimizedPrompt,
  };
};
