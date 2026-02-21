import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { browserSakAPI } from './lib/sakAPI.browser';

// Inject browser-mode API shim when not running inside Electron
// (i.e. opened directly in a browser at http://localhost:5173)
if (typeof window.sakAPI === 'undefined') {
  (window as any).sakAPI = browserSakAPI;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
