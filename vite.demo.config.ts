import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { projectRoot, sourceAliases } from './config/entries';

export default defineConfig(({ command }) => ({
  root: resolve(projectRoot, 'demo'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: command === 'serve' ? sourceAliases : {},
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    outDir: resolve(projectRoot, 'demo-dist'),
    emptyOutDir: true,
  },
}));
