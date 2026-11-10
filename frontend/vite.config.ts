import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy `npm run dev` với VITE_USE_MOCK=false, mọi request /api được chuyển tiếp sang backend (M3).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.VITE_API_PROXY || 'http://localhost:8080', changeOrigin: true },
      },
    },
  };
});
