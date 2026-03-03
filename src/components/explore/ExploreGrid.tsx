import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Play, Layers, Film } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ExplorePost } from '@/hooks/useExploreSearch';

interface ExploreGridProps {
  posts: ExplorePost[];
  loading?: boolean;
  onLoadMore?: () => void;
}

function SkeletonCell({ large }: { large?: boolean }) {
  return (
    <div
      className={`bg-neutral-800 animate-pulse ${large ? 'col-span-2 row-span-2' : ''}`}
      style={{ aspectRatio: large ? undefined : '1/1', height: large ? '100%' : undefined }}
    />
  );
}

function GridCell({ post, large }: { post: ExplorePost; large?: boolean }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const imgUrl = post.image_urls?.[0];

  const handleClick = () => {
    if (post.type === 'reel') {
      navigate(`/reels?id=${post.id}`);
    } else {
      navigate(`/post/${post.id}`);
    }
  };

  return (
    <div
      className={`relative overflow-hidden cursor-pointer bg-neutral-900 ${large ? 'col-span-2 row-span-2' : ''}`}
      style={{ aspectRatio: large ? undefined : '1/1', height: large ? '100%' : undefined }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
          <Play className="text-neutral-600" size={32} />
        </div>
      )}

      {/* Тип контента */}
      <div className="absolute top-1.5 right-1.5">
        {post.type === 'reel' && (
          <Film size={16} className="text-white drop-shadow" />
        )}
        {post.type === 'carousel' && (
          <Layers size={16} className="text-white drop-shadow" />
        )}
      </div>

      {/* Hover overlay */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 flex items-center justify-center gap-4"
        >
          <div className="flex items-center gap-1 text-white font-semibold text-sm">
            <Heart size={18} fill="white" />
            <span>{post.likes_count > 999 ? `${(post.likes_count / 1000).toFixed(1)}к` : post.likes_count}</span>
          </div>
          <div className="flex items-center gap-1 text-white font-semibold text-sm">
            <MessageCircle size={18} fill="white" />
            <span>{post.comments_count > 999 ? `${(post.comments_count / 1000).toFixed(1)}к` : post.comments_count}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function ExploreGrid({ posts, loading, onLoadMore }: ExploreGridProps) {
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onLoadMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [onLoadMore]);

  if (loading && posts.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCell key={i} />
        ))}
      </div>
    );
  }

  // Instagram-паттерн: каждые 6 постов:
  // [0,1,2] - 3 квадрата в ряд
  // [3] - большой 2x2 слева, [4,5] - 2 маленьких справа
  const renderGrid = () => {
    const blocks: React.ReactNode[] = [];
    let i = 0;
    let blockIdx = 0;

    while (i < posts.length) {
      const remaining = posts.length - i;

      if (remaining < 3) {
        // Оставшиеся посты — просто квадраты
        for (let j = i; j < posts.length; j++) {
          blocks.push(
            <GridCell key={posts[j].id} post={posts[j]} />
          );
        }
        break;
      }

      // Ряд 1: 3 квадрата
      const row1 = posts.slice(i, i + 3);
      row1.forEach(p => blocks.push(<GridCell key={p.id} post={p} />));
      i += 3;

      if (i >= posts.length) break;

      // Ряд 2-3: большой + 2 маленьких (чередуем лево/право)
      const bigPost = posts[i];
      const small1 = posts[i + 1];
      const small2 = posts[i + 2];

      if (blockIdx % 2 === 0) {
        // Большой слева
        blocks.push(
          <div key={`block-${blockIdx}`} className="col-span-3 grid grid-cols-3 grid-rows-2 gap-0.5" style={{ height: 'auto' }}>
            {bigPost && <GridCell post={bigPost} large />}
            {small1 && <GridCell post={small1} />}
            {small2 && <GridCell post={small2} />}
          </div>
        );
      } else {
        // Большой справа
        blocks.push(
          <div key={`block-${blockIdx}`} className="col-span-3 grid grid-cols-3 grid-rows-2 gap-0.5">
            {small1 && <GridCell post={small1} />}
            {small2 && <GridCell post={small2} />}
            {bigPost && <GridCell post={bigPost} large />}
          </div>
        );
      }

      i += 3;
      blockIdx++;
    }

    return blocks;
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-0.5">
        {renderGrid()}
      </div>
      {loading && (
        <div className="grid grid-cols-3 gap-0.5 mt-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCell key={i} />
          ))}
        </div>
      )}
      <div ref={loaderRef} className="h-10" />
    </div>
  );
}
