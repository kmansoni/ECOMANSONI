import { defineConfig } from "@playwright/test";

/**
 * Playwright конфиг для SFU-тестов без E2EE.
 *
 * Запуск (все три компонента):
 *   pwsh scripts/start-vite-sfu-e2e.ps1    # Vite на 8093 с REQUIRE_SFRAME=false
 *   pwsh scripts/start-test-browser.ps1    # Chromium с CDP на 9222
 *   $env:E2E_SUPABASE_URL='...'; $env:E2E_SUPABASE_KEY='...'; $env:E2E_PASSWORD='...'
 *   npx playwright test -c playwright.sfu.config.ts --reporter=line
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["calls-sfu.spec.ts"],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  timeout: 180_000,

  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8093",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Не запускать браузер из конфига — фикстура sfu-fixture.ts соединяется через CDP
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--allow-file-access",
        "--no-sandbox",
      ],
    },
  },

  projects: [
    {
      name: "sfu-chromium",
      use: { browserName: "chromium" },
    },
  ],
});
