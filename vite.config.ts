import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
                return 'vendor-react';
              }
              if (id.includes('lucide-react') || id.includes('framer-motion') || id.includes('motion') || id.includes('canvas-confetti')) {
                return 'vendor-utils';
              }
              if (id.includes('pdfjs-dist') || id.includes('pdf-lib')) {
                return 'vendor-pdf';
              }
              if (id.includes('fabric')) {
                return 'vendor-canvas';
              }
              if (id.includes('tesseract.js') || id.includes('onnxruntime-web') || id.includes('opencv-js')) {
                return 'vendor-ml';
              }
              if (id.includes('jszip')) {
                return 'vendor-zip';
              }
            }
          }
        }
      },
      chunkSizeWarningLimit: 1000,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
