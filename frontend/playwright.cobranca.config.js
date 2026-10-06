import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: ['cobranca-retorno.spec.js', 'cobranca-moderna.spec.js', 'cobranca-posicao.spec.js'], timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5184', channel: 'msedge', timezoneId: 'America/Sao_Paulo', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5184 --strictPort', url: 'http://127.0.0.1:5184', reuseExistingServer: false },
});
