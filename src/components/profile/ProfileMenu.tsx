import { motion, AnimatePresence } from "framer-motion";
import { Share2, Link, Flag, UserX, Settings, Archive, Bookmark, Users } from "lucide-react";
import { toast } from "sonner";

interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isOwnProfile: boolean;
  username?: string;
  onBlock?: () => void;
  onArchive?: () => void;
  onSettings?: () => void;
}

export function ProfileMenu({ isOpen, onClose, isOwnProfile, username, onBlock, onArchive, onSettings }: ProfileMenuProps) {
  const copyLink = () => {
    const url = `${window.location.origin}/profile/${username || ""}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"));
    onClose();
  };

  const share = () => {
    const url = `${window.location.origin}/profile/${username || ""}`;
    if (navigator.share) {
      navigator.share({ url });
    } else {
      copyLink();
    }
    onClose();
  };

  const ownItems = [
    { icon: Settings, label: "Настройки", action: () => { onSettings?.(); onClose(); } },
    { icon: Archive, label: "Архив", action: () => { onArchive?.(); onClose(); } },
    { icon: Share2, label: "Поделиться профилем", action: share },
    { icon: Link, label: "Скопировать ссылку", action: copyLink },
  ];

  const otherItems = [
    { icon: Share2, label: "Поделиться", action: share },
    { icon: Link, label: "Скопировать ссылку", action: copyLink },
    { icon: Flag, label: "Пожаловаться", action: () => { toast("Жалоба отправлена"); onClose(); }, danger: true },
    { icon: UserX, label: "Заблокировать", action: () => { onBlock?.(); onClose(); }, danger: true },
  ];

  const items = isOwnProfile ? ownItems : otherItems;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-3xl overflow-hidden pb-safe"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mt-3 mb-4" />
            <div className="pb-6">
              {items.map(({ icon: Icon, label, action, danger }: any) => (
                <button
                  key={label}
                  onClick={action}
                  className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors ${danger ? "text-red-400" : "text-foreground"}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-base">{label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
