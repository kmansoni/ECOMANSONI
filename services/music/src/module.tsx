import { useEffect } from 'react';
import { MusicAppRoutes } from './App';
import AudioPlayer from './components/AudioPlayer';
import './styles/index.css';
import { setMansoniToken } from './lib/supabase';

function bootstrapMansoniIntegration() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (token) {
    setMansoniToken(token);
  }

  if (window.parent !== window) {
    window.parent.postMessage({ type: 'MUSIC_MODULE_READY' }, '*');
  }
}

export default function MusicModule() {
  useEffect(() => {
    bootstrapMansoniIntegration();
  }, []);

  return (
    <>
      <MusicAppRoutes />
      <AudioPlayer />
    </>
  );
}