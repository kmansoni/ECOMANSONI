/**
 * EditorPage.tsx — Страница видеоредактора.
 *
 * Получает projectId из URL, загружает проект, инициализирует stores,
 * подключает автосохранение, keyboard shortcuts и timeline playback.
 * При unmount — очищает все stores.
 */

import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProject } from '@/features/editor/hooks/useProject';
import { useAutoSave } from '@/features/editor/hooks/useAutoSave';
import { useKeyboardShortcuts } from '@/features/editor/hooks/useKeyboardShortcuts';
import { useTimeline } from '@/features/editor/hooks/useTimeline';
import { EditorLayout } from '@/features/editor/components/EditorLayout';
import { useEditorStore } from '@/features/editor/stores/editor-store';

// ── Loading state ─────────────────────────────────────────────────────────

function EditorLoadingState() {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-white/80 text-sm font-medium">Загрузка проекта...</p>
        <p className="text-white/40 text-xs mt-1">Подготовка таймлайна и медиа</p>
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────

interface EditorErrorStateProps {
  message: string;
  onBack: () => void;
  onRetry?: () => void;
}

function EditorErrorState({ message, onBack, onRetry }: EditorErrorStateProps) {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] flex flex-col items-center justify-center gap-6 px-4">
      <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-400" />
      </div>
      <div className="text-center max-w-md">
        <h2 className="text-white text-lg font-semibold mb-2">Не удалось загрузить проект</h2>
        <p className="text-white/60 text-sm">{message}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4" />
          К проектам
        </Button>
        {onRetry && (
          <Button
            className="gap-2 bg-indigo-600 hover:bg-indigo-700"
            onClick={onRetry}
          >
            <RotateCcw className="w-4 h-4" />
            Повторить
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Not found state ───────────────────────────────────────────────────────

function EditorNotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-screen w-screen bg-[#0a0a1a] flex flex-col items-center justify-center gap-6 px-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
      </div>
      <div className="text-center max-w-md">
        <h2 className="text-white text-lg font-semibold mb-2">Проект не найден</h2>
        <p className="text-white/60 text-sm">
          Указанный проект не существует или был удалён.
          Проверьте ссылку или вернитесь к списку проектов.
        </p>
      </div>
      <Button
        variant="outline"
        className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800"
        onClick={onBack}
      >
        <ArrowLeft className="w-4 h-4" />
        К проектам
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const clearProject = useEditorStore((s) => s.clearProject);

  // ── Load project via TanStack Query ───────────────────────────────────
  const {
    data: projectData,
    isLoading,
    isError,
    error,
    refetch,
  } = useProject(projectId);

  // ── Initialize editor subsystems ──────────────────────────────────────
  // These hooks are safe to call unconditionally — they check projectId/state internally.
  useAutoSave(projectId);
  useKeyboardShortcuts({ projectId });
  useTimeline();

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearProject();
    };
  }, [clearProject]);

  // ── Navigation helpers ────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // ── Render states ─────────────────────────────────────────────────────

  // No projectId in URL
  if (!projectId) {
    return <EditorNotFoundState onBack={handleBack} />;
  }

  // Loading
  if (isLoading) {
    return <EditorLoadingState />;
  }

  // Error
  if (isError) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Произошла неизвестная ошибка при загрузке проекта.';

    // Detect 404-like errors
    const is404 =
      errorMessage.includes('404') ||
      errorMessage.toLowerCase().includes('not found');

    if (is404) {
      return <EditorNotFoundState onBack={handleBack} />;
    }

    return (
      <EditorErrorState
        message={errorMessage}
        onBack={handleBack}
        onRetry={handleRetry}
      />
    );
  }

  // No data (shouldn't happen after successful load, but defensive check)
  if (!projectData?.project) {
    return <EditorNotFoundState onBack={handleBack} />;
  }

  // ── Success — render the editor layout ────────────────────────────────
  return <EditorLayout />;
}

export default EditorPage;
