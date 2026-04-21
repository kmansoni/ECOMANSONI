import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Heart, MoreHorizontal, Download } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';
import { useMemo, useState } from 'react';
import { useMusicData } from '../lib/useMusicData';
import { useMusicActions } from '../lib/useMusicActions';

export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const { playlists, tracks, playTrack, currentTrack, isPlaying, pauseTrack, resumeTrack, likedTrackIds, downloadedTrackIds } = useMusicStore();
  const { tracks: fetchedTracks, playlists: fetchedPlaylists } = useMusicData();
  const { toggleLike, toggleDownload } = useMusicActions();
  const [actionError, setActionError] = useState<string | null>(null);

  const allTracks = useMemo(() => {
    const merged = new Map<string, (typeof tracks)[number]>();

    for (const track of [
      ...tracks,
      ...fetchedTracks,
      ...playlists.flatMap((playlist) => playlist.tracks),
      ...fetchedPlaylists.flatMap((playlist) => playlist.tracks),
    ]) {
      merged.set(track.id, track);
    }

    return Array.from(merged.values());
  }, [tracks, fetchedTracks, playlists, fetchedPlaylists]);

  const track = allTracks.find((item) => item.id === id) || null;

  if (!track) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Трек не найден</h2>
          <Link to="/" className="text-blue-400 hover:underline">← Назад</Link>
        </div>
      </div>
    );
  }

  const isCurrentTrack = currentTrack?.id === track.id;
  const isLiked = likedTrackIds.includes(track.id);
  const isDownloaded = downloadedTrackIds.includes(track.id);

  function handlePlay() {
    if (isCurrentTrack) {
      if (isPlaying) {
        pauseTrack();
      } else {
        resumeTrack();
      }
    } else {
      playTrack(track);
    }
  }

  async function handleToggleLike() {
    try {
      setActionError(null);
      await toggleLike(track.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось обновить лайк');
    }
  }

  async function handleToggleDownload() {
    try {
      setActionError(null);
      await toggleDownload(track);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось обновить офлайн-доступ');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-black text-white">
      {/* Кнопка назад */}
      <div className="p-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад
        </Link>
      </div>

      {/* Основной контент */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">
          {/* Обложка */}
          <div className="w-64 h-64 flex-shrink-0">
            <img
              src={track.coverUrl}
              alt={track.title}
              className={`w-full h-full object-cover rounded-xl shadow-2xl ${isCurrentTrack && isPlaying ? 'animate-pulse' : ''}`}
            />
          </div>

          {/* Информация */}
          <div className="flex-1 text-center md:text-left">
            <p className="text-sm text-slate-300 mb-2">Трек</p>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {track.title}
            </h1>
            <p className="text-xl text-slate-300 mb-2">{track.artist}</p>
            <p className="text-sm text-slate-400">Альбом: {track.album}</p>
            <p className="text-sm text-slate-400 mt-1">
              Длительность: {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
            </p>
          </div>
        </div>

        {/* Действия */}
        <div className="flex items-center justify-center md:justify-start gap-4 mt-8">
          <button
            onClick={handlePlay}
            className="flex items-center gap-2 px-8 py-3 bg-purple-500 hover:bg-purple-600 rounded-full font-semibold transition-colors"
          >
            {isCurrentTrack && isPlaying ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                Пауза
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                Воспроизвести
              </>
            )}
          </button>

          <button
            onClick={handleToggleLike}
            className={`p-3 rounded-full border transition-colors ${isLiked ? 'bg-red-500/20 border-red-500 text-red-500' : 'border-slate-600 hover:border-slate-500'}`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={handleToggleDownload}
            className={`p-3 rounded-full border transition-colors ${isDownloaded ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-slate-600 hover:border-slate-500'}`}
          >
            <Download className="w-5 h-5" />
          </button>

          <button className="p-3 rounded-full border border-slate-600 hover:border-slate-500 transition-colors">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        {actionError ? <p className="mt-4 text-sm text-red-400">{actionError}</p> : null}

        {/* Рекомендации (простые) */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4">Похожие треки</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {playlists.flatMap((p) => p.tracks)
              .filter((t) => t.id !== track.id)
              .slice(0, 4)
              .map((similarTrack) => (
                <div
                  key={similarTrack.id}
                  onClick={() => playTrack(similarTrack)}
                  className="p-4 rounded-lg bg-slate-800/30 hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <img
                    src={similarTrack.coverUrl}
                    alt={similarTrack.title}
                    className="w-full aspect-square rounded-lg object-cover mb-3"
                  />
                  <h3 className="font-medium truncate">{similarTrack.title}</h3>
                  <p className="text-sm text-slate-400 truncate">{similarTrack.artist}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
