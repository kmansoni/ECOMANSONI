import { useEffect, useMemo } from "react";

interface SimpleMediaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaFile: File | null;
  contentType: "post" | "reel" | "story" | "live";
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

export function SimpleMediaEditor({
  open,
  onOpenChange,
  mediaFile,
  contentType,
  onSave,
  onCancel,
}: SimpleMediaEditorProps) {
  const previewUrl = useMemo(() => (mediaFile ? URL.createObjectURL(mediaFile) : null), [mediaFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-lg bg-zinc-900 p-4 text-white">
        <div className="mb-3 text-sm opacity-80">Simple editor ({contentType})</div>
        {previewUrl && mediaFile?.type.startsWith("image/") && (
          <img src={previewUrl} alt="preview" className="max-h-72 w-full rounded object-contain" />
        )}
        {previewUrl && mediaFile?.type.startsWith("video/") && (
          <video src={previewUrl} controls className="max-h-72 w-full rounded" />
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded border border-white/20 bg-black/30 px-3 py-2"
            onClick={() => {
              onCancel();
              onOpenChange(false);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded bg-white px-3 py-2 text-black"
            onClick={async () => {
              if (!mediaFile) {
                onOpenChange(false);
                return;
              }
              const blob = mediaFile.slice(0, mediaFile.size, mediaFile.type || "application/octet-stream");
              onSave(blob);
              onOpenChange(false);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
