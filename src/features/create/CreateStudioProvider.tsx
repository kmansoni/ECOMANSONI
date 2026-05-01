import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CreateStudioContext, mapCreateTabToMode, type CreateStudioContextValue, type CreateStudioOpenOptions, type CreateStudioTab } from "./createStudioContext";
import { useCreateSessionStore } from "./session/useCreateSessionStore";
import { DraftRestoreDialog } from "./session/DraftRestoreDialog";

type CreateStudioState = {
  isOpen: boolean;
  initialTab: CreateStudioTab;
  closeTo?: string | number;
  successTo?: string;
};

export function CreateStudioProvider({ children }: { children: ReactNode }) {
  const { session, resetSession } = useCreateSessionStore({
    initialMode: "post",
    restoreDraft: true,
    autosave: true,
  });

  const [state, setState] = useState<CreateStudioState>({
    isOpen: false,
    initialTab: "publications",
  });

  const [showDraftDialog, setShowDraftDialog] = useState(false);

  const hasDraft = session.draft.isDirty && session.updatedAt > session.createdAt;

  const openCreateStudio = useCallback((options: CreateStudioOpenOptions = {}) => {
    const nextTab = options.tab ?? "publications";
    
    if (hasDraft) {
      setShowDraftDialog(true);
      return;
    }
    
    resetSession(mapCreateTabToMode(nextTab), options.closeTo === undefined ? "plus" : "deep_link");
    setState({
      isOpen: true,
      initialTab: nextTab,
      closeTo: options.closeTo,
      successTo: options.successTo,
    });
  }, [resetSession, hasDraft]);

  const handleRestoreDraft = useCallback(() => {
    setShowDraftDialog(false);
    setState({
      isOpen: true,
      initialTab: "publications",
    });
  }, []);

  const handleStartFresh = useCallback(() => {
    setShowDraftDialog(false);
    resetSession("post", "plus");
    setState({
      isOpen: true,
      initialTab: "publications",
    });
  }, [resetSession]);

  const closeCreateStudio = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false, closeTo: undefined, successTo: undefined }));
  }, []);

  const value = useMemo<CreateStudioContextValue>(() => ({
    isOpen: state.isOpen,
    initialTab: state.initialTab,
    closeTo: state.closeTo,
    successTo: state.successTo,
    session,
    openCreateStudio,
    closeCreateStudio,
  }), [closeCreateStudio, openCreateStudio, session, state.closeTo, state.initialTab, state.isOpen, state.successTo]);

  return (
    <CreateStudioContext.Provider value={value}>
      {children}
      <DraftRestoreDialog
        isOpen={showDraftDialog}
        draftTimestamp={session.updatedAt}
        onRestore={handleRestoreDraft}
        onDiscard={handleStartFresh}
        onCancel={() => setShowDraftDialog(false)}
      />
    </CreateStudioContext.Provider>
  );
}
