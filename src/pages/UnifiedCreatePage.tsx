import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreateContentModal } from "@/components/feed/CreateContentModal";
import type { ContentType } from "@/hooks/useMediaEditor";

type UnifiedTab = "publications" | "stories" | "reels" | "live";

function mapQueryTabToModalTab(value: string | null): UnifiedTab {
  const tab = String(value || "").toLowerCase();
  if (tab === "story" || tab === "stories") return "stories";
  if (tab === "reels" || tab === "reel") return "reels";
  if (tab === "live") return "live";
  return "publications";
}

export function UnifiedCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialTab = useMemo(() => {
    return mapQueryTabToModalTab(searchParams.get("tab"));
  }, [searchParams]);

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const handleSuccess = (contentType: ContentType) => {
    if (contentType === "reel") {
      navigate("/reels");
      return;
    }
    navigate("/");
  };

  return (
    <CreateContentModal
      isOpen={true}
      initialTab={initialTab}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  );
}

export default UnifiedCreatePage;
