import EmojiPicker, { EmojiStyle, EmojiClickData, Theme, Categories } from "emoji-picker-react";
import { useTheme } from "next-themes";

interface EmojiStickerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiStickerPicker({
  open,
  onOpenChange,
  onEmojiSelect,
}: EmojiStickerPickerProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiSelect(emojiData.emoji);
  };

  if (!open) return null;

  return (
    <div className={`w-full border-t rounded-t-2xl overflow-hidden ${isDark ? 'bg-[#1c1c1e] border-white/10' : 'bg-[#f8f8f8] border-black/10'}`}>
      {/* Drag handle */}
      <div className="flex justify-center py-2">
        <div className={`w-10 h-1 rounded-full ${isDark ? 'bg-white/30' : 'bg-black/20'}`} />
      </div>
      
      {/* Custom styled emoji picker */}
      <div className="emoji-picker-ios">
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          emojiStyle={EmojiStyle.APPLE}
          theme={isDark ? Theme.DARK : Theme.LIGHT}
          width="100%"
          height={320}
          searchDisabled={false}
          skinTonesDisabled={false}
          lazyLoadEmojis={true}
          previewConfig={{ showPreview: false }}
          searchPlaceHolder="Поиск эмодзи"
          categories={[
            { name: "Недавние", category: Categories.SUGGESTED },
            { name: "Смайлики", category: Categories.SMILEYS_PEOPLE },
            { name: "Животные", category: Categories.ANIMALS_NATURE },
            { name: "Еда", category: Categories.FOOD_DRINK },
            { name: "Путешествия", category: Categories.TRAVEL_PLACES },
            { name: "Активности", category: Categories.ACTIVITIES },
            { name: "Объекты", category: Categories.OBJECTS },
            { name: "Символы", category: Categories.SYMBOLS },
            { name: "Флаги", category: Categories.FLAGS },
          ]}
        />
      </div>
      
      {/* iOS-style bottom safe area */}
      <div className={`safe-area-bottom ${isDark ? 'bg-[#1c1c1e]' : 'bg-[#f8f8f8]'}`} />
    </div>
  );
}
