import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSecretChat } from "@/hooks/useSecretChat";
import { GradientAvatar } from "@/components/ui/gradient-avatar";

interface Contact {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface CreateSecretChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (conversationId: string) => void;
}

const TTL_OPTIONS = [
  { label: "30 сек", value: 30 },
  { label: "1 мин", value: 60 },
  { label: "5 мин", value: 300 },
  { label: "1 час", value: 3600 },
  { label: "1 день", value: 86400 },
  { label: "Нет", value: 0 },
];

export function CreateSecretChatSheet({ open, onOpenChange, onCreated }: CreateSecretChatSheetProps) {
  const { user } = useAuth();
  const { initiateSecretChat } = useSecretChat(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [ttl, setTtl] = useState(30);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    (supabase as any)
      .from("profiles")
      .select("id, display_name, avatar_url")
      .neq("id", user.id)
      .limit(50)
      .then(({ data }: { data: Contact[] | null }) => {
        setContacts(data || []);
      });
  }, [open, user]);

  const filtered = contacts.filter((c) =>
    (c.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!selectedContact) return;
    setCreating(true);
    const result = await initiateSecretChat(selectedContact.id, ttl);
    setCreating(false);
    if (result && "conversationId" in result && result.conversationId) {
      onCreated?.(result.conversationId as string);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#1c1c1e] border-white/10 rounded-t-2xl max-h-[85vh] flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2 text-white">
            <Lock className="w-5 h-5 text-emerald-400" />
            Секретный чат
          </SheetTitle>
        </SheetHeader>

        {/* Description */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0">
          <Shield className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-300/80">
            Секретные чаты используют E2E шифрование. Сообщения не хранятся на сервере.
          </p>
        </div>

        {/* Search contacts */}
        <Input
          placeholder="Поиск контакта..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/40 shrink-0"
        />

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedContact(c)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                selectedContact?.id === c.id
                  ? "bg-emerald-500/20 border border-emerald-500/30"
                  : "hover:bg-white/5"
              }`}
            >
              <GradientAvatar name={c.display_name || "?"} seed={c.id} avatarUrl={c.avatar_url} size="sm" />
              <span className="text-white text-sm">{c.display_name || "Пользователь"}</span>
            </button>
          ))}
        </div>

        {/* TTL */}
        <div className="shrink-0 space-y-2">
          <p className="text-xs text-white/50">Таймер самоуничтожения по умолчанию</p>
          <div className="flex flex-wrap gap-2">
            {TTL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTtl(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  ttl === opt.value
                    ? "bg-emerald-500 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleCreate}
          disabled={!selectedContact || creating}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
        >
          {creating ? "Создание..." : "Создать секретный чат"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
