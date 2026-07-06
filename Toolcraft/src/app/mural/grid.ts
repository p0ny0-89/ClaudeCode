export type MuralGridInput = {
  groutSpacing: number;
  tileHeight: number;
  tileWidth: number;
  wallHeight: number;
  wallWidth: number;
};

export type MuralGrid = {
  columns: number;
  groutSpacing: number;
  rows: number;
  tileHeight: number;
  tileWidth: number;
  totalTiles: number;
  usedHeight: number;
  usedWidth: number;
  wallHeight: number;
  wallWidth: number;
};

/**
 * Hard ceiling so pathological tile/wall ratios cannot explode the cell count.
 * 512 columns x 512 rows stays renderable in a single Canvas 2D pass.
 */
export const MAX_GRID_AXIS_CELLS = 512;

/**
 * Physical tile grid math. A wall of width W fits N tiles of width T with
 * grout gap G between tiles when N*T + (N-1)*G <= W, so
 * N = floor((W + G) / (T + G)).
 */
export function computeMuralGrid(input: MuralGridInput): MuralGrid {
  const wallWidth = Math.max(input.wallWidth, 0.001);
  const wallHeight = Math.max(input.wallHeight, 0.001);
  const tileWidth = Math.max(input.tileWidth, 0.001);
  const tileHeight = Math.max(input.tileHeight, 0.001);
  const groutSpacing = Math.max(input.groutSpacing, 0);

  const columns = Math.min(
    MAX_GRID_AXIS_CELLS,
    Math.max(1, Math.floor((wallWidth + groutSpacing) / (tileWidth + groutSpacing))),
  );
  const rows = Math.min(
    MAX_GRID_AXIS_CELLS,
    Math.max(1, Math.floor((wallHeight + groutSpacing) / (tileHeight + groutSpacing))),
  );

  return {
    columns,
    groutSpacing,
    rows,
    tileHeight,
    tileWidth,
    totalTiles: columns * rows,
    usedHeight: rows * tileHeight + (rows - 1) * groutSpacing,
    usedWidth: columns * tileWidth + (columns - 1) * groutSpacing,
    wallHeight,
    wallWidth,
  };
}

export type MuralLayoutRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type MuralCanvasLayout = {
  /** Pixels per physical unit. */
  scale: number;
  tilePixelHeight: number;
  tilePixelWidth: number;
  groutPixels: number;
  wallRect: MuralLayoutRect;
};

/**
 * Fits the physical wall rectangle inside the pixel canvas, centered and
 * aspect-correct, and derives per-tile pixel geometry from the same scale.
 */
export function computeMuralCanvasLayout(
  grid: MuralGrid,
  canvasWidth: number,
  canvasHeight: number,
): MuralCanvasLayout {
  const scale = Math.min(
    canvasWidth / grid.wallWidth,
    canvasHeight / grid.wallHeight,
  );
  const wallPixelWidth = grid.wallWidth * scale;
  const wallPixelHeight = grid.wallHeight * scale;

  return {
    groutPixels: grid.groutSpacing * scale,
    scale,
    tilePixelHeight: grid.tileHeight * scale,
    tilePixelWidth: grid.tileWidth * scale,
    wallRect: {
      height: wallPixelHeight,
      width: wallPixelWidth,
      x: (canvasWidth - wallPixelWidth) / 2,
      y: (canvasHeight - wallPixelHeight) / 2,
    },
  };
}

export function getTilePixelOrigin(
  grid: MuralGrid,
  layout: MuralCanvasLayout,
  row: number,
  column: number,
): { x: number; y: number } {
  const marginX = (layout.wallRect.width - grid.usedWidth * layout.scale) / 2;
  const marginY = (layout.wallRect.height - grid.usedHeight * layout.scale) / 2;

  return {
    x:
      layout.wallRect.x +
      marginX +
      column * (layout.tilePixelWidth + layout.groutPixels),
    y:
      layout.wallRect.y +
      marginY +
      row * (layout.tilePixelHeight + layout.groutPixels),
  };
}
