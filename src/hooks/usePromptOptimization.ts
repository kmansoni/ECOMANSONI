/**
 * src/hooks/usePromptOptimization.ts
 *
 * Hook для интеграции Prompt Optimizer в AI-ассистант.
 * Обрабатывает оптимизацию запросов перед отправкой в Mansoni.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OptimizationState {
  isOptimizing: boolean;
  error: string | null;
  result: OptimizationResult | null;
}

export interface OptimizationResult {
  original: string;
  optimized: string;
  improvement_score: number;
  changes: string[];
  reasoning: string;
}

export const usePromptOptimization = () => {
  const [state, setState] = useState<OptimizationState>({
    isOptimizing: false,
    error: null,
    result: null,
  });

  const optimize = useCallback(
    async (prompt: string, agentType: string = 'general'): Promise<OptimizationResult | null> => {
      if (!prompt.trim()) {
        setState(s => ({ ...s, error: 'Запрос не может быть пустым' }));
        return null;
      }

      setState({ isOptimizing: true, error: null, result: null });

      try {
        // Вызов Supabase Edge Function через клиент (автоматически добавляет JWT)
        const { data, error: fnError } = await supabase.functions.invoke('optimize-prompt', {
          body: { prompt, agent_type: agentType },
        });

        if (fnError) {
          throw new Error(fnError.message || 'Не удалось оптимизировать запрос');
        }

        const result = data as OptimizationResult;

        setState({
          isOptimizing: false,
          error: null,
          result,
        });

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Неизвестная ошибка';

        setState({
          isOptimizing: false,
          error,
          result: null,
        });

        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({
      isOptimizing: false,
      error: null,
      result: null,
    });
  }, []);

  return {
    ...state,
    optimize,
    reset,
  };
};

/**
 * Имя Supabase Edge Function для оптимизации промптов.
 * Задеплоена по пути: supabase/functions/optimize-prompt/index.ts
 * Вызывается через: supabase.functions.invoke(OPTIMIZE_FUNCTION_NAME, { body })
 */
export const OPTIMIZE_FUNCTION_NAME = 'optimize-prompt';
