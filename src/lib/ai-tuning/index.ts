/**
 * AI Tuning — frontend-портируемая библиотека для тюнинга LLM
 * и пост-обработки ответов.
 *
 * Модули:
 *   - AutoTune: контекстно-адаптивный подбор параметров генерации
 *     (temperature/top_p/top_k/penalties) с EMA-обучением.
 *   - STM: очистка ответов LLM от AI-шелухи (hedges, преамбул, филлеров)
 *     с защитой markdown code blocks.
 *
 * Использование в React/Edge Functions/AI endpoints:
 *
 *   import { computeParams, transform } from '@/lib/ai-tuning';
 *
 *   const { params, context } = computeParams({
 *     strategy: 'adaptive',
 *     message: userInput,
 *     history: chatHistory,
 *   });
 *
 *   const raw = await llm.chat({ ...params, messages: [...] });
 *   const { transformed } = transform(raw, ['hedge_reducer', 'direct_mode']);
 */

export {
  computeParams,
  recordFeedback,
  getFeedbackStats,
  applyFeedbackSnapshot,
  CONTEXT_PROFILES,
  type ContextType,
  type Strategy,
  type TuneParams,
  type TuneResult,
  type ContextScore,
  type ComputeParamsOptions,
} from './autotune';

export {
  transform,
  listModules,
  type STMModule,
  type TransformResult,
  type ModuleInfo,
} from './stm';
