// Builds the app: app/app.html (+ app.css, main.js) → dist/app.html and dist/assets/*.[hash].{js,css}.
// Everything in public/ (landing pages, icons, fonts, sw.js, i18n/en.js, vendor/supabase-js …) is copied to dist/ as it is.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',              // no rewriting: the browsers that ran the app before run it the same way
    modulePreload: { polyfill: false },
    sourcemap: 'hidden',           // .map files for reading error reports; pages don't point to them
    rollupOptions: { input: 'app/app.html' },
  },
});
