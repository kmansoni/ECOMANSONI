import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CreateContentModal } from "@/components/feed/CreateContentModal";
import type { ContentType } from "@/hooks/useMediaEditor";
import { useCreateStudio } from "./createStudioContext";

export function CreateStudioOverlayHost() {
  const navigate = useNavigate();
  const { isOpen, initialTab, closeTo, successTo, closeCreateStudio } = useCreateStudio();

  const navigateTarget = useCallback((target: string | number | undefined) => {
    if (typeof target === "number") {
      navigate(target);
      return;
    }
    if (target) {
      navigate(target);
    }
  }, [navigate]);

  const handleClose = useCallback(() => {
    const target = closeTo;
    closeCreateStudio();
    navigateTarget(target);
  }, [closeCreateStudio, closeTo, navigateTarget]);

  const handleSuccess = useCallback((contentType: ContentType) => {
    const target = successTo ?? (contentType === "reel" ? "/reels" : undefined);
    closeCreateStudio();
    navigateTarget(target);
  }, [closeCreateStudio, navigateTarget, successTo]);

  return (
    <CreateContentModal
      isOpen={isOpen}
      initialTab={initialTab}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  );
}
