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

/**
 * Maps a backing-pixel coordinate to the tile cell under it, or null when
 * the point sits outside the wall or on a grout line.
 */
export function locateTileCell(
  grid: MuralGrid,
  layout: MuralCanvasLayout,
  x: number,
  y: number,
): { column: number; row: number } | null {
  const marginX = (layout.wallRect.width - grid.usedWidth * layout.scale) / 2;
  const marginY = (layout.wallRect.height - grid.usedHeight * layout.scale) / 2;
  const localX = x - layout.wallRect.x - marginX;
  const localY = y - layout.wallRect.y - marginY;

  if (localX < 0 || localY < 0) {
    return null;
  }

  const periodX = layout.tilePixelWidth + layout.groutPixels;
  const periodY = layout.tilePixelHeight + layout.groutPixels;
  const column = Math.floor(localX / periodX);
  const row = Math.floor(localY / periodY);

  if (column >= grid.columns || row >= grid.rows) {
    return null;
  }

  if (
    localX - column * periodX > layout.tilePixelWidth ||
    localY - row * periodY > layout.tilePixelHeight
  ) {
    return null;
  }

  return { column, row };
}

/** All tile cells whose pixel rects intersect the given backing-pixel rect. */
export function locateTileCellsInRect(
  grid: MuralGrid,
  layout: MuralCanvasLayout,
  rect: MuralLayoutRect,
): { column: number; row: number }[] {
  const marginX = (layout.wallRect.width - grid.usedWidth * layout.scale) / 2;
  const marginY = (layout.wallRect.height - grid.usedHeight * layout.scale) / 2;
  const originX = layout.wallRect.x + marginX;
  const originY = layout.wallRect.y + marginY;
  const periodX = layout.tilePixelWidth + layout.groutPixels;
  const periodY = layout.tilePixelHeight + layout.groutPixels;
  const left = Math.min(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const right = Math.max(rect.x, rect.x + rect.width);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  const firstColumn = Math.max(0, Math.floor((left - originX) / periodX));
  const firstRow = Math.max(0, Math.floor((top - originY) / periodY));
  const lastColumn = Math.min(grid.columns - 1, Math.floor((right - originX) / periodX));
  const lastRow = Math.min(grid.rows - 1, Math.floor((bottom - originY) / periodY));
  const cells: { column: number; row: number }[] = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const cellLeft = originX + column * periodX;
      const cellTop = originY + row * periodY;

      if (
        cellLeft + layout.tilePixelWidth >= left &&
        cellLeft <= right &&
        cellTop + layout.tilePixelHeight >= top &&
        cellTop <= bottom
      ) {
        cells.push({ column, row });
      }
    }
  }

  return cells;
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
