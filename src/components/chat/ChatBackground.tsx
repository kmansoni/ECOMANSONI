import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CHAT_WALLPAPERS } from './chatWallpapers';
import { logger } from '@/lib/logger';

interface ChatBackgroundProps {
  wallpaper?: string;
  children: ReactNode;
  className?: string;
}

function isTrustedCustomWallpaper(wallpaper: string): boolean {
  if (!wallpaper) return false;
  if (wallpaper.startsWith('blob:')) return true;
  if (wallpaper.startsWith('/')) return true;

  if (!wallpaper.startsWith('http://') && !wallpaper.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(wallpaper);
    if (typeof window === 'undefined') return false;

    if (parsed.origin === window.location.origin) {
      return true;
    }

    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
    if (!supabaseUrl) {
      return false;
    }

    const supabaseHost = new URL(supabaseUrl).hostname;
    const isSupabaseStoragePath = parsed.pathname.includes('/storage/v1/object/public/');
    return parsed.hostname === supabaseHost && isSupabaseStoragePath;
  } catch (error) {
    logger.warn('chat-background: invalid wallpaper url', { wallpaper, error });
    return false;
  }
}

export function ChatBackground({ wallpaper = 'default', children, className }: ChatBackgroundProps) {
  const isCustomUrl = isTrustedCustomWallpaper(wallpaper);
  const builtIn = CHAT_WALLPAPERS[wallpaper] ?? CHAT_WALLPAPERS.default;

  if (isCustomUrl) {
    return (
      <div
        className={cn('relative flex-1 overflow-hidden', className)}
        style={{ backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={cn('relative flex-1 overflow-hidden', builtIn, className)}>
      {wallpaper === 'stars' && (
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
      )}
      {wallpaper === 'geometric' && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
            backgroundSize: '16px 16px',
          }}
        />
      )}
      <div className="relative z-10 h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}
