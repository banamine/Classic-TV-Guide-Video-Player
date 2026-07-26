import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/Classic-TV-Guide-Video-Player/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
