import type { MuralTilePlan } from "./generate";
import {
  computeMuralCanvasLayout,
  getTilePixelOrigin,
  type MuralGrid,
  type MuralLayoutRect,
} from "./grid";
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
  includeBackground: boolean;
  overlay?: MuralPreviewOverlay;
  plan: MuralTilePlan;
  settings: MuralSettings;
  width: number;
};

/**
 * Draws the full mural into the given context at the given pixel size. Used
 * by both the live preview canvas and the PNG export canvas so preview and
 * export stay pixel-consistent.
 */
export function drawMural(options: DrawMuralOptions): void {
  const { context, grid, height, includeBackground, overlay, plan, settings, width } =
    options;

  context.clearRect(0, 0, width, height);

  if (includeBackground) {
    context.fillStyle = settings.background;
    context.fillRect(0, 0, width, height);
  }

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

  drawPreviewOverlay(options);
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
