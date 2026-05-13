import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './App';
import './styles/index.css';
import { setMansoniToken, getAuthToken } from './lib/supabase';

// Единый вход для получения токена из любого доступного источника
function resolveMansoniToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) return urlToken;

  const metaToken = document.querySelector('meta[name="mansoni-token"]')?.getAttribute('content');
  if (metaToken) return metaToken;

  // getAuthToken() проверяет глобальную переменную, sessionStorage, localStorage
  return getAuthToken();
}

// Бутстрап: устанавливаем токен и оповещаем родительское приложение
function bootstrapMansoniIntegration() {
  const token = resolveMansoniToken();
  if (token) {
    setMansoniToken(token);
    sessionStorage.setItem('mansoni_token', token);
  }

  if (window.parent !== window) {
    window.parent.postMessage({ type: 'MUSIC_MODULE_READY' }, '*');
  }
}

bootstrapMansoniIntegration();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppRoutes />
    </BrowserRouter>
  </React.StrictMode>
);