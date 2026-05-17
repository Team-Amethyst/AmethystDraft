import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "depth-charts");

test.describe("Depth Charts design screenshots", () => {
  test("capture depth charts UI", async ({ page }) => {
    await page.goto("/dev/depth-charts-design");
    await expect(page.getByRole("heading", { name: "Depth Charts" })).toBeVisible();

    await page.screenshot({
      path: path.join(outDir, "depth-charts-full.png"),
      fullPage: true,
    });

    const spCard = page.locator(".depth-position-card").filter({ hasText: /^SP/ });
    await expect(spCard).toBeVisible();
    await spCard.screenshot({
      path: path.join(outDir, "depth-charts-sp-card.png"),
    });

    const rfCard = page.locator(".depth-position-card").filter({ hasText: /^RF/ });
    await expect(rfCard).toBeVisible();
    await expect(rfCard.getByText("$35")).toBeVisible();
    await expect(rfCard.getByText("Catalog only")).toBeVisible();
    await rfCard.screenshot({
      path: path.join(outDir, "depth-charts-rf-valued-catalog.png"),
    });

    await page.getByRole("button", { name: /no-valuation modal/i }).click();
    const modal = page.locator(".pdm-modal");
    await expect(modal.getByText("No valuation available")).toBeVisible();
    await modal.screenshot({
      path: path.join(outDir, "depth-charts-no-valuation-modal.png"),
    });
  });
});
