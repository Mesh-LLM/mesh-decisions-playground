import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser', workers: 1,
  use: { baseURL: 'http://127.0.0.1:18787', headless: true },
  webServer: { command: 'node server.mjs', port: 18787, env: { PORT: '18787' }, reuseExistingServer: false },
});
