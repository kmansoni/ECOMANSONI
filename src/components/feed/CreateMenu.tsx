import { X, Image, Film, Radio, Sparkles, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: string) => void;
}

const menuItems = [
  { id: "reels", label: "Видео Reels", icon: Film },
  { id: "post", label: "Публикация", icon: Image },
  { id: "story", label: "История", icon: Camera },
  { id: "live", label: "Эфир", icon: Radio },
];

export function CreateMenu({ isOpen, onClose, onSelect }: CreateMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999]" onClick={onClose}>
      {/* Backdrop - covers everything including bottom nav */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      
      {/* Liquid Glass Menu */}
      <div 
        className="absolute bottom-0 left-0 right-0 overflow-hidden animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom) + 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glass container */}
        <div className="mx-3 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/30 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          {/* Glass highlight */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-white/5 pointer-events-none rounded-3xl" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2 relative">
            <div className="w-9 h-1 bg-white/30 rounded-full" />
          </div>

          {/* Title */}
          <div className="px-6 pb-4 relative">
            <h2 className="text-xl font-semibold text-center text-white">Создать</h2>
          </div>

          {/* Menu Items */}
          <div className="px-4 pb-4 relative">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-white/10 active:bg-white/20 transition-colors"
                >
                  <div className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[17px] font-normal text-white">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
