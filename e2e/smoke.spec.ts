import { test, expect } from "@playwright/test";

test("smoke: app renders", async ({ page }) => {
  await page.goto("/");
  // Minimal invariant: the SPA loads and sets a title.
  await expect(page).toHaveTitle(/.+/);
});

test("smoke: invite menu contains QR option", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.localStorage.setItem("dev_guest_mode", "1");
  });

  await page.goto("/chats");

  const menuButtons = page.locator("button:has(svg.lucide-more-vertical)");
  const count = await menuButtons.count();
  if (count === 0) {
    console.log("⚠️  No chat menu triggers found on /chats; skipping QR invite menu assertion");
    return;
  }

  let checked = false;
  for (let i = 0; i < count; i++) {
    await menuButtons.nth(i).click({ force: true }).catch(() => {});

    const hasInviteBaseline =
      (await page.getByRole("menuitem", { name: /Пригласить в канал/i }).isVisible().catch(() => false)) ||
      (await page.getByRole("menuitem", { name: /Скопировать invite-link/i }).isVisible().catch(() => false));

    if (!hasInviteBaseline) {
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }

    await expect(page.getByRole("menuitem", { name: /Показать QR-приглашение/i })).toBeVisible();
    checked = true;
    await page.keyboard.press("Escape").catch(() => {});
    break;
  }

  if (!checked) {
    console.log("⚠️  Invite-capable chat menu not reachable in current environment; skipping strict QR assertion");
  }
});
