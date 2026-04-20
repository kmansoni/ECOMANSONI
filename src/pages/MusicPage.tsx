import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import moduleLoader, { type ModuleManifest } from '@/lib/ModuleLoader';
import { Download, Wifi, WifiOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const MUSIC_MANIFEST: ModuleManifest = {
  id: 'music',
  name: 'Музыка',
  version: '1.0.0',
  size: 2 * 1024 * 1024,
  url: import.meta.env.VITE_MUSIC_MODULE_URL || '/modules/music/music-module.js',
  entryFile: 'music-module.js',
  entryComponent: 'default',
};

export function MusicPage() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [status, setStatus] = useState<'checking' | 'downloading' | 'loading' | 'ready' | 'error'>('checking');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) {
      loadNativeModule();
    } else {
      loadWebModule();
    }
  }, [isNative]);

  async function loadNativeModule() {
    try {
      setStatus('checking');
      const installed = await moduleLoader.isInstalled('music');

      if (!installed) {
        if (!isOnline) {
          setError('Требуется интернет для установки модуля');
          setStatus('error');
          return;
        }
        setStatus('downloading');
        await moduleLoader.install('music', MUSIC_MANIFEST, (downloaded: number, total: number) => {
          const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          setProgress(percent);
        });
      }

      setStatus('loading');
      const Comp = await moduleLoader.loadModule<React.ComponentType>('music', MUSIC_MANIFEST.entryComponent);
      setComponent(() => Comp);
      setStatus('ready');
    } catch (err: any) {
      console.error('Music module error:', err);
      setError(err.message || 'Ошибка при загрузке модуля');
      setStatus('error');
    }
  }

  async function loadWebModule() {
    try {
      setStatus('loading');

      // Попытка 1: локальный модуль (если собран и положили в public/)
      try {
        const localUrl = '/modules/music/music-module.js';
        const module = await import(/* webpackIgnore: true */ localUrl);
        const Comp = MUSIC_MANIFEST.entryComponent === 'default' ? module.default : module[MUSIC_MANIFEST.entryComponent!];
        setComponent(() => Comp);
        setStatus('ready');
        return;
      } catch (e) {
        console.log('Local module not found, trying CDN...');
      }

      // Попытка 2: CDN URL
      const cdnUrl = import.meta.env.VITE_MUSIC_MODULE_URL || 'http://localhost:3080/modules/music-module.js';
      const module = await import(/* webpackIgnore: true */ cdnUrl);
      const Comp = MUSIC_MANIFEST.entryComponent === 'default' ? module.default : module[MUSIC_MANIFEST.entryComponent!];
      setComponent(() => Comp);
      setStatus('ready');
    } catch (err: any) {
      console.error('Failed to load music module:', err);
      setError('Не удалось загрузить музыкальный модуль. Проверьте, доступен ли CDN или соберите модуль.');
      setStatus('error');
    }
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="max-w-md w-full p-6 bg-card border border-border rounded-lg shadow-lg text-center">
          <X className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Ошибка модуля «Музыка»</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.history.back()}>
              Назад
            </Button>
            <Button onClick={() => window.location.reload()}>
              Повторить
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-md w-full p-6 bg-card border border-border rounded-lg shadow-lg">
          <div className="text-center mb-6">
            <Download className="w-10 h-10 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-1">Установка модуля «Музыка»</h2>
            <p className="text-sm text-muted-foreground">Скачивание с сервера... (~2 МБ)</p>
          </div>
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{Math.round(progress)}%</span>
              <span>{progress < 100 ? 'Загрузка...' : 'Установка завершена'}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
            {isOnline ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
            <span>{isOnline ? 'Интернет подключён' : 'Нет интернета'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'checking' || status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {status === 'checking' ? 'Проверка модуля...' : 'Загрузка модуля...'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'ready' && Component) {
    return <Component />;
  }

  return null;
}

export default MusicPage;
