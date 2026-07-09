import { expect, test, type Page } from "@playwright/test";

import {
  clickFooterAction,
  clickSegment,
  clickToolbarButton,
  clickToolbarEyedropper,
  isJpeg,
  makeArtworkSvg,
  openMuralApp,
  parsePngDimensions,
  readDownloadBuffer,
  readToolbarColorHex,
  scrollFieldIntoView,
  selectMuralTool,
  selectToolcraftOption,
  setColorFieldHex,
  setSettingTextField,
  setToolbarColor,
  toggleSwitch,
  uploadArtwork,
} from "./mural-helpers";
import {
  dragToolcraftSliderToValue,
  expectToolcraftSegmentedControlCellsPreservePadding,
  getToolcraftFieldByLabel,
} from "./performance-helpers";
import {
  expectToolcraftProductObservableToChange,
  getToolcraftProductObservableSnapshot,
} from "./product-observable-helpers";

/**
 * Presses the slider track, moves partway while the pointer is still down to
 * prove live product updates during the drag, then finishes the drag.
 */
async function expectLiveSliderDrag(page: Page, label: string): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, label);
  const slider = field.locator('[data-slot="slider"], [role="slider"]').first();

  await expect(slider, `Slider "${label}" should be visible`).toBeVisible();
  await slider.scrollIntoViewIfNeeded();

  const box = await slider.boundingBox();

  if (!box) {
    throw new Error(`Could not measure slider "${label}".`);
  }

  const centerY = box.y + box.height / 2;
  const before = await getToolcraftProductObservableSnapshot(page);

  await page.mouse.move(box.x + box.width * 0.45, centerY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, centerY, { steps: 8 });

  await expect
    .poll(async () => getToolcraftProductObservableSnapshot(page), {
      message: `Mural should update live while dragging "${label}".`,
      timeout: 5000,
    })
    .not.toBe(before);

  await page.mouse.move(box.x + box.width * 0.95, centerY, { steps: 6 });
  await page.mouse.up();
}

test("browser: artwork upload, transform, clear, and reset drive the mural", async ({
  page,
}) => {
  await openMuralApp(page);

  const initial = await getToolcraftProductObservableSnapshot(page);

  await expectToolcraftProductObservableToChange(
    page,
    async () => uploadArtwork(page, makeArtworkSvg()),
    { message: "Uploading artwork should change the rendered mural." },
  );

  await expectToolcraftProductObservableToChange(
    page,
    async () => page.getByRole("button", { name: "90° Right" }).click(),
    {
      message:
        "Rotating the artwork 90° should update runtime mediaAssets[].transform and the rendered mural.",
    },
  );

  await expectToolcraftProductObservableToChange(
    page,
    async () => page.getByRole("button", { name: "Flip horizontal" }).click(),
    {
      message:
        "Flipping the artwork should update runtime mediaAssets[].transform and the rendered mural.",
    },
  );

  await expectToolcraftProductObservableToChange(
    page,
    async () => page.getByRole("button", { name: "Remove image" }).click(),
    { message: "Clearing the upload should return the mural to the neutral pattern." },
  );

  await uploadArtwork(page, makeArtworkSvg());
  await expect
    .poll(async () => getToolcraftProductObservableSnapshot(page))
    .not.toBe(initial);

  await page.getByRole("button", { name: /reset controls/i }).click();
  await expect
    .poll(async () => getToolcraftProductObservableSnapshot(page), {
      message:
        "Reset controls should remove the uploaded source media because no default assets exist.",
    })
    .toBe(initial);
});

test("browser: artwork placement mode changes the rendered mural", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ height: 400, width: 1200 }));
  await expectToolcraftSegmentedControlCellsPreservePadding(page, "Placement");

  const snapshots = new Set<string>();

  for (const mode of ["Fit", "Repeat", "Fill"]) {
    await clickSegment(page, "Placement", mode);
    await page.waitForTimeout(300);
    snapshots.add(await getToolcraftProductObservableSnapshot(page));
  }

  expect(snapshots.size, "Fit, Repeat, and Fill should each render differently").toBe(3);
});

