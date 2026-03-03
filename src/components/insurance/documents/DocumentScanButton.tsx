import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DocumentScanner } from "./DocumentScanner";
import type { DocumentScannerProps } from "./DocumentScanner";

interface DocumentScanButtonProps {
  documentType: DocumentScannerProps['documentType'];
  onFieldsFilled: (fields: Record<string, string>) => void;
  className?: string;
}

export function DocumentScanButton({ documentType, onFieldsFilled, className }: DocumentScanButtonProps) {
  const [open, setOpen] = useState(false);

  const handleRecognized = (data: Record<string, string>) => {
    onFieldsFilled(data);
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <Camera className="w-4 h-4 mr-2" />
        Сканировать документ
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <DocumentScanner
            documentType={documentType}
            onRecognized={handleRecognized}
            onClose={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
