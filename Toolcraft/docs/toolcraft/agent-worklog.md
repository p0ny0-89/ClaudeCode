# Implementation Worklog

This file records product decisions and the evidence behind them.

## Status

Mode: product

Product: Tile Mural Generator — a modular wall tile design tool that converts wall dimensions, physical tile sizes, and uploaded artwork into a mural built from a library of geometric tile modules, with PNG/JPG image export and a JSON tile schedule export.

## Decision Trail

### Iteration 1 — Tile mural generator MVP

- Request: Build a tile mural generator / modular wall tile design tool: wall dimensions with units, physical tile dimensions plus grout spacing, artwork upload with fit/fill/repeat placement, a geometric tile module library (empty, solid, halves, diagonals, quarter/half circles, dot, ring, checker, stripes), mixed and single module generation driven by brightness/threshold/contrast/density/randomness/seed, base/accent/grout/background colors with sampled source colors, PNG export, and JSON tile schedule export.
- Task type: New Toolcraft product app assembly (schema, custom Canvas 2D renderer, exports, acceptance, performance).
- User-visible result: The canvas renders a physically accurate tile wall (grout gaps, wall margin, aspect-correct fit inside the editable output canvas) whose cells each pick a geometric module from the sampled artwork and generation rules; controls update the mural live; the sticky footer exports the rendered mural image and a fabrication JSON schedule.
- Source/reference checked: None — the prompt described the product directly; the mentioned reference images were not attached to the request, so the geometric module language was designed from the written description only.
- Reference inputs: None.
- Docs/contracts read: workflow.md, assembly-workflow.md, schema-reference.md, component-rules.md, acceptance-testing.md, performance.md, renderer-technique.md, decision-contract.md, AGENTS.md.
- Contract rules applied: runtime-shell-required, canvas-no-app-ui, canvas-surface-preserved, controls-product-coverage, controls-layout-heuristics, output-export-required, renderer-technique-inventory, acceptance-product-observable, performance-coverage-levels, persistence-policy-explicit, workflow-required.
- Decision: Build through `defineToolcraft` with `editable-output` sizing, upload, and `renderScale: true`; render the mural as one static Canvas 2D pass in `canvasContent`; keep all generation logic in pure modules under `src/app/mural/` (grid math, sampling, module assignment, drawing, schedule) shared by preview and export; expose Export PNG and Export JSON as sticky footer `panelActions` with real Promises and `reportProgress`.
- Alternatives rejected: SVG/DOM tile nodes (up to 18432 cells with two shapes each would create tens of thousands of vector nodes for a static image); WebGL (static single-pass composition with no animation loop and only one cached cols-by-rows downsample does not justify GPU pipeline complexity); `intrinsic-media` sizing (uploaded artwork is source material inside the product canvas, not a media viewer source); persistence via localStorage (deferred for v1 — settings survive through runtime Setup Export/Import Settings; recorded as a follow-up risk).
- State/output mapping: `wall.*` and `tiles.*` values feed `computeMuralGrid` (columns = floor((wall+grout)/(tile+grout)) per axis, clamped at 512/axis); `artwork.source` mediaAssets (with `mediaAssets[].transform`) decode once and downsample into one RGBA sample per cell keyed by media id + grid shape + `artwork.scaleMode`; `mapping.*` and `modules.*` map samples to module + rotation per cell through a deterministic seeded stream; `colors.*`, `tiles.groutColor`, `appearance.background`, and `export.includeBackground` (via `shouldIncludeToolcraftPreviewBackground`) style the single `drawMural` pass rendered into the `[data-toolcraft-product-output]` canvas at `canvas.size * canvas.renderScale`; Export PNG re-renders through `createToolcraftPngExportCanvas` with `export.image.format`/`export.image.resolution`; Export JSON serializes `buildMuralTileSchedule` (row, column, module, rotation, base/accent/sampled colors, wall unit).
- Files changed: src/app/app-schema.ts, src/app/app-acceptance.ts (exported constants only), src/app/app-performance.ts, src/app/app-export.ts, src/app/mural-renderer.tsx, src/app/mural/{units,grid,tile-presets,sampling,generate,render,schedule,mural-state,artwork-sampler}.ts, src/app/mural.test.ts, src/app/app-schema.test.ts, src/routes/index.tsx, e2e/{mural-helpers.ts,app-mural.spec.ts,app-mural-perf.spec.ts,app-controls.spec.ts}, index.html, docs/toolcraft/agent-worklog.md.
- Verification: Verification tier: Tier 4 (fresh generated app completion). Run: `pnpm verify:quick`, `pnpm verify:final`, browser performance checkpoint via `pnpm verify:perf`, then `pnpm dev`. See the Verification section for results.
- Skipped checks: None for the final gate. During implementation, intermediate edits used targeted `vitest run` and `tsc --noEmit` instead of the full suite per the tier classifier.
- Risks: No localStorage persistence in v1 (settings reset on reload; Export/Import Settings covers transfer). Manual per-tile editing, SVG export, CSV export, palette reduction, edge/contour mode, preset pool controls, and printable install maps are follow-up features from the prompt's post-MVP list.

