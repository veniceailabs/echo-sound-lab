import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
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
            // Let Vite handle chunking automatically to prevent load order issues
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve('.', './src'),
        }
      },
      optimizeDeps: {
        exclude: ['@breezystack/lamejs']
      }
    };
});
