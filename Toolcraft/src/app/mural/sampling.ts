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

/**
 * Computes where the artwork lands in grid cell space (one unit = one tile
 * cell). Fit letterboxes inside the grid, fill covers and crops, repeat
 * tiles a half-grid contain fit from the top-left corner.
 */
export function computeArtworkPlacements(
  imageWidth: number,
  imageHeight: number,
  columns: number,
  rows: number,
  mode: ArtworkScaleMode,
): readonly ArtworkPlacementRect[] {
  if (imageWidth <= 0 || imageHeight <= 0 || columns <= 0 || rows <= 0) {
    return [];
  }

  const containScale = Math.min(columns / imageWidth, rows / imageHeight);
  const coverScale = Math.max(columns / imageWidth, rows / imageHeight);

  if (mode === "fit") {
    const width = imageWidth * containScale;
    const height = imageHeight * containScale;

    return [
      {
        height,
        width,
        x: (columns - width) / 2,
        y: (rows - height) / 2,
      },
    ];
  }

  if (mode === "fill") {
    const width = imageWidth * coverScale;
    const height = imageHeight * coverScale;

    return [
      {
        height,
        width,
        x: (columns - width) / 2,
        y: (rows - height) / 2,
      },
    ];
  }

  const repeatScale = containScale / 2;
  const width = Math.max(imageWidth * repeatScale, 0.001);
  const height = Math.max(imageHeight * repeatScale, 0.001);
  const placements: ArtworkPlacementRect[] = [];

  for (let y = 0; y < rows; y += height) {
    for (let x = 0; x < columns; x += width) {
      placements.push({ height, width, x, y });
    }
  }

  return placements;
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
