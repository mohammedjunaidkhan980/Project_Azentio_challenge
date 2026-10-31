import { defineConfig, devices } from '@playwright/test'

// Dedicated opt-in suite. Never imports mock route handlers or records credentials.
export default defineConfig({
  testDir: './e2e-live', workers: 1, timeout: 90000, reporter: 'list',
  outputDir: '.local/live-browser-results',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev -- --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
})
