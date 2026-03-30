import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Store, ArrowLeft } from 'lucide-react';
import { dbLoose } from '@/lib/supabase';
import { motion } from 'framer-motion';

const CATEGORIES = ['Все', 'Мода', 'Еда', 'Техника', 'Красота', 'Спорт', 'Дом', 'Искусство'];

interface ShopItem {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  category?: string;
  owner_id: string;
  profiles?: { username: string; avatar_url?: string };
}

export default function ShopDiscoveryPage() {
  const navigate = useNavigate();
  const [shops, setShops] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Все');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const query = dbLoose
        .from('shops')
        .select('*, profiles(username, avatar_url)')
        .order('created_at', { ascending: false });

      const { data } = await query;
      setShops((data as unknown as ShopItem[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = shops.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'Все' || s.category === category;
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Каталог магазинов</h1>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-zinc-900 rounded-2xl px-4 py-2.5">
            <Search className="w-4 h-4 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск магазинов..."
              className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-2xl h-40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Store className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">Магазины не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((shop, i) => (
              <motion.button
                key={shop.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/shop/${shop.id}`)}
                className="bg-zinc-900 rounded-2xl overflow-hidden text-left hover:bg-zinc-800 transition-colors"
              >
                {shop.avatar_url ? (
                  <img src={shop.avatar_url} alt={shop.name} className="w-full h-24 object-cover" />
                ) : (
                  <div className="w-full h-24 bg-zinc-800 flex items-center justify-center">
                    <Store className="w-8 h-8 text-zinc-600" />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-white font-semibold text-sm truncate">{shop.name}</p>
                  {shop.description && (
                    <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{shop.description}</p>
                  )}
                  {shop.profiles?.username && (
                    <p className="text-zinc-600 text-xs mt-1">@{shop.profiles.username}</p>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
