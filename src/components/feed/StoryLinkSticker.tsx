import { Link2, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

interface StoryLinkStickerProps {
  url: string;
  text?: string;
  interactive?: boolean;
}

export function StoryLinkSticker({ url, text, interactive = true }: StoryLinkStickerProps) {
  const display = text || url.replace(/^https?:\/\//, "").split("/")[0];

  const handleClick = () => {
    if (!interactive) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="flex items-center gap-2 bg-white/90 backdrop-blur-sm text-black rounded-2xl px-3 py-2 shadow-lg"
    >
      <Link2 className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-medium truncate max-w-[160px]">{display}</span>
      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-zinc-400" />
    </motion.button>
  );
}
