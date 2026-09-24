import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/validarAmbienteQA.mjs',
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.QA_E2E_BASE_URL || 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: 'msedge',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
