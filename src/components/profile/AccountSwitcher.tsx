import { Plus, Check, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useMultiAccount } from "@/contexts/MultiAccountContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AccountSwitcherProps {
  currentUsername: string;
}

export function AccountSwitcher({ currentUsername }: AccountSwitcherProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { accounts, activeAccountId, switchAccount, isSwitchingAccount } = useMultiAccount();

  const handleSwitchAccount = async (accountId: string) => {
    if (accountId === activeAccountId || isSwitchingAccount) return;
    await switchAccount(accountId);
    setOpen(false);
  };

  const handleAddAccount = () => {
    setOpen(false);
    navigate("/auth");
  };

  const getDisplayName = (entry: typeof accounts[number]) => {
    const p = entry.profile;
    return p?.display_name || p?.displayName || p?.username || "Аккаунт";
  };

  const getUsername = (entry: typeof accounts[number]) => {
    const p = entry.profile;
    return p?.username || entry.accountId.slice(0, 8);
  };

  const getAvatar = (entry: typeof accounts[number]) => {
    const p = entry.profile;
    return p?.avatar_url || p?.avatarUrl || undefined;
  };

  if (accounts.length <= 1) {
    return (
      <span className="font-semibold text-lg">{currentUsername}</span>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1 hover:opacity-80 transition-opacity">
          <span className="font-semibold text-lg">{currentUsername}</span>
          <ChevronDown className="w-4 h-4 text-primary" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-card border-border">
        <DrawerHeader className="border-b border-border pb-4">
          <DrawerTitle className="text-center">Сменить аккаунт</DrawerTitle>
        </DrawerHeader>
        
        <div className="p-4 space-y-2">
          {accounts.map((entry) => {
            const isActive = entry.accountId === activeAccountId;
            const switching = isSwitchingAccount && !isActive;
            return (
              <button
                key={entry.accountId}
                onClick={() => handleSwitchAccount(entry.accountId)}
                disabled={switching}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                  isActive ? "bg-primary/10" : "hover:bg-muted",
                  switching && "opacity-50"
                )}
              >
                <Avatar className="w-12 h-12">
                  <AvatarImage src={getAvatar(entry)} alt={getDisplayName(entry)} />
                  <AvatarFallback>{getDisplayName(entry)[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">{getUsername(entry)}</p>
                  <p className="text-sm text-muted-foreground">{getDisplayName(entry)}</p>
                </div>
                {isActive && <Check className="w-5 h-5 text-primary" />}
                {switching && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
              </button>
            );
          })}
          
          <button
            onClick={handleAddAccount}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Plus className="w-6 h-6 text-foreground" />
            </div>
            <p className="font-medium text-foreground">Добавить аккаунт</p>
          </button>
        </div>
        
        <div className="h-6" />
      </DrawerContent>
    </Drawer>
  );
}
