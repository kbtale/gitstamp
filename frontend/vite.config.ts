import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    fs: {
      allow: ['..']
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
});