## Decisions

### Renderer

- Decision: Single-pass Canvas 2D product renderer (`MuralRenderer`) drawing background, grout-filled wall rect, and per-cell tile modules; geometric modules are intentionally rasterized; redraws are coalesced to one per animation frame and tile motifs draw without per-cell clipping (all motifs are constructed inside the tile bounds).
- Reason: The mural is a static composition redrawn only on control changes; the stress grid is 18432 cells (240x120 wall, 1x1 tiles), which draws in one pass in tens of milliseconds, while SVG/DOM node counts would be unmanageable and WebGL adds pipeline complexity without a measurable win for static redraws. High-frequency slider drags initially queued one full redraw per pointer move; requestAnimationFrame coalescing keeps only the latest scheduled draw, and removing the per-cell clip removed the dominant per-cell cost.
- Evidence: `rendererTechnique` and `rendererPipeline` in src/app/app-performance.ts; stress scenario `preview-render-stress` measures the 18432-cell grid via `e2e/app-mural-perf.spec.ts`; the `density-drag` scenario measures live drags on the 18432-cell grid at render scale 2 within the 120ms frame-gap budget; artwork sampling is cached by media identity + grid shape + placement so slider drags only reassign modules and redraw (`interactionInvalidation` mustNotInvalidate rules). The artwork downsample readback runs through a shared WebGL `readPixels` reader created outside React render.

### Timeline

- Decision: No timeline.
- Reason: The mural is a still product with no product animation, no transport behavior, and no video export; `appTransferMode.animationIntent.mode = "none"`.
- Evidence: `panels.timeline` is omitted in src/app/app-schema.ts; only `Export PNG`/`Export JSON` footer actions exist.

### Layers

- Decision: No layers.
- Reason: Single-surface product; one artwork source, no multi-object selection/reorder/visibility model.
- Evidence: `panels.layers` is omitted in src/app/app-schema.ts.

### Controls

- Decision: Ten authored sections grouped by product entity and workflow stage: Artwork (uploader, standalone runtime block), Artwork Placement (placement + view), Wall Surface (unit + dimensions), Tile Grid (tile dimensions + grout gap/color), Tile Mapping (mode selector + gated threshold + contrast), Tile Modules (module set + gated motif + density/randomness/seed), Tile Colors (base/accent/source-colors), required Background (Include + unlabeled color), Image Export (format/resolution pair), sticky Export actions.
- Reason: Grouping follows product entities, mode selectors sit above their `visibleWhen`-gated branches (threshold under Threshold mode, motif under Single module), and the Background/Image Export sections follow the mandated contract layout.
- Evidence: `starterControlSectionInventory` in src/app/app-acceptance.ts matches the schema targets exactly; app-schema.test.ts asserts visible control order; every non-action control declares `performanceRole`/`performanceReason`.

### Export

