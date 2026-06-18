import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // En dev local, proxy /api vers netlify dev (port 8888)
    proxy: {
      '/api': 'http://localhost:8888'
    }
  }
});
