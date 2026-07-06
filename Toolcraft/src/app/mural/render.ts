import type { MuralTilePlan } from "./generate";
import {
  computeMuralCanvasLayout,
  getTilePixelOrigin,
  type MuralGrid,
} from "./grid";
import type { MuralSettings } from "./mural-state";
import { drawTilePreset } from "./tile-presets";

export type DrawMuralOptions = {
  context: CanvasRenderingContext2D;
  grid: MuralGrid;
  height: number;
  includeBackground: boolean;
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
  const { context, grid, height, includeBackground, plan, settings, width } = options;

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
      settings.useSourceColors && cell.sampledHex
        ? cell.sampledHex
        : settings.accentColor;

    drawTilePreset(cell.presetId, {
      accent,
      base: settings.baseColor,
      context,
      height: layout.tilePixelHeight,
      rotation: cell.rotation,
      width: layout.tilePixelWidth,
      x: origin.x,
      y: origin.y,
    });
  }
}
