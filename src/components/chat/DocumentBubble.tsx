/**
 * DocumentBubble — Telegram-style document attachment in message bubble.
 *
 * Shows: file icon (by extension), filename, file size, download button.
 * PDF files: inline preview option.
 * Click: download file.
 */

import { FileText, FileArchive, FileSpreadsheet, FileImage, File, Download, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

interface DocumentBubbleProps {
  fileName: string;
  fileUrl: string;
  fileSize: number; // bytes
  mimeType?: string;
}

// Map extension → icon + color
const FILE_ICONS: Record<string, { icon: typeof File; color: string }> = {
  pdf: { icon: FileText, color: "text-red-400" },
  doc: { icon: FileText, color: "text-blue-400" },
  docx: { icon: FileText, color: "text-blue-400" },
  xls: { icon: FileSpreadsheet, color: "text-green-400" },
  xlsx: { icon: FileSpreadsheet, color: "text-green-400" },
  zip: { icon: FileArchive, color: "text-yellow-400" },
  rar: { icon: FileArchive, color: "text-yellow-400" },
  "7z": { icon: FileArchive, color: "text-yellow-400" },
  png: { icon: FileImage, color: "text-purple-400" },
  jpg: { icon: FileImage, color: "text-purple-400" },
  jpeg: { icon: FileImage, color: "text-purple-400" },
  svg: { icon: FileImage, color: "text-purple-400" },
};

function getExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function DocumentBubble({ fileName, fileUrl, fileSize, mimeType }: DocumentBubbleProps) {
  const [showPreview, setShowPreview] = useState(false);
  const ext = getExtension(fileName);
  const fileInfo = FILE_ICONS[ext] ?? { icon: File, color: "text-gray-400" };
  const IconComponent = fileInfo.icon;
  const isPdf = ext === "pdf" || mimeType === "application/pdf";

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  };

  return (
    <div className="space-y-2">
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={handleDownload}
        className="flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-colors min-w-[200px]"
      >
        {/* File icon */}
        <div className={`w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 ${fileInfo.color}`}>
          <IconComponent className="w-5 h-5" />
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{fileName}</p>
          <p className="text-xs text-white/50">{formatFileSize(fileSize)}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPdf && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowPreview(!showPreview); }}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
              title="Предпросмотр"
            >
              <Eye className="w-4 h-4 text-white/60" />
            </button>
          )}
          <div className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center">
            <Download className="w-4 h-4 text-white/60" />
          </div>
        </div>
      </motion.div>

      {/* PDF inline preview */}
      {isPdf && showPreview && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 300, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="rounded-lg overflow-hidden border border-white/10"
        >
          <iframe
            src={`${fileUrl}#toolbar=0`}
            className="w-full h-[300px] bg-white"
            title={fileName}
          />
        </motion.div>
      )}
    </div>
  );
}
