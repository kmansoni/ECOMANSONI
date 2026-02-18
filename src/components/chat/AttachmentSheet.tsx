import { useRef } from "react";
import { Image, FileText, MapPin } from "lucide-react";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";

interface AttachmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFile: (file: File, type: "image" | "video" | "document") => void;
  onSelectLocation?: () => void;
}

export function AttachmentSheet({
  open,
  onOpenChange,
  onSelectFile,
  onSelectLocation,
}: AttachmentSheetProps) {
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const handleMediaSelect = () => {
    mediaInputRef.current?.click();
  };

  const handleDocumentSelect = () => {
    documentInputRef.current?.click();
  };

  const handleLocationSelect = () => {
    onSelectLocation?.();
    onOpenChange(false);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const type = file.type.startsWith("video/") ? "video" : "image";
      onSelectFile(file, type);
      onOpenChange(false);
    }
    e.target.value = "";
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file, "document");
      onOpenChange(false);
    }
    e.target.value = "";
  };

  const menuItems = [
    {
      icon: Image,
      label: "Фото или видео",
      onClick: handleMediaSelect,
    },
    {
      icon: FileText,
      label: "Документ",
      onClick: handleDocumentSelect,
    },
    {
      icon: MapPin,
      label: "Геопозиция",
      onClick: handleLocationSelect,
    },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-4 mb-4 rounded-2xl border-0 bg-card">
        <div className="py-2">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <item.icon className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleMediaChange}
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
          className="hidden"
          onChange={handleDocumentChange}
        />
      </DrawerContent>
    </Drawer>
  );
}