test("browser: preview view toggles artwork grid and mural rendering", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));
  await expectToolcraftSegmentedControlCellsPreservePadding(page, "View");

  const snapshots = new Set<string>();

  for (const view of ["Artwork", "Grid", "Mural", "Labels"]) {
    await clickSegment(page, "View", view);
    await page.waitForTimeout(300);
    snapshots.add(await getToolcraftProductObservableSnapshot(page));
  }

  expect(
    snapshots.size,
    "Artwork, Grid, Mural, and Labels views should render differently",
  ).toBe(4);
});

test("browser: wall unit changes the exported schedule unit", async ({ page }) => {
  await openMuralApp(page);

  const expectedUnits: Record<string, string> = {
    Centimeters: "cm",
    Feet: "ft",
    Inches: "in",
    Millimeters: "mm",
  };

  for (const [optionLabel, unit] of Object.entries(expectedUnits)) {
    await selectToolcraftOption(page, "Unit", optionLabel);

    const download = await clickFooterAction(page, "Export JSON");
    const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));

    expect(schedule.unit, `Unit option ${optionLabel} should export as ${unit}`).toBe(
      unit,
    );
  }
});

test("browser: wall width updates the tile grid columns", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setSettingTextField(page, "Wall width", "192"),
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));

  expect(schedule.grid.columns).toBe(Math.floor((192 + 0.25) / 4.25));
});

test("browser: wall height updates the tile grid rows", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setSettingTextField(page, "Wall height", "144"),
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));

  expect(schedule.grid.rows).toBe(Math.floor((144 + 0.25) / 4.25));
});

test("browser: tile width updates the mural grid", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setSettingTextField(page, "Tile width", "2"),
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));

  expect(schedule.grid.columns).toBe(Math.floor((96 + 0.25) / 2.25));
});

test("browser: tile height updates the mural grid", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setSettingTextField(page, "Tile height", "2"),
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));

  expect(schedule.grid.rows).toBe(Math.floor((72 + 0.25) / 2.25));
});

test("browser: grout gap changes the rendered mural", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setSettingTextField(page, "Grout gap", "1.5"),
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));

  expect(schedule.groutSpacing).toBe(1.5);
});

test("browser: grout color changes the rendered mural", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setColorFieldHex(page, "Grout color", "#FF00AA"),
  );
});

test("browser: mapping mode reassigns tile modules", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  await expectToolcraftProductObservableToChange(page, async () =>
    selectToolcraftOption(page, "Mode", "Threshold"),
  );
  await expectToolcraftProductObservableToChange(page, async () =>
    selectToolcraftOption(page, "Mode", "Brightness"),
  );
});

test("browser: threshold slider drag live-updates the mural", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Threshold/ }),
  ).toHaveCount(0);

  await selectToolcraftOption(page, "Mode", "Threshold");
  await expect(
    page
      .locator('[data-slot="field"]')
      .filter({ hasText: /^Threshold/ })
      .first(),
  ).toBeVisible();

  await expectLiveSliderDrag(page, "Threshold");

  await selectToolcraftOption(page, "Mode", "Brightness");
  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Threshold/ }),
  ).toHaveCount(0);

  expect(await getToolcraftProductObservableSnapshot(page)).toBeTruthy();
});

test("browser: contrast slider drag live-updates the mural", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  const before = await getToolcraftProductObservableSnapshot(page);

  await expectLiveSliderDrag(page, "Contrast");

  expect(await getToolcraftProductObservableSnapshot(page)).not.toBe(before);
});

test("browser: module set select changes mural generation", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    selectToolcraftOption(page, "Module set", "Single module"),
  );
  await expectToolcraftProductObservableToChange(page, async () =>
    selectToolcraftOption(page, "Module set", "Mixed modules"),
  );
});

