import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type UserConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig((): UserConfig => {
  const base = process.env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      entries: ['index.html'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: ['**/android/**', '**/ios/**', '**/dist/**', '**/supabase/**'],
            },
    },
    preview: {
      port: 3000,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
