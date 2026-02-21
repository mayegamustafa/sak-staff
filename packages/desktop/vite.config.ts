import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendURL = env.VITE_SERVER_URL || 'http://localhost:4000';

  return {
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@sak/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy all /api/ requests to the backend — eliminates CORS entirely
      '/api': {
        target: backendURL,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Target ES2015 (ES6) so the web app works in any browser released since 2016
    // Chrome 49+, Firefox 52+, Edge 15+, Safari 10.1+ — covers Windows 7/8/8.1 browsers
    target: 'es2015',
  },
  };
});
