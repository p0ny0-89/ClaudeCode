import { describe, expect, it } from "vitest";

import {
  getToolcraftImageExportSize,
  shouldIncludeToolcraftPreviewBackground,
} from "@/toolcraft/runtime";
import type { ToolcraftState } from "@/toolcraft/runtime";

import { getMuralImageExportEncoding } from "./app-export";
import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";
import {
  cellRandom,
  generateMuralTilePlan,
  type MuralGenerationSettings,
} from "./mural/generate";
import { computeMuralCanvasLayout, computeMuralGrid } from "./mural/grid";
import { muralDefaults, parseMuralSettings, type MuralSettings } from "./mural/mural-state";
import { drawMural } from "./mural/render";
import {
  applyContrast,
  cellSampleGridFromImageData,
  computeArtworkPlacements,
  type CellSampleGrid,
} from "./mural/sampling";
import { buildMuralTileSchedule } from "./mural/schedule";
import { drawTilePreset, tilePresetIds } from "./mural/tile-presets";

type RecordedFill = {
  color: string;
  height?: number;
  kind: "path" | "rect";
  width?: number;
  x?: number;
  y?: number;
};

class FakeContext2D {
  fillStyle = "#000000";
  fills: RecordedFill[] = [];
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "high";

  beginPath(): void {}
  clearRect(): void {}
  clip(): void {}
  closePath(): void {}
  ellipse(): void {}
  lineTo(): void {}
  moveTo(): void {}
  rect(): void {}
  restore(): void {}
  rotate(): void {}
  save(): void {}
  scale(): void {}
  translate(): void {}

  fill(): void {
    this.fills.push({ color: String(this.fillStyle), kind: "path" });
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.fills.push({
      color: String(this.fillStyle),
      height,
      kind: "rect",
      width,
      x,
      y,
    });
  }
}

function asContext(fake: FakeContext2D): CanvasRenderingContext2D {
  return fake as unknown as CanvasRenderingContext2D;
}

const defaultGenerationSettings: MuralGenerationSettings = {
  contrast: 0,
  density: 50,
  mappingMode: "brightness",
  moduleMode: "mixed",
  randomness: 0,
  seed: 47,
  singleModule: "solid",
  threshold: 50,
};

function makeSettings(overrides: Partial<MuralSettings> = {}): MuralSettings {
  return {
    accentColor: muralDefaults.accentColor,
    background: muralDefaults.background,
    baseColor: muralDefaults.baseColor,
    generation: { ...defaultGenerationSettings },
    groutColor: muralDefaults.groutColor,
    groutSpacing: 0.25,
    previewMode: "mural",
    scaleMode: "fill",
    tileHeight: 4,
    tileWidth: 4,
    useSourceColors: false,
    wallHeight: 16,
    wallUnit: "in",
    wallWidth: 16,
    ...overrides,
  };
}

/** 4x4 sample grid: top two rows black, bottom two rows white. */
function makeHalfDarkSamples(): CellSampleGrid {
  const data = new Uint8ClampedArray(4 * 4 * 4);

  for (let index = 0; index < 16; index += 1) {
    const value = index < 8 ? 0 : 255;

    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }

  return cellSampleGridFromImageData(data, 4, 4);
}

/** 4x4 sample grid: top two rows mid gray, bottom two rows white. */
function makeGrayWhiteSamples(): CellSampleGrid {
  const data = new Uint8ClampedArray(4 * 4 * 4);

  for (let index = 0; index < 16; index += 1) {
    const value = index < 8 ? 128 : 255;

    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }

  return cellSampleGridFromImageData(data, 4, 4);
}

const smallGrid = computeMuralGrid({
  groutSpacing: 0,
  tileHeight: 4,
  tileWidth: 4,
  wallHeight: 16,
  wallWidth: 16,
});

function makeFakeState(values: Record<string, unknown>): ToolcraftState {
  return {
    canvas: { size: { height: 1080, width: 1920 } },
    values,
  } as unknown as ToolcraftState;
}

describe("tile mural grid math", () => {
  it("wall width changes the tile column count", () => {
    const base = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 96,
    });
    const wider = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 192,
    });

    expect(base.columns).toBe(Math.floor((96 + 0.25) / 4.25));
    expect(wider.columns).toBeGreaterThan(base.columns);
    expect(wider.rows).toBe(base.rows);
  });

  it("wall height changes the tile row count", () => {
    const base = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 96,
    });
    const taller = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 144,
      wallWidth: 96,
    });

    expect(taller.rows).toBeGreaterThan(base.rows);
    expect(taller.columns).toBe(base.columns);
  });

  it("tile width changes the tile column count", () => {
    const base = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 96,
    });
    const smallerTiles = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 4,
      tileWidth: 2,
      wallHeight: 72,
      wallWidth: 96,
    });

    expect(smallerTiles.columns).toBeGreaterThan(base.columns);
  });

  it("tile height changes the tile row count", () => {
    const base = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 96,
    });
    const smallerTiles = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: 2,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 96,
    });

    expect(smallerTiles.rows).toBeGreaterThan(base.rows);
  });

  it("grout spacing changes tile counts and used wall area", () => {
    const tight = computeMuralGrid({
      groutSpacing: 0,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 96,
    });
    const spaced = computeMuralGrid({
      groutSpacing: 1,
      tileHeight: 4,
      tileWidth: 4,
      wallHeight: 72,
      wallWidth: 96,
    });

    expect(tight.columns).toBe(24);
    expect(spaced.columns).toBe(Math.floor(97 / 5));
    expect(spaced.columns).toBeLessThan(tight.columns);
    expect(spaced.usedWidth).toBe(spaced.columns * 4 + (spaced.columns - 1) * 1);
    expect(spaced.usedWidth).toBeLessThanOrEqual(96);
  });

  it("stress grid math yields the declared maximum cell count", () => {
    const stressScenario = appPerformance.scenarios.find(
      (scenario) => scenario.id === "preview-render-stress",
    );
    const stressValue = stressScenario?.stressFixture?.value as Record<string, string>;

    expect(stressValue).toBeDefined();
    const stress = computeMuralGrid({
      groutSpacing: 0.25,
      tileHeight: Number(stressValue.tileHeight),
      tileWidth: Number(stressValue.tileWidth),
      wallHeight: Number(stressValue.wallHeight),
      wallWidth: Number(stressValue.wallWidth),
    });

    expect(stress.columns).toBe(192);
    expect(stress.rows).toBe(96);
    expect(stress.totalTiles).toBe(18432);
  });

  it("resolution scale changes canvas backing pixels", () => {
    expect(appSchema.canvas.renderScale.enabled).toBe(true);
    expect(appSchema.canvas.renderScale.min).toBe(1);
    expect(appSchema.canvas.renderScale.max).toBe(2);
    expect(appSchema.canvas.renderScale.defaultValue).toBe(2);
  });

  it("uploaded artwork keeps the current canvas size", () => {
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });

    const layout = computeMuralCanvasLayout(smallGrid, 1920, 1080);

    expect(layout.wallRect.width).toBeLessThanOrEqual(1920);
    expect(layout.wallRect.height).toBeLessThanOrEqual(1080);
    expect(layout.wallRect.x + layout.wallRect.width / 2).toBeCloseTo(1920 / 2, 5);
    expect(layout.wallRect.y + layout.wallRect.height / 2).toBeCloseTo(1080 / 2, 5);
  });
});

describe("tile mural artwork sampling", () => {
  it("artwork upload sampling maps image cells into the tile plan", () => {
    const samples = makeHalfDarkSamples();
    const withArtwork = generateMuralTilePlan(smallGrid, samples, {
      ...defaultGenerationSettings,
    });
    const withoutArtwork = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
    });

    const darkCell = withArtwork.cells.find((cell) => cell.row === 0 && cell.column === 0);
    const lightCell = withArtwork.cells.find((cell) => cell.row === 3 && cell.column === 0);

    expect(darkCell?.sampledHex).toBe("#000000");
    expect(lightCell?.sampledHex).toBe("#ffffff");
    expect(darkCell!.fillLevel).toBeGreaterThan(lightCell!.fillLevel);
    expect(withoutArtwork.cells.every((cell) => cell.sampledHex === null)).toBe(true);
    expect(withArtwork.presetCounts).not.toEqual(withoutArtwork.presetCounts);
  });

  it("artwork placement modes fit fill and repeat map cells differently", () => {
    const fit = computeArtworkPlacements(200, 100, 10, 10, "fit");
    const fill = computeArtworkPlacements(200, 100, 10, 10, "fill");
    const repeat = computeArtworkPlacements(200, 100, 10, 10, "repeat");

    expect(fit).toHaveLength(1);
    expect(fit[0]).toMatchObject({ height: 5, width: 10, x: 0, y: 2.5 });

    expect(fill).toHaveLength(1);
    expect(fill[0]!.width).toBe(20);
    expect(fill[0]!.height).toBe(10);
    expect(fill[0]!.x).toBeLessThan(0);

    expect(repeat.length).toBeGreaterThan(1);
    expect(repeat[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("contrast rescales sampled luminance before module mapping", () => {
    expect(applyContrast(0.6, 0)).toBeCloseTo(0.6, 5);
    expect(applyContrast(0.6, 100)).toBeCloseTo(0.8, 5);
    expect(applyContrast(0.1, 100)).toBe(0);
    expect(applyContrast(0.9, 100)).toBe(1);
  });
});

describe("tile mural module generation", () => {
  it("mapping mode switches between brightness and threshold assignment", () => {
    const samples = makeGrayWhiteSamples();
    const brightness = generateMuralTilePlan(smallGrid, samples, {
      ...defaultGenerationSettings,
      mappingMode: "brightness",
    });
    const threshold = generateMuralTilePlan(smallGrid, samples, {
      ...defaultGenerationSettings,
      mappingMode: "threshold",
    });

    const thresholdPresets = new Set(threshold.cells.map((cell) => cell.presetId));

    expect(
      [...thresholdPresets].every((preset) => preset === "empty" || preset === "solid"),
    ).toBe(true);
    expect(brightness.presetCounts).not.toEqual(threshold.presetCounts);
  });

  it("threshold level splits cells into solid and empty", () => {
    const samples = makeHalfDarkSamples();
    const midThreshold = generateMuralTilePlan(smallGrid, samples, {
      ...defaultGenerationSettings,
      mappingMode: "threshold",
      threshold: 50,
    });
    const lowThreshold = generateMuralTilePlan(smallGrid, samples, {
      ...defaultGenerationSettings,
      mappingMode: "threshold",
      threshold: 0,
    });

    expect(midThreshold.presetCounts.solid).toBe(8);
    expect(midThreshold.presetCounts.empty).toBe(8);
    expect(lowThreshold.presetCounts.solid).toBe(16);
  });

  it("module set switches between mixed and single generation", () => {
    const mixed = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      moduleMode: "mixed",
    });
    const single = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      moduleMode: "single",
      singleModule: "dot",
    });

    const mixedPresets = new Set(mixed.cells.map((cell) => cell.presetId));
    const singlePresets = new Set(single.cells.map((cell) => cell.presetId));

    expect(mixedPresets.size).toBeGreaterThan(1);
    expect([...singlePresets]).toEqual(["dot"]);
  });

  it("single module mode repeats one chosen module", () => {
    for (const presetId of ["diagonal", "half-circle", "ring"] as const) {
      const plan = generateMuralTilePlan(smallGrid, null, {
        ...defaultGenerationSettings,
        moduleMode: "single",
        singleModule: presetId,
      });

      expect(new Set(plan.cells.map((cell) => cell.presetId))).toEqual(
        new Set([presetId]),
      );
    }
  });

  it("density biases cells toward denser or emptier modules", () => {
    const dense = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      density: 100,
    });
    const sparse = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      density: 0,
    });

    expect(dense.presetCounts.solid).toBe(16);
    expect(sparse.presetCounts.empty).toBe(16);
  });

  it("randomness swaps modules within coverage bands", () => {
    const ordered = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      randomness: 0,
    });
    const randomized = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      randomness: 100,
    });

    expect(ordered.presetCounts).not.toEqual(randomized.presetCounts);

    for (const cell of randomized.cells) {
      expect(tilePresetIds).toContain(cell.presetId);
    }
  });

  it("seed produces repeatable module assignment", () => {
    const first = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      seed: 7,
    });
    const repeat = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      seed: 7,
    });
    const different = generateMuralTilePlan(smallGrid, null, {
      ...defaultGenerationSettings,
      seed: 8,
    });

    expect(repeat.cells).toEqual(first.cells);
    expect(different.cells).not.toEqual(first.cells);
    expect(cellRandom(7, 2, 3)).toBe(cellRandom(7, 2, 3));
    expect(cellRandom(7, 2, 3)).not.toBe(cellRandom(8, 2, 3));
  });
});

describe("tile mural rendering", () => {
  it("preview modes draw artwork grid and mural variants", () => {
    const samples = makeHalfDarkSamples();
    const plan = generateMuralTilePlan(smallGrid, samples, defaultGenerationSettings);
    const rendered: Record<string, RecordedFill[]> = {};

    for (const previewMode of ["artwork", "grid", "mural"] as const) {
      const fake = new FakeContext2D();

      drawMural({
        context: asContext(fake),
        grid: smallGrid,
        height: 400,
        includeBackground: true,
        plan,
        settings: makeSettings({ previewMode }),
        width: 400,
      });
      rendered[previewMode] = fake.fills;
    }

    const gridColors = new Set(rendered.grid!.slice(2).map((fill) => fill.color));
    const artworkColors = new Set(rendered.artwork!.slice(2).map((fill) => fill.color));

    expect(gridColors).toEqual(new Set([muralDefaults.baseColor]));
    expect(artworkColors).toContain("#000000");
    expect(artworkColors).toContain("#ffffff");
    expect(rendered.mural!.some((fill) => fill.color === muralDefaults.accentColor)).toBe(
      true,
    );
  });

  it("grout color fills the wall area behind tiles", () => {
    const fake = new FakeContext2D();
    const plan = generateMuralTilePlan(smallGrid, null, defaultGenerationSettings);

    drawMural({
      context: asContext(fake),
      grid: smallGrid,
      height: 400,
      includeBackground: false,
      plan,
      settings: makeSettings({ groutColor: "#123456" }),
      width: 400,
    });

    const groutFill = fake.fills[0];

    expect(groutFill?.color).toBe("#123456");
    expect(groutFill?.width).toBeCloseTo(400, 3);
    expect(groutFill?.height).toBeCloseTo(400, 3);
  });

  it("base color fills tile faces", () => {
    const fake = new FakeContext2D();

    drawTilePreset("diagonal", {
      accent: "#ff0000",
      base: "#00ff00",
      context: asContext(fake),
      height: 100,
      rotation: 0,
      width: 100,
      x: 0,
      y: 0,
    });

    expect(fake.fills[0]).toMatchObject({ color: "#00ff00", kind: "rect" });
  });

  it("accent color fills module motifs", () => {
    const fake = new FakeContext2D();

    drawTilePreset("solid", {
      accent: "#ff00ff",
      base: "#ffffff",
      context: asContext(fake),
      height: 100,
      rotation: 0,
      width: 100,
      x: 0,
      y: 0,
    });

    expect(fake.fills.some((fill) => fill.color === "#ff00ff")).toBe(true);
  });

  it("source colors sample accents from the artwork", () => {
    const samples = makeHalfDarkSamples();
    const plan = generateMuralTilePlan(smallGrid, samples, {
      ...defaultGenerationSettings,
      density: 100,
    });
    const fake = new FakeContext2D();

    drawMural({
      context: asContext(fake),
      grid: smallGrid,
      height: 400,
      includeBackground: false,
      plan,
      settings: makeSettings({ useSourceColors: true }),
      width: 400,
    });

    const colors = new Set(fake.fills.map((fill) => fill.color));

    expect(colors).toContain("#ffffff");
    expect(colors).not.toContain(muralDefaults.accentColor);
  });

  it("background color fills behind the wall", () => {
    const fake = new FakeContext2D();
    const plan = generateMuralTilePlan(smallGrid, null, defaultGenerationSettings);

    drawMural({
      context: asContext(fake),
      grid: smallGrid,
      height: 300,
      includeBackground: true,
      plan,
      settings: makeSettings({ background: "#ABCDEF" }),
      width: 600,
    });

    expect(fake.fills[0]).toMatchObject({
      color: "#ABCDEF",
      height: 300,
      width: 600,
      x: 0,
      y: 0,
    });
  });

  it("include background controls preview and png transparency", () => {
    const fake = new FakeContext2D();
    const plan = generateMuralTilePlan(smallGrid, null, defaultGenerationSettings);

    drawMural({
      context: asContext(fake),
      grid: smallGrid,
      height: 300,
      includeBackground: false,
      plan,
      settings: makeSettings({ background: "#ABCDEF" }),
      width: 600,
    });

    expect(fake.fills.some((fill) => fill.color === "#ABCDEF")).toBe(false);
    expect(
      shouldIncludeToolcraftPreviewBackground({
        state: makeFakeState({ "export.includeBackground": false }),
      }),
    ).toBe(false);
    expect(
      shouldIncludeToolcraftPreviewBackground({
        state: makeFakeState({ "export.includeBackground": true }),
      }),
    ).toBe(true);
  });
});

describe("tile mural export", () => {
  it("wall unit is recorded in the tile schedule", () => {
    const plan = generateMuralTilePlan(smallGrid, null, defaultGenerationSettings);

    for (const [unit, suffix] of [
      ["in", "in"],
      ["ft", "ft"],
      ["mm", "mm"],
      ["cm", "cm"],
    ] as const) {
      const schedule = buildMuralTileSchedule(
        smallGrid,
        plan,
        makeSettings({ wallUnit: unit }),
      );

      expect(schedule.unit).toBe(suffix);
    }
  });

  it("image export format selects png or jpg encoding", () => {
    expect(getMuralImageExportEncoding("png")).toEqual({
      extension: "png",
      forcesBackground: false,
      mimeType: "image/png",
    });
    expect(getMuralImageExportEncoding("jpg")).toEqual({
      extension: "jpg",
      forcesBackground: true,
      mimeType: "image/jpeg",
    });
    expect(getMuralImageExportEncoding(undefined).mimeType).toBe("image/png");
  });

  it("image export resolution changes output pixel dimensions", () => {
    const state = makeFakeState({});

    expect(getToolcraftImageExportSize({ resolution: "2k", state }).width).toBe(2048);
    expect(getToolcraftImageExportSize({ resolution: "4k", state }).width).toBe(4096);
    expect(getToolcraftImageExportSize({ resolution: "8k", state }).width).toBe(8192);
  });

  it("panel export actions build png and json deliverables", () => {
    const samples = makeHalfDarkSamples();
    const plan = generateMuralTilePlan(smallGrid, samples, defaultGenerationSettings);
    const settings = makeSettings({ useSourceColors: true });
    const schedule = buildMuralTileSchedule(smallGrid, plan, settings);

    expect(schedule.grid).toEqual({ columns: 4, rows: 4, totalTiles: 16 });
    expect(schedule.wall).toEqual({ height: 16, width: 16 });
    expect(schedule.tileSize).toEqual({ height: 4, width: 4 });
    expect(schedule.tiles).toHaveLength(16);

    const firstTile = schedule.tiles[0]!;

    expect(firstTile).toMatchObject({ column: 0, row: 0 });
    expect(typeof firstTile.preset).toBe("string");
    expect([0, 90, 180, 270]).toContain(firstTile.rotation);
    expect(firstTile.baseColor).toBe(settings.baseColor);
    expect(firstTile.sampledColor).toBe("#000000");
    expect(firstTile.accentColor).toBe("#000000");

    const totalCounted = Object.values(schedule.presetCounts).reduce<number>(
      (total, count) => total + (count ?? 0),
      0,
    );

    expect(totalCounted).toBe(16);

    const fake = new FakeContext2D();

    drawMural({
      context: asContext(fake),
      grid: smallGrid,
      height: 1080,
      includeBackground: true,
      plan,
      settings,
      width: 1920,
    });
    expect(fake.fills.length).toBeGreaterThan(16);
  });

  it("parses runtime values into clamped mural settings", () => {
    const settings = parseMuralSettings({
      "colors.accent": { hex: "#112233" },
      "mapping.contrast": 250,
      "modules.seed": -5,
      "tiles.width": "not-a-number",
      "wall.unit": "parsec",
      "wall.width": "120",
    });

    expect(settings.accentColor).toBe("#112233");
    expect(settings.generation.contrast).toBe(100);
    expect(settings.generation.seed).toBe(1);
    expect(settings.tileWidth).toBe(muralDefaults.tileWidth);
    expect(settings.wallUnit).toBe(muralDefaults.wallUnit);
    expect(settings.wallWidth).toBe(120);
  });
});
