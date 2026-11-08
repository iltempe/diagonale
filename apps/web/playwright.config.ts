import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173/diagonale/', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'BASE_PATH=/diagonale/ pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort --base /diagonale/',
    url: 'http://localhost:4173/diagonale/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
