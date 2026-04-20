import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
}

interface Playlist {
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
  playlists: Playlist[];

  // Actions
  playTrack: (track: Track) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  setVolume: (volume: number) => void;
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      isPlaying: false,
      volume: 0.8,
      queue: [],

      playlists: [
        {
          id: '1',
          name: 'Популярные треки',
          description: 'Лучшие треки недели',
          coverUrl: 'https://picsum.photos/seed/music1/300/300',
          tracks: [
            {
              id: 't1',
              title: 'Midnight Dreams',
              artist: 'Luna Star',
              album: 'Starlight',
              duration: 234,
              coverUrl: 'https://picsum.photos/seed/t1/300/300',
              audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            },
            {
              id: 't2',
              title: 'Electric Pulse',
              artist: 'Neon Waves',
              album: 'Cyber City',
              duration: 198,
              coverUrl: 'https://picsum.photos/seed/t2/300/300',
              audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
            },
            {
              id: 't3',
              title: 'Ocean Waves',
              artist: 'Chill Vibes',
              album: 'Relaxation',
              duration: 267,
              coverUrl: 'https://picsum.photos/seed/t3/300/300',
              audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
            },
          ],
        },
        {
          id: '2',
          name: 'Рабочая музыка',
          description: 'Фокус и концентрация',
          coverUrl: 'https://picsum.photos/seed/music2/300/300',
          tracks: [
            {
              id: 't4',
              title: 'Deep Focus',
              artist: 'Brain Waves',
              album: 'Productivity',
              duration: 320,
              coverUrl: 'https://picsum.photos/seed/t4/300/300',
              audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
            },
          ],
        },
      ],

      playTrack: (track) => {
        set({ currentTrack: track, isPlaying: true });
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
    }),
    {
      name: 'music-storage',
      partialize: (state) => ({
        volume: state.volume,
        queue: state.queue,
      }),
    }
  )
);
