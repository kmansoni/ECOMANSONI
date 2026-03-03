import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Image, Video, FileText } from 'lucide-react';

interface ReplyMessage {
  id: string;
  content: string;
  senderName: string;
  mediaType?: string;
}

interface ReplyPreviewProps {
  replyTo: ReplyMessage | null;
  onCancel: () => void;
}

function getMediaLabel(mediaType?: string) {
  switch (mediaType) {
    case 'voice': return { icon: <Mic className="w-3 h-3" />, label: 'Голосовое' };
    case 'image': return { icon: <Image className="w-3 h-3" />, label: 'Фото' };
    case 'video': return { icon: <Video className="w-3 h-3" />, label: 'Видео' };
    default: return null;
  }
}

export function ReplyPreview({ replyTo, onCancel }: ReplyPreviewProps) {
  return (
    <AnimatePresence>
      {replyTo && (
        <motion.div
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800/80 border-l-4 border-blue-500 mx-2 mb-1 rounded-r-lg"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-blue-400 text-xs font-medium truncate">{replyTo.senderName}</p>
            <div className="flex items-center gap-1 text-zinc-400 text-xs truncate">
              {getMediaLabel(replyTo.mediaType) ? (
                <>
                  {getMediaLabel(replyTo.mediaType)!.icon}
                  <span>{getMediaLabel(replyTo.mediaType)!.label}</span>
                </>
              ) : (
                <span className="truncate">{replyTo.content}</span>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Мини-превью цитаты внутри пузыря сообщения
export function ReplyQuote({ replyTo }: { replyTo: ReplyMessage }) {
  const media = getMediaLabel(replyTo.mediaType);
  return (
    <div className="flex items-start gap-1.5 mb-1.5 pl-2 border-l-2 border-white/30 opacity-80">
      <div className="min-w-0">
        <p className="text-xs font-medium text-white/70 truncate">{replyTo.senderName}</p>
        <div className="flex items-center gap-1 text-xs text-white/50 truncate">
          {media ? (
            <>
              {media.icon}
              <span>{media.label}</span>
            </>
          ) : (
            <span className="truncate">{replyTo.content}</span>
          )}
        </div>
      </div>
    </div>
  );
}
