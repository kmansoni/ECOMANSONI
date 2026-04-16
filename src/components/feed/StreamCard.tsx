import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MapPin, ImageIcon } from 'lucide-react';

interface PostMapMarkerProps {
  postId: string;
  thumbnailUrl: string;
  authorId: string;
  onClick?: () => void;
}

export function PostMapMarker({ postId, thumbnailUrl, authorId, onClick }: PostMapMarkerProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/post/${postId}`);
    }
  };

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="relative flex items-center justify-center w-12 h-12 rounded-lg overflow-hidden border-2 border-white dark:border-zinc-800 shadow-lg cursor-pointer"
      aria-label={`Открыть пост на карте`}
    >
      {thumbnailUrl ? (
        <img loading="lazy" src={thumbnailUrl}
          alt=""
          className="w-full h-full object-cover"
          
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      {/* Стрелка внизу */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-zinc-800 rotate-45 border-r border-b border-white dark:border-zinc-800" />
    </motion.button>
  );
}

interface PostMapPreviewCardProps {
  postId: string;
  thumbnailUrl: string;
  content: string | null;
  createdAt: string;
  onClose: () => void;
}

export function PostMapPreviewCard({ postId, thumbnailUrl, content, createdAt, onClose }: PostMapPreviewCardProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-4 left-4 right-4 z-[1000] bg-card rounded-xl shadow-xl border border-border overflow-hidden"
    >
      <button
        onClick={() => navigate(`/post/${postId}`)}
        className="flex gap-3 p-3 w-full text-left min-h-[44px]"
        aria-label="Перейти к посту"
      >
        {thumbnailUrl ? (
          <img loading="lazy"             src={thumbnailUrl}
            alt=""
            className="w-16 h-16 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground line-clamp-2">{content ?? 'Без описания'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(createdAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
      </button>
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground"
        aria-label="Закрыть превью"
      >
        ✕
      </button>
    </motion.div>
  );
}
