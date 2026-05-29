import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, RefreshCw, Search, UserPlus, Users, Megaphone, Smartphone, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type ContactEntry = {
  key: string;
  displayName: string;
  avatarUrl: string | null;
  phone: string | null;
  userId: string | null;
  source: "device" | "app";
};

interface ContactsHubSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
  onCreateBot: () => void;
}

export function ContactsHubSheet({
  open,
  onOpenChange,
  onCreateGroup,
  onCreateChannel,
  onCreateBot,
}: ContactsHubSheetProps) {
  const [search, setSearch] = useState("");
  const [loadingDeviceContacts, setLoadingDeviceContacts] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<ContactEntry[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [sheetHeightVh, setSheetHeightVh] = useState(64);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(64);
  const isDraggingRef = useRef(false);

  const MIN_SHEET_VH = 46;
  const MAX_SHEET_VH = 92;

  const isContactPickerSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean((navigator as any)?.contacts?.select);

  const clampSheetVh = (value: number) => Math.max(MIN_SHEET_VH, Math.min(MAX_SHEET_VH, value));

  const startResize = (clientY: number) => {
    isDraggingRef.current = true;
    dragStartYRef.current = clientY;
    dragStartHeightRef.current = sheetHeightVh;
  };

  const onHandlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    startResize(event.clientY);
  };

  const onHandleTouchStart: React.TouchEventHandler<HTMLButtonElement> = (event) => {
    const point = event.touches?.[0];
    if (!point) return;
    startResize(point.clientY);
  };

  useEffect(() => {
    if (!open) return;
    setSheetHeightVh((prev) => clampSheetVh(prev));
  }, [open]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = event.clientY - dragStartYRef.current;
      const deltaVh = (deltaY / window.innerHeight) * 100;
      setSheetHeightVh(clampSheetVh(dragStartHeightRef.current - deltaVh));
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isDraggingRef.current) return;
      const point = event.touches?.[0];
      if (!point) return;
      const deltaY = point.clientY - dragStartYRef.current;
      const deltaVh = (deltaY / window.innerHeight) * 100;
      setSheetHeightVh(clampSheetVh(dragStartHeightRef.current - deltaVh));
      event.preventDefault();
    };

    const stopDragging = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", stopDragging);
    window.addEventListener("touchcancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stopDragging);
      window.removeEventListener("touchcancel", stopDragging);
    };
  }, []);

  const importDeviceContacts = async () => {
    if (!isContactPickerSupported) {
      toast.info("Контакты телефона недоступны в этом браузере");
      return;
    }

    setLoadingDeviceContacts(true);
    try {
      const selected = await (navigator as any).contacts.select(["name", "tel"], { multiple: true });
      const mapped: ContactEntry[] = (selected || [])
        .map((c: any, index: number) => {
          const rawName = Array.isArray(c?.name) ? c.name[0] : c?.name;
          const rawPhone = Array.isArray(c?.tel) ? c.tel[0] : c?.tel;
          const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Контакт";
          const phone = typeof rawPhone === "string" && rawPhone.trim() ? rawPhone.trim() : null;
          if (!phone) return null;
          const keyPhone = phone.replace(/\s+/g, "");
          return {
            key: `device:${keyPhone || index}`,
            displayName: name,
            avatarUrl: null,
            phone,
            userId: null,
            source: "device" as const,
          };
        })
        .filter((item: ContactEntry | null): item is ContactEntry => Boolean(item));

      setDeviceContacts((prev) => {
        const map = new Map<string, ContactEntry>();
        for (const item of [...prev, ...mapped]) {
          map.set(item.key, item);
        }
        return Array.from(map.values());
      });

      toast.success("Контакты телефона добавлены");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось прочитать контакты телефона";
      if (!message.toLowerCase().includes("abort")) {
        toast.error(message);
      }
    } finally {
      setLoadingDeviceContacts(false);
    }
  };

  const importVcfContacts = async (file?: File | null) => {
    if (!file) return;
    setLoadingDeviceContacts(true);
    try {
      const text = await file.text();
      const cards = text.split(/END:VCARD/i);
      const parsed: ContactEntry[] = [];

      for (const card of cards) {
        const fnMatch = card.match(/(?:^|\n)FN[^:]*:([^\n\r]+)/i);
        const telMatches = [...card.matchAll(/(?:^|\n)TEL[^:]*:([^\n\r]+)/gi)];
        const rawName = fnMatch?.[1]?.trim() || "Контакт";
        for (const tel of telMatches) {
          const phone = tel?.[1]?.trim();
          if (!phone) continue;
          const keyPhone = phone.replace(/\s+/g, "");
          parsed.push({
            key: `device:${keyPhone}`,
            displayName: rawName,
            avatarUrl: null,
            phone,
            userId: null,
            source: "device",
          });
        }
      }

      setDeviceContacts((prev) => {
        const map = new Map<string, ContactEntry>();
        for (const item of [...prev, ...parsed]) {
          map.set(item.key, item);
        }
        return Array.from(map.values());
      });

      if (parsed.length > 0) {
        toast.success(`Импортировано контактов: ${parsed.length}`);
      } else {
        toast.info("В VCF не найдены контакты с телефонами");
      }
    } catch {
      toast.error("Не удалось прочитать VCF-файл");
    } finally {
      setLoadingDeviceContacts(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filteredDeviceContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deviceContacts;
    return deviceContacts.filter((contact) => {
      const byName = contact.displayName.toLowerCase().includes(q);
      const byPhone = (contact.phone || "").toLowerCase().includes(q);
      return byName || byPhone;
    });
  }, [deviceContacts, search]);

  const filteredContacts = useMemo(() => {
    return [...filteredDeviceContacts]
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" }));
  }, [filteredDeviceContacts]);

  const groupedContacts = useMemo(() => {
    const map = new Map<string, ContactEntry[]>();
    for (const contact of filteredContacts) {
      const first = contact.displayName.trim().charAt(0).toUpperCase();
      const letter = /[A-ZА-ЯЁ]/.test(first) ? first : "#";
      const existing = map.get(letter) || [];
      existing.push(contact);
      map.set(letter, existing);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "ru", { sensitivity: "base" }))
      .map(([letter, contacts]) => ({ letter, contacts }));
  }, [filteredContacts]);

  const alphabet = useMemo(() => groupedContacts.map((section) => section.letter), [groupedContacts]);

  const createManualContact = () => {
    const name = manualName.trim();
    const phone = manualPhone.trim();
    if (!name || !phone) {
      toast.error("Введите имя и телефон");
      return;
    }

    const keyPhone = phone.replace(/\s+/g, "");
    setDeviceContacts((prev) => [
      {
        key: `manual:${keyPhone}:${Date.now()}`,
        displayName: name,
        avatarUrl: null,
        phone,
        userId: null,
        source: "device",
      },
      ...prev,
    ]);
    setManualName("");
    setManualPhone("");
    setShowManualCreate(false);
    toast.success("Контакт создан");
  };

  const handleContactClick = async (contact: ContactEntry) => {
    if (contact.phone) {
      try {
        await navigator.clipboard.writeText(contact.phone);
        toast.success("Телефон скопирован");
      } catch {
        toast.info(contact.phone);
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideCloseButton
      className="chat-glass-scope rounded-t-3xl p-0 overflow-hidden flex flex-col"
      style={{ height: `${sheetHeightVh}vh`, minHeight: `${MIN_SHEET_VH}vh`, maxHeight: `${MAX_SHEET_VH}vh` }}
        overlayClassName="bg-black/60 backdrop-blur-sm"
      >
        <div className="pt-2 pb-1 flex justify-center border-b border-white/5">
          <button
            type="button"
            onPointerDown={onHandlePointerDown}
            onTouchStart={onHandleTouchStart}
            aria-label="Изменить высоту окна"
            className="h-5 w-32 flex items-center justify-center touch-none"
            style={{ touchAction: "none", cursor: "ns-resize" }}
          >
            <span className="block h-1 w-24 rounded-full bg-white/70" />
          </button>
        </div>
        <div className="p-4 pb-3 border-b border-white/10 bg-white/[0.03]">
          <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2 min-h-10">
            <button
              onClick={() => onOpenChange(false)}
              className="chat-glass-icon-btn h-9 w-9 rounded-full flex items-center justify-center"
              aria-label="Закрыть окно контактов"
            >
              <X className="h-5 w-5" />
            </button>
            <SheetHeader className="space-y-0">
              <SheetTitle className="text-white text-[1.55rem] font-semibold tracking-tight leading-none text-center drop-shadow-[0_1px_10px_rgba(0,0,0,0.35)]">
                Написать сообщение
              </SheetTitle>
            </SheetHeader>
            <div aria-hidden className="h-9 w-9" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-white/45 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск"
                className="glass-input h-11 pl-9 pr-3 rounded-full w-full text-base"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vcf,text/vcard"
              className="hidden"
              onChange={(e) => void importVcfContacts(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="px-4">
          <button
            onClick={onCreateGroup}
            className="w-full h-14 flex items-center gap-3 text-left border-b border-white/10 text-cyan-400"
          >
            <Users className="h-5 w-5" />
            <span className="text-[1.05rem]">Создать группу</span>
          </button>
          <button
            onClick={() => setShowManualCreate((v) => !v)}
            className="w-full h-14 flex items-center gap-3 text-left border-b border-white/10 text-cyan-400"
          >
            <UserPlus className="h-5 w-5" />
            <span className="text-[1.05rem]">Создать контакт</span>
          </button>
          {showManualCreate && (
            <div className="py-3 px-1 border-b border-white/10 space-y-2">
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Имя"
                className="glass-input h-10 px-3 rounded-xl w-full text-sm"
              />
              <div className="flex items-center gap-2">
                <input
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="Телефон"
                  className="glass-input h-10 px-3 rounded-xl flex-1 text-sm"
                />
                <button
                  onClick={createManualContact}
                  className="chat-glass-chip h-10 px-3 rounded-xl text-sm font-medium"
                >
                  Сохранить
                </button>
              </div>
            </div>
          )}
          <button
            onClick={onCreateChannel}
            className="w-full h-14 flex items-center gap-3 text-left border-b border-white/10 text-cyan-400"
          >
            <Megaphone className="h-5 w-5" />
            <span className="text-[1.05rem]">Создать канал</span>
          </button>
          <button
            onClick={onCreateBot}
            className="w-full h-14 flex items-center gap-3 text-left border-b border-white/10 text-cyan-400"
          >
            <Bot className="h-5 w-5" />
            <span className="text-[1.05rem]">Создать чат-бот</span>
          </button>
          <button
            onClick={() => {
              if (isContactPickerSupported) {
                void importDeviceContacts();
                return;
              }
              fileInputRef.current?.click();
            }}
            disabled={loadingDeviceContacts}
            className="w-full h-14 flex items-center gap-3 text-left border-b border-white/10 text-cyan-400 disabled:opacity-60"
          >
            {loadingDeviceContacts ? <RefreshCw className="h-5 w-5 animate-spin" /> : isContactPickerSupported ? <Smartphone className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            <span className="text-[1.05rem]">{isContactPickerSupported ? "Обновить контакты телефона" : "Импортировать VCF-контакты"}</span>
          </button>
          {!isContactPickerSupported && (
            <p className="mt-2 text-sm text-white/80 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2">
              Ваш браузер не поддерживает прямой доступ к контактам. Используйте кнопку "Импортировать VCF-контакты".
            </p>
          )}
        </div>

        <div className="relative flex-1 min-h-0 mt-1">
          <div className="h-full min-h-0 overflow-y-auto px-4 pb-4 pr-8">
            {loadingDeviceContacts && filteredContacts.length === 0 ? (
              <div className="py-5 text-sm text-white/70">Загружаем контакты...</div>
            ) : filteredContacts.length === 0 ? (
              <div className="py-5 text-sm text-white/70">Контакты не найдены</div>
            ) : (
              groupedContacts.map((section) => (
                <div
                  key={section.letter}
                  id={`contacts-letter-${section.letter}`}
                  ref={(el) => {
                    sectionRefs.current[section.letter] = el;
                  }}
                >
                  <p className="pt-3 pb-1 text-white/65 font-semibold text-[1.02rem]">{section.letter}</p>
                  {section.contacts.map((contact) => (
                    <button
                      key={contact.key}
                      onClick={() => void handleContactClick(contact)}
                      className="w-full flex items-center gap-3 py-2.5 border-b border-white/10 text-left"
                    >
                      <GradientAvatar
                        name={contact.displayName}
                        seed={contact.userId || contact.phone || contact.key}
                        avatarUrl={contact.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[1.06rem] leading-tight font-medium text-white truncate">{contact.displayName}</p>
                        <p className="text-sm text-white/70 truncate">{contact.phone || "Контакт"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {alphabet.length > 1 && (
            <div className="absolute right-0 top-2 bottom-3 z-20 w-5 flex flex-col items-center justify-center gap-[2px] text-cyan-300 bg-gradient-to-l from-black/20 to-transparent">
              {alphabet.map((letter) => (
                <button
                  key={letter}
                  className="text-[11px] font-semibold leading-none px-1 drop-shadow-[0_0_6px_rgba(0,0,0,0.55)]"
                  onClick={() => sectionRefs.current[letter]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  aria-label={`Перейти к букве ${letter}`}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
