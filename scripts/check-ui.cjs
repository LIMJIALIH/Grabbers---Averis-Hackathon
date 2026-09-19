// Optional browser smoke test: npm install --no-save --package-lock=false playwright
// Run against a running app: node scripts/check-ui.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.PREVIEW_URL || "http://localhost:3100");
    await page
      .getByRole("heading", { name: "Pacific Trader", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Approve & submit", exact: true })
        .isEnabled(),
      false,
    );
    await page
      .getByRole("button", { name: "Review Container count", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Edit Container count" })
      .fill("-1");
    await page.getByRole("button", { name: "Save field" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "positive value" })
      .waitFor();
    await page.getByRole("textbox", { name: "Edit Container count" }).fill("3");
    await page.getByRole("button", { name: "Save field" }).click();
    await page
      .getByRole("button", { name: "Review Gross weight (kg)", exact: true })
      .click();
    await page.getByRole("button", { name: "Save field" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Approve & submit", exact: true })
        .isEnabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Approve & submit", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm local approval" }).click();
    await page.getByRole("button", { name: /EML-8039/ }).click();
    await page
      .getByRole("heading", { name: "Evergreen Atlas", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Escalate", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Reason for escalation" })
      .fill("Please confirm the source weight.");
    await page.getByRole("button", { name: "Record escalation" }).click();
    await page
      .getByRole("button", { name: "Audit trail", exact: true })
      .click();
    await page
      .getByText("EML-8039 escalated: Please confirm the source weight.")
      .waitFor();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search cases" })
      .fill("not-a-vessel");
    await page.getByText("No cases found").waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export report" }).click();
    assert.equal((await download).suggestedFilename(), "docuverify-8039.json");
    await page.getByRole("button", { name: "New verification" }).click();
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "sample.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Shipping instruction sample"),
      });
    await page.getByRole("button", { name: "Prepare verification" }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: "desktop-preview.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByRole("heading", { name: "Document library" }).waitFor();
    await page.getByRole("button", { name: /Pacific Trader/ }).click();
    await page.screenshot({ path: "mobile-preview.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: edits, validation, approval gating, case switching, escalation, audit, search, export, upload, mobile navigation, overflow, and browser errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
