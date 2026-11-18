import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' ensures assets resolve cleanly on GitHub Pages regardless of repo name or custom domain
export default defineConfig({
  base: './',
  plugins: [react()],
});