test("browser: single module select becomes visible and changes the mural", async ({
  page,
}) => {
  await openMuralApp(page);

  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Motif/ }),
  ).toHaveCount(0);

  await selectToolcraftOption(page, "Module set", "Single module");
  await expect(
    page
      .locator('[data-slot="field"]')
      .filter({ hasText: /^Motif/ })
      .first(),
  ).toBeVisible();

  const snapshots = new Set<string>();
  const motifLabels = [
    "Solid",
    "Dot",
    "Ring",
    "Quarter circle",
    "Half circle",
    "Diagonal",
    "Diagonal alt",
    "Half horizontal",
    "Half vertical",
    "Checker",
    "Stripes",
    "Empty",
  ];

  for (const motifLabel of motifLabels) {
    await selectToolcraftOption(page, "Motif", motifLabel);
    await page.waitForTimeout(150);
    snapshots.add(await getToolcraftProductObservableSnapshot(page));
  }

  expect(
    snapshots.size,
    "Each chosen motif should render a different mural",
  ).toBeGreaterThanOrEqual(motifLabels.length - 1);

  await selectToolcraftOption(page, "Module set", "Mixed modules");
  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Motif/ }),
  ).toHaveCount(0);
});

test("browser: density slider drag live-updates the mural", async ({ page }) => {
  await openMuralApp(page);

  const before = await getToolcraftProductObservableSnapshot(page);

  await expectLiveSliderDrag(page, "Density");

  expect(await getToolcraftProductObservableSnapshot(page)).not.toBe(before);
});

test("browser: randomness slider drag live-updates the mural", async ({ page }) => {
  await openMuralApp(page);

  const before = await getToolcraftProductObservableSnapshot(page);

  await expectLiveSliderDrag(page, "Randomness");

  expect(await getToolcraftProductObservableSnapshot(page)).not.toBe(before);
});

test("browser: seed slider drag regenerates a repeatable mural", async ({ page }) => {
  await openMuralApp(page);
  await scrollFieldIntoView(page, "Seed");

  await dragToolcraftSliderToValue(page, "Seed", 1);
  await page.waitForTimeout(300);

  const seedOne = await getToolcraftProductObservableSnapshot(page);

  await dragToolcraftSliderToValue(page, "Seed", 9999);
  await page.waitForTimeout(300);

  const seedMax = await getToolcraftProductObservableSnapshot(page);

  expect(seedMax, "Different seeds should regenerate different murals").not.toBe(seedOne);

  await dragToolcraftSliderToValue(page, "Seed", 1);
  await page.waitForTimeout(300);

  expect(
    await getToolcraftProductObservableSnapshot(page),
    "Returning to the same seed should reproduce the identical mural",
  ).toBe(seedOne);
});

test("browser: base color changes the rendered mural", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setColorFieldHex(page, "Base", "#112233"),
  );
});

test("browser: accent color changes the rendered mural", async ({ page }) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(page, async () =>
    setColorFieldHex(page, "Accent", "#22CCEE"),
  );
});

test("browser: source colors switch recolors the mural from the artwork", async ({
  page,
}) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  await expectToolcraftProductObservableToChange(page, async () =>
    toggleSwitch(page, "Source colors"),
  );
  await expectToolcraftProductObservableToChange(page, async () =>
    toggleSwitch(page, "Source colors"),
  );
});

test("browser: image export format changes exported file type", async ({ page }) => {
  await openMuralApp(page);
  await selectToolcraftOption(page, "Resolution", "2K");

  const pngDownload = await clickFooterAction(page, "Export PNG");
  const pngBuffer = await readDownloadBuffer(pngDownload);

  expect(parsePngDimensions(pngBuffer).width).toBeGreaterThan(0);
  expect(pngDownload.suggestedFilename()).toContain(".png");

  await selectToolcraftOption(page, "Format", "JPG");

  const jpgDownload = await clickFooterAction(page, "Export PNG");
  const jpgBuffer = await readDownloadBuffer(jpgDownload);

  expect(isJpeg(jpgBuffer), "JPG format should download JPEG bytes").toBe(true);
  expect(jpgDownload.suggestedFilename()).toContain(".jpg");
});

test("browser: image export resolution changes exported dimensions", async ({ page }) => {
  await openMuralApp(page);

  const expectedLongEdges: Record<string, number> = {
    "2K": 2048,
    "4K": 4096,
    "8K": 8192,
  };

  for (const [optionLabel, longEdge] of Object.entries(expectedLongEdges)) {
    await selectToolcraftOption(page, "Resolution", optionLabel);

    const download = await clickFooterAction(page, "Export PNG");
    const buffer = await readDownloadBuffer(download);
    const dimensions = parsePngDimensions(buffer);

    // Decode the exported bytes in the page so the asserted dimensions come
    // from a real image decode, not only the PNG header.
    const exportedImage = await page.evaluate(
      async ({ base64 }) => {
        const response = await fetch(`data:image/png;base64,${base64}`);
        const bitmap = await createImageBitmap(await response.blob());

        return { height: bitmap.height, width: bitmap.width };
      },
      { base64: buffer.toString("base64") },
    );

    expect(exportedImage.width).toBe(dimensions.width);
    expect(exportedImage.height).toBe(dimensions.height);
    expect(
      Math.max(exportedImage.width, exportedImage.height),
      `${optionLabel} export should render a ${longEdge}px long edge`,
    ).toBe(longEdge);
  }
});

