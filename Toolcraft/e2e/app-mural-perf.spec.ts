import { expect, test, type Page } from "@playwright/test";

import { appPerformance } from "../src/app/app-performance";
import {
  clickFooterAction,
  makeArtworkSvg,
  openMuralApp,
  parsePngDimensions,
  scrollFieldIntoView,
  readDownloadBuffer,
  selectToolcraftOption,
  setSettingTextField,
  uploadArtwork,
} from "./mural-helpers";
import {
  applyToolcraftPerformanceStressFixture,
  applyToolcraftPerformanceWorkloadFixture,
  dragToolcraftSliderByLabel,
  dragToolcraftSliderToPerformanceStressValue,
  dragToolcraftSliderToValue,
  expectToolcraftCanvasBackingPixelsForRenderScale,
  expectToolcraftCanvasViewportStable,
  expectToolcraftScenarioPerformanceBudget,
  getToolcraftFieldByLabel,
  getToolcraftPerformanceStressValue,
  measureToolcraftInteraction,
  zoomToolcraftCanvasViewport,
} from "./performance-helpers";
import { getToolcraftProductObservableSnapshot } from "./product-observable-helpers";

async function snapshotMural(page: Page): Promise<string> {
  return getToolcraftProductObservableSnapshot(page, {
    selector: "[data-toolcraft-product-output]",
  });
}

async function fillSettingField(page: Page, label: string, value: string): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, label);
  const input = field.locator("input").first();

  await input.fill(value);
  await input.press("Enter");
}

function selectField(page: Page, fieldLabel: string) {
  return page
    .locator('[data-slot="field"]')
    .filter({ hasText: new RegExp(`^${fieldLabel}`) })
    .filter({ has: page.locator('[role="combobox"], [data-slot="select-trigger"]') })
    .first();
}

