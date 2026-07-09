import { expect, test } from "@playwright/test";

import { openMuralApp } from "./mural-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";

test("browser: mural app opens with the Toolcraft shell and product sections", async ({
  page,
}) => {
  await openMuralApp(page);

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
  await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();

  for (const sectionTitle of [
    "Artwork",
    "Wall Surface",
    "Tile Grid",
    "Tile Mapping",
    "Tile Modules",
    "Tile Colors",
    "Image Export",
  ]) {
    await expect(
      page.getByText(sectionTitle, { exact: true }).first(),
      `Section "${sectionTitle}" should be visible in the controls panel`,
    ).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Export PNG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();
});

test("browser: canvas drop imports artwork into the mural", async ({ page }) => {
  await openMuralApp(page);

  const upload = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="320" height="480" fill="#000"/><rect x="320" width="320" height="480" fill="#fff"/></svg>',
      ],
      "dropped-artwork.svg",
      { type: "image/svg+xml" },
    );

    dataTransfer.items.add(file);
    return dataTransfer;
  });

  await expectToolcraftProductObservableToChange(page, async () => {
    await page
      .getByRole("application", { name: "Canvas viewport" })
      .dispatchEvent("drop", { dataTransfer: upload });
  });
});