test("browser: export png and export json deliver product output", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  const jsonDownload = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(jsonDownload)).toString("utf8"));

  expect(schedule.wall).toEqual({ height: 72, width: 96 });
  expect(schedule.tileSize).toEqual({ height: 4, width: 4 });
  expect(schedule.grid.totalTiles).toBe(schedule.grid.columns * schedule.grid.rows);
  expect(schedule.tiles).toHaveLength(schedule.grid.totalTiles);
  expect(schedule.tiles[0]).toMatchObject({ column: 0, row: 0 });
  expect(typeof schedule.tiles[0].preset).toBe("string");
  expect([0, 90, 180, 270]).toContain(schedule.tiles[0].rotation);
  expect(typeof schedule.tiles[0].baseColor).toBe("string");
  expect(typeof schedule.tiles[0].accentColor).toBe("string");
  expect(schedule.presetCounts).toBeDefined();

  await selectToolcraftOption(page, "Resolution", "8K");

  const downloadPromise = page.waitForEvent("download");

  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(
    page.locator('[data-sticky-footer-active="true"]'),
    "The sticky footer accent indicator should be visible while export is pending",
  ).toBeVisible({ timeout: 8000 });

  const pngDownload = await downloadPromise;
  const dimensions = parsePngDimensions(await readDownloadBuffer(pngDownload));

  expect(Math.max(dimensions.width, dimensions.height)).toBe(8192);
  expect(dimensions.width).toBeGreaterThanOrEqual(1920 * 2);
  expect(dimensions.height).toBeGreaterThanOrEqual(1080 * 2);
});

test("browser: resolution scale drags smoothly and rescales the canvas backing", async ({
  page,
}) => {
  const { dragToolcraftSliderToValue: dragSliderToValue, expectToolcraftDiscreteSliderDragSmoothness } =
    await import("./performance-helpers");
  const { expectToolcraftCanvasBackingPixelsForRenderScale } = await import(
    "./performance-helpers"
  );

  await openMuralApp(page);
  await scrollFieldIntoView(page, "Resolution scale");

  const field = await getToolcraftFieldByLabel(page, "Resolution scale");
  const slider = field.locator('[data-slot="slider"]').first();

  await expect(slider).toHaveAttribute("data-variant", "discrete");
  await expect(
    field.locator('[data-slot="slider-marker"]').first(),
    "Discrete Resolution scale positions should render markers",
  ).toBeAttached();

  await expectToolcraftDiscreteSliderDragSmoothness(page, "Resolution scale", {
    maxFrameGapMs: 120,
    maxInteractionMs: 2000,
  });

  await scrollFieldIntoView(page, "Resolution scale");

  const scaleTwoSnapshot = await getToolcraftProductObservableSnapshot(page);
  const thumb = field.getByRole("slider").first();

  await dragSliderToValue(page, "Resolution scale", 1);
  await thumb.press("Home");

  const canvas = page.locator("[data-toolcraft-product-output]").first();

  await expect
    .poll(async () =>
      canvas.evaluate((element) => (element as HTMLCanvasElement).width),
    )
    .toBe(1920);
  expect(
    await getToolcraftProductObservableSnapshot(page),
    "Lowering the resolution scale should change the rendered backing",
  ).not.toBe(scaleTwoSnapshot);

  await dragSliderToValue(page, "Resolution scale", 2);
  await thumb.press("End");
  await expectToolcraftCanvasBackingPixelsForRenderScale(
    page,
    "[data-toolcraft-product-output]",
    2,
  );
});

