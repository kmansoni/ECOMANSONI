import { useState, useRef } from "react";
import { Check, X, Image as ImageIcon, Upload } from "lucide-react";

interface MultiGalleryPickerProps {
  onFilesSelect: (files: File[]) => void;
  maxFiles?: number;
  accept?: string;
}

export function MultiGalleryPicker({
  onFilesSelect,
  maxFiles = 10,
  accept = "image/*,video/*",
}: MultiGalleryPickerProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    const newFiles = [...selectedFiles, ...fileArray].slice(0, maxFiles);
    setSelectedFiles(newFiles);
    onFilesSelect(newFiles);
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelect(newFiles);
  };

  return (
    <div className="w-full">
      <div
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Click to select files or drag and drop
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {selectedFiles.length} / {maxFiles} files selected
        </p>
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {selectedFiles.map((file, index) => (
            <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <button
                onClick={() => removeFile(index)}
                className="absolute top-1 right-1 p-1 bg-background/80 rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}