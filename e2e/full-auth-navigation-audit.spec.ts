/**
 * Full E2E Authentication & Navigation Audit
 * Tests all routes, captures console errors, validates auth flow
 */
import { test, expect, Page, ConsoleMessage } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

interface ConsoleEntry {
  type: string;
  text: string;
  url: string;
}

interface NetworkError {
  url: string;
  status: number;
  method: string;
  route: string;
}

// Helper to attach console and network listeners to a page
function attachListeners(
  page: Page,
  consoleLog: ConsoleEntry[],
  networkErrors: NetworkError[],
  currentRoute: { value: string }
) {
  page.on("console", (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type === "error" || type === "warning" || type === "warn") {
      consoleLog.push({
        type,
        text: msg.text(),
        url: currentRoute.value,
      });
    }
  });

  page.on("pageerror", (err) => {
    consoleLog.push({
      type: "pageerror",
      text: err.message,
      url: currentRoute.value,
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      networkErrors.push({
        url: response.url(),
        status,
        method: response.request().method(),
        route: currentRoute.value,
      });
    }
  });
}

test.describe("Full Auth & Navigation Audit", () => {
  const allConsoleErrors: ConsoleEntry[] = [];
  const allNetworkErrors: NetworkError[] = [];
  const routeResults: Record<string, { title: string; url: string; status: string; notes: string[] }> = {};

  // ─── Step 1 & 2: Homepage (unauthenticated) ───────────────────────────────
  test("Step 1-2: Open homepage and capture initial state", async ({ page }) => {
    const currentRoute = { value: "/" };
    attachListeners(page, allConsoleErrors, allNetworkErrors, currentRoute);

    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30_000 });

    const title = await page.title();
    const finalUrl = page.url();
    const bodyText = await page.locator("body").innerText().catch(() => "");

    // Check for common states
    const hasSpinner = await page.locator('[class*="spinner"], [class*="loader"], [class*="loading"]').count();
    const hasAuthForm = await page.locator('form, input[type="email"], input[type="password"]').count();
    const hasBlankContent = bodyText.trim().length < 50;

    // Screenshot the initial state
    await page.screenshot({ path: "e2e/screenshots/01-homepage.png", fullPage: true });

    routeResults["/"] = {
      title,
      url: finalUrl,
      status: hasAuthForm > 0 ? "AUTH_FORM" : hasSpinner > 0 ? "SPINNER" : hasBlankContent ? "BLANK" : "CONTENT",
      notes: [
        `Final URL: ${finalUrl}`,
        `Has auth form elements: ${hasAuthForm}`,
        `Has spinner: ${hasSpinner}`,
        `Body text length: ${bodyText.trim().length}`,
      ],
    };

    console.log("=== HOMEPAGE STATE ===");
    console.log(JSON.stringify(routeResults["/"], null, 2));

    // Verify page loaded at all
    expect(title).toBeTruthy();
  });

  // ─── Step 3: Auth page ────────────────────────────────────────────────────
  test("Step 3: Auth page validation and error handling", async ({ page }) => {
    const currentRoute = { value: "/auth" };
    const consoleEntries: ConsoleEntry[] = [];
    const networkEntries: NetworkError[] = [];
    attachListeners(page, consoleEntries, networkEntries, currentRoute);

    await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.screenshot({ path: "e2e/screenshots/02-auth-page.png", fullPage: true });

    const finalUrl = page.url();

    // Check form elements
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Войти"), button:has-text("Sign"), button:has-text("Login"), button:has-text("Вход")');

    const hasEmail = await emailInput.count();
    const hasPassword = await passwordInput.count();
    const hasSubmit = await submitBtn.count();

    console.log("=== AUTH PAGE ===");
    console.log(`URL: ${finalUrl}`);
    console.log(`Email inputs: ${hasEmail}, Password inputs: ${hasPassword}, Submit btns: ${hasSubmit}`);

    routeResults["/auth"] = {
      title: await page.title(),
      url: finalUrl,
      status: hasEmail > 0 ? "AUTH_FORM_PRESENT" : "NO_AUTH_FORM",
      notes: [
        `Email inputs: ${hasEmail}`,
        `Password inputs: ${hasPassword}`,
        `Submit buttons: ${hasSubmit}`,
      ],
    };

    // Sub-test 3a: Empty email validation
    if (hasSubmit > 0) {
      await submitBtn.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: "e2e/screenshots/03a-auth-empty-submit.png", fullPage: true });

      const validationMsg = await page.locator('[class*="error"], [class*="invalid"], [role="alert"], .text-red, .text-destructive').innerText().catch(() => "none");
      console.log(`Empty submit validation: ${validationMsg}`);
      routeResults["/auth"].notes.push(`Empty submit validation: ${validationMsg}`);
    }

    // Sub-test 3b: Invalid email format
    if (hasEmail > 0) {
      await emailInput.first().fill("test@");
      if (hasSubmit > 0) {
        await submitBtn.first().click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "e2e/screenshots/03b-auth-invalid-email.png", fullPage: true });
        const validationMsg = await page.locator('[class*="error"], [class*="invalid"], [role="alert"], .text-red, .text-destructive').innerText().catch(() => "none");
        console.log(`Invalid email validation: ${validationMsg}`);
        routeResults["/auth"].notes.push(`Invalid email (test@) validation: ${validationMsg}`);
      }
    }

    // Sub-test 3c: Non-existent account
    if (hasEmail > 0 && hasPassword > 0) {
      await emailInput.first().fill("nonexistent_user_xyz_12345@example.com");
      await passwordInput.first().fill("WrongPassword123!");
      if (hasSubmit > 0) {
        await submitBtn.first().click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: "e2e/screenshots/03c-auth-wrong-creds.png", fullPage: true });

        const errorMsg = await page.locator('[class*="error"], [class*="invalid"], [role="alert"], .text-red, .text-destructive, [class*="toast"]').innerText().catch(() => "none");
        console.log(`Wrong credentials response: ${errorMsg}`);
        routeResults["/auth"].notes.push(`Wrong credentials response: ${errorMsg}`);
      }
    }

    // Collect auth-specific errors
    allConsoleErrors.push(...consoleEntries);
    allNetworkErrors.push(...networkEntries);

    console.log(`Auth page console errors: ${consoleEntries.length}`);
    consoleEntries.forEach((e) => console.log(`  [${e.type}] ${e.text}`));
    console.log(`Auth page network errors: ${networkEntries.length}`);
    networkEntries.forEach((e) => console.log(`  [${e.status}] ${e.method} ${e.url}`));
  });

  // ─── Step 4: All main routes ──────────────────────────────────────────────
  const routes = [
    "/",
    "/chats",
    "/feed",
    "/reels",
    "/profile",
    "/settings",
    "/search",
    "/explore",
    "/notifications",
    "/create",
    "/people-nearby",
    "/live",
    "/shop",
    "/ai-assistant",
  ];

  for (const route of routes) {
    test(`Step 4: Route ${route}`, async ({ page }) => {
      const currentRoute = { value: route };
      const consoleEntries: ConsoleEntry[] = [];
      const networkEntries: NetworkError[] = [];
      attachListeners(page, consoleEntries, networkEntries, currentRoute);

      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 20_000 });

      const finalUrl = page.url();
      const title = await page.title();
      const bodyText = await page.locator("body").innerText().catch(() => "");

      const hasAuthRedirect = finalUrl.includes("/auth") || finalUrl.includes("login");
      const hasContent = bodyText.trim().length > 100;
      const hasSpinner = await page.locator('[class*="spinner"], [class*="loader"]').count();
      const hasError = await page.locator('[class*="error-page"], [class*="not-found"], h1:has-text("404"), h1:has-text("Error")').count();

      let status = "UNKNOWN";
      if (hasAuthRedirect) status = "REDIRECT_TO_AUTH";
      else if (hasError > 0) status = "ERROR_PAGE";
      else if (hasSpinner > 0 && !hasContent) status = "LOADING_SPINNER";
      else if (hasContent) status = "HAS_CONTENT";
      else status = "BLANK";

      const safeRoute = route.replace(/\//g, "_").replace(/^_/, "") || "root";
      await page.screenshot({ path: `e2e/screenshots/04-route-${safeRoute}.png`, fullPage: true });

      routeResults[route] = {
        title,
        url: finalUrl,
        status,
        notes: [
          `Body length: ${bodyText.trim().length}`,
          `Console errors: ${consoleEntries.filter((e) => e.type === "error" || e.type === "pageerror").length}`,
          `Network errors: ${networkEntries.length}`,
        ],
      };

      // Log to stdout for visibility
      console.log(`\n=== ROUTE: ${route} ===`);
      console.log(`  Status: ${status}`);
      console.log(`  Final URL: ${finalUrl}`);
      console.log(`  Title: ${title}`);
      consoleEntries.forEach((e) => console.log(`  [console.${e.type}] ${e.text.substring(0, 200)}`));
      networkEntries
        .filter((e) => e.status >= 400)
        .forEach((e) => console.log(`  [network ${e.status}] ${e.method} ${e.url.substring(0, 150)}`));

      allConsoleErrors.push(...consoleEntries);
      allNetworkErrors.push(...networkEntries);

      // The page must not crash entirely
      const pageErrorCount = consoleEntries.filter((e) => e.type === "pageerror").length;
      expect(pageErrorCount, `Page crashed (uncaught JS error) on ${route}`).toBe(0);
    });
  }

  // ─── Step 5: 404 page ─────────────────────────────────────────────────────
  test("Step 5: 404 not-found page", async ({ page }) => {
    const currentRoute = { value: "/nonexistent-route-xyz" };
    const consoleEntries: ConsoleEntry[] = [];
    const networkEntries: NetworkError[] = [];
    attachListeners(page, consoleEntries, networkEntries, currentRoute);

    await page.goto(`${BASE_URL}/nonexistent-route-xyz`, { waitUntil: "networkidle", timeout: 20_000 });

    const finalUrl = page.url();
    const title = await page.title();
    const bodyText = await page.locator("body").innerText().catch(() => "");

    const has404 = bodyText.includes("404") || bodyText.toLowerCase().includes("not found") || bodyText.toLowerCase().includes("не найдено");
    const hasAuthRedirect = finalUrl.includes("/auth") || finalUrl.includes("login");

    await page.screenshot({ path: "e2e/screenshots/05-404-page.png", fullPage: true });

    let status = "UNKNOWN";
    if (hasAuthRedirect) status = "REDIRECT_TO_AUTH_BEFORE_404";
    else if (has404) status = "SHOWS_404";
    else if (bodyText.trim().length < 50) status = "BLANK";
    else status = "OTHER_CONTENT";

    console.log("\n=== 404 PAGE ===");
    console.log(`  Final URL: ${finalUrl}`);
    console.log(`  Status: ${status}`);
    console.log(`  Body excerpt: ${bodyText.substring(0, 200)}`);
    consoleEntries.forEach((e) => console.log(`  [console.${e.type}] ${e.text.substring(0, 200)}`));

    allConsoleErrors.push(...consoleEntries);
    allNetworkErrors.push(...networkEntries);

    routeResults["/nonexistent-route-xyz"] = {
      title,
      url: finalUrl,
      status,
      notes: [`Body: ${bodyText.substring(0, 300)}`],
    };
  });

  // ─── Final Report ─────────────────────────────────────────────────────────
  test("Final: Print consolidated audit report", async () => {
    console.log("\n\n");
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║         FULL AUTH & NAVIGATION AUDIT REPORT              ║");
    console.log("╚══════════════════════════════════════════════════════════╝");

    console.log("\n### Console Errors (all routes combined) ###");
    const errors = allConsoleErrors.filter((e) => e.type === "error" || e.type === "pageerror");
    const warnings = allConsoleErrors.filter((e) => e.type === "warning" || e.type === "warn");

    if (errors.length === 0) {
      console.log("  ✓ No console errors");
    } else {
      errors.forEach((e) => console.log(`  [${e.type}] on ${e.url}: ${e.text.substring(0, 300)}`));
    }

    console.log("\n### Console Warnings ###");
    if (warnings.length === 0) {
      console.log("  ✓ No warnings");
    } else {
      const unique = [...new Set(warnings.map((w) => w.text.substring(0, 150)))];
      unique.forEach((w) => console.log(`  [warn] ${w}`));
    }

    console.log("\n### Network Errors (4xx/5xx) ###");
    if (allNetworkErrors.length === 0) {
      console.log("  ✓ No network errors");
    } else {
      allNetworkErrors.forEach((e) =>
        console.log(`  [${e.status}] ${e.method} ${e.url.substring(0, 150)} (on page: ${e.route})`)
      );
    }

    console.log("\n### Route Navigation Results ###");
    Object.entries(routeResults).forEach(([route, result]) => {
      console.log(`\n  ${route}`);
      console.log(`    Status:    ${result.status}`);
      console.log(`    Final URL: ${result.url}`);
      console.log(`    Title:     ${result.title}`);
      result.notes.forEach((n) => console.log(`    Note:      ${n}`));
    });

    console.log("\n### Summary ###");
    const authRedirects = Object.entries(routeResults).filter(([, r]) => r.status === "REDIRECT_TO_AUTH");
    const blanks = Object.entries(routeResults).filter(([, r]) => r.status === "BLANK");
    const contentPages = Object.entries(routeResults).filter(([, r]) => r.status === "HAS_CONTENT");
    const spinners = Object.entries(routeResults).filter(([, r]) => r.status === "LOADING_SPINNER");

    console.log(`  Routes redirecting to auth:  ${authRedirects.length} (${authRedirects.map(([r]) => r).join(", ")})`);
    console.log(`  Routes with content:         ${contentPages.length}`);
    console.log(`  Routes showing spinner:       ${spinners.length}`);
    console.log(`  Blank/empty routes:           ${blanks.length} (${blanks.map(([r]) => r).join(", ")})`);
    console.log(`  Total console errors:         ${errors.length}`);
    console.log(`  Total console warnings:       ${warnings.length}`);
    console.log(`  Total network 4xx/5xx:        ${allNetworkErrors.length}`);
  });
});
