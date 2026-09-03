import { defineConfig } from 'vite';

export default defineConfig({
  // Set base to './' so assets are resolved correctly in Electron file:// protocol
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
