import { Play, Pause, MoreHorizontal, Heart } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';
import type { Track } from '../store/useMusicStore';
import { useState } from 'react';

interface TrackListProps {
  tracks: Track[];
  showAlbum?: boolean;
}

export default function TrackList({ tracks, showAlbum = true }: TrackListProps) {
  const { currentTrack, isPlaying, playTrack, pauseTrack, resumeTrack } = useMusicStore();

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleTrackClick(track: Track) {
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pauseTrack();
      } else {
        resumeTrack();
      }
    } else {
      playTrack(track);
    }
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[16px_4fr_3fr_1fr] gap-4 px-4 py-2 text-sm text-slate-400 border-b border-slate-700/50">
        <span>#</span>
        <span>Название</span>
        {showAlbum && <span>Альбом</span>}
        <span className="text-right">Время</span>
      </div>

      {/* Tracks */}
      {tracks.map((track, index) => {
        const isCurrentTrack = currentTrack?.id === track.id;

        return (
          <div
            key={track.id}
            onClick={() => handleTrackClick(track)}
            className={`grid grid-cols-[16px_4fr_3fr_1fr] gap-4 px-4 py-3 rounded-lg cursor-pointer group transition-all
              ${isCurrentTrack ? 'bg-purple-500/20 border border-purple-500/30' : 'hover:bg-slate-800/50'}
            `}
          >
            {/* Number / Play button */}
            <div className="flex items-center justify-center">
              <span className={`group-hover:hidden ${isCurrentTrack ? 'text-purple-400' : 'text-slate-400'}`}>
                {isCurrentTrack && isPlaying ? (
                  <div className="flex items-end gap-0.5 h-4">
                    <div className="w-1 bg-purple-400 animate-pulse h-2" />
                    <div className="w-1 bg-purple-400 animate-pulse h-4" />
                    <div className="w-1 bg-purple-400 animate-pulse h-3" />
                  </div>
                ) : (
                  index + 1
                )}
              </span>
              <button className="hidden group-hover:block text-white">
                {isCurrentTrack && isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Title + Artist */}
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={track.coverUrl}
                alt={track.album}
                className="w-10 h-10 rounded object-cover"
              />
              <div className="min-w-0">
                <p className={`font-medium truncate ${isCurrentTrack ? 'text-purple-300' : ''}`}>
                  {track.title}
                </p>
                <p className="text-sm text-slate-400 truncate">{track.artist}</p>
              </div>
            </div>

            {/* Album */}
            {showAlbum && (
              <div className="flex items-center text-sm text-slate-400 truncate">
                {track.album}
              </div>
            )}

            {/* Duration + Actions */}
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-slate-400">
                {formatDuration(track.duration)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-purple-400"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500"
              >
                <Heart className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
