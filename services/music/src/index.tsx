import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Хук для интеграции с Mansoni (передаём токен, если есть)
function useMansoniIntegration() {
  useEffect(() => {
    // Получаем токен из URL параметров (передан из Mansoni)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      // Сохраняем токен для API запросов
      localStorage.setItem('mansoni_token', token);
    }

    // Сообщаем Mansoni, что модуль загружен
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'MUSIC_MODULE_READY' }, '*');
    }
  }, []);
}

// Инициализируем интеграцию
useMansoniIntegration();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
