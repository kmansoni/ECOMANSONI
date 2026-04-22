import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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

bootstrapMansoniIntegration();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
