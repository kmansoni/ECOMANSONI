import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StarsPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (amount: number) => void;
}

const PRESET_AMOUNTS = [100, 300, 500, 1000, 2000, 5000];

export function StarsPurchaseModal({ open, onOpenChange, onSelect }: StarsPurchaseModalProps) {
  const [customAmount, setCustomAmount] = useState("");

  const handleSelect = (amount: number) => {
    onSelect(amount);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Купить Telegram Stars</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-2 py-4">
          {PRESET_AMOUNTS.map(amount => (
            <Button
              key={amount}
              variant="outline"
              onClick={() => handleSelect(amount)}
              className="flex flex-col h-auto py-3"
            >
              <span className="text-lg font-bold">{amount}</span>
              <span className="text-xs text-muted-foreground">⭐</span>
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Своя сумма"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md"
            min="100"
            max="100000"
          />
          <Button
            onClick={() => {
              const amount = parseInt(customAmount);
              if (amount >= 100) handleSelect(amount);
            }}
            disabled={!customAmount || parseInt(customAmount) < 100}
          >
            Купить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}