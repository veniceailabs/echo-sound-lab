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
            manualChunks(id) {
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
                return 'vendor-react';
              }
              if (id.includes('node_modules/framer-motion')) {
                return 'vendor-motion';
              }
              if (
                id.includes('@webaudiomodules/api') ||
                id.includes('@webaudiomodules/sdk') ||
                id.includes('@breezystack/lamejs')
              ) {
                return 'vendor-audio';
              }
              if (id.includes('/src/components/demo/') || id.includes('/src/services/demo/')) {
                return 'feature-demo';
              }
              if (
                id.includes('/src/components/AIStudio') ||
                id.includes('/src/components/APL/') ||
                id.includes('/src/services/AIAgentService') ||
                id.includes('/src/services/APLAnalysisService') ||
                id.includes('/src/services/geminiService')
              ) {
                return 'feature-ai';
              }
              if (
                id.includes('/src/components/HistoryTimeline') ||
                id.includes('/src/services/historyManager') ||
                id.includes('/src/services/sessionManager')
              ) {
                return 'feature-history';
              }
              if (
                id.includes('/src/services/AudioPlaybackEngine') ||
                id.includes('/src/services/OfflineRenderService') ||
                id.includes('/src/services/AssetRegistry') ||
                id.includes('/src/services/ProvenanceLedger')
              ) {
                return 'feature-engine';
              }
              return undefined;
            },
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
