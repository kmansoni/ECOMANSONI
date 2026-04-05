import { motion, AnimatePresence } from "framer-motion";
import { Share2, Link, Flag, UserX, Settings, Archive, Bookmark, Users, Trash2, Briefcase, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { buildProfileUrl } from "@/lib/users/profileLinks";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isOwnProfile: boolean;
  username?: string;
  userId?: string;
  onBlock?: () => void;
  onArchive?: () => void;
  onSettings?: () => void;
}

export function ProfileMenu({ isOpen, onClose, isOwnProfile, username, userId, onBlock, onArchive, onSettings }: ProfileMenuProps) {
  const navigate = useNavigate();
  const copyLink = () => {
    const url = buildProfileUrl({ username, userId });
    navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"));
    onClose();
  };

  const share = () => {
    const url = buildProfileUrl({ username, userId });
    if (navigator.share) {
      navigator.share({ url });
    } else {
      copyLink();
    }
    onClose();
  };

  const reportUser = async () => {
    if (!userId) return;
    onClose();
    const db = supabase as SupabaseClient<any>;
    const { error } = await db.from("moderation_reports").insert({
      report_type: "other",
      reported_entity_type: "user",
      reported_entity_id: userId,
      reported_user_id: userId,
      reporter_id: (await supabase.auth.getUser()).data.user?.id ?? null,
    });
    if (error) {
      toast.error("Не удалось отправить жалобу");
    } else {
      toast.success("Жалоба отправлена");
    }
  };

  const ownItems = [
    { icon: Settings, label: "Настройки", action: () => { onSettings?.(); onClose(); } },
    { icon: Archive, label: "Архив", action: () => { onArchive?.(); onClose(); } },
    { icon: MapPin, label: "Люди рядом", action: () => { onClose(); navigate("/people-nearby"); } },
    { icon: Briefcase, label: "Бизнес-инструменты", action: () => { onClose(); navigate("/business"); } },
    { icon: Share2, label: "Поделиться профилем", action: share },
    { icon: Link, label: "Скопировать ссылку", action: copyLink },
    { icon: Trash2, label: "Удалить аккаунт", action: () => { onClose(); navigate("/delete-account"); }, danger: true },
  ];

  const otherItems = [
    { icon: Share2, label: "Поделиться", action: share },
    { icon: Link, label: "Скопировать ссылку", action: copyLink },
    { icon: Flag, label: "Пожаловаться", action: reportUser, danger: true },
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
