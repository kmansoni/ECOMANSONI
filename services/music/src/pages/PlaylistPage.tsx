import { useParams, Link } from 'react-router-dom';
import { Play, Shuffle } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';
import TrackList from '../components/TrackList';
import { useMusicData } from '../lib/useMusicData';

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const { playlists, playTrack, setQueue } = useMusicStore();
  const { playlists: fetchedPlaylists, loading } = useMusicData();

  const playlist = playlists.find((p) => p.id === id) || fetchedPlaylists.find((p) => p.id === id);

  if (loading && !playlist) {
    return <div className="flex items-center justify-center h-full text-slate-300">Загрузка плейлиста...</div>;
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Плейлист не найден</h2>
          <Link to="/" className="text-blue-400 hover:underline">← Назад</Link>
        </div>
      </div>
    );
  }

  const totalDuration = playlist.tracks.reduce((sum, t) => sum + t.duration, 0);
  const formattedDuration = formatDuration(totalDuration);

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} ч ${mins} мин`;
    }
    return `${mins} мин`;
  }

  function handlePlayAll() {
    if (playlist.tracks.length > 0) {
      setQueue(playlist.tracks);
      playTrack(playlist.tracks[0]);
    }
  }

  function handleShuffle() {
    if (playlist.tracks.length > 0) {
      const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      playTrack(shuffled[0]);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-black text-white">
      {/* Header с фоном */}
      <div className="relative h-80 bg-gradient-to-b from-purple-900/60 to-slate-900">
        <div className="absolute inset-0 bg-black/40" />
        <img
          src={playlist.coverUrl}
          alt={playlist.name}
          className="w-full h-full object-cover mix-blend-overlay opacity-50"
        />
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 -mt-32 relative z-10">
        <div className="flex items-end gap-6 mb-8">
          <img
            src={playlist.coverUrl}
            alt={playlist.name}
            className="w-48 h-48 rounded-xl shadow-2xl object-cover"
          />
          <div className="flex-1">
            <p className="text-sm text-slate-300 mb-2">Плейлист</p>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {playlist.name}
            </h1>
            <p className="text-slate-300 mb-2">{playlist.description}</p>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span>{playlist.tracks.length} треков</span>
              <span>•</span>
              <span>{formattedDuration}</span>
            </div>
          </div>
        </div>

        {/* Действия */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-8 py-3 bg-purple-500 hover:bg-purple-600 rounded-full font-semibold transition-colors"
          >
            <Play className="w-5 h-5 fill-current" />
            Воспроизвести
          </button>
          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
          >
            <Shuffle className="w-5 h-5" />
            Перемешать
          </button>
        </div>

        {/* Список треков */}
        <TrackList tracks={playlist.tracks} />
      </div>
    </div>
  );
}
