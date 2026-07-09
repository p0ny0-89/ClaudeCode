import type { MuralTilePlan } from "./generate";
import {
  computeMuralCanvasLayout,
  getTilePixelOrigin,
  type MuralCanvasLayout,
  type MuralGrid,
  type MuralLayoutRect,
} from "./grid";
import { getCellLabel } from "./labels";
import type { MuralSettings } from "./mural-state";
import { getTileCellKey } from "./overrides";
import { drawTilePreset } from "./tile-presets";

/** Preview-only decorations; never passed by the export render path. */
export type MuralPreviewOverlay = {
  marqueeRect?: MuralLayoutRect | null;
  selectionKeys?: ReadonlySet<string>;
};

export type DrawMuralOptions = {
  context: CanvasRenderingContext2D;
  grid: MuralGrid;
  height: number;
  overlay?: MuralPreviewOverlay;
  plan: MuralTilePlan;
  settings: MuralSettings;
  width: number;
};

/** Backing pixels below which per-cell labels become unreadable and are skipped. */
const MIN_LABEL_TILE_PIXELS = 30;

/**
 * Draws the full mural into the given context at the given pixel size. The
 * area around the wall is left transparent (there is no output background);
 * used by both the live preview canvas and the PNG export canvas so preview
 * and export stay pixel-consistent.
 */
export function drawMural(options: DrawMuralOptions): void {
  const { context, grid, height, plan, settings, width } = options;

  context.clearRect(0, 0, width, height);

  const layout = computeMuralCanvasLayout(grid, width, height);

  context.fillStyle = settings.groutColor;
  context.fillRect(
    layout.wallRect.x,
    layout.wallRect.y,
    layout.wallRect.width,
    layout.wallRect.height,
  );

  for (const cell of plan.cells) {
    const origin = getTilePixelOrigin(grid, layout, cell.row, cell.column);

    if (settings.previewMode === "grid") {
      context.fillStyle = settings.baseColor;
      context.fillRect(
        origin.x,
        origin.y,
        layout.tilePixelWidth,
        layout.tilePixelHeight,
      );
      continue;
    }

    if (settings.previewMode === "artwork") {
      context.fillStyle = cell.sampledHex ?? settings.baseColor;
      context.fillRect(
        origin.x,
        origin.y,
        layout.tilePixelWidth,
        layout.tilePixelHeight,
      );
      continue;
    }

    const accent =
      cell.overrideHex ??
      (settings.useSourceColors && cell.sampledHex
        ? cell.sampledHex
        : settings.accentColor);

    drawTilePreset(cell.presetId, {
      accent,
      base: cell.overrideHex ?? settings.baseColor,
      context,
      height: layout.tilePixelHeight,
      rotation: cell.rotation,
      width: layout.tilePixelWidth,
      x: origin.x,
      y: origin.y,
    });
  }

  if (settings.previewMode === "labels") {
    drawCellLabels(context, grid, layout, plan);
  }

  drawPreviewOverlay(options);
}

/**
 * Fabrication/install map: overlays each tile with its spreadsheet-style
 * coordinate (A3) so a contractor knows which design goes in which cell.
 */
function drawCellLabels(
  context: CanvasRenderingContext2D,
  grid: MuralGrid,
  layout: MuralCanvasLayout,
  plan: MuralTilePlan,
): void {
  const minTilePixels = Math.min(layout.tilePixelWidth, layout.tilePixelHeight);
  const labelsFit = minTilePixels >= MIN_LABEL_TILE_PIXELS;
  const fontSize = Math.max(10, Math.min(48, minTilePixels * 0.34));

  context.save();
  context.strokeStyle = "rgba(0, 0, 0, 0.35)";
  context.lineWidth = Math.max(1, minTilePixels * 0.02);
  context.font = `600 ${fontSize}px "Inter Variable", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const cell of plan.cells) {
    const origin = getTilePixelOrigin(grid, layout, cell.row, cell.column);

    context.strokeRect(
      origin.x,
      origin.y,
      layout.tilePixelWidth,
      layout.tilePixelHeight,
    );

    if (!labelsFit) {
      continue;
    }

    const label = getCellLabel(cell.row, cell.column);
    const centerX = origin.x + layout.tilePixelWidth / 2;
    const centerY = origin.y + layout.tilePixelHeight / 2;
    const metrics = context.measureText(label);
    const chipWidth = metrics.width + fontSize * 0.6;
    const chipHeight = fontSize * 1.35;

    context.fillStyle = "rgba(12, 12, 16, 0.72)";
    context.fillRect(
      centerX - chipWidth / 2,
      centerY - chipHeight / 2,
      chipWidth,
      chipHeight,
    );
    context.fillStyle = "#F4EFE6";
    context.fillText(label, centerX, centerY);
  }

  context.restore();
}

/** Selection highlights and the marquee rect; drawn over the preview only. */
function drawPreviewOverlay({ context, grid, overlay, plan, settings }: DrawMuralOptions): void {
  if (!overlay) {
    return;
  }

  const layout = computeMuralCanvasLayout(
    grid,
    context.canvas.width,
    context.canvas.height,
  );
  const selectionKeys = overlay.selectionKeys;

  if (selectionKeys && selectionKeys.size > 0) {
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.28)";
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = Math.max(1, layout.tilePixelWidth * 0.06);

    for (const cell of plan.cells) {
      if (!selectionKeys.has(getTileCellKey(cell.row, cell.column))) {
        continue;
      }

      const origin = getTilePixelOrigin(grid, layout, cell.row, cell.column);

      context.fillRect(origin.x, origin.y, layout.tilePixelWidth, layout.tilePixelHeight);
      context.strokeRect(
        origin.x,
        origin.y,
        layout.tilePixelWidth,
        layout.tilePixelHeight,
      );
    }

    context.restore();
  }

  const marquee = overlay.marqueeRect;

  if (marquee) {
    context.save();
    context.fillStyle = "rgba(120, 170, 255, 0.15)";
    context.strokeStyle = "rgba(120, 170, 255, 0.9)";
    context.lineWidth = Math.max(1, settings.tileWidth * 0.02);
    context.setLineDash([6, 4]);
    context.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
    context.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);
    context.restore();
  }
}
