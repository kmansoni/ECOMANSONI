import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MusicAppRoutes } from './App';
import AudioPlayer from './components/AudioPlayer';
import './styles/index.css';
import { setMansoniToken } from './lib/supabase';

function getMansoniToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) return urlToken;

  const metaToken = document.querySelector('meta[name="mansoni-token"]')?.getAttribute('content');
  if (metaToken) return metaToken;

  return sessionStorage.getItem('mansoni_token');
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Music module error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-900/50 text-red-200 rounded" role="alert">
          <h3 className="font-bold mb-2">Ошибка музыкального модуля</h3>
          <p className="text-sm">{this.state.error?.message || 'Неизвестная ошибка'}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MusicModule() {
  useEffect(() => {
    const token = getMansoniToken();
    if (token) {
      setMansoniToken(token);
      sessionStorage.setItem('mansoni_token', token);
    }

    if (window.parent !== window) {
      window.parent.postMessage({ type: 'MUSIC_MODULE_READY' }, '*');
    }
  }, []);

  return (
    <div className="music-module">
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <MusicAppRoutes />
        </BrowserRouter>
        <AudioPlayer />
      </ErrorBoundary>
    </div>
  );
}