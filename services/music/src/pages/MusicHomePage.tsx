import { useMusicStore } from '../store/useMusicStore';
import TrackList from '../components/TrackList';
import PlaylistCard from '../components/PlaylistCard';
import { Music, Headphones, Radio } from 'lucide-react';

export default function MusicHomePage() {
  const playlists = useMusicStore((state) => state.playlists);
  // Берем все треки из всех плейлистов
  const allTracks = playlists.flatMap((p) => p.tracks).slice(0, 10);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-black text-white">
      {/* Hero секция */}
      <div className="px-6 py-12 bg-gradient-to-r from-purple-900/50 to-blue-900/50">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">
            Музыка
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl">
            Слушайте миллионы треков, создавайте плейлисты, открывайте новую музыку
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-12">
        {/* Быстрые действия */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickAction
              icon={<Music className="w-6 h-6" />}
              title="Поиск музыки"
              description="Найдите любимые треки и артистов"
              href="/search"
            />
            <QuickAction
              icon={<Headphones className="w-6 h-6" />}
              title="Плейлисты"
              description="Ваши подборки и рекомендации"
              href="/playlist/1"
            />
            <QuickAction
              icon={<Radio className="w-6 h-6" />}
              title="Радио"
              description="Персональное радио по вкусам"
              href="#"
            />
          </div>
        </section>

        {/* Популярные треки */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span className="text-3xl">🔥</span> Популярные сейчас
          </h2>
          <TrackList tracks={allTracks} />
        </section>

        {/* Ваши плейлисты */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Ваши плейлисты</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group p-6 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300 block"
    >
      <div className="flex items-center gap-4">
        <div className="p-3 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-lg group-hover:text-purple-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </a>
  );
}
