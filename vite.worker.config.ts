import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Hosted variant only. Bundles functions/worker.ts into dist/_worker.js, which
 * is what Cloudflare Pages runs in front of the static build. Kept separate
 * from the client build so the BYOK deployment stays pure static output.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@/components': resolvePath('./src/components'),
      '@/lib': resolvePath('./src/lib'),
      '@/modules': resolvePath('./src/modules'),
      '@/data': resolvePath('./src/data'),
    },
  },
  ssr: {
    target: 'webworker',
    noExternal: true,
  },
  build: {
    ssr: 'functions/worker.ts',
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    rollupOptions: {
      output: {
        entryFileNames: '_worker.js',
        format: 'es',
        inlineDynamicImports: true,
      },
    },
  },
});
