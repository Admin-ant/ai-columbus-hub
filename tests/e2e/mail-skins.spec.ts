import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * E2E: authenticated Mail skins flow.
 * - Loads /mail/skins as a signed-in user
 * - Creates a new skin, edits its fields, saves it
 * - Confirms it appears in the list and a version row is created
 * - Fails on any console error or missing UI element
 */

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

test.describe("Mail skins", () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD,
    "TEST_EMAIL and TEST_PASSWORD env vars are required for authenticated E2E tests",
  );

  const consoleErrors: string[] = [];

  function attachConsoleGuard(page: Page) {
    consoleErrors.length = 0;
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore benign noise (e.g. resource 404s from external CDNs)
        if (/favicon|sourcemap/i.test(text)) return;
        consoleErrors.push(text);
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
  }

  test("list → create → save → versies", async ({ page }) => {
    attachConsoleGuard(page);

    // 1. Sign in
    await page.goto("/auth");
    await page.getByLabel(/e-?mail/i).first().fill(TEST_EMAIL!);
    await page.getByLabel(/wachtwoord/i).first().fill(TEST_PASSWORD!);
    await page.getByRole("button", { name: /inloggen|log in|sign in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    // 2. Navigate to skins
    await page.goto("/mail/skins");
    await expect(
      page.getByRole("heading", { name: /skin/i }).first().or(page.getByText(/Skinbeheer|Mail skins/i).first()),
    ).toBeVisible({ timeout: 15_000 });

    // Core UI: search input, Nieuw button, editor labels
    await expect(page.getByPlaceholder(/Zoek op naam/i)).toBeVisible();
    const newButton = page.getByRole("button", { name: /^Nieuw$/i });
    await expect(newButton).toBeVisible();

    // 3. Create a new skin
    await newButton.click();
    const nameInput = page.getByPlaceholder(/Standaard bedrijfsstijl/i);
    await expect(nameInput).toBeVisible();
    const skinName = `E2E skin ${Date.now()}`;
    await nameInput.fill(skinName);

    const colorInput = page.getByPlaceholder("#f5f5f5");
    await expect(colorInput).toBeVisible();
    await colorInput.fill("#eef2ff");

    // 4. Save
    const saveButton = page.getByRole("button", { name: /^Opslaan$/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Success toast
    await expect(page.getByText(/opgeslagen|saved/i).first()).toBeVisible({ timeout: 10_000 });

    // 5. Appears in list
    await expect(page.getByText(skinName).first()).toBeVisible({ timeout: 10_000 });

    // 6. Versies panel renders and lists at least version 1
    await expect(page.getByText(/Versies/i).first()).toBeVisible();
    await expect(page.getByText(/^v?\s*1\b/i).first()).toBeVisible({ timeout: 10_000 });

    // 7. No console errors during the flow
    expect(consoleErrors, `Console errors: \n${consoleErrors.join("\n")}`).toEqual([]);
  });
});
