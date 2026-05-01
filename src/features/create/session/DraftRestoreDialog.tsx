import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, RefreshCw, Trash2 } from "lucide-react";

interface DraftRestoreDialogProps {
  isOpen: boolean;
  draftTimestamp?: number;
  onRestore: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function DraftRestoreDialog({
  isOpen,
  draftTimestamp,
  onRestore,
  onDiscard,
  onCancel,
}: DraftRestoreDialogProps) {
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "unknown time";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-primary" />
          Continue Draft?
        </DialogTitle>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You have an unsaved draft from{" "}
            <strong>{formatDate(draftTimestamp)}</strong>.
            Would you like to continue where you left off?
          </p>
          
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onDiscard}>
              <Trash2 className="w-4 h-4 mr-2" />
              Start Fresh
            </Button>
            <Button onClick={onRestore}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Continue Draft
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}