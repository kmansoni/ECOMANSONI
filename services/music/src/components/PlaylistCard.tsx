import { Play } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';
import { useNavigate } from 'react-router-dom';

interface PlaylistCardProps {
  playlist: {
    id: string;
    name: string;
    description: string;
    coverUrl: string;
    tracks: any[];
  };
}

export default function PlaylistCard({ playlist }: PlaylistCardProps) {
  const navigate = useNavigate();
  const playTrack = useMusicStore((state) => state.playTrack);

  const handleClick = () => {
    navigate(`/playlist/${playlist.id}`);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0]);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative p-4 rounded-xl bg-slate-800/30 hover:bg-slate-700/50 border border-slate-700/30 hover:border-purple-500/50 transition-all duration-300 cursor-pointer"
    >
      {/* Cover image */}
      <div className="relative aspect-square mb-4 overflow-hidden rounded-lg">
        <img
          src={playlist.coverUrl}
          alt={playlist.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={handlePlay}
            className="p-3 bg-purple-500 rounded-full hover:bg-purple-600 transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0"
          >
            <Play className="w-6 h-6 text-white fill-white" />
          </button>
        </div>
      </div>

      {/* Info */}
      <h3 className="font-semibold text-white truncate group-hover:text-purple-400 transition-colors">
        {playlist.name}
      </h3>
      <p className="text-sm text-slate-400 mt-1 line-clamp-2">
        {playlist.description}
      </p>
      <p className="text-xs text-slate-500 mt-2">
        {playlist.tracks.length} треков
      </p>
    </div>
  );
}
