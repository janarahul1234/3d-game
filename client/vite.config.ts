import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(here, '../shared/src'),
      '@': path.resolve(here, './src'),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), '.'],
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
  },
});