test("browser: uploading different aspect artwork keeps canvas size", async ({ page }) => {
  await openMuralApp(page);

  const widthField = await getToolcraftFieldByLabel(page, "Canvas width");
  const heightField = await getToolcraftFieldByLabel(page, "Canvas height");
  const widthBefore = await widthField.locator("input").first().inputValue();
  const heightBefore = await heightField.locator("input").first().inputValue();

  await expectToolcraftProductObservableToChange(page, async () =>
    uploadArtwork(page, makeArtworkSvg({ height: 1200, width: 300 })),
  );

  await expect(widthField.locator("input").first()).toHaveValue(widthBefore);
  await expect(heightField.locator("input").first()).toHaveValue(heightBefore);
});

/** Client point inside the mural wall for canvas tool interactions. */
async function getCanvasToolPoint(
  page: Page,
  offsetXRatio = 0.5,
  offsetYRatio = 0.5,
): Promise<{ x: number; y: number }> {
  const canvas = page.locator("[data-toolcraft-product-output]").first();
  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error("Mural canvas is not visible.");
  }

  return {
    x: box.x + box.width * offsetXRatio,
    y: box.y + box.height * offsetYRatio,
  };
}

/** Small paint drag so at least one tile interior is crossed. */
async function paintAtRatio(
  page: Page,
  offsetXRatio: number,
  offsetYRatio: number,
): Promise<void> {
  const point = await getCanvasToolPoint(page, offsetXRatio, offsetYRatio);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 14, point.y + 10, { steps: 4 });
  await page.mouse.up();
}

async function dragMarquee(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  modifier?: "Control" | "Shift",
): Promise<void> {
  if (modifier) {
    await page.keyboard.down(modifier);
  }

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();

  if (modifier) {
    await page.keyboard.up(modifier);
  }
}

test("browser: artwork size slider drag live-updates the mural", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "rings" }));
  // Fit placement makes the artwork extent visibly track the Size value; a
  // centered cover fill can look identical across scales for symmetric art.
  await clickSegment(page, "Placement", "Fit");

  const before = await getToolcraftProductObservableSnapshot(page);

  await expectLiveSliderDrag(page, "Size");

  expect(await getToolcraftProductObservableSnapshot(page)).not.toBe(before);
});

test("browser: artwork padding drags discretely and pads the mural", async ({ page }) => {
  const { expectToolcraftDiscreteSliderDragSmoothness } = await import(
    "./performance-helpers"
  );

  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "rings" }));
  await scrollFieldIntoView(page, "Padding");

  const field = await getToolcraftFieldByLabel(page, "Padding");
  const slider = field.locator('[data-slot="slider"]').first();

  await expect(slider).toHaveAttribute("data-variant", "discrete");
  await expect(
    field.locator('[data-slot="slider-marker"]').first(),
    "Discrete Padding positions should render markers",
  ).toBeAttached();

  const before = await getToolcraftProductObservableSnapshot(page);

  await expectToolcraftDiscreteSliderDragSmoothness(page, "Padding", {
    maxFrameGapMs: 120,
    maxInteractionMs: 2000,
  });
  await scrollFieldIntoView(page, "Padding");
  await dragToolcraftSliderToValue(page, "Padding", 6);

  await expect
    .poll(async () => getToolcraftProductObservableSnapshot(page), {
      message: "Padding should keep clear cells around the artwork.",
    })
    .not.toBe(before);
});

test("browser: repeat spacing appears in repeat mode and respaces the mural", async ({
  page,
}) => {
  const { expectToolcraftDiscreteSliderDragSmoothness } = await import(
    "./performance-helpers"
  );

  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "rings" }));

  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Spacing/ }),
  ).toHaveCount(0);

  await clickSegment(page, "Placement", "Repeat");
  await expect(
    page
      .locator('[data-slot="field"]')
      .filter({ hasText: /^Spacing/ })
      .first(),
  ).toBeVisible();

  await scrollFieldIntoView(page, "Spacing");

  const field = await getToolcraftFieldByLabel(page, "Spacing");
  const slider = field.locator('[data-slot="slider"]').first();

  await expect(slider).toHaveAttribute("data-variant", "discrete");
  await expect(field.locator('[data-slot="slider-marker"]').first()).toBeAttached();

  const before = await getToolcraftProductObservableSnapshot(page);

  await expectToolcraftDiscreteSliderDragSmoothness(page, "Spacing", {
    maxFrameGapMs: 120,
    maxInteractionMs: 2000,
  });
  await scrollFieldIntoView(page, "Spacing");
  await dragToolcraftSliderToValue(page, "Spacing", 6);

  await expect
    .poll(async () => getToolcraftProductObservableSnapshot(page), {
      message: "Spacing should separate repeated artwork instances.",
    })
    .not.toBe(before);

  await clickSegment(page, "Placement", "Fill");
  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Spacing/ }),
  ).toHaveCount(0);
});

