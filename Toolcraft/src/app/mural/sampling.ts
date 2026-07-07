export type ArtworkScaleMode = "fill" | "fit" | "repeat";

export function isArtworkScaleMode(value: unknown): value is ArtworkScaleMode {
  return value === "fill" || value === "fit" || value === "repeat";
}

export type ArtworkPlacementRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type ArtworkPlacementOptions = {
  /** Empty tile cells kept clear around the artwork on every side. */
  paddingCells?: number;
  /** Percent size multiplier applied to the base fit/fill/repeat size. */
  scalePercent?: number;
  /** Extra tile cells between repeated instances (repeat mode only). */
  spacingCells?: number;
};

export type RepeatPeriodCells = {
  columns: number;
  rows: number;
};

type ResolvedPlacementOptions = {
  paddingCells: number;
  scaleFactor: number;
  spacingCells: number;
};

function resolvePlacementOptions(
  options: ArtworkPlacementOptions | undefined,
): ResolvedPlacementOptions {
  const paddingRaw = options?.paddingCells ?? 0;
  const scaleRaw = options?.scalePercent ?? 100;
  const spacingRaw = options?.spacingCells ?? 0;

  return {
    paddingCells: Number.isFinite(paddingRaw) ? Math.max(0, paddingRaw) : 0,
    scaleFactor:
      Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.max(1, scaleRaw) / 100 : 1,
    spacingCells: Number.isFinite(spacingRaw) ? Math.max(0, spacingRaw) : 0,
  };
}

type InnerArea = {
  height: number;
  width: number;
  x: number;
  y: number;
};

/** The padded region of the grid the artwork may occupy, at least one cell. */
function getInnerArea(columns: number, rows: number, paddingCells: number): InnerArea {
  const padX = Math.min(paddingCells, Math.max(0, (columns - 1) / 2));
  const padY = Math.min(paddingCells, Math.max(0, (rows - 1) / 2));

  return {
    height: Math.max(1, rows - padY * 2),
    width: Math.max(1, columns - padX * 2),
    x: padX,
    y: padY,
  };
}

function getRepeatBaseSize(
  imageWidth: number,
  imageHeight: number,
  inner: InnerArea,
  scaleFactor: number,
): { height: number; width: number } {
  const containScale = Math.min(inner.width / imageWidth, inner.height / imageHeight);
  const repeatScale = (containScale / 2) * scaleFactor;

  return {
    height: Math.max(imageHeight * repeatScale, 0.001),
    width: Math.max(imageWidth * repeatScale, 0.001),
  };
}

/**
 * Computes where the artwork lands in grid cell space (one unit = one tile
 * cell). Fit letterboxes inside the padded grid area, fill covers it and
 * crops, repeat tiles a half-area contain fit from the padded origin with
 * optional spacing cells between instances; scale multiplies the base size.
 */
export function computeArtworkPlacements(
  imageWidth: number,
  imageHeight: number,
  columns: number,
  rows: number,
  mode: ArtworkScaleMode,
  options?: ArtworkPlacementOptions,
): readonly ArtworkPlacementRect[] {
  if (imageWidth <= 0 || imageHeight <= 0 || columns <= 0 || rows <= 0) {
    return [];
  }

  const { paddingCells, scaleFactor, spacingCells } = resolvePlacementOptions(options);
  const inner = getInnerArea(columns, rows, paddingCells);
  const containScale = Math.min(inner.width / imageWidth, inner.height / imageHeight);
  const coverScale = Math.max(inner.width / imageWidth, inner.height / imageHeight);

  if (mode === "fit" || mode === "fill") {
    const baseScale = mode === "fit" ? containScale : coverScale;
    const width = imageWidth * baseScale * scaleFactor;
    const height = imageHeight * baseScale * scaleFactor;

    return [
      {
        height,
        width,
        x: inner.x + (inner.width - width) / 2,
        y: inner.y + (inner.height - height) / 2,
      },
    ];
  }

  const base = getRepeatBaseSize(imageWidth, imageHeight, inner, scaleFactor);
  const stepX = base.width + spacingCells;
  const stepY = base.height + spacingCells;
  const placements: ArtworkPlacementRect[] = [];
  const maxX = inner.x + inner.width;
  const maxY = inner.y + inner.height;

  for (let y = inner.y; y < maxY; y += stepY) {
    for (let x = inner.x; x < maxX; x += stepX) {
      placements.push({ height: base.height, width: base.width, x, y });
    }
  }

  return placements;
}

/**
 * The repeat pattern period in whole tile cells: one artwork instance plus
 * its spacing. Manual paint overrides use this to replicate across repeats.
 */
export function getRepeatPeriodCells(
  imageWidth: number,
  imageHeight: number,
  columns: number,
  rows: number,
  options?: ArtworkPlacementOptions,
): RepeatPeriodCells | null {
  if (imageWidth <= 0 || imageHeight <= 0 || columns <= 0 || rows <= 0) {
    return null;
  }

  const { paddingCells, scaleFactor, spacingCells } = resolvePlacementOptions(options);
  const inner = getInnerArea(columns, rows, paddingCells);
  const base = getRepeatBaseSize(imageWidth, imageHeight, inner, scaleFactor);

  return {
    columns: Math.max(1, Math.round(base.width + spacingCells)),
    rows: Math.max(1, Math.round(base.height + spacingCells)),
  };
}

export type CellSample = {
  alpha: number;
  blue: number;
  green: number;
  red: number;
};

export type CellSampleGrid = {
  columns: number;
  rows: number;
  samples: readonly (CellSample | null)[];
};

export function getCellSample(
  grid: CellSampleGrid,
  row: number,
  column: number,
): CellSample | null {
  return grid.samples[row * grid.columns + column] ?? null;
}

export function createEmptyCellSampleGrid(columns: number, rows: number): CellSampleGrid {
  return {
    columns,
    rows,
    samples: new Array<CellSample | null>(columns * rows).fill(null),
  };
}

export function cellSampleGridFromImageData(
  data: Uint8ClampedArray,
  columns: number,
  rows: number,
): CellSampleGrid {
  const samples: (CellSample | null)[] = new Array(columns * rows).fill(null);

  for (let index = 0; index < columns * rows; index += 1) {
    const offset = index * 4;
    const alpha = (data[offset + 3] ?? 0) / 255;

    if (alpha < 0.02) {
      continue;
    }

    samples[index] = {
      alpha,
      blue: data[offset + 2] ?? 0,
      green: data[offset + 1] ?? 0,
      red: data[offset] ?? 0,
    };
  }

  return { columns, rows, samples };
}

/** Rec. 709 relative luminance, normalized to 0..1. */
export function getSampleLuminance(sample: CellSample): number {
  return (0.2126 * sample.red + 0.7152 * sample.green + 0.0722 * sample.blue) / 255;
}

/**
 * Applies contrast as a pivot around mid gray. Contrast 0 keeps the value,
 * contrast 100 triples the distance from 0.5, clamped to 0..1.
 */
export function applyContrast(luminance: number, contrast: number): number {
  const factor = 1 + Math.max(0, Math.min(100, contrast)) / 50;
  const adjusted = 0.5 + (luminance - 0.5) * factor;

  return Math.max(0, Math.min(1, adjusted));
}

export function sampleToHex(sample: CellSample): string {
  const toHexByte = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");

  return `#${toHexByte(sample.red)}${toHexByte(sample.green)}${toHexByte(sample.blue)}`;
}