function selectItem(page: Page, optionLabel: string) {
  return page
    .locator('[data-slot="select-item"]')
    .filter({ hasText: new RegExp(`^${optionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first();
}

async function openSelectAndChoose(
  page: Page,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  await selectField(page, fieldLabel).getByRole("combobox").first().click();

  const option = selectItem(page, optionLabel);

  await option.click();
  await expect(option).toBeHidden();
}

const stressWallAppliers = (page: Page) => ({
  tileHeight: async (value: unknown) => {
    await setSettingTextField(page, "Tile height", String(value));
  },
  tileWidth: async (value: unknown) => {
    await setSettingTextField(page, "Tile width", String(value));
  },
  wallHeight: async (value: unknown) => {
    await setSettingTextField(page, "Wall height", String(value));
  },
  wallWidth: async (value: unknown) => {
    await setSettingTextField(page, "Wall width", String(value));
  },
});

test("browser perf: stress preview renders the maximum tile grid", async ({ page }) => {
  await openMuralApp(page);

  await applyToolcraftPerformanceStressFixture(
    page,
    appPerformance,
    "preview-render-stress",
    stressWallAppliers(page),
  );

  await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();

  const result = await measureToolcraftInteraction(page, async () => {
    const viewField = await getToolcraftFieldByLabel(page, "View");

    await viewField.getByRole("button", { name: "Grid", exact: true }).click();
    await viewField.getByRole("button", { name: "Mural", exact: true }).click();
  });

  expect(await snapshotMural(page)).toBeTruthy();

  expectToolcraftScenarioPerformanceBudget(
    {
      longTaskMaxMs: result.longTaskMaxMs,
      previewMs: result.durationMs,
      renderMs: result.durationMs,
    },
    appPerformance,
    "preview-render-stress",
  );
});

test("browser perf: density drag stays live on the stress grid", async ({ page }) => {
  await openMuralApp(page);

  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "density-drag", {
    ...stressWallAppliers(page),
    renderScale: async (value: unknown) => {
      await scrollFieldIntoView(page, "Resolution scale");
      await dragToolcraftSliderToValue(page, "Resolution scale", Number(value));

      // The fixture value is the slider max; finish with a keyboard End so
      // track-edge rounding cannot leave the value one step short.
      const scaleField = await getToolcraftFieldByLabel(page, "Resolution scale");

      await scaleField.getByRole("slider").first().press("End");
    },
  });

  await expectToolcraftCanvasBackingPixelsForRenderScale(
    page,
    "[data-toolcraft-product-output]",
    2,
  );

  // The 96-sample canvas fingerprint stride aliases with the 20px tile
  // period of the stress grid, so prove the redraw with a wall-region
  // color average instead.
  const readWallRegionAverage = () =>
    page.evaluate(() => {
      const canvas = document.querySelector(
        "[data-toolcraft-product-output]",
      ) as HTMLCanvasElement;
      const context = canvas.getContext("2d");

      if (!context) {
        return "no-context";
      }

      const region = context.getImageData(
        Math.floor(canvas.width / 2) - 100,
        Math.floor(canvas.height / 2) - 100,
        200,
        200,
      ).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      const pixelCount = region.length / 4;

      for (let index = 0; index < region.length; index += 4) {
        red += region[index] ?? 0;
        green += region[index + 1] ?? 0;
        blue += region[index + 2] ?? 0;
      }

      return [
        Math.round(red / pixelCount),
        Math.round(green / pixelCount),
        Math.round(blue / pixelCount),
      ].join(",");
    });

  const before = await readWallRegionAverage();

  const liveResult = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Density");
    await dragToolcraftSliderByLabel(page, "Density", 0.25);
  });

  const stressResult = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderToPerformanceStressValue(
      page,
      "Density",
      appPerformance,
      "density-drag",
    );
  });

  await expect.poll(async () => readWallRegionAverage()).not.toBe(before);
  expect(
    await readWallRegionAverage(),
    "Product output must change after the measured interaction",
  ).not.toBe(before);

  expectToolcraftScenarioPerformanceBudget(
    {
      durationMs: Math.max(liveResult.durationMs, stressResult.durationMs),
      maxFrameGapMs: Math.max(liveResult.maxFrameGapMs, stressResult.maxFrameGapMs),
    },
    appPerformance,
    "density-drag",
  );
});

test("browser perf: threshold drag stays live within budget", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));
  await openSelectAndChoose(page, "Mode", "Threshold");

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Threshold");
    await dragToolcraftSliderByLabel(page, "Threshold", 0.9);
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "threshold-drag",
  );
});

test("browser perf: contrast drag stays live within budget", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Contrast");
    await dragToolcraftSliderByLabel(page, "Contrast", 0.9);
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "contrast-drag",
  );
});

test("browser perf: randomness drag stays live within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Randomness");
    await dragToolcraftSliderByLabel(page, "Randomness", 0.95);
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "randomness-drag",
  );
});

test("browser perf: seed drag stays live within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Seed");
    await dragToolcraftSliderByLabel(page, "Seed", 0.9);
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "seed-drag",
  );
});

test("browser perf: placement change stays within budget", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  const placement = String(
    getToolcraftPerformanceStressValue(appPerformance, "placement-change"),
  );
  const placementLabel = placement === "repeat" ? "Repeat" : "Fill";
  const before = await snapshotMural(page);

  const result = await measureToolcraftInteraction(page, async () => {
    const field = await getToolcraftFieldByLabel(page, "Placement");

    await field.getByRole("button", { name: placementLabel, exact: true }).click();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "placement-change",
  );
});

test("browser perf: view change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const view = String(getToolcraftPerformanceStressValue(appPerformance, "view-change"));
  const viewLabel = view === "mural" ? "Mural" : "Grid";
  const field = await getToolcraftFieldByLabel(page, "View");

  await field.getByRole("button", { name: "Grid", exact: true }).click();

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await field.getByRole("button", { name: viewLabel, exact: true }).click();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "view-change",
  );
});

test("browser perf: image resolution change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const resolution = String(
    getToolcraftPerformanceStressValue(appPerformance, "image-resolution-change"),
  ).toUpperCase();

  const result = await measureToolcraftInteraction(page, async () => {
    await selectField(page, "Resolution").getByRole("combobox").first().click();
    await selectItem(page, resolution).click();
    await expect(selectItem(page, resolution)).toBeHidden();
  });

  await expect(page.locator('[data-slot="field"]').filter({ hasText: /^Resolution/ }).first()).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "image-resolution-change",
  );
});

test("browser perf: image format change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const result = await measureToolcraftInteraction(page, async () => {
    await selectField(page, "Format").getByRole("combobox").first().click();
    await selectItem(page, "JPG").click();
    await expect(selectItem(page, "JPG")).toBeHidden();
  });

  await expect(page.locator('[data-slot="field"]').filter({ hasText: /^Format/ }).first()).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "image-format-change",
  );
});

test("browser perf: wall width change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const stressValue = String(
    getToolcraftPerformanceStressValue(appPerformance, "wall-width-change"),
  );
  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = (await getToolcraftFieldByLabel(page, "Wall width")).locator("input").first();

    await input.fill(stressValue);
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "wall-width-change",
  );
});

test("browser perf: wall height change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const stressValue = String(
    getToolcraftPerformanceStressValue(appPerformance, "wall-height-change"),
  );
  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = (await getToolcraftFieldByLabel(page, "Wall height")).locator("input").first();

    await input.fill(stressValue);
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "wall-height-change",
  );
});

test("browser perf: tile width change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const stressValue = String(
    getToolcraftPerformanceStressValue(appPerformance, "tile-width-change"),
  );
  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = (await getToolcraftFieldByLabel(page, "Tile width")).locator("input").first();

    await input.fill(stressValue);
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "tile-width-change",
  );
});

test("browser perf: tile height change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const stressValue = String(
    getToolcraftPerformanceStressValue(appPerformance, "tile-height-change"),
  );
  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = (await getToolcraftFieldByLabel(page, "Tile height")).locator("input").first();

    await input.fill(stressValue);
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "tile-height-change",
  );
});

test("browser perf: grout gap change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = (await getToolcraftFieldByLabel(page, "Grout gap")).locator("input").first();

    await input.fill("1.5");
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "grout-gap-change",
  );
});

test("browser perf: wall unit change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const result = await measureToolcraftInteraction(page, async () => {
    await selectField(page, "Unit").getByRole("combobox").first().click();
    await selectItem(page, "Feet").click();
    await expect(selectItem(page, "Feet")).toBeHidden();
  });

  await expect(page.locator('[data-slot="field"]').filter({ hasText: /^Unit/ }).first()).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "wall-unit-change",
  );
});

test("browser perf: mapping mode change stays within interaction budget", async ({
  page,
}) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await selectField(page, "Mode").getByRole("combobox").first().click();
    await selectItem(page, "Threshold").click();
    await expect(selectItem(page, "Threshold")).toBeHidden();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "mapping-change",
  );
});

test("browser perf: module set change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await selectField(page, "Module set").getByRole("combobox").first().click();
    await selectItem(page, "Single module").click();
    await expect(selectItem(page, "Single module")).toBeHidden();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "module-set-change",
  );
});

test("browser perf: motif change stays within budget", async ({ page }) => {
  await openMuralApp(page);
  await openSelectAndChoose(page, "Module set", "Single module");

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await selectField(page, "Motif").getByRole("combobox").first().click();
    await selectItem(page, "Ring").click();
    await expect(selectItem(page, "Ring")).toBeHidden();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "motif-change",
  );
});

test("browser perf: grout color change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = page.locator('input[aria-label="Grout color hex"]').first();

    await input.fill("FF00AA");
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "grout-color-change",
  );
});

test("browser perf: base color change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = page.locator('input[aria-label="Base hex"]').first();

    await input.fill("112233");
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "base-color-change",
  );
});

test("browser perf: accent color change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = page.locator('input[aria-label="Accent hex"]').first();

    await input.fill("22CCEE");
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "accent-color-change",
  );
});

test("browser perf: background color change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const input = page.locator('input[aria-label="background hex"]').first();

    await input.fill("7700FF");
    await input.press("Enter");
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "background-color-change",
  );
});

test("browser perf: source colors toggle stays within budget", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "colorful" }));

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const field = await getToolcraftFieldByLabel(page, "Source colors");

    await field.getByRole("switch").first().click();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "source-colors-toggle",
  );
});

test("browser perf: include background toggle stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const field = await getToolcraftFieldByLabel(page, "Include");

    await field.getByRole("switch").first().click();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "include-background-toggle",
  );
});

test("browser perf: artwork import resamples within budget", async ({ page }) => {
  await openMuralApp(page);

  const mediaFixture = getToolcraftPerformanceStressValue<{
    height: number;
    width: number;
  }>(appPerformance, "media-import");

  const before = await snapshotMural(page);

  const result = await measureToolcraftInteraction(
    page,
    async () => {
      await uploadArtwork(
        page,
        makeArtworkSvg({
          height: mediaFixture.height,
          variant: "colorful",
          width: mediaFixture.width,
        }),
      );
      await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(await snapshotMural(page), "Product output must change after the measured interaction").not.toBe(before);
    },
    { settleFrames: 6 },
  );

  expectToolcraftScenarioPerformanceBudget(
    {
      durationMs: result.durationMs,
      maxFrameGapMs: result.maxFrameGapMs,
      previewMs: result.durationMs,
    },
    appPerformance,
    "media-import",
  );
});

test("browser perf: image export completes within budget", async ({ page }) => {
  await openMuralApp(page);

  await applyToolcraftPerformanceStressFixture(
    page,
    appPerformance,
    "export-image",
    stressWallAppliers(page),
  );

  await selectToolcraftOption(page, "Resolution", "4K");
  await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();

  let buffer = Buffer.alloc(0);
  const result = await measureToolcraftInteraction(page, async () => {
    const download = await clickFooterAction(page, "Export PNG");

    buffer = await readDownloadBuffer(download);
  });
  const exportMs = result.durationMs;
  const dimensions = parsePngDimensions(buffer);

  expect(
    Math.max(dimensions.width, dimensions.height),
    "Export must be measured at the selected 4K output dimensions",
  ).toBe(4096);

  expectToolcraftScenarioPerformanceBudget({ exportMs }, appPerformance, "export-image");
});

test("browser perf: toolbar zoom stays smooth on the stress grid", async ({ page }) => {
  await openMuralApp(page);

  await applyToolcraftPerformanceStressFixture(
    page,
    appPerformance,
    "viewport-zoom-stress",
    stressWallAppliers(page),
  );

  const result = await measureToolcraftInteraction(page, async () => {
    await zoomToolcraftCanvasViewport(page, 2);
  });

  await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();

  expectToolcraftScenarioPerformanceBudget(
    {
      durationMs: result.durationMs,
      longTaskMaxMs: result.longTaskMaxMs,
      maxFrameGapMs: result.maxFrameGapMs,
    },
    appPerformance,
    "viewport-zoom-stress",
  );
});

test("browser perf: viewport stays stable during panel interactions", async ({ page }) => {
  await openMuralApp(page);

  const result = await expectToolcraftCanvasViewportStable(page, async () => {
    await scrollFieldIntoView(page, "Density");
    await dragToolcraftSliderByLabel(page, "Density", 0.7);
    await dragToolcraftSliderByLabel(page, "Randomness", 0.6);

    const viewField = await getToolcraftFieldByLabel(page, "View");

    await viewField.getByRole("button", { name: "Grid", exact: true }).click();
    await viewField.getByRole("button", { name: "Mural", exact: true }).click();
  });

  await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();

  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "viewport-stability",
  );
});

async function paintToolPointAt(
  page: Page,
  offsetXRatio: number,
  offsetYRatio: number,
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

test("browser perf: artwork size drag stays live within budget", async ({ page }) => {
  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "rings" }));

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Size");
    await dragToolcraftSliderByLabel(page, "Size", 0.5);
    await dragToolcraftSliderToPerformanceStressValue(
      page,
      "Size",
      appPerformance,
      "artwork-size-drag",
    );
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(
    await snapshotMural(page),
    "Product output must change after the measured interaction",
  ).not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "artwork-size-drag",
  );
});

test("browser perf: artwork padding drag stays live within budget", async ({ page }) => {
  const { expectToolcraftDiscreteSliderDragSmoothness } = await import(
    "./performance-helpers"
  );

  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "rings" }));

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Padding");
    await dragToolcraftSliderByLabel(page, "Padding", 0.5);
    await dragToolcraftSliderToPerformanceStressValue(
      page,
      "Padding",
      appPerformance,
      "artwork-padding-drag",
    );
  });

  await expectToolcraftDiscreteSliderDragSmoothness(page, "Padding", {
    maxFrameGapMs: 120,
    maxInteractionMs: 2000,
  });
  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(
    await snapshotMural(page),
    "Product output must change after the measured interaction",
  ).not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "artwork-padding-drag",
  );
});

test("browser perf: repeat spacing drag stays live within budget", async ({ page }) => {
  const { expectToolcraftDiscreteSliderDragSmoothness } = await import(
    "./performance-helpers"
  );

  await openMuralApp(page);
  await uploadArtwork(page, makeArtworkSvg({ variant: "rings" }));

  const placementField = await getToolcraftFieldByLabel(page, "Placement");

  await placementField.getByRole("button", { exact: true, name: "Repeat" }).click();

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await scrollFieldIntoView(page, "Spacing");
    await dragToolcraftSliderByLabel(page, "Spacing", 0.5);
    await dragToolcraftSliderToPerformanceStressValue(
      page,
      "Spacing",
      appPerformance,
      "repeat-spacing-drag",
    );
  });

  await expectToolcraftDiscreteSliderDragSmoothness(page, "Spacing", {
    maxFrameGapMs: 120,
    maxInteractionMs: 2000,
  });
  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(
    await snapshotMural(page),
    "Product output must change after the measured interaction",
  ).not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "repeat-spacing-drag",
  );
});

test("browser perf: paint tool change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const toolField = await getToolcraftFieldByLabel(page, "Tool");
  const canvas = page.locator("[data-toolcraft-product-output]").first();

  const result = await measureToolcraftInteraction(page, async () => {
    await toolField.getByRole("button", { exact: true, name: "Paint" }).click();
  });

  await expect(canvas).toHaveCSS("cursor", "pointer");
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "paint-tool-change",
  );
});

test("browser perf: paint color change stays within budget", async ({ page }) => {
  await openMuralApp(page);

  const input = page.locator('input[aria-label="Color hex"]').first();
  const result = await measureToolcraftInteraction(page, async () => {
    await input.fill("22AA88");
    await input.press("Enter");
  });

  await expect(input).toHaveValue("#22AA88");
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "paint-color-change",
  );
});

test("browser perf: paint actions stay within budget", async ({ page }) => {
  await openMuralApp(page);

  const toolField = await getToolcraftFieldByLabel(page, "Tool");

  await toolField.getByRole("button", { exact: true, name: "Paint" }).click();

  const point = await paintToolPointAt(page, 0.45, 0.45);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 14, point.y + 10, { steps: 4 });
  await page.mouse.up();

  const before = await snapshotMural(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: "Clear painted" }).click();
  });

  await expect.poll(async () => snapshotMural(page)).not.toBe(before);
  expect(
    await snapshotMural(page),
    "Product output must change after the measured interaction",
  ).not.toBe(before);
  expectToolcraftScenarioPerformanceBudget(
    { durationMs: result.durationMs, maxFrameGapMs: result.maxFrameGapMs },
    appPerformance,
    "paint-actions-run",
  );
});
