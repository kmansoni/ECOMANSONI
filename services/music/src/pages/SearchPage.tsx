import { useState } from 'react';
import { Search } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';
import TrackList from '../components/TrackList';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const { playlists } = useMusicStore();

  // Простой поиск по всем трекам
  const allTracks = playlists.flatMap((p) => p.tracks);
  const results = query
    ? allTracks.filter(
        (track) =>
          track.title.toLowerCase().includes(query.toLowerCase()) ||
          track.artist.toLowerCase().includes(query.toLowerCase()) ||
          track.album.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Поиск музыки</h1>

        {/* Search input */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Что хотите слушать?"
            className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Results */}
        {query && (
          <div>
            <h2 className="text-xl font-semibold mb-4">
              Результаты для "{query}" ({results.length})
            </h2>
            {results.length > 0 ? (
              <TrackList tracks={results} />
            ) : (
              <div className="text-center py-12 text-slate-400">
                <p>Ничего не найдено</p>
                <p className="text-sm mt-2">Попробуйте другие ключевые слова</p>
              </div>
            )}
          </div>
        )}

        {/* Popular categories (when not searching) */}
        {!query && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Популярные жанры</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['Поп', 'Рок', 'Хип-хоп', 'Электроника', 'Джаз', 'Классика', 'R&B', 'Метал'].map(
                (genre) => (
                  <button
                    key={genre}
                    onClick={() => setQuery(genre)}
                    className="p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 hover:from-purple-900/50 hover:to-blue-900/50 border border-slate-700/50 hover:border-purple-500/50 transition-all"
                  >
                    {genre}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
