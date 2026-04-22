import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEMO_PLAYLISTS, DEMO_TRACKS } from '../lib/demoMusicData';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  tracks: Track[];
}

interface MusicState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  queue: Track[];
  tracks: Track[];
  playlists: Playlist[];
  likedTrackIds: string[];
  downloadedTrackIds: string[];
  
  // Data from Supabase
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  
  // Set data from API
  setTracks: (tracks: Track[]) => void;
  setPlaylists: (playlists: Playlist[]) => void;
  setLikedTrackIds: (trackIds: string[]) => void;
  setDownloadedTrackIds: (trackIds: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setIsDemo: (isDemo: boolean) => void;

  // Actions
  playTrack: (track: Track) => void;
  playTrackAtIndex: (index: number) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  setVolume: (volume: number) => void;
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      isPlaying: false,
      volume: 0.8,
      queue: [],
      tracks: DEMO_TRACKS,
      playlists: DEMO_PLAYLISTS,
      likedTrackIds: [],
      downloadedTrackIds: [],
      loading: false,
      error: null,
      isDemo: true,

      setTracks: (tracks) => set({ tracks }),
      setPlaylists: (playlists) => set({ playlists }),
      setLikedTrackIds: (likedTrackIds) => set({ likedTrackIds }),
      setDownloadedTrackIds: (downloadedTrackIds) => set({ downloadedTrackIds }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setIsDemo: (isDemo) => set({ isDemo }),

      playTrack: (track) => {
        set({ currentTrack: track, isPlaying: true });
      },

      playTrackAtIndex: (index) => {
        const { queue } = get();
        if (index >= 0 && index < queue.length) {
          set({ currentTrack: queue[index], isPlaying: true });
        }
      },

      pauseTrack: () => {
        set({ isPlaying: false });
      },

      resumeTrack: () => {
        set({ isPlaying: true });
      },

      setVolume: (volume) => {
        set({ volume });
      },

      setQueue: (tracks) => {
        set({ queue: tracks });
      },

      addToQueue: (track) => {
        set((state) => ({ queue: [...state.queue, track] }));
      },

      removeFromQueue: (trackId) => {
        set((state) => ({ 
          queue: state.queue.filter(t => t.id !== trackId)
        }));
      },

      clearQueue: () => {
        set({ queue: [] });
      },
    }),
    {
      name: 'music-storage',
      partialize: (state) => ({
        volume: state.volume,
        queue: state.queue,
        likedTrackIds: state.likedTrackIds,
        downloadedTrackIds: state.downloadedTrackIds,
      }),
    }
  )
);
