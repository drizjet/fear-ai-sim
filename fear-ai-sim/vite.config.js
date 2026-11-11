import { defineConfig } from 'vite';

export default defineConfig({
  // Set base to './' so assets are resolved correctly when the built app is loaded from disk by the Tauri shell
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
