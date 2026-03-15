import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({mode}) => {
  // Ensure the transparent logo and other assets are generated before Vite starts building
  try {
    console.log('Generating assets (favicon, social preview, etc.)...');
    execSync('node generate-assets.js', { stdio: 'inherit' });
    console.log('Generating sitemap...');
    execSync('node generate-sitemap.js', { stdio: 'inherit' });
  } catch (e) {
    console.error('Warning: Failed to generate assets during Vite build:', e);
  }

  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
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
