# Tile Mural Generator — App Spec

A modular wall tile design tool: physical wall + tile dimensions define a grid, uploaded artwork is sampled into one color per tile cell, and each cell independently picks a geometric tile module (empty, dot, ring, quarter circle, half circle, diagonals, halves, checker, stripes, solid) from brightness/threshold mapping, density, randomness, and a repeatable seed. Output is a rendered mural image (PNG/JPG at 2K/4K/8K) plus a JSON tile schedule for fabrication.

## Renderer Technique Decision Matrix

- sourceRepresentation: `image-media` — the uploaded artwork is the only external source; it is decoded once and downsampled to one RGBA sample per tile cell.
- productRepresentation: `vector` — the mural is geometric tile motifs (rects, triangles, ellipses, rings, stripes) on a grout-colored wall; motifs are intentionally rasterized (see below).
- previewRenderer: `canvas-2d` — one static draw pass into the product canvas at `canvas.size * canvas.renderScale`.
- exportRenderer: `canvas-2d` — the export pass reuses the exact same `drawMural` routine through `createToolcraftPngExportCanvas`, so preview and export stay pixel-consistent and export renders product-quality output at the selected 2K/4K/8K dimensions.
- rendererWorkload: `simple-composition` — a single flat composition pass; the only pixel work is one cached cols-by-rows downsample of the artwork, read back through a shared WebGL `readPixels` path, not a CPU per-pixel loop over product output.
- rendererStrategy: `canvas-2d`.
- whyNotAlternativeStrategies:
  - SVG/DOM (`vector-output` native): the stress grid is 18432 cells with up to two shapes each; tens of thousands of live vector nodes would dominate layout, memory, and hit-testing for a static image, while Canvas 2D draws the same cells in one pass in tens of milliseconds.
  - WebGL/WebGPU (`pixel-output` strategies): the mural is a static single-pass composition redrawn only on control changes — no animation loop, no shader effects, no per-pixel processing of product output. GPU pipeline setup would add complexity without a measurable win; the one real pixel task (artwork downsample readback) already runs through a shared WebGL reader.
  - DOM text (`text-output`): the product has no text output.
- intentionalRasterizationReason: hundreds to tens of thousands of geometric cells render as one flat raster so preview redraws stay a single pass and export/copy shares the identical drawing code; per-cell vector nodes are unmanageable at the stress cell count.
- fidelityRisks: rasterized motifs soften slightly at extreme zoom (mitigated by `canvas.renderScale` up to 2); JPEG export flattens transparency, so background exclusion applies to PNG only.
- performanceRisks: very small tiles on a very large wall multiply cell counts (clamped at 512 cells per axis; stress scenario measures 18432 cells); artwork resampling must never run during slider drags (cached by media identity + grid shape + placement).

## Renderer Layer Inventory

- product-foreground (`mural-surface`): the whole mural — background fill, grout-filled wall rect, and per-cell tile motifs — drawn as one Canvas 2D layer, `primitiveCount: high`, `exportMode: included`, visible at `[data-toolcraft-product-output]`. There is no separate backgroundLayer, editingHandlesLayer, or exportComposite layer: the background is part of the same draw pass, there are no canvas handles, and export reuses the same pass.

## Render Pipeline Inventory

Passes (mirrored in `rendererPipeline` in `src/app/app-performance.ts`):

1. `artwork-decode` (decode, main): dataUrl → HTMLImageElement, cacheKey = media id + dataUrl + transform; invalidated by media-import and image rotate/flip.
2. `cell-sample` (preprocess, main): composed placement draw into a cols×rows canvas plus shared WebGL readback; cacheKey = media id + transform + grid shape + `artwork.scaleMode`; invalidated by artwork changes and grid-shape controls (`wall.*`, `tiles.width/height/grout`).
3. `module-assign` (vector-build, main): per-cell fill level → module + rotation through the seeded stream; invalidated by `mapping.*` and `modules.*` control-drag/control-change and by grid-shape changes; must not invalidate decode or cell-sample.
4. `mural-draw` (rasterize, main, retina quality): single Canvas 2D pass at `canvas.size * canvas.renderScale`; invalidated by colors, view mode, canvas size, and render scale.
5. `export-render` (export, export-only): `createToolcraftPngExportCanvas` at the selected `export.image.resolution`.

Interaction invalidation: control-drag on threshold/contrast/density/randomness/seed reassigns modules and redraws only; media-import invalidates the full chain; viewport-drag and viewport-zoom invalidate nothing (the runtime shell transforms the static canvas backing, keeping zoom responsive); export invalidates only the export pass.

## Control Selection Inventory (summary)

- Artwork source upload → `fileDrop` (exact owner for source material import; owns empty state, preview, rotate/flip, clear).
- Placement (fit/fill/repeat) and View (artwork/grid/mural) → `segmented` (compact ≤3 short options).
- Wall unit, mapping mode, module set, motif, export format/resolution → `select` (finite choices; motif has 12 options, beyond segmented limits).
- Wall/tile dimensions and grout gap → `text` with `commitMode: "setting"` (physical numeric values in the selected unit; sliders would need unit-dependent ranges).
- Threshold, contrast, density, randomness, seed → `slider` (live continuous tuning; seed is a stepped continuous 1–9999 range).
- Grout/base/accent/background colors → `color` (free hex, no opacity semantics, so not `colorOpacity`).
- Source colors, Include background → `switch` (binary states).
- Export PNG / Export JSON → sticky footer `panelActions` (product delivery).

Rejected: `collectionActions` (the module library is fixed, not a user-growable set in v1), `vector` (no stable two-axis parameter in the MVP; manual artwork offset is a post-MVP feature), `curves` (no editable response curve in the MVP), `imagePicker` for motifs (no rendered thumbnails yet; select labels stay honest).

## Persistence Policy

No localStorage persistence in v1: session-only state, with runtime Setup Export/Import Settings for transfer. Revisit if reload restoration is requested.
