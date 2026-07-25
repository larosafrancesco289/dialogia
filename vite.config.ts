import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { injectThemeClass } from './src/lib/html';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The theme class has to land on <html> before first paint or the app flashes
 * the wrong palette. Injecting from the shared helper keeps the inline script
 * and the runtime theme logic on one source.
 */
const themeInit = () => ({
  name: 'dialogia-theme-init',
  transformIndexHtml() {
    return [{ tag: 'script', children: injectThemeClass(), injectTo: 'head' as const }];
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), themeInit()],
  resolve: {
    alias: {
      '@/components': resolvePath('./src/components'),
      '@/lib': resolvePath('./src/lib'),
      '@/modules': resolvePath('./src/modules'),
      '@/data': resolvePath('./src/data'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 3000,
  },
});
