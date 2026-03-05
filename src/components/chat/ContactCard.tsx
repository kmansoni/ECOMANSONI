/**
 * ContactCard — renders a shared contact in a message bubble.
 */

import { User, Phone, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface ContactCardProps {
  name: string;
  phone: string;
}

export function ContactCard({ name, phone }: ContactCardProps) {
  const handleCall = () => {
    window.open(`tel:${phone}`, "_self");
  };

  const handleAddContact = () => {
    // Copy phone to clipboard as a simple "add contact" action
    navigator.clipboard.writeText(`${name}: ${phone}`).then(() => {
      toast.success("Контакт скопирован");
    }).catch(() => {
      toast.error("Не удалось скопировать");
    });
  };

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 min-w-[200px]"
    >
      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
        <User className="w-5 h-5 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        <p className="text-xs text-white/50">{phone}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleCall}
          className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
          title="Позвонить"
        >
          <Phone className="w-4 h-4 text-green-400" />
        </button>
        <button
          onClick={handleAddContact}
          className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
          title="Добавить контакт"
        >
          <UserPlus className="w-4 h-4 text-blue-400" />
        </button>
      </div>
    </motion.div>
  );
}
