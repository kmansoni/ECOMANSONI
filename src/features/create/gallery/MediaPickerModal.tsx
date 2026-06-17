import { useState, useRef, useMemo } from "react";
import { X, ImageIcon, Film, ChevronLeft, CheckSquare, Square, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MediaPickerItem, MediaPickerFolder, PickerSelection } from "./mediaPickerTypes";

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: PickerSelection) => void;
  maxFiles?: number;
  accept?: string;
}

const VIRTUAL_FOLDER_ID = "__virtual_all__";

export function MediaPickerModal({
  isOpen,
  onClose,
  onSelect,
  maxFiles = 10,
  accept = "image/*,video/*",
}: MediaPickerModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFolderId, setActiveFolderId] = useState<string>(VIRTUAL_FOLDER_ID);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const folders = useMemo<MediaPickerFolder[]>(() => {
    const base: MediaPickerFolder[] = [
      {
        id: VIRTUAL_FOLDER_ID,
        name: "All media",
        path: VIRTUAL_FOLDER_ID,
        parentPath: null,
      },
    ];
    return base;
  }, []);

  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? folders[0];

  const items = useMemo<MediaPickerItem[]>(() => {
    const all: MediaPickerItem[] = [];
    return all;
  }, [activeFolderId, searchQuery]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const isAllSelected = visibleItems.length > 0 && selectedIds.size === visibleItems.length;
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < maxFiles) next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const ids = visibleItems.slice(0, maxFiles).map((it) => it.id);
      setSelectedIds(new Set(ids));
    }
  };

  const handleConfirm = () => {
    const selected = visibleItems.filter((it) => selectedIds.has(it.id));
    if (selected.length === 0) return;
    onSelect({ items: selected, mode: selected.length === 1 ? "single" : "multi" });
  };

  const handleBack = () => {
    if (activeFolder.parentPath) {
      setActiveFolderId(activeFolder.parentPath);
    }
  };

  const handleFolderClick = (folderId: string) => {
    setActiveFolderId(folderId);
  };

  const previewItem = previewItemId ? items.find((it) => it.id === previewItemId) : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex h-[85vh] w-[90vw] max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl">
        {/* Sidebar */}
        <div className="flex w-56 flex-col border-r border-white/10 bg-black/30">
          <div className="flex items-center justify-between p-3">
            <h2 className="text-sm font-semibold text-white">Media</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/70 hover:text-white"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-white/40" />
              <Input
                placeholder="Search media..."
                className="h-8 rounded-lg border-white/10 bg-white/5 pl-8 text-xs text-white placeholder:text-white/40"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleFolderClick(folder.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    activeFolderId === folder.id
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white/80",
                  )}
                >
                  <ImageIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 p-2 text-[10px] text-white/40">
            {selectedIds.size} / {maxFiles} selected
          </div>
        </div>

        {/* Main grid */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/10 p-3">
            <div className="flex items-center gap-2">
              {activeFolder.parentPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="h-8 gap-1 text-white/70 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              <span className="text-sm font-medium text-white">{activeFolder.name}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="h-8 gap-1.5 text-white/70 hover:text-white"
              >
                {isAllSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {isAllSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>
          </div>

          <div
            ref={gridContainerRef}
            className="flex-1 overflow-y-auto p-3"
          >
            {visibleItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/40">
                <ImageIcon className="h-10 w-10" />
                <p className="text-sm">No media found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {visibleItems.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const isPreview = previewItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        toggleItem(item.id);
                        setPreviewItemId(item.id);
                      }}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                        isSelected
                          ? "border-blue-500 ring-2 ring-blue-500/30"
                          : "border-transparent hover:border-white/30",
                      )}
                    >
                      {item.kind === "video" ? (
                        <video
                          src={item.url}
                          className="h-full w-full object-cover"
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={item.url}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity" />

                      {item.kind === "video" && (
                        <div className="absolute top-1.5 right-1.5 rounded bg-black/70 p-1">
                          <Film className="h-3 w-3 text-white" />
                        </div>
                      )}

                      {isSelected && (
                        <div className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-blue-600">
                          <CheckSquare className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}

                      {isPreview && (
                        <div className="absolute inset-0 rounded-lg border-2 border-blue-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/10 p-3">
            <div className="text-xs text-white/50">
              {selectedIds.size} of {maxFiles} max
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="h-9 rounded-xl border-white/10 bg-white/5 px-4 text-sm text-white hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={selectedIds.size === 0}
                className="h-9 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
              </Button>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        {previewItem && (
          <div className="hidden w-72 border-l border-white/10 bg-black/30 md:block">
            <div className="p-3">
              <h3 className="text-xs font-semibold text-white/70">Preview</h3>
            </div>
            <div className="flex items-center justify-center p-3">
              {previewItem.kind === "video" ? (
                <video
                  src={previewItem.url}
                  className="max-h-[60vh] max-w-full rounded-lg object-contain"
                  controls
                  muted
                />
              ) : (
                <img
                  src={previewItem.url}
                  alt={previewItem.name}
                  className="max-h-[60vh] max-w-full rounded-lg object-contain"
                />
              )}
            </div>
            <div className="px-3 pb-3">
              <p className="truncate text-xs text-white/60">{previewItem.name}</p>
              <p className="mt-1 text-[10px] text-white/40">
                {previewItem.kind === "video" ? "Video" : "Image"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
