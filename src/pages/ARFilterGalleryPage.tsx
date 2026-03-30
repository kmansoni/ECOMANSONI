import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Sparkles, Play } from 'lucide-react';
import { dbLoose } from '@/lib/supabase';
import { motion } from 'framer-motion';

const CATEGORIES = [
  { id: 'all', label: 'Все' },
  { id: 'beauty', label: 'Красота' },
  { id: 'color', label: 'Цвет' },
  { id: 'fun', label: 'Забавные' },
  { id: 'world', label: 'Мир' },
];

interface ARFilter {
  id: string;
  name: string;
  description?: string;
  preview_url?: string;
  category: string;
  uses_count: number;
  creator_id: string;
  filter_data: Record<string, unknown>;
  profiles?: { username: string };
}

export default function ARFilterGalleryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ARFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await dbLoose
        .from('ar_filters')
        .select('*, profiles(username)')
        .eq('is_published', true)
        .order('uses_count', { ascending: false });
      setFilters((data as unknown as ARFilter[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = filters.filter(f => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'all' || f.category === category;
    return matchSearch && matchCat;
  });

  const handleTry = (filter: ARFilter) => {
    navigate('/ar', { state: { filter } });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg flex-1">AR-фильтры</h1>
          <button
            onClick={() => navigate('/ar/editor')}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm px-3 py-1.5 rounded-full"
          >
            <Sparkles className="w-4 h-4" />
            Создать
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-zinc-900 rounded-2xl px-4 py-2.5">
            <Search className="w-4 h-4 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск фильтров..."
              className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat.id ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-2xl h-48 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">Фильтры не найдены</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((filter, i) => (
              <motion.div
                key={filter.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className="bg-zinc-900 rounded-2xl overflow-hidden"
              >
                {filter.preview_url ? (
                  <img src={filter.preview_url} alt={filter.name} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-purple-900 to-pink-900 flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-white/50" />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-white font-semibold text-sm truncate">{filter.name}</p>
                  {filter.profiles?.username && (
                    <p className="text-zinc-500 text-xs">@{filter.profiles.username}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-zinc-600 text-xs">{filter.uses_count.toLocaleString('ru-RU')} использований</span>
                    <button
                      onClick={() => handleTry(filter)}
                      className="flex items-center gap-1 bg-white text-black text-xs font-semibold px-3 py-1 rounded-full"
                    >
                      <Play className="w-3 h-3" />
                      Попробовать
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