test("browser: floating toolbar tools switch canvas interaction modes", async ({
  page,
}) => {
  await openMuralApp(page);

  const canvas = page.locator("[data-toolcraft-product-output]").first();

  // Pan is the default tool: the renderer marks its active tool on the canvas.
  await expect(
    page.getByRole("button", { exact: true, name: "Pan" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-mural-tool", "pan");

  await selectMuralTool(page, "Paint");
  await expect(canvas).toHaveAttribute("data-mural-tool", "paint");
  await expectToolcraftProductObservableToChange(
    page,
    async () => paintAtRatio(page, 0.4, 0.4),
    { message: "The Paint tool should fill a clicked tile." },
  );

  await selectMuralTool(page, "Select");
  await expect(canvas).toHaveAttribute("data-mural-tool", "select");

  await selectMuralTool(page, "Pan");
  await expect(canvas).toHaveAttribute("data-mural-tool", "pan");
});

test("browser: toolbar paint color drives painted tiles", async ({ page }) => {
  await openMuralApp(page);
  await selectMuralTool(page, "Paint");

  await setToolbarColor(page, "00FF66");
  await expectToolcraftProductObservableToChange(
    page,
    async () => paintAtRatio(page, 0.35, 0.35),
    { message: "Painting should apply the first paint color." },
  );

  await setToolbarColor(page, "3311FF");
  await expectToolcraftProductObservableToChange(
    page,
    async () => paintAtRatio(page, 0.6, 0.6),
    { message: "Painting should apply the updated paint color." },
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));
  const painted = schedule.tiles.filter((tile: { painted: boolean }) => tile.painted);

  expect(
    new Set(painted.map((tile: { accentColor: string }) => tile.accentColor)),
  ).toEqual(new Set(["#00FF66", "#3311FF"]));
});

test("browser: toolbar fill and clear actions change the mural", async ({ page }) => {
  await openMuralApp(page);
  await selectMuralTool(page, "Select");

  await dragMarquee(
    page,
    await getCanvasToolPoint(page, 0.3, 0.3),
    await getCanvasToolPoint(page, 0.55, 0.55),
  );
  await setToolbarColor(page, "FF8800");

  await expectToolcraftProductObservableToChange(
    page,
    async () => clickToolbarButton(page, page.getByRole("button", { name: "Fill selected" })),
    { message: "Toolbar Fill should paint every selected tile." },
  );

  await expectToolcraftProductObservableToChange(
    page,
    async () => clickToolbarButton(page, page.getByRole("button", { name: "Clear painted" })),
    { message: "Toolbar Clear should remove all manual overrides." },
  );
});

test("browser: labels view overlays cell coordinates and exports them", async ({
  page,
}) => {
  await openMuralApp(page);

  await expectToolcraftProductObservableToChange(
    page,
    async () => clickSegment(page, "View", "Labels"),
    { message: "Labels view should overlay each cell's install coordinate." },
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));

  expect(schedule.tiles[0].label).toBe("A1");
  expect(
    schedule.tiles.every((tile: { label: string }) => /^[A-Z]+\d+$/.test(tile.label)),
  ).toBe(true);
});

test("browser: middle mouse drag pans the canvas viewport", async ({ page }) => {
  await openMuralApp(page);

  // Read the pan offset from the canvas world transform:
  // translate(-50%, -50%) translate(Xpx, Ypx) scale(Z)
  const readWorldPan = () =>
    page.evaluate(() => {
      const world = document.querySelector(
        "[data-toolcraft-canvas-world]",
      ) as HTMLElement | null;
      const match = world?.style.transform.match(
        /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/,
      );

      return {
        x: Number(match?.[1] ?? 0),
        y: Number(match?.[2] ?? 0),
        zoom: Number(match?.[3] ?? 1),
      };
    });

  const before = await readWorldPan();
  const point = await getCanvasToolPoint(page, 0.5, 0.5);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(point.x + 120, point.y - 80, { steps: 8 });
  await page.mouse.up({ button: "middle" });

  const after = await readWorldPan();

  expect(after.x - before.x, "Middle drag should pan horizontally").toBeCloseTo(120, 0);
  expect(after.y - before.y, "Middle drag should pan vertically").toBeCloseTo(-80, 0);
  expect(after.zoom, "Middle drag must not change zoom").toBeCloseTo(before.zoom, 5);

  // Releasing the middle button ends the pan: further movement is inert.
  await page.mouse.move(point.x, point.y);

  const settled = await readWorldPan();

  expect(settled.x).toBeCloseTo(after.x, 5);
  expect(settled.y).toBeCloseTo(after.y, 5);
});

test("browser: paint tool paints a tile and repeats replicate it", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));
  await clickSegment(page, "Placement", "Repeat");
  await selectMuralTool(page, "Paint");
  await setToolbarColor(page, "112299");

  await expectToolcraftProductObservableToChange(
    page,
    async () => paintAtRatio(page, 0.45, 0.45),
    { message: "Painting in repeat mode should change the mural." },
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));
  const paintedCells = schedule.tiles.filter(
    (tile: { painted: boolean }) => tile.painted,
  );

  expect(
    paintedCells.length,
    "A pattern-relative paint should replicate across repeated instances",
  ).toBeGreaterThan(1);
  expect(
    new Set(paintedCells.map((tile: { accentColor: string }) => tile.accentColor)),
  ).toEqual(new Set(["#112299"]));
});

