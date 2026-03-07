import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowLeft } from 'lucide-react';
import { useExploreSearch } from '@/hooks/useExploreSearch';
import { ExploreGrid } from '@/components/explore/ExploreGrid';
import { SearchResults } from '@/components/explore/SearchResults';
import { SearchHistory } from '@/components/explore/SearchHistory';
import { TrendingTags } from '@/components/explore/TrendingTags';
import { SearchSuggestions } from '@/components/explore/SearchSuggestions';

const CATEGORIES = [
  { id: 'all', label: 'Все' },
  { id: 'igtv', label: 'IGTV' },
  { id: 'shop', label: 'Магазин' },
  { id: 'fashion', label: 'Стиль' },
  { id: 'food', label: 'Еда' },
  { id: 'travel', label: 'Путешествия' },
  { id: 'architecture', label: 'Архитектура' },
  { id: 'decor', label: 'Декор' },
  { id: 'art', label: 'Искусство' },
  { id: 'music', label: 'Музыка' },
  { id: 'sports', label: 'Спорт' },
  { id: 'nature', label: 'Природа' },
  { id: 'tech', label: 'Технологии' },
];

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQuery = searchParams.get('q') || searchParams.get('tag') ? `#${searchParams.get('tag')}` : '';

  const [query, setQuery] = useState(searchParams.get('q') || (searchParams.get('tag') ? `#${searchParams.get('tag')}` : ''));
  const [focused, setFocused] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!query);
  const [activeCategory, setActiveCategory] = useState('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    loading,
    searchResults,
    exploreContent,
    history,
    trending,
    search,
    getSearchHistory,
    clearSearchHistory,
    deleteSearchHistoryItem,
    getTrendingHashtags,
    getExploreContent,
    saveSearchQuery,
  } = useExploreSearch();

  // Загрузка explore контента при старте
  useEffect(() => {
    void getExploreContent(activeCategory !== 'all' ? activeCategory : undefined);
  }, [activeCategory, getExploreContent]);

  // Загрузка истории и трендов при фокусе
  useEffect(() => {
    if (focused) {
      void getSearchHistory();
      void getTrendingHashtags();
    }
  }, [focused, getSearchHistory, getTrendingHashtags]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void search(query);
      setHasSearched(true);
      // Обновляем URL
      const params = new URLSearchParams();
      params.set('q', query);
      setSearchParams(params, { replace: true });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search, setSearchParams]);

  const handleFocus = () => setFocused(true);

  const handleCancel = () => {
    setFocused(false);
    setQuery('');
    setHasSearched(false);
    setSearchParams({}, { replace: true });
    inputRef.current?.blur();
  };

  const handleHistorySelect = (q: string) => {
    setQuery(q);
    search(q);
    setHasSearched(true);
  };

  const handleTagSelect = (tag: string) => {
    setQuery(tag);
    search(tag);
    setHasSearched(true);
  };

  const handleLoadMore = useCallback(() => {
    if (!loading) {
      void getExploreContent(activeCategory !== 'all' ? activeCategory : undefined);
    }
  }, [loading, activeCategory, getExploreContent]);

  const isSearchMode = focused || query.length > 0;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Шапка с поиском */}
      <div className="sticky top-0 z-20 bg-black pt-safe">
        <div className="flex items-center gap-2 px-3 py-2">
          <AnimatePresence>
            {isSearchMode && (
              <motion.button
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                onClick={handleCancel}
                className="text-white shrink-0"
              >
                <ArrowLeft size={22} />
              </motion.button>
            )}
          </AnimatePresence>

          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={handleFocus}
              placeholder="Поиск"
              className="w-full bg-neutral-800 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-neutral-500 outline-none"
            />
            {query.length > 0 && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
              >
                <X size={14} />
              </button>
            )}
            <SearchSuggestions
              query={query}
              visible={focused && !hasSearched}
              onSelect={(s) => {
                if (s.type === 'user') navigate(`/user/${s.id}`);
                else if (s.type === 'hashtag') { setQuery(s.label); search(s.label); setHasSearched(true); }
                else if (s.type === 'location') navigate(`/location/${s.id}`);
                setFocused(false);
              }}
            />
          </div>

          {isSearchMode && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={handleCancel}
              className="text-blue-400 text-sm font-medium shrink-0"
            >
              Отмена
            </motion.button>
          )}
        </div>

        {/* Категории (только в режиме browse) */}
        <AnimatePresence>
          {!isSearchMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-none">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      activeCategory === cat.id
                        ? 'bg-white text-black'
                        : 'bg-neutral-800 text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Контент */}
      <AnimatePresence mode="wait">
        {isSearchMode ? (
          <motion.div
            key="search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {!hasSearched || !query.trim() ? (
              // История поиска + тренды
              <div>
                <SearchHistory
                  history={history}
                  onSelect={handleHistorySelect}
                  onDelete={deleteSearchHistoryItem}
                  onClearAll={clearSearchHistory}
                />
                <TrendingTags tags={trending} onSelect={handleTagSelect} />
              </div>
            ) : (
              <SearchResults
                results={searchResults}
                query={query}
                loading={loading}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="explore"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ExploreGrid
              posts={exploreContent}
              loading={loading}
              onLoadMore={handleLoadMore}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
