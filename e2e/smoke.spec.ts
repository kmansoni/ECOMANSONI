import { test, expect } from "@playwright/test";

test("smoke: app renders", async ({ page }) => {
  await page.goto("/");
  // Minimal invariant: the SPA loads and sets a title.
  await expect(page).toHaveTitle(/.+/);
});
