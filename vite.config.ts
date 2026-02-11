import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3005,
        host: '0.0.0.0',
        proxy: {
          '/api/video': {
            target: 'http://localhost:3006',
            changeOrigin: true
          }
        }
      },
      plugins: [react()],
      build: {
        target: 'es2022',
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-motion': ['framer-motion'],
              'vendor-ai': ['@google/genai'],
              'vendor-audio': ['@webaudiomodules/api', '@webaudiomodules/sdk', '@breezystack/lamejs'],
            },
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.VITE_SUNO_API_KEY': JSON.stringify(env.VITE_SUNO_API_KEY),
        'process.env.VITE_SUNO_API_URL': JSON.stringify(env.VITE_SUNO_API_URL),
        'process.env.VITE_RATE_LIMIT_PER_DAY': JSON.stringify(env.VITE_RATE_LIMIT_PER_DAY)
      },
      resolve: {
        alias: {
          '@': path.resolve('.', './src'),
        }
      },
      optimizeDeps: {
        exclude: ['@breezystack/lamejs', '@google/genai']
      }
    };
});
