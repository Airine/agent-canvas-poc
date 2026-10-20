import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './test/browser', timeout: 45000, workers: 1,
  outputDir: process.env.PI_SCRATCH_DIR ? path.join(process.env.PI_SCRATCH_DIR, 'integration/playwright') : './test-results',
  use: { baseURL: process.env.CANVAS_TEST_URL || 'http://127.0.0.1:5189', headless: true,
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
  },
  webServer: process.env.CANVAS_TEST_URL ? undefined : {
    command: 'npm run dev -- --port 5189 --strictPort', url: 'http://127.0.0.1:5189', reuseExistingServer: false,
  },
});
