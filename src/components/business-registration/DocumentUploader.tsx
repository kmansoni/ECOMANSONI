import { useMemo } from "react";
import { FileText, CheckCircle2, AlertCircle, Trash2, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  type BizDocType,
  type BizLegalDocument,
  DOC_TYPE_TITLES,
  uploadDocument,
  deleteDocument,
  getDocumentSignedUrl,
} from "@/lib/bizRegistrationApi";

interface Props {
  applicationId: string;
  docType: BizDocType;
  required?: boolean;
  documents: BizLegalDocument[];
  disabled?: boolean;
  onUploaded?: (doc: BizLegalDocument) => void;
  onDeleted?: (id: string) => void;
  hint?: string;
}

export function DocumentUploader(props: Props) {
  const { applicationId, docType, required, documents, disabled, onUploaded, onDeleted, hint } = props;

  const own = useMemo(
    () => documents.filter((d) => d.doc_type === docType),
    [documents, docType],
  );

  async function handleFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const doc = await uploadDocument({ applicationId, docType, file });
      toast.success("Файл загружен");
      onUploaded?.(doc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить файл");
    }
  }

  async function handleView(doc: BizLegalDocument) {
    try {
      const url = await getDocumentSignedUrl(doc.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Не удалось открыть документ");
    }
  }

  async function handleDelete(doc: BizLegalDocument) {
    if (!window.confirm(`Удалить "${doc.file_name}"?`)) return;
    try {
      await deleteDocument(doc);
      onDeleted?.(doc.id);
      toast.success("Файл удалён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить");
    }
  }

  const uploaded = own.length > 0;

  return (
    <div className="glass-window rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 shrink-0" />
            <div className="font-medium truncate">{DOC_TYPE_TITLES[docType]}</div>
            {required && <Badge variant="outline" className="text-xs">обязательно</Badge>}
            {uploaded && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {required && !uploaded && <AlertCircle className="w-4 h-4 text-amber-500" />}
          </div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        {!disabled && (
          <label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={handleFile}
            />
            <Button asChild size="sm" variant="secondary">
              <span>Загрузить</span>
            </Button>
          </label>
        )}
      </div>

      {own.length > 0 && (
        <ul className="space-y-2">
          {own.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 text-sm rounded-xl border px-3 py-2 bg-background/40"
            >
              <div className="min-w-0">
                <div className="truncate">{d.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  {(d.size_bytes / 1024).toFixed(0)} KB · {d.mime_type}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => handleView(d)} title="Открыть">
                  <Eye className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleView(d)} title="Скачать">
                  <Download className="w-4 h-4" />
                </Button>
                {!disabled && (
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(d)} title="Удалить">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
