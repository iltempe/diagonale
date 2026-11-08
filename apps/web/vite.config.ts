import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. /diagonale/).
// `vite build --mode desktop` builds the Electron bundle: no service worker (served from app://).
export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop';
  const base = desktop ? '/' : (process.env.BASE_PATH ?? '/');
  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '') },
    plugins: [
      react(),
      !desktop &&
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg'],
          manifest: {
            name: 'Diagonale — La tattica, fase per fase',
            short_name: 'Diagonale',
            description: 'Lavagna tattica animata open source per allenatori.',
            theme_color: '#0F3D2E',
            background_color: '#0B2B20',
            display: 'standalone',
            orientation: 'any',
            start_url: base,
            scope: base,
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          },
        }),
    ],
    build: {
      target: 'es2022',
      sourcemap: !desktop,
      chunkSizeWarningLimit: 1500,
      outDir: desktop ? 'dist-desktop' : 'dist',
    },
  };
});
