import { test, expect } from "@playwright/test";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

async function seedMultiAccountStorage(page: any) {
  await page.evaluate(
    ({ a, b }) => {
      const keyIndex = "ma:v1:accountsIndex";
      const keyActive = "ma:v1:activeAccountId";

      const now = new Date().toISOString();
      const accountsIndex = [
        {
          accountId: a,
          addedAt: now,
          lastActiveAt: now,
          requiresReauth: false,
          profile: { accountId: a, displayName: "Account A", username: "alice", avatarUrl: null, updatedAt: now },
        },
        {
          accountId: b,
          addedAt: now,
          lastActiveAt: now,
          requiresReauth: false,
          profile: { accountId: b, displayName: "Account B", username: "bob", avatarUrl: null, updatedAt: now },
        },
      ];

      localStorage.setItem(keyIndex, JSON.stringify(accountsIndex));
      localStorage.setItem(keyActive, a);

      // Tokens must exist as strings so pruneAccountsIndex() doesn't delete entries.
      localStorage.setItem(`ma:v1:tokens:${a}`, JSON.stringify({ accessToken: "x", refreshToken: "y", expiresAt: null }));
      localStorage.setItem(`ma:v1:tokens:${b}`, JSON.stringify({ accessToken: "x", refreshToken: "y", expiresAt: null }));
    },
    { a: A, b: B },
  );

  // Reload so the app reads seeded storage on startup.
  await page.reload();
}

test.describe("multi-account: multi-tab sync", () => {
  test("storage event: tab B follows activeAccountId change", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto("/");
    await page2.goto("/");

    await seedMultiAccountStorage(page1);
    await seedMultiAccountStorage(page2);

    // Change active in tab1; tab2 should react via storage event.
    await page1.evaluate((b) => {
      localStorage.setItem("ma:v1:activeAccountId", b);
    }, B);

    await expect.poll(async () => {
      return await page2.evaluate(() => localStorage.getItem("ma:v1:activeAccountId"));
    }).toBe(B);
  });

  test("BroadcastChannel: tab B follows active_changed message", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto("/");
    await page2.goto("/");

    await seedMultiAccountStorage(page1);
    await seedMultiAccountStorage(page2);

    await page1.evaluate((b) => {
      const bc = new BroadcastChannel("multi-account:v1");
      bc.postMessage({ type: "active_changed", accountId: b, source: "test-source", ts: Date.now() });
      bc.close();
    }, B);

    await expect.poll(async () => {
      return await page2.evaluate(() => localStorage.getItem("ma:v1:activeAccountId"));
    }).toBe(B);
  });
});
