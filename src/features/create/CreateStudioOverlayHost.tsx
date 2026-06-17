import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MansoniCreateStudio } from "./MansoniCreateStudio";
import type { Intent } from "./MansoniCreateStudio";
import { useCreateStudio } from "./createStudioContext";

export function CreateStudioOverlayHost() {
  const navigate = useNavigate();
  const { isOpen, closeCreateStudio } = useCreateStudio();

  const handleIntentSelect = useCallback(
    (intent: Intent) => {
      closeCreateStudio();
      console.log("[CreateStudio] Intent selected:", intent);
    },
    [closeCreateStudio],
  );

  const handleClose = useCallback(() => {
    closeCreateStudio();
  }, [closeCreateStudio]);

  if (!isOpen) return null;

  return (
    <MansoniCreateStudio
      onIntentSelect={handleIntentSelect}
      onClose={handleClose}
    />
  );
}
