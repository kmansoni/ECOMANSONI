import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const WALLPAPERS: Record<string, string> = {
  default: 'bg-background',
  dark: 'bg-gradient-to-b from-gray-900 to-black',
  'gradient-blue': 'bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900',
  'gradient-purple': 'bg-gradient-to-br from-purple-900 via-pink-900 to-rose-900',
  'gradient-green': 'bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900',
  stars: 'bg-gray-900',
  geometric: 'bg-zinc-900',
  'minimal-dark': 'bg-zinc-900',
  'minimal-light': 'bg-zinc-100 dark:bg-zinc-800',
};

interface ChatBackgroundProps {
  wallpaper?: string;
  children: ReactNode;
  className?: string;
}

export function ChatBackground({ wallpaper = 'default', children, className }: ChatBackgroundProps) {
  const isCustomUrl = wallpaper.startsWith('http') || wallpaper.startsWith('/');
  const builtIn = WALLPAPERS[wallpaper] ?? WALLPAPERS.default;

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
