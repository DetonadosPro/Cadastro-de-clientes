import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const versaoBuild = process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.VITE_APP_VERSION
  || `local-${Date.now()}`;

// Configuração do Vite. O "host: true" permite que outras pessoas na
// mesma rede local acessem o sistema pelo IP deste computador
// (ex: http://192.168.0.10:5173), não só pelo localhost.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(versaoBuild),
  },
  plugins: [
    react(),
    {
      name: 'gerar-versao-do-app',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ versao: versaoBuild }),
        });
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Qualquer chamada do frontend para /api é redirecionada
      // automaticamente para o backend rodando na porta 3001.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
