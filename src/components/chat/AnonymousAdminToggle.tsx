/**
 * src/components/chat/AnonymousAdminToggle.tsx
 * Switch for admins/owners to enable anonymous mode in a group.
 * When enabled, their admin actions appear as "Действие администратора" to others.
 */
import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAnonymousAdmin } from "@/hooks/useAnonymousAdmin";
import { cn } from "@/lib/utils";

interface AnonymousAdminToggleProps {
  groupId: string;
  /** Current user role in the group */
  userRole: "owner" | "admin" | "member";
  className?: string;
}

export function AnonymousAdminToggle({
  groupId,
  userRole,
  className,
}: AnonymousAdminToggleProps) {
  const { isAnonymous, toggleAnonymous, isLoading } = useAnonymousAdmin();
  const [checked, setChecked] = useState(false);

  // Load current state on mount
  useEffect(() => {
    if (userRole === "member") return;
    void isAnonymous(groupId).then(setChecked);
  }, [groupId, userRole]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only admins and owners can toggle
  if (userRole === "member") return null;

  const handleChange = async (value: boolean) => {
    setChecked(value); // optimistic
    const success = await toggleAnonymous(groupId, value);
    if (!success) {
      setChecked(!value); // rollback on failure
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
        "bg-card/80 border-white/10",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <Label htmlFor={`anon-admin-${groupId}`} className="cursor-pointer font-medium text-sm">
            Остаться анонимным
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ваши действия будут показаны как «Действие администратора»
          </p>
        </div>
      </div>
      <Switch
        id={`anon-admin-${groupId}`}
        checked={checked}
        onCheckedChange={handleChange}
        disabled={isLoading}
        aria-label="Анонимный режим администратора"
      />
    </div>
  );
}
