import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

// Ленивая загрузка страниц для уменьшения начального бандла
const MusicHomePage = lazy(() => import('./pages/MusicHomePage'));
const PlaylistPage = lazy(() => import('./pages/PlaylistPage'));
const TrackPage = lazy(() => import('./pages/TrackPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));

// Компонент загрузчика
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

// Главный компонент модуля
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Главная страница — лента рекомендаций */}
          <Route path="/" element={<MusicHomePage />} />

          {/* Плейлист */}
          <Route path="/playlist/:id" element={<PlaylistPage />} />

          {/* Страница трека */}
          <Route path="/track/:id" element={<TrackPage />} />

          {/* Поиск */}
          <Route path="/search" element={<SearchPage />} />

          {/* Редирект с /music/* на / */}
          <Route path="/music/*" element={<Navigate to="/" replace />} />

          {/* 404 внутри модуля */}
          <Route path="*" element={
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <h2 className="text-2xl font-bold mb-2">Страница не найдена</h2>
              <p className="text-muted-foreground">В musicaльном模块е</p>
            </div>
          } />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
