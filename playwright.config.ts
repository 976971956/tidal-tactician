import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:47832'
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  use: { baseURL },
  webServer: {
    command: 'npm run preview -- --port 47832 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
  projects: [
    { name: '桌面 Chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'iPhone WebKit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
})
