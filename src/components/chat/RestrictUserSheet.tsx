/**
 * src/components/chat/RestrictUserSheet.tsx — Sheet для ограничения пользователя.
 *
 * Аналог Instagram Restrict: мягкая блокировка без уведомления.
 * Сообщения ограниченного пользователя видны только ему.
 */

import { useCallback } from "react";
import { ShieldAlert, ShieldOff, Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useRestrict } from "@/hooks/useRestrict";

interface RestrictUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetDisplayName: string;
}

export function RestrictUserSheet({
  open,
  onOpenChange,
  targetUserId,
  targetDisplayName,
}: RestrictUserSheetProps) {
  const { isRestricted, restrictUser, unrestrictUser, loading } = useRestrict();
  const restricted = isRestricted(targetUserId);

  const handleToggle = useCallback(async () => {
    if (restricted) {
      await unrestrictUser(targetUserId);
    } else {
      await restrictUser(targetUserId);
    }
    onOpenChange(false);
  }, [restricted, restrictUser, unrestrictUser, targetUserId, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-zinc-950 border-white/10">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            {restricted ? (
              <ShieldOff className="w-5 h-5 text-green-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-orange-400" />
            )}
            {restricted ? "Снять ограничение" : "Ограничить пользователя"}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="bg-white/5 rounded-xl p-4 space-y-3">
            <p className="text-sm text-white/80">
              {restricted
                ? `Вы снимаете ограничение с ${targetDisplayName}. Пользователь снова сможет свободно отправлять вам сообщения.`
                : `Вы ограничиваете ${targetDisplayName}. Это мягкая блокировка:`}
            </p>

            {!restricted && (
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-white/60">
                    Сообщения от этого пользователя будут видны только ему
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-white/60">
                    Вы сможете просмотреть и одобрить сообщения вручную
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-white/60">
                    Пользователь не получит уведомление об ограничении
                  </span>
                </li>
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-white/10"
              disabled={loading}
            >
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={handleToggle}
              disabled={loading}
              className={`flex-1 ${
                restricted
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              {loading
                ? "Обработка..."
                : restricted
                  ? "Снять ограничение"
                  : "Ограничить"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
