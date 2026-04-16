import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { buildProfilePath } from '@/lib/users/profileLinks';

interface CollabAuthor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface CollabReelBadgeProps {
  primaryAuthor: CollabAuthor;
  collaborator: CollabAuthor;
}

export function CollabReelBadge({ primaryAuthor, collaborator }: CollabReelBadgeProps) {
  const navigate = useNavigate();

  const primaryName = primaryAuthor.display_name ?? primaryAuthor.id.slice(0, 8);
  const collabName = collaborator.display_name ?? collaborator.id.slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 mt-1"
    >
      {/* Двойной аватар */}
      <div className="flex -space-x-2">
        <button
          onClick={() => navigate(buildProfilePath({ userId: primaryAuthor.id }))}
          className="relative z-0"
          aria-label={`Профиль ${primaryName}`}
        >
          <img loading="lazy"
            src={primaryAuthor.avatar_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(primaryName)}&background=random`}
            alt={primaryName}
            className="w-6 h-6 rounded-full border-2 border-background object-cover"
          />
        </button>
        <button
          onClick={() => navigate(buildProfilePath({ userId: collaborator.id }))}
          className="relative z-10"
          aria-label={`Профиль ${collabName}`}
        >
          <img loading="lazy"
            src={collaborator.avatar_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(collabName)}&background=random`}
            alt={collabName}
            className="w-6 h-6 rounded-full border-2 border-background object-cover"
          />
        </button>
      </div>

      <span className="text-xs text-zinc-400">
        Совместный Reel ·{' '}
        <button
          onClick={() => navigate(buildProfilePath({ userId: collaborator.id }))}
          className="text-white font-medium hover:underline"
          aria-label={`Перейти к профилю @${collabName}`}
        >
          @{collabName}
        </button>
      </span>
    </motion.div>
  );
}
