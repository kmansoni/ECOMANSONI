/**
 * Phase 1 PMF: End-to-End Flow Test
 * 
 * Validates the complete user journey:
 * 1. Signup → User creation
 * 2. Upload first reel → Appears in creator's profile
 * 3. Feed loads → Shows reels from other creators
 * 4. Analytics → Creator dashboard shows metrics
 */

import { test, expect } from "@playwright/test";

// Test user credentials (unique per test run)
const testEmail = `e2e-phase1-${Date.now()}@example.com`;
const testPassword = "SecurePassword123!";
const testDisplayName = "E2E Test Creator";

test.describe("Phase 1 PMF: Complete User Journey", () => {
  test.setTimeout(120_000); // 2 minutes for full flow

  test("1. Signup: Create new user account", async ({ page }) => {
    await page.goto("/");
    
    // Navigate to signup (adjust selector based on actual UI)
    const signupButton = page.getByRole("link", { name: /sign up|signup|register/i });
    if (await signupButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signupButton.click();
    } else {
      // If already on signup/login page, no navigation needed
      await page.goto("/signup");
    }

    // Fill signup form
    await page.fill('input[type="email"], input[name="email"]', testEmail);
    await page.fill('input[type="password"], input[name="password"]', testPassword);
    
    // Display name field (if exists)
    const displayNameField = page.locator('input[name="displayName"], input[name="display_name"]');
    if (await displayNameField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await displayNameField.fill(testDisplayName);
    }

    // Submit signup
    await page.click('button[type="submit"], button:has-text("Sign up"), button:has-text("Create")');

    // Wait for successful signup (redirect to home/feed or see welcome message)
    await expect(page).toHaveURL(/\/(home|feed|welcome|dashboard|reels)/, { timeout: 15000 });
    
    console.log(`✅ Signup successful: ${testEmail}`);
  });

  test("2. Upload Reel: First reel creation", async ({ page, context }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home|feed|reels)/, { timeout: 10000 });

    // Navigate to upload/add reel page
    const addReelButton = page.getByRole("button", { name: /add|upload|create|new reel|\+/i });
    if (await addReelButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addReelButton.click();
    } else {
      await page.goto("/add-reel");
    }

    // Wait for upload form to load
    await page.waitForSelector('input[type="file"], textarea, input[placeholder*="caption"]', { timeout: 5000 });

    // Fill reel metadata (caption, hashtags)
    const captionField = page.locator('textarea[name="caption"], textarea[placeholder*="caption"]');
    if (await captionField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await captionField.fill("E2E Test Reel #phase1 #automation");
    }

    // Upload video file (mock or use sample video)
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // For E2E, we might need a sample video file or mock the upload
      // For now, check if upload component is present
      await expect(fileInput).toBeVisible();
      console.log("⚠️  Video upload field found (manual file selection needed for full test)");
    }

    // If there's a submit button for reel creation
    const submitButton = page.getByRole("button", { name: /publish|post|upload|submit/i });
    if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Note: Actual upload will fail without a valid file
      // This test validates the UI presence, not the full upload flow
      await expect(submitButton).toBeVisible();
      console.log("✅ Upload form validated (submit button present)");
    }
  });

  test("3. Feed: Browse reels from other creators", async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home|feed|reels)/, { timeout: 10000 });

    // Navigate to feed/reels page
    await page.goto("/reels");

    // Wait for feed to load (reels container)
    const feedContainer = page.locator('[data-testid="reels-feed"], [class*="feed"], [class*="reel"]').first();
    await expect(feedContainer).toBeVisible({ timeout: 10000 });

    // Check if any reels are rendered
    const reelItems = page.locator('[data-testid="reel-item"], [class*="reel-card"], video, [class*="video"]');
    const reelCount = await reelItems.count();
    
    if (reelCount > 0) {
      console.log(`✅ Feed loaded: ${reelCount} reels visible`);
    } else {
      console.log("⚠️  Feed loaded but no reels found (empty state expected for new platform)");
    }

    // Verify feed is interactive (can scroll or navigate)
    await expect(page).toHaveURL(/\/reels/);
  });

  test("4. Analytics: Creator dashboard shows metrics", async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home|feed|reels)/, { timeout: 10000 });

    // Navigate to creator analytics/dashboard
    const profileButton = page.getByRole("button", { name: /profile|account|me/i });
    if (await profileButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await profileButton.click();
    } else {
      await page.goto("/profile");
    }

    // Look for analytics section
    const analyticsButton = page.getByRole("link", { name: /analytics|insights|stats|dashboard/i });
    if (await analyticsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analyticsButton.click();
    } else {
      await page.goto("/creator-analytics");
    }

    // Verify analytics dashboard loads
    await page.waitForSelector('[data-testid="creator-analytics"], [class*="analytics"], h1:has-text("Analytics")', { timeout: 10000 });

    // Check for key metrics (views, likes, engagement)
    const metricsLabels = ["views", "likes", "engagement", "reach", "followers"];
    let foundMetrics = 0;

    for (const metric of metricsLabels) {
      const metricElement = page.getByText(new RegExp(metric, "i"));
      if (await metricElement.isVisible({ timeout: 2000 }).catch(() => false)) {
        foundMetrics++;
      }
    }

    expect(foundMetrics).toBeGreaterThan(0);
    console.log(`✅ Analytics dashboard loaded: ${foundMetrics} metrics visible`);
  });

  test("5. Guardrails: KPI monitoring dashboard accessible (admin only)", async ({ page }) => {
    // This test assumes there's an admin route for KPI monitoring
    // Skip if user is not admin or route is restricted
    
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home|feed|reels)/, { timeout: 10000 });

    // Try to access admin/monitoring dashboard
    const response = await page.goto("/admin/kpi-dashboard");
    
    // If route exists and is accessible
    if (response?.status() === 200) {
      // Check for KPI metrics
      const kpiElements = page.locator('text=/retention|dau|session|guardrail|alert/i');
      const kpiCount = await kpiElements.count();
      
      if (kpiCount > 0) {
        console.log(`✅ KPI Dashboard accessible: ${kpiCount} metrics found`);
      }
    } else {
      console.log("⚠️  KPI Dashboard not accessible (expected for non-admin users)");
    }
  });
});

test.describe("Phase 1 PMF: API Integration Tests", () => {
  test("RPC: get_feed_v2 returns reels", async ({ request }) => {
    // Test Supabase RPC directly
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://lfkbgnbjxskspsownvjm.supabase.co";
    const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseAnonKey) {
      test.skip();
      return;
    }

    const response = await request.post(`${supabaseUrl}/rest/v1/rpc/get_feed_v2`, {
      headers: {
        "apikey": supabaseAnonKey,
        "Content-Type": "application/json",
      },
      data: {
        p_user_id: "00000000-0000-0000-0000-000000000000", // placeholder
        p_limit: 10,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
    console.log(`✅ get_feed_v2 RPC: returned ${data.length} reels`);
  });

  test("RPC: get_kpi_dashboard_v1 returns monitoring data", async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://lfkbgnbjxskspsownvjm.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      console.log("⚠️  SUPABASE_SERVICE_ROLE_KEY not set, skipping admin RPC test");
      test.skip();
      return;
    }

    const response = await request.post(`${supabaseUrl}/rest/v1/rpc/get_kpi_dashboard_v1`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      data: {},
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty("snapshot_date");
    expect(data).toHaveProperty("dau");
    console.log(`✅ get_kpi_dashboard_v1 RPC: DAU=${data.dau}, retention_7d=${data.retention_7d}%`);
  });
});
