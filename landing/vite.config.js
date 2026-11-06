// AI-assisted: Used Claude for the landing page build setup
import { defineConfig } from 'vite';

// Built into the Next.js public folder, then served at / by the rewrite in frontend/next.config.ts.
export default defineConfig({
  base: '/landing/',
  build: { outDir: '../frontend/public/landing', emptyOutDir: true },
});
