import { useNavigate } from 'react-router-dom';
import { buildProfilePath } from '@/lib/users/profileLinks';

interface CollabAuthor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface CollabBadgeProps {
  collaborator: CollabAuthor;
  primaryAuthor?: CollabAuthor;
}

export function CollabBadge({ collaborator, primaryAuthor }: CollabBadgeProps) {
  const navigate = useNavigate();
  const username = collaborator.display_name ?? collaborator.id.slice(0, 8);

  return (
    <button
      onClick={() => navigate(buildProfilePath({ userId: collaborator.id }))}
      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors mt-1"
    >
      {/* Double avatar stack */}
      <div className="flex -space-x-2">
        {primaryAuthor && (
          <img
            src={primaryAuthor.avatar_url ?? `https://i.pravatar.cc/150?u=${primaryAuthor.id}`}
            alt={primaryAuthor.display_name ?? ''}
            className="w-5 h-5 rounded-full border border-zinc-800 object-cover z-0"
          />
        )}
        <img
          src={collaborator.avatar_url ?? `https://i.pravatar.cc/150?u=${collaborator.id}`}
          alt={username}
          className="w-5 h-5 rounded-full border border-zinc-800 object-cover z-10"
        />
      </div>
      <span>
        Совместная публикация с{' '}
        <span className="text-white font-medium">@{username}</span>
      </span>
    </button>
  );
}
