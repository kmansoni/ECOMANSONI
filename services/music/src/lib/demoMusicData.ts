import type { Playlist, Track } from '../store/useMusicStore';

export const DEMO_PLAYLISTS: Playlist[] = [
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
];

export const DEMO_TRACKS: Track[] = DEMO_PLAYLISTS.flatMap((playlist) => playlist.tracks);