/**
 * MiniAppContainer - Контейнер для мини-приложений
 * 
 * Интегрированный iframe для отображения мини-приложений
 * как в Telegram Mini Apps.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MiniAppContainerProps {
  /** URL мини-приложения */
  url: string;
  /** ID мини-приложения */
  appId?: string;
  /** Контекст бота (если запущено из бота) */
  botContext?: {
    bot_id: string;
    user_id: string;
    chat_id?: string;
  };
  /** Показывать в полноэкранном режиме */
  fullscreen?: boolean;
  /** Колбэк при закрытии */
  onClose?: () => void;
  /** Колбэк при готовности */
  onReady?: () => void;
  /** Колбэк при ошибке */
  onError?: (error: Error) => void;
  /** Дополнительные классы */
  className?: string;
}

export function MiniAppContainer({
  url,
  appId,
  botContext,
  fullscreen = false,
  onClose,
  onReady,
  onError,
  className,
}: MiniAppContainerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Build URL with query params
  const appUrl = React.useMemo(() => {
    const urlObj = new URL(url);
    urlObj.searchParams.set('platform', 'web');
    urlObj.searchParams.set('app_id', appId || '');
    
    if (botContext) {
      urlObj.searchParams.set('bot_id', botContext.bot_id);
      urlObj.searchParams.set('user_id', botContext.user_id);
      if (botContext.chat_id) {
        urlObj.searchParams.set('chat_id', botContext.chat_id);
      }
    }
    
    return urlObj.toString();
  }, [url, appId, botContext]);

  const handleLoad = () => {
    setLoading(false);
    onReady?.();
  };

  const handleError = () => {
    setLoading(false);
    setError('Failed to load mini app');
    onError?.(new Error('Failed to load mini app'));
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setRetryCount(prev => prev + 1);
    
    if (iframeRef.current) {
      iframeRef.current.src = appUrl;
    }
  };

  const handleClose = useCallback(() => {
    // Send close message to mini app
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'close' },
        '*'
      );
    }
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    // Listen for messages from mini app
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ready') {
        onReady?.();
      } else if (event.data?.type === 'close') {
        handleClose();
      } else if (event.data?.type === 'error') {
        onError?.(new Error(event.data.message || 'Mini app error'));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onReady, onError, handleClose]);

  return (
    <div
      className={cn(
        "relative flex flex-col bg-background",
        fullscreen ? "fixed inset-0 z-50" : "rounded-xl border overflow-hidden",
        className
      )}
    >
      {/* Header (only in non-fullscreen mode) */}
      {!fullscreen && (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
          <div className="flex items-center gap-2">
            {loading && (
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            <span className="text-sm font-medium">Mini App</span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-accent rounded-lg transition-colors"
              title="Открыть в новой вкладке"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-accent rounded-lg transition-colors"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen close button */}
      {fullscreen && (
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Iframe */}
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <p className="text-destructive mb-4">{error}</p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            >
              Повторить
            </button>
          </div>
        ) : (
          <iframe
            key={retryCount}
            ref={iframeRef}
            src={appUrl}
            className="w-full h-full border-0"
            allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
            onLoad={handleLoad}
            onError={handleError}
            title="Mini App"
          />
        )}
      </div>
    </div>
  );
}

export default MiniAppContainer;
