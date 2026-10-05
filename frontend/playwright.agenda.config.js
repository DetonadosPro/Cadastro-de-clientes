import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e', testMatch:'agenda-moderna.spec.js', timeout:30000, workers:1,
  use:{baseURL:'http://127.0.0.1:5183',channel:'msedge',timezoneId:'America/Sao_Paulo',hasTouch:true,screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',url:'http://127.0.0.1:5183',reuseExistingServer:false},
});
