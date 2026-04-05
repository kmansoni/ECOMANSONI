import { useRef } from "react";
import { Image, FileText, MapPin, UserPlus, Camera } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";

const MAX_ALBUM_FILES = 10;

interface AttachmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFile: (file: File, type: "image" | "video" | "document") => void;
  onSelectFiles?: (files: File[], types: ("image" | "video")[]) => void;
  onSelectLocation?: () => void;
  onContactShare?: () => void;
  onOpenCamera?: () => void;
}

export function AttachmentSheet({
  open,
  onOpenChange,
  onSelectFile,
  onSelectFiles,
  onSelectLocation,
  onContactShare,
  onOpenCamera,
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
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      e.target.value = "";
      return;
    }

    if (fileList.length === 1) {
      const file = fileList[0];
      const type = file.type.startsWith("video/") ? "video" as const : "image" as const;
      onSelectFile(file, type);
      onOpenChange(false);
    } else if (onSelectFiles) {
      const files: File[] = [];
      const types: ("image" | "video")[] = [];
      const count = Math.min(fileList.length, MAX_ALBUM_FILES);

      if (fileList.length > MAX_ALBUM_FILES) {
        toast.error(`Максимум ${MAX_ALBUM_FILES} файлов в альбоме`);
      }

      for (let i = 0; i < count; i++) {
        files.push(fileList[i]);
        types.push(fileList[i].type.startsWith("video/") ? "video" : "image");
      }
      onSelectFiles(files, types);
      onOpenChange(false);
    } else {
      const file = fileList[0];
      const type = file.type.startsWith("video/") ? "video" as const : "image" as const;
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
    ...(onOpenCamera
      ? [
          {
            icon: Camera,
            label: "Камера",
            onClick: () => {
              onOpenCamera();
              onOpenChange(false);
            },
          },
        ]
      : []),
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
    ...(onContactShare ? [{
      icon: UserPlus,
      label: "Контакт",
      onClick: () => { onContactShare(); onOpenChange(false); },
    }] : []),
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
          multiple
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
