/**
 * ContactShareSheet — sheet for sharing a contact card in chat.
 *
 * User enters name + phone manually (Contacts API requires HTTPS + user gesture
 * and is not universally supported). Sends as a special message type.
 */

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Phone, Send } from "lucide-react";
import { toast } from "sonner";

interface ContactShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendContact: (contact: { name: string; phone: string }) => void;
}

export function ContactShareSheet({ open, onOpenChange, onSendContact }: ContactShareSheetProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const handleSend = () => {
    const trimName = name.trim();
    const trimPhone = phone.trim();
    if (!trimName) {
      toast.error("Введите имя контакта");
      return;
    }
    if (!trimPhone) {
      toast.error("Введите номер телефона");
      return;
    }
    onSendContact({ name: trimName, phone: trimPhone });
    setName("");
    setPhone("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-foreground dark:text-white">Отправить контакт</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground dark:text-white/50">Имя</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Иванов"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground dark:text-white/50">Телефон</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 999 123-45-67"
                type="tel"
                className="pl-10"
              />
            </div>
          </div>

          <Button onClick={handleSend} className="w-full" size="lg">
            <Send className="w-4 h-4 mr-2" />
            Отправить контакт
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
