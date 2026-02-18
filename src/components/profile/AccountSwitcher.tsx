import { Plus, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  isActive: boolean;
}

const mockAccounts: Account[] = [
  {
    id: "1",
    username: "alex_ivanov",
    displayName: "Александр Иванов",
    avatar: "https://i.pravatar.cc/150?img=32",
    isActive: true,
  },
  {
    id: "2",
    username: "work_account",
    displayName: "Рабочий аккаунт",
    avatar: "https://i.pravatar.cc/150?img=12",
    isActive: false,
  },
];

interface AccountSwitcherProps {
  currentUsername: string;
}

export function AccountSwitcher({ currentUsername }: AccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState(mockAccounts);

  const handleSwitchAccount = (accountId: string) => {
    setAccounts(prev =>
      prev.map(acc => ({
        ...acc,
        isActive: acc.id === accountId,
      }))
    );
    setOpen(false);
  };

  const handleAddAccount = () => {
    // TODO: Navigate to auth page or show login modal
    console.log("Add account");
    setOpen(false);
  };

  const activeAccount = accounts.find(acc => acc.isActive);

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
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => handleSwitchAccount(account.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                account.isActive 
                  ? "bg-primary/10" 
                  : "hover:bg-muted"
              )}
            >
              <img
                src={account.avatar}
                alt={account.displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
              <div className="flex-1 text-left">
                <p className="font-medium text-foreground">{account.username}</p>
                <p className="text-sm text-muted-foreground">{account.displayName}</p>
              </div>
              {account.isActive && (
                <Check className="w-5 h-5 text-primary" />
              )}
            </button>
          ))}
          
          {/* Add Account Button */}
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
        
        {/* Safe area padding */}
        <div className="h-6" />
      </DrawerContent>
    </Drawer>
  );
}