test("browser: marquee selection with shift and ctrl fills selected tiles", async ({
  page,
}) => {
  await openMuralApp(page);
  await selectMuralTool(page, "Select");

  await dragMarquee(
    page,
    await getCanvasToolPoint(page, 0.25, 0.25),
    await getCanvasToolPoint(page, 0.45, 0.45),
  );
  await dragMarquee(
    page,
    await getCanvasToolPoint(page, 0.55, 0.55),
    await getCanvasToolPoint(page, 0.7, 0.7),
    "Shift",
  );
  await dragMarquee(
    page,
    await getCanvasToolPoint(page, 0.3, 0.3),
    await getCanvasToolPoint(page, 0.4, 0.4),
    "Control",
  );

  await setToolbarColor(page, "FF3366");
  await expectToolcraftProductObservableToChange(
    page,
    async () => clickToolbarButton(page, page.getByRole("button", { name: "Fill selected" })),
    { message: "Fill selected should paint the combined selection." },
  );

  const download = await clickFooterAction(page, "Export JSON");
  const schedule = JSON.parse((await readDownloadBuffer(download)).toString("utf8"));
  const painted = schedule.tiles.filter((tile: { painted: boolean }) => tile.painted);

  expect(painted.length).toBeGreaterThan(0);
  expect(
    new Set(painted.map((tile: { accentColor: string }) => tile.accentColor)),
  ).toEqual(new Set(["#FF3366"]));
});

test("browser: toolbar eyedropper samples a tile color", async ({ page }) => {
  await openMuralApp(page);
  await selectMuralTool(page, "Paint");
  await setToolbarColor(page, "0A6B4F");

  await expectToolcraftProductObservableToChange(
    page,
    async () => paintAtRatio(page, 0.5, 0.42),
    { message: "Painting should place the known color." },
  );

  await setToolbarColor(page, "FFFFFF");
  await clickToolbarEyedropper(page);

  const point = await getCanvasToolPoint(page, 0.5, 0.42);

  await page.mouse.move(point.x + 6, point.y + 4);
  await page.mouse.down();
  await page.mouse.up();

  await expect
    .poll(async () => readToolbarColorHex(page), {
      message: "Picking the painted tile should restore its color.",
    })
    .toBe("#0A6B4F");

  // After one pick the tool returns to Paint so the sampled color can be used.
  await expect(
    page.getByRole("button", { exact: true, name: "Paint" }),
  ).toHaveAttribute("aria-pressed", "true");
});
