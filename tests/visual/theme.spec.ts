import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression for theme tokens. The harness route /visual-check
 * renders every shadcn primitive (buttons, inputs, cards, badges, links,
 * surfaces) so we can catch unintended color or theme drift.
 *
 * Additional public pages (auth, 404, public quote/template viewers) are
 * snapshotted full-page to guard the cross-page look.
 */

async function gotoStable(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  // Disable caret blink + any residual animations for deterministic shots.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("theme tokens", () => {
  test("primitives harness", async ({ page }) => {
    await gotoStable(page, "/visual-check");

    for (const id of ["buttons", "inputs", "cards", "badges", "links", "surfaces"]) {
      const section = page.getByTestId(id);
      await expect(section).toBeVisible();
      await expect(section).toHaveScreenshot(`harness-${id}.png`);
    }
  });
});

test.describe("public pages", () => {
  test("auth page", async ({ page }) => {
    await gotoStable(page, "/auth");
    await expect(page).toHaveScreenshot("page-auth.png", { fullPage: false });
  });

  test("404 page", async ({ page }) => {
    await gotoStable(page, "/this-page-does-not-exist");
    await expect(page).toHaveScreenshot("page-404.png", { fullPage: false });
  });
});
