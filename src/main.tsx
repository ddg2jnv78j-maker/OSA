import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Clean up any conflicting dev-sw registrations and register the unified OSA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (scriptUrl && !scriptUrl.endsWith('/service-worker.js')) {
          await reg.unregister();
        }
      }
      const baseUrl = import.meta.env.BASE_URL || '/';
      await navigator.serviceWorker.register(`${baseUrl}service-worker.js`, {
        scope: baseUrl,
      });
    } catch {
      // Ignore SW registration errors in restricted preview contexts
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
