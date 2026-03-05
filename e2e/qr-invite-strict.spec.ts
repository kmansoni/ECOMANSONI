import { test, expect } from "@playwright/test";

const STRICT_ENABLED = process.env.E2E_QR_STRICT === "1";

type SeedResult = {
  channelName: string;
  groupName: string;
  channelInviteToken: string;
  groupInviteToken: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function seedQrInviteFixtures(request: import("@playwright/test").APIRequestContext): Promise<SeedResult> {
  const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ownerId = requireEnv("E2E_OWNER_ID");

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const channelName = `e2e-qr-channel-${suffix}`;
  const groupName = `e2e-qr-group-${suffix}`;

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const channelCreate = await request.post(`${supabaseUrl}/rest/v1/channels`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: {
      name: channelName,
      owner_id: ownerId,
      is_public: true,
      member_count: 1,
    },
  });
  if (!channelCreate.ok()) {
    throw new Error(`Failed to create channel fixture: ${channelCreate.status()} ${await channelCreate.text()}`);
  }
  const [channelRow] = (await channelCreate.json()) as Array<{ id: string }>;

  const channelMemberCreate = await request.post(`${supabaseUrl}/rest/v1/channel_members`, {
    headers,
    data: {
      channel_id: channelRow.id,
      user_id: ownerId,
      role: "owner",
    },
  });
  if (!channelMemberCreate.ok()) {
    throw new Error(`Failed to create channel member fixture: ${channelMemberCreate.status()} ${await channelMemberCreate.text()}`);
  }

  const channelInvite = await request.post(`${supabaseUrl}/rest/v1/rpc/create_channel_invite`, {
    headers,
    data: {
      _channel_id: channelRow.id,
      _max_uses: null,
      _ttl_hours: 24,
    },
  });
  if (!channelInvite.ok()) {
    throw new Error(`Failed to create channel invite token: ${channelInvite.status()} ${await channelInvite.text()}`);
  }
  const channelInviteToken = String(await channelInvite.json());

  const groupCreate = await request.post(`${supabaseUrl}/rest/v1/group_chats`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: {
      name: groupName,
      owner_id: ownerId,
      member_count: 1,
    },
  });
  if (!groupCreate.ok()) {
    throw new Error(`Failed to create group fixture: ${groupCreate.status()} ${await groupCreate.text()}`);
  }
  const [groupRow] = (await groupCreate.json()) as Array<{ id: string }>;

  const groupMemberCreate = await request.post(`${supabaseUrl}/rest/v1/group_chat_members`, {
    headers,
    data: {
      group_id: groupRow.id,
      user_id: ownerId,
      role: "owner",
    },
  });
  if (!groupMemberCreate.ok()) {
    throw new Error(`Failed to create group member fixture: ${groupMemberCreate.status()} ${await groupMemberCreate.text()}`);
  }

  const groupInvite = await request.post(`${supabaseUrl}/rest/v1/rpc/create_group_invite`, {
    headers,
    data: {
      _group_id: groupRow.id,
      _max_uses: null,
      _ttl_hours: 24,
    },
  });
  if (!groupInvite.ok()) {
    throw new Error(`Failed to create group invite token: ${groupInvite.status()} ${await groupInvite.text()}`);
  }
  const groupInviteToken = String(await groupInvite.json());

  return { channelName, groupName, channelInviteToken, groupInviteToken };
}

async function enableGuestMode(page: import("@playwright/test").Page): Promise<void> {
  await page.context().addInitScript(() => {
    window.localStorage.setItem("dev_guest_mode", "1");
  });
}

test.describe("strict: QR invite menu options", () => {
  test.skip(!STRICT_ENABLED, "Set E2E_QR_STRICT=1 to run strict seeded QR invite tests");
  test.describe.configure({ mode: "serial" });

  let seed: SeedResult;

  test.beforeAll(async ({ request }) => {
    seed = await seedQrInviteFixtures(request);
  });

  test("channel menu shows QR invite item and opens dialog", async ({ page }) => {
    await enableGuestMode(page);
    await page.goto(`/chats?channel_invite=${encodeURIComponent(seed.channelInviteToken)}`);

    await expect(page.getByText(seed.channelName).first()).toBeVisible({ timeout: 15000 });
    await page.getByText(seed.channelName).first().click();

    await page.locator("button:has(svg.lucide-more-vertical)").first().click();
    await expect(page.getByRole("menuitem", { name: /Показать QR-приглашение/i })).toBeVisible();

    await page.getByRole("menuitem", { name: /Показать QR-приглашение/i }).click();
    await expect(page.getByRole("heading", { name: /QR-приглашение в канал/i })).toBeVisible();
  });

  test("group menu shows QR invite item and opens dialog", async ({ page }) => {
    await enableGuestMode(page);
    await page.goto(`/chats?group_invite=${encodeURIComponent(seed.groupInviteToken)}`);

    await expect(page.getByText(seed.groupName).first()).toBeVisible({ timeout: 15000 });
    await page.getByText(seed.groupName).first().click();

    await page.locator("button:has(svg.lucide-more-vertical)").first().click();
    await expect(page.getByRole("menuitem", { name: /Показать QR-приглашение/i })).toBeVisible();

    await page.getByRole("menuitem", { name: /Показать QR-приглашение/i }).click();
    await expect(page.getByRole("heading", { name: /QR-приглашение в группу/i })).toBeVisible();
  });
});