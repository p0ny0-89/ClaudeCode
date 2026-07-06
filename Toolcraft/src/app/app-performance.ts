import {
  defineToolcraftPerformance,
  type ToolcraftPerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

/**
 * Stress geometry: a 240x120 wall with 1x1 tiles and 0.25 grout yields
 * floor(240.25 / 1.25) = 192 columns x floor(120.25 / 1.25) = 96 rows,
 * 18432 tile cells drawn in one static Canvas 2D pass.
 */
const stressWall = {
  tileHeight: "1",
  tileWidth: "1",
  wallHeight: "120",
  wallWidth: "240",
} as const;

const stressWallReason =
  "240x120 wall with 1x1 tiles is the heaviest realistic mural: 18432 cells, near the practical fabrication ceiling; the grid clamps at 512 cells per axis.";

const responsivenessBudget = {
  maxFrameGapMs: 120,
  maxInteractionMs: 2000,
} as const;

/**
 * Lightweight responsiveness scenarios: every visible control redraws the
 * same static grid, so one control-change budget shape covers them all.
 */
function makeControlChangeScenario({
  automatedTestName,
  browserTestName,
  controlLabel,
  expectedObservable,
  fixture,
  id,
  target,
  uiSelector,
}: {
  automatedTestName: string;
  browserTestName: string;
  controlLabel?: string;
  expectedObservable: string;
  fixture: string;
  id: string;
  target: string;
  uiSelector?: string;
}): ToolcraftPerformanceScenario {
  return {
    automated: true,
    automatedTestName,
    browser: true,
    browserTestName,
    budget: { ...responsivenessBudget },
    controlLabel,
    expectedObservable,
    fixture,
    id,
    interaction: "control-change",
    target,
    uiSelector,
    workload: false,
  };
}

function makeControlDragScenario({
  automatedTestName,
  browserTestName,
  controlLabel,
  expectedObservable,
  id,
  target,
}: {
  automatedTestName: string;
  browserTestName: string;
  controlLabel: string;
  expectedObservable: string;
  id: string;
  target: string;
}): ToolcraftPerformanceScenario {
  return {
    automated: true,
    automatedTestName,
    browser: true,
    browserTestName,
    budget: { ...responsivenessBudget },
    controlLabel,
    expectedObservable,
    fixture: "Default mural grid; the drag reassigns modules live on every step.",
    id,
    interaction: "control-drag",
    target,
    workload: false,
  };
}

export const appPerformance: ToolcraftPerformanceConfig = defineToolcraftPerformance({
  browserCheckPolicy: {
    fallbackRunner: "playwright",
    fallbackWhen: ["agent-browser-unavailable", "ci"],
    preferredRunner: "agent-browser",
  },
  rendererPipeline: {
    interactionInvalidation: [
      {
        interaction: "media-import",
        invalidates: ["artwork-decode", "cell-sample", "module-assign", "mural-draw"],
        targets: ["artwork.source"],
      },
      {
        interaction: "control-change",
        invalidates: ["cell-sample", "module-assign", "mural-draw"],
        mustNotInvalidate: ["artwork-decode"],
        targets: [
          "artwork.scaleMode",
          "wall.width",
          "wall.height",
          "tiles.width",
          "tiles.height",
          "tiles.grout",
        ],
      },
      {
        interaction: "control-change",
        invalidates: ["module-assign", "mural-draw"],
        mustNotInvalidate: ["artwork-decode", "cell-sample"],
        targets: ["mapping.mode", "modules.mode", "modules.single"],
      },
      {
        interaction: "control-change",
        invalidates: ["mural-draw"],
        mustNotInvalidate: ["artwork-decode", "cell-sample", "module-assign"],
        targets: [
          "artwork.previewMode",
          "wall.unit",
          "tiles.groutColor",
          "colors.base",
          "colors.accent",
          "colors.useSource",
          "appearance.background",
          "export.includeBackground",
        ],
      },
      {
        interaction: "control-drag",
        invalidates: ["module-assign", "mural-draw"],
        mustNotInvalidate: ["artwork-decode", "cell-sample"],
        targets: [
          "mapping.threshold",
          "mapping.contrast",
          "modules.density",
          "modules.randomness",
          "modules.seed",
        ],
      },
      {
        interaction: "control-drag",
        invalidates: ["mural-draw"],
        mustNotInvalidate: ["artwork-decode", "cell-sample", "module-assign"],
        targets: ["canvas.renderScale"],
      },
      {
        interaction: "viewport-drag",
        invalidates: [],
        mustNotInvalidate: [
          "artwork-decode",
          "cell-sample",
          "module-assign",
          "mural-draw",
        ],
        targets: ["canvas.offset"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: [
          "artwork-decode",
          "cell-sample",
          "module-assign",
          "mural-draw",
        ],
        targets: ["canvas.zoom"],
      },
      {
        interaction: "export",
        invalidates: ["export-render"],
        mustNotInvalidate: ["artwork-decode", "cell-sample"],
        targets: ["export.image.format", "export.image.resolution"],
      },
    ],
    passes: [
      {
        cacheKey: ["mediaAssets[].id", "mediaAssets[].dataUrl", "mediaAssets[].transform"],
        id: "artwork-decode",
        inputs: ["artwork.source", "mediaAssets[].dataUrl"],
        invalidatedBy: ["artwork.source", "mediaAssets[].transform"],
        kind: "decode",
        output: "source",
        quality: "full",
        runsOn: "main",
      },
      {
        cacheKey: [
          "mediaAssets[].id",
          "mediaAssets[].transform",
          "grid.columns",
          "grid.rows",
          "artwork.scaleMode",
        ],
        id: "cell-sample",
        inputs: ["artwork-decode", "grid.columns", "grid.rows", "artwork.scaleMode"],
        invalidatedBy: [
          "artwork.source",
          "artwork.scaleMode",
          "wall.width",
          "wall.height",
          "tiles.width",
          "tiles.height",
          "tiles.grout",
        ],
        kind: "preprocess",
        output: "intermediate",
        quality: "full",
        runsOn: "main",
      },
      {
        id: "module-assign",
        inputs: [
          "cell-sample",
          "mapping.mode",
          "mapping.threshold",
          "mapping.contrast",
          "modules.mode",
          "modules.single",
          "modules.density",
          "modules.randomness",
          "modules.seed",
        ],
        invalidatedBy: [
          "mapping.mode",
          "mapping.threshold",
          "mapping.contrast",
          "modules.mode",
          "modules.single",
          "modules.density",
          "modules.randomness",
          "modules.seed",
          "wall.width",
          "wall.height",
          "tiles.width",
          "tiles.height",
          "tiles.grout",
          "artwork.source",
        ],
        kind: "vector-build",
        output: "intermediate",
        quality: "full",
        runsOn: "main",
      },
      {
        cacheKey: [
          "module-assign",
          "artwork.previewMode",
          "colors.base",
          "colors.accent",
          "colors.useSource",
          "tiles.groutColor",
          "appearance.background",
          "export.includeBackground",
          "canvas.size.width",
          "canvas.size.height",
          "canvas.renderScale",
        ],
        id: "mural-draw",
        inputs: [
          "module-assign",
          "artwork.previewMode",
          "colors.base",
          "colors.accent",
          "colors.useSource",
          "tiles.groutColor",
          "appearance.background",
          "export.includeBackground",
          "canvas.size.width",
          "canvas.size.height",
          "canvas.renderScale",
        ],
        invalidatedBy: [
          "module-assign",
          "artwork.previewMode",
          "colors.base",
          "colors.accent",
          "colors.useSource",
          "tiles.groutColor",
          "appearance.background",
          "export.includeBackground",
          "canvas.size.width",
          "canvas.size.height",
          "canvas.renderScale",
        ],
        kind: "rasterize",
        output: "preview",
        quality: "retina",
        runsOn: "main",
      },
      {
        id: "export-render",
        inputs: [
          "module-assign",
          "export.image.format",
          "export.image.resolution",
          "appearance.background",
          "export.includeBackground",
        ],
        invalidatedBy: ["export.image.format", "export.image.resolution"],
        kind: "export",
        output: "export",
        quality: "export",
        runsOn: "export-only",
      },
    ],
  },
  rendererStrategy: "canvas-2d",
  rendererTechnique: {
    exportRenderer: "canvas-2d",
    fidelityRisks: [
      "Rasterized tile motifs soften slightly at high zoom; renderScale up to 2 keeps preview crisp at typical zoom levels.",
      "JPEG export flattens transparency, so background exclusion only applies to PNG output.",
    ],
    intentionalRasterizationReason:
      "The mural is up to 18k+ geometric tile cells drawn as one flat raster; SVG/DOM would need one node per cell motif (40k+ nodes at stress), while a single Canvas 2D pass draws them in tens of milliseconds and export reuses the exact same pass for pixel parity.",
    layers: [
      {
        content: ["geometry"],
        exportMode: "included",
        id: "mural-surface",
        kind: "product-foreground",
        primitiveCount: "high",
        renderer: "canvas-2d",
        uiSelector: "[data-toolcraft-product-output]",
      },
    ],
    performanceRisks: [
      "Very small tiles on a very large wall multiply cell counts; the grid clamps at 512 cells per axis and the stress scenario measures 18432 cells.",
      "Artwork resampling runs on grid-shape changes; it is cached by media identity plus grid shape plus placement so slider drags never re-sample.",
    ],
    previewRenderer: "canvas-2d",
    productRepresentation: "vector",
    rendererStrategy: "canvas-2d",
    rendererWorkload: "simple-composition",
    sourceRepresentation: "image-media",
    whyNotAlternativeStrategies: [
      "SVG/DOM: the stress grid is 18432 cells with up to two shapes each; tens of thousands of vector nodes would dominate layout and memory for a static image, while Canvas 2D draws the same cells in one pass.",
      "WebGL/WebGPU: the mural is a static single-pass composition redrawn only on control changes, with no animation loop; the only per-pixel work is the cached cols-by-rows artwork downsample, which already reads back through a shared WebGL path.",
    ],
  },
  rendererWorkload: "simple-composition",
  scenarios: [
    {
      automated: true,
      automatedTestName: "stress grid math yields the declared maximum cell count",
      browser: true,
      browserTestName: "browser perf: stress preview renders the maximum tile grid",
      budget: {
        maxLongTaskMs: 250,
        maxPreviewMs: 2000,
        maxRenderMs: 2000,
      },
      expectedObservable:
        "The 240x120 wall with 1x1 tiles renders 192x96 = 18432 tile cells in a single static pass without exceeding render or long-task budgets.",
      fixture:
        "Wall 240x120 with 1x1 tiles and 0.25 grout: the heaviest useful product grid.",
      id: "preview-render-stress",
      interaction: "preview-render",
      stress: true,
      stressFixture: {
        kind: "custom",
        reason: stressWallReason,
        value: { ...stressWall },
      },
      uiSelector: "[data-toolcraft-product-output]",
      workload: false,
    },
    {
      automated: true,
      automatedTestName: "density biases cells toward denser or emptier modules",
      browser: true,
      browserTestName: "browser perf: density drag stays live on the stress grid",
      budget: { ...responsivenessBudget },
      controlLabel: "Density",
      expectedObservable:
        "Dragging Density on the 18432-cell stress grid at render scale 2 live-updates the mural during the drag without frame gaps beyond budget; backing pixels match the selected render scale.",
      fixture: "Stress wall grid at render scale 2, then drag Density to 100.",
      id: "density-drag",
      interaction: "control-drag",
      target: "modules.density",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: 100,
          metric: "numeric-max",
          smoothTarget: 100,
          smoothTargetRatio: 1,
          target: "modules.density",
          userFacingRange: "fully-guaranteed",
        },
        reason: "Density 100 forces the solid-heavy assignment branch on every cell.",
        value: 100,
      },
      values: { default: 50, max: 100, min: 0 },
      workloadFixture: {
        kind: "custom",
        loadProfile: {
          hardLimit: { ...stressWall, renderScale: 2 },
          metric: "custom",
          smoothTarget: { ...stressWall, renderScale: 2 },
          smoothTargetRatio: 1,
          target: "tiles.width",
          userFacingRange: "fully-guaranteed",
        },
        reason:
          "The drag must be measured against the heaviest baseline: the 18432-cell stress wall at the default render scale 2 backing.",
        value: { ...stressWall, renderScale: 2 },
      },
      workload: true,
    },
    makeControlDragScenario({
      automatedTestName: "threshold level splits cells into solid and empty",
      browserTestName: "browser perf: threshold drag stays live within budget",
      controlLabel: "Threshold",
      expectedObservable:
        "Dragging Threshold reassigns solid/empty cells live without frame gaps beyond budget.",
      id: "threshold-drag",
      target: "mapping.threshold",
    }),
    makeControlDragScenario({
      automatedTestName: "contrast rescales sampled luminance before module mapping",
      browserTestName: "browser perf: contrast drag stays live within budget",
      controlLabel: "Contrast",
      expectedObservable:
        "Dragging Contrast reassigns modules live without frame gaps beyond budget.",
      id: "contrast-drag",
      target: "mapping.contrast",
    }),
    makeControlDragScenario({
      automatedTestName: "randomness swaps modules within coverage bands",
      browserTestName: "browser perf: randomness drag stays live within budget",
      controlLabel: "Randomness",
      expectedObservable:
        "Dragging Randomness swaps modules live without frame gaps beyond budget.",
      id: "randomness-drag",
      target: "modules.randomness",
    }),
    makeControlDragScenario({
      automatedTestName: "seed produces repeatable module assignment",
      browserTestName: "browser perf: seed drag stays live within budget",
      controlLabel: "Seed",
      expectedObservable:
        "Dragging Seed regenerates the module layout live without frame gaps beyond budget.",
      id: "seed-drag",
      target: "modules.seed",
    }),
    {
      automated: true,
      automatedTestName:
        "artwork placement modes fit fill and repeat map cells differently",
      browser: true,
      browserTestName: "browser perf: placement change stays within budget",
      budget: { ...responsivenessBudget },
      controlLabel: "Placement",
      expectedObservable:
        "Switching placement re-runs the cached artwork downsample and redraws within budget; Repeat draws the most placements.",
      fixture: "Uploaded artwork, then switch Placement to Repeat.",
      id: "placement-change",
      interaction: "control-change",
      target: "artwork.scaleMode",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: "repeat",
          metric: "custom",
          smoothTarget: "repeat",
          smoothTargetRatio: 1,
          target: "artwork.scaleMode",
          userFacingRange: "fully-guaranteed",
        },
        reason:
          "Repeat tiles the artwork across the whole wall, drawing the most placement rects during resampling.",
        value: "repeat",
      },
      values: { default: "fill", max: "repeat", min: "fit" },
      workload: true,
    },
    {
      automated: true,
      automatedTestName: "preview modes draw artwork grid and mural variants",
      browser: true,
      browserTestName: "browser perf: view change stays within budget",
      budget: { ...responsivenessBudget },
      controlLabel: "View",
      expectedObservable:
        "Switching the view redraws every tile cell within budget; the Mural view draws the most shapes.",
      fixture: "Default grid, then switch View to Mural.",
      id: "view-change",
      interaction: "control-change",
      target: "artwork.previewMode",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: "mural",
          metric: "custom",
          smoothTarget: "mural",
          smoothTargetRatio: 1,
          target: "artwork.previewMode",
          userFacingRange: "fully-guaranteed",
        },
        reason: "The Mural view draws base plus accent shapes for every cell.",
        value: "mural",
      },
      values: { default: "mural", max: "mural", min: "grid" },
      workload: true,
    },
    {
      automated: true,
      automatedTestName: "image export resolution changes output pixel dimensions",
      browser: true,
      browserTestName: "browser perf: image resolution change stays within budget",
      budget: { ...responsivenessBudget },
      controlLabel: "Resolution",
      expectedObservable:
        "Choosing an export resolution updates runtime state within budget; the heavy cost runs in the export pass measured by export-image.",
      fixture: "Choose the 8K resolution option.",
      id: "image-resolution-change",
      interaction: "control-change",
      target: "export.image.resolution",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: "8k",
          metric: "custom",
          smoothTarget: "8k",
          smoothTargetRatio: 1,
          target: "export.image.resolution",
          userFacingRange: "fully-guaranteed",
        },
        reason: "8K is the largest export target: an 8192px long-edge render.",
        value: "8k",
      },
      values: { default: "4k", max: "8k", min: "2k" },
      workload: true,
    },
    {
      automated: true,
      automatedTestName: "wall width changes the tile column count",
      browser: true,
      browserTestName: "browser perf: wall width change stays within budget",
      budget: { ...responsivenessBudget },
      controlLabel: "Wall width",
      expectedObservable:
        "Committing a wider wall multiplies tile columns and re-renders within budget.",
      fixture: "Type the 240 stress wall width and commit.",
      id: "wall-width-change",
      interaction: "control-change",
      target: "wall.width",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: "240",
          metric: "custom",
          smoothTarget: "240",
          smoothTargetRatio: 1,
          target: "wall.width",
          userFacingRange: "fully-guaranteed",
        },
        reason: "240 units is the stress wall width used across heavy scenarios.",
        value: "240",
      },
      values: { default: "96", max: "240", min: "24" },
      workload: true,
    },
    {
      automated: true,
      automatedTestName: "wall height changes the tile row count",
      browser: true,
      browserTestName: "browser perf: wall height change stays within budget",
      budget: { ...responsivenessBudget },
      controlLabel: "Wall height",
      expectedObservable:
        "Committing a taller wall multiplies tile rows and re-renders within budget.",
      fixture: "Type the 120 stress wall height and commit.",
      id: "wall-height-change",
      interaction: "control-change",
      target: "wall.height",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: "120",
          metric: "custom",
          smoothTarget: "120",
          smoothTargetRatio: 1,
          target: "wall.height",
          userFacingRange: "fully-guaranteed",
        },
        reason: "120 units is the stress wall height used across heavy scenarios.",
        value: "120",
      },
      values: { default: "72", max: "120", min: "24" },
      workload: true,
    },
    {
      automated: true,
      automatedTestName: "tile width changes the tile column count",
      browser: true,
      browserTestName: "browser perf: tile width change stays within budget",
      budget: { ...responsivenessBudget },
      controlLabel: "Tile width",
      expectedObservable:
        "Committing a smaller tile width multiplies tile columns and re-renders within budget.",
      fixture: "Type the 1-unit stress tile width and commit.",
      id: "tile-width-change",
      interaction: "control-change",
      target: "tiles.width",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: "1",
          metric: "custom",
          smoothTarget: "1",
          smoothTargetRatio: 1,
          target: "tiles.width",
          userFacingRange: "fully-guaranteed",
        },
        reason:
          "1-unit tiles maximize the column count on the stress wall (192 columns).",
        value: "1",
      },
      values: { default: "4", max: "1", min: "12" },
      workload: true,
    },
    {
      automated: true,
      automatedTestName: "tile height changes the tile row count",
      browser: true,
      browserTestName: "browser perf: tile height change stays within budget",
      budget: { ...responsivenessBudget },
      controlLabel: "Tile height",
      expectedObservable:
        "Committing a smaller tile height multiplies tile rows and re-renders within budget.",
      fixture: "Type the 1-unit stress tile height and commit.",
      id: "tile-height-change",
      interaction: "control-change",
      target: "tiles.height",
      stressFixture: {
        kind: "max-value",
        loadProfile: {
          hardLimit: "1",
          metric: "custom",
          smoothTarget: "1",
          smoothTargetRatio: 1,
          target: "tiles.height",
          userFacingRange: "fully-guaranteed",
        },
        reason: "1-unit tiles maximize the row count on the stress wall (96 rows).",
        value: "1",
      },
      values: { default: "4", max: "1", min: "12" },
      workload: true,
    },
    makeControlChangeScenario({
      automatedTestName: "grout spacing changes tile counts and used wall area",
      browserTestName: "browser perf: grout gap change stays within budget",
      controlLabel: "Grout gap",
      expectedObservable:
        "Committing a larger grout gap re-renders the grid within budget.",
      fixture: "Type a 1.5-unit grout gap and commit.",
      id: "grout-gap-change",
      target: "tiles.grout",
    }),
    makeControlChangeScenario({
      automatedTestName: "wall unit is recorded in the tile schedule",
      browserTestName: "browser perf: wall unit change stays within budget",
      controlLabel: "Unit",
      expectedObservable: "Choosing a unit relabels dimensions within budget.",
      fixture: "Choose the Feet unit option.",
      id: "wall-unit-change",
      target: "wall.unit",
    }),
    makeControlChangeScenario({
      automatedTestName:
        "mapping mode switches between brightness and threshold assignment",
      browserTestName: "browser perf: mapping mode change stays within interaction budget",
      controlLabel: "Mode",
      expectedObservable:
        "Switching the mapping mode reassigns modules across the grid within budget.",
      fixture: "Switch Mode between Brightness and Threshold.",
      id: "mapping-change",
      target: "mapping.mode",
    }),
    makeControlChangeScenario({
      automatedTestName: "module set switches between mixed and single generation",
      browserTestName: "browser perf: module set change stays within budget",
      controlLabel: "Module set",
      expectedObservable:
        "Switching the module set reassigns modules across the grid within budget.",
      fixture: "Switch Module set to Single module.",
      id: "module-set-change",
      target: "modules.mode",
    }),
    makeControlChangeScenario({
      automatedTestName: "single module mode repeats one chosen module",
      browserTestName: "browser perf: motif change stays within budget",
      controlLabel: "Motif",
      expectedObservable:
        "Choosing a motif redraws every non-empty cell within budget.",
      fixture: "Single module set, then choose the Ring motif.",
      id: "motif-change",
      target: "modules.single",
    }),
    makeControlChangeScenario({
      automatedTestName: "image export format selects png or jpg encoding",
      browserTestName: "browser perf: image format change stays within budget",
      controlLabel: "Format",
      expectedObservable:
        "Choosing an export format updates runtime state within budget.",
      fixture: "Choose the JPG format option.",
      id: "image-format-change",
      target: "export.image.format",
    }),
    makeControlChangeScenario({
      automatedTestName: "grout color fills the wall area behind tiles",
      browserTestName: "browser perf: grout color change stays within budget",
      controlLabel: "Grout color",
      expectedObservable: "Committing a grout color re-renders the grid within budget.",
      fixture: "Type a new grout hex value and commit.",
      id: "grout-color-change",
      target: "tiles.groutColor",
    }),
    makeControlChangeScenario({
      automatedTestName: "base color fills tile faces",
      browserTestName: "browser perf: base color change stays within budget",
      controlLabel: "Base",
      expectedObservable: "Committing a base color re-renders the grid within budget.",
      fixture: "Type a new base hex value and commit.",
      id: "base-color-change",
      target: "colors.base",
    }),
    makeControlChangeScenario({
      automatedTestName: "accent color fills module motifs",
      browserTestName: "browser perf: accent color change stays within budget",
      controlLabel: "Accent",
      expectedObservable: "Committing an accent color re-renders the grid within budget.",
      fixture: "Type a new accent hex value and commit.",
      id: "accent-color-change",
      target: "colors.accent",
    }),
    makeControlChangeScenario({
      automatedTestName: "background color fills behind the wall",
      browserTestName: "browser perf: background color change stays within budget",
      expectedObservable:
        "Committing a background color re-renders the canvas within budget.",
      fixture: "Type a new background hex value and commit.",
      id: "background-color-change",
      target: "appearance.background",
      uiSelector: 'input[aria-label="background hex"]',
    }),
    makeControlChangeScenario({
      automatedTestName: "source colors sample accents from the artwork",
      browserTestName: "browser perf: source colors toggle stays within budget",
      controlLabel: "Source colors",
      expectedObservable:
        "Toggling source colors recolors every motif within budget.",
      fixture: "Toggle the Source colors switch.",
      id: "source-colors-toggle",
      target: "colors.useSource",
    }),
    makeControlChangeScenario({
      automatedTestName: "include background controls preview and png transparency",
      browserTestName: "browser perf: include background toggle stays within budget",
      controlLabel: "Include",
      expectedObservable:
        "Toggling Include hides or shows the preview background within budget.",
      fixture: "Toggle the Include switch in the Background section.",
      id: "include-background-toggle",
      target: "export.includeBackground",
    }),
    {
      automated: true,
      automatedTestName: "artwork upload sampling maps image cells into the tile plan",
      browser: true,
      browserTestName: "browser perf: artwork import resamples within budget",
      budget: {
        maxFrameGapMs: 120,
        maxInteractionMs: 2000,
        maxPreviewMs: 2000,
      },
      expectedObservable:
        "Importing a 4K-class artwork decodes and downsamples into the tile grid within budget and updates the rendered mural.",
      fixture: "A generated 3840x2160 artwork image imported through the uploader.",
      id: "media-import",
      interaction: "media-import",
      target: "artwork.source",
      stressFixture: {
        kind: "media",
        loadProfile: {
          hardLimit: { height: 2160, width: 3840 },
          metric: "media-area",
          smoothTarget: { height: 2160, width: 3840 },
          smoothTargetRatio: 1,
          target: "artwork.source",
          userFacingRange: "fully-guaranteed",
        },
        reason:
          "4K-class source artwork is the realistic heavy upload for a wall mural design source.",
        value: { height: 2160, width: 3840 },
      },
      workload: true,
    },
    {
      automated: true,
      automatedTestName: "panel export actions build png and json deliverables",
      browser: true,
      browserTestName: "browser perf: image export completes within budget",
      budget: {
        maxExportMs: 8000,
      },
      expectedObservable:
        "Export PNG renders the stress grid at the selected 4K resolution and hands off the blob within the export budget, measured at the exported output dimensions.",
      fixture: "Stress wall grid exported at 4K resolution.",
      id: "export-image",
      interaction: "export-copy",
      stressFixture: {
        kind: "custom",
        reason:
          "Exporting the heaviest grid at 4K is the heaviest export path the app exposes.",
        value: { ...stressWall },
      },
      uiSelector: "[data-toolcraft-product-output]",
      workload: false,
    },
    {
      automated: true,
      automatedTestName: "stress grid math yields the declared maximum cell count",
      browser: true,
      browserTestName: "browser perf: toolbar zoom stays smooth on the stress grid",
      budget: {
        maxFrameGapMs: 120,
        maxInteractionMs: 2000,
        maxLongTaskMs: 250,
      },
      expectedObservable:
        "Toolbar zoom in/out on the stress grid transforms the static canvas backing without re-rendering tiles, keeping frame gaps and long tasks within budget.",
      fixture: "Stress wall grid, then real toolbar zoom controls.",
      id: "viewport-zoom-stress",
      interaction: "viewport-zoom-stress",
      stress: true,
      stressFixture: {
        kind: "custom",
        reason: stressWallReason,
        value: { ...stressWall },
      },
      uiSelector: "[data-toolcraft-product-output]",
      workload: false,
    },
    {
      automated: true,
      automatedTestName: "preview modes draw artwork grid and mural variants",
      browser: true,
      browserTestName: "browser perf: viewport stays stable during panel interactions",
      budget: { ...responsivenessBudget },
      expectedObservable:
        "Slider drags and panel interactions keep canvas zoom and offset stable with no unexpected jumps.",
      fixture: "Default mural grid with panel control interactions.",
      id: "viewport-stability",
      interaction: "viewport-stability",
      uiSelector: "[data-toolcraft-product-output]",
      workload: false,
    },
  ],
  usesCustomRenderer: true,
  workloadTargets: [
    "artwork.scaleMode",
    "artwork.previewMode",
    "wall.width",
    "wall.height",
    "tiles.width",
    "tiles.height",
    "modules.density",
    "export.image.resolution",
  ],
});