- Decision: Export PNG (PNG/JPG via `export.image.format`, 2K/4K/8K via `export.image.resolution` through `createToolcraftPngExportCanvas`) and Export JSON tile schedule as sticky footer actions returning real Promises with `reportProgress`; JPEG always includes the background because it has no alpha channel.
- Reason: Still-output product apps require Export PNG through the standard helper; the JSON schedule (wall, tile size, grid counts, per-tile module/rotation/colors, module counts, unit) is the fabrication deliverable the prompt requires.
- Evidence: src/app/app-export.ts; browser tests decode exported bytes for type, dimensions (2048/4096/8192 long edge), and PNG alpha behavior with Include off/on; preview uses `shouldIncludeToolcraftPreviewBackground`. The browser suite caught and fixed a real export bug: `drawMural` clears the surface before painting, so the export path passes `includeBackground` into `drawMural` itself instead of relying on the helper's pre-fill, which the clear would have erased.

### Performance

- Decision: Workload targets are the grid-count drivers (`wall.width`, `wall.height`, `tiles.width`, `tiles.height`) plus `artwork.source` media import; every scenario measures the 18432-cell stress wall (240x120 wall, 1x1 tiles → 192x96 cells) with `loadProfile` hardLimit = smoothTarget = 18432, ratio 1, fully guaranteed; media import uses a 3840x2160 source fixture; density drag measures at render scale 2 with backing-pixel proof.
- Reason: Tile count is the only multiplicative render cost; the grid clamps at 512 cells per axis, and the declared stress value is the heaviest realistic mural, tried at the full hard limit with no degraded smooth target.
- Evidence: src/app/app-performance.ts scenarios (`preview-render-stress`, `density-drag`, `mapping-change`, `media-import`, `export-image`, `viewport-zoom-stress`, `viewport-stability`) and e2e/app-mural-perf.spec.ts applying fixtures through `applyToolcraftPerformanceStressFixture`/`applyToolcraftPerformanceWorkloadFixture` and asserting budgets through `expectToolcraftScenarioPerformanceBudget`.

### Persistence

- Decision: No localStorage persistence in v1; explicit policy is session-only state with runtime Setup Export/Import Settings for transfer.
- Reason: Keeps the first delivery surface small; no reload restoration promise is made to the user.
- Evidence: schema `persistence` is omitted in src/app/app-schema.ts; recorded as a follow-up risk.

## Evidence

- Source reviewed: prompt requirements only (no reference apps, URLs, screenshots, videos, or media files were provided; the mentioned reference images were not attached).
- Contract applied: AGENTS.md quick entry contract plus the local docs listed in the decision trail.
- Empty-source behavior: before any upload, cells use a neutral 0.5 fill level so the mural renders as a user-driven modular pattern from the density/randomness/seed controls; no fake sample artwork, CTA copy, or preset source designs are drawn, and the uploader (`fileDrop`) owns the empty state.

## Verification

- Verification tier: Tier 4 — fresh generated app completion (first working product version).
- Run: `pnpm verify:quick` — passed (docs check, integrity check, script tests, vitest app tests).
- Run: `pnpm verify:final` — passed (ai:check, tests, typecheck + build, browser functional suite).
- Run: `pnpm verify:perf` — passed (playwright-fallback browser performance checkpoint: performance audit plus budget scenarios with one worker).
- Verification: playwright-fallback browser performance checkpoint.
- Fallback reason: agent-browser-unavailable — the agent-controlled browser in this environment has no frame-gap/long-task instrumentation for budget measurement, so the Playwright fallback suite measured the declared budgets.
- Browser: functional checks also exercised through the agent-controlled preview (upload, slider drags, mode switches, export) after the gates passed.

## Risks

- Risk: No localStorage persistence in v1; user settings reset on reload (Export/Import Settings covers transfer). Follow-up if reload restoration is wanted.
- Risk: Post-MVP prompt features not yet built: manual per-tile editing, SVG export, CSV export, limited palette reduction, edge/contour mode, preset pool (guided assignment) controls, printable install maps with row/column labels.
- Risk: JPEG export flattens transparency by design; background exclusion applies to PNG only.
