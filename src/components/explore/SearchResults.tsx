import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, MapPin, UserPlus, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { SearchResults as SearchResultsType } from '@/hooks/useExploreSearch';

interface SearchResultsProps {
  results: SearchResultsType;
  query: string;
  loading?: boolean;
}

type Tab = 'best' | 'accounts' | 'tags' | 'places';

const TABS: { id: Tab; label: string }[] = [
  { id: 'best', label: 'Лучшее' },
  { id: 'accounts', label: 'Аккаунты' },
  { id: 'tags', label: 'Теги' },
  { id: 'places', label: 'Места' },
];

function FollowButton({ userId }: { userId: string }) {
  const [following, setFollowing] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (following) {
      await (supabase as any).from('follows').delete().match({ follower_id: user.id, following_id: userId });
    } else {
      await (supabase as any).from('follows').insert({ follower_id: user.id, following_id: userId });
    }
    setFollowing(f => !f);
  };

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        following
          ? 'bg-neutral-700 text-white'
          : 'bg-blue-500 text-white'
      }`}
    >
      {following ? <Check size={12} /> : <UserPlus size={12} />}
      {following ? 'Вы следите' : 'Подписаться'}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-16 text-center text-neutral-500 text-sm">{text}</div>
  );
}

export function SearchResults({ results, query, loading }: SearchResultsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('best');
  const navigate = useNavigate();

  const hasAny =
    results.users.length > 0 ||
    results.hashtags.length > 0 ||
    results.posts.length > 0 ||
    results.locations.length > 0;

  return (
    <div>
      {/* Вкладки */}
      <div className="flex border-b border-neutral-800 sticky top-0 bg-black z-10">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-white border-white'
                : 'text-neutral-500 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Контент */}
      {loading ? (
        <div className="py-8 text-center text-neutral-500 text-sm">Поиск...</div>
      ) : !hasAny ? (
        <EmptyState text={`Ничего не найдено по запросу «${query}»`} />
      ) : (
        <>
          {activeTab === 'best' && (
            <div>
              {results.users.slice(0, 3).map(user => (
                <UserRow key={user.id} user={user} navigate={navigate} />
              ))}
              {results.hashtags.slice(0, 3).map(tag => (
                <TagRow key={tag.id} tag={tag} navigate={navigate} />
              ))}
              {results.locations.slice(0, 3).map((loc, i) => (
                <LocationRow key={i} location={loc} navigate={navigate} />
              ))}
            </div>
          )}

          {activeTab === 'accounts' && (
            <div>
              {results.users.length === 0
                ? <EmptyState text="Аккаунты не найдены" />
                : results.users.map(user => (
                  <UserRow key={user.id} user={user} navigate={navigate} showFollow />
                ))
              }
            </div>
          )}

          {activeTab === 'tags' && (
            <div>
              {results.hashtags.length === 0
                ? <EmptyState text="Теги не найдены" />
                : results.hashtags.map(tag => (
                  <TagRow key={tag.id} tag={tag} navigate={navigate} />
                ))
              }
            </div>
          )}

          {activeTab === 'places' && (
            <div>
              {results.locations.length === 0
                ? <EmptyState text="Места не найдены" />
                : results.locations.map((loc, i) => (
                  <LocationRow key={i} location={loc} navigate={navigate} />
                ))
              }
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UserRow({ user, navigate, showFollow }: { user: any; navigate: any; showFollow?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 active:bg-neutral-900 cursor-pointer"
      onClick={() => navigate(`/profile/${user.username}`)}
    >
      <div className="w-11 h-11 rounded-full overflow-hidden bg-neutral-800 shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-500 text-lg font-bold">
            {(user.display_name || user.username || '?')[0].toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{user.display_name || user.username}</p>
        <p className="text-neutral-500 text-xs truncate">@{user.username}</p>
      </div>
      {showFollow && <FollowButton userId={user.id} />}
    </div>
  );
}

function TagRow({ tag, navigate }: { tag: any; navigate: any }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 active:bg-neutral-900 cursor-pointer"
      onClick={() => navigate(`/explore?tag=${tag.name}`)}
    >
      <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
        <Hash size={20} className="text-neutral-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold">#{tag.name}</p>
        <p className="text-neutral-500 text-xs">{(tag.post_count || 0).toLocaleString('ru-RU')} публикаций</p>
      </div>
    </div>
  );
}

function LocationRow({ location, navigate }: { location: string; navigate: any }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 active:bg-neutral-900 cursor-pointer"
      onClick={() => navigate(`/explore?location=${encodeURIComponent(location)}`)}
    >
      <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
        <MapPin size={20} className="text-neutral-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold">{location}</p>
        <p className="text-neutral-500 text-xs">Место</p>
      </div>
    </div>
  );
}
