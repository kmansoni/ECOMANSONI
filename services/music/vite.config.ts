import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, '.'), // services/music/
  base: './', // относительные пути для загрузки из файловой системы
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/module.tsx'),
      name: 'MusicModule',
      formats: ['es'], // только ES modules для динамического импорта
      fileName: 'index',
    },
    rollupOptions: {
      // Внешние зависимости (уже в основном приложении)
      external: ['react', 'react-dom', 'react-router-dom'],
      output: {
        exports: 'named',
        entryFileNames: 'index.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3001,
    host: true,
  },
});
