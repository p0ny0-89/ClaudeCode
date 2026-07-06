export type TilePresetId =
  | "checker"
  | "diagonal"
  | "diagonal-alt"
  | "dot"
  | "empty"
  | "half-circle"
  | "half-horizontal"
  | "half-vertical"
  | "quarter-circle"
  | "ring"
  | "solid"
  | "stripes";

export type TileRotation = 0 | 90 | 180 | 270;

export type TilePreset = {
  /** Fraction of the tile face covered by the accent shape, used to map
   * sampled fill level to the closest motif. */
  coverage: number;
  id: TilePresetId;
  label: string;
  /** Motifs with a directional shape may rotate; symmetric motifs never do. */
  rotatable: boolean;
};

export const tilePresets: readonly TilePreset[] = [
  { coverage: 0, id: "empty", label: "Empty", rotatable: false },
  { coverage: 0.12, id: "dot", label: "Dot", rotatable: false },
  { coverage: 0.2, id: "ring", label: "Ring", rotatable: false },
  { coverage: 0.29, id: "quarter-circle", label: "Quarter circle", rotatable: true },
  { coverage: 0.39, id: "half-circle", label: "Half circle", rotatable: true },
  { coverage: 0.5, id: "diagonal", label: "Diagonal", rotatable: true },
  { coverage: 0.5, id: "diagonal-alt", label: "Diagonal alt", rotatable: true },
  { coverage: 0.5, id: "half-horizontal", label: "Half horizontal", rotatable: false },
  { coverage: 0.5, id: "half-vertical", label: "Half vertical", rotatable: false },
  { coverage: 0.5, id: "checker", label: "Checker", rotatable: false },
  { coverage: 0.5, id: "stripes", label: "Stripes", rotatable: true },
  { coverage: 1, id: "solid", label: "Solid", rotatable: false },
];

export const tilePresetIds: readonly TilePresetId[] = tilePresets.map(
  (preset) => preset.id,
);

const tilePresetById = new Map(tilePresets.map((preset) => [preset.id, preset]));

export function getTilePreset(id: TilePresetId): TilePreset {
  const preset = tilePresetById.get(id);

  if (!preset) {
    throw new Error(`Unknown tile preset: ${id}`);
  }

  return preset;
}

export function isTilePresetId(value: unknown): value is TilePresetId {
  return typeof value === "string" && tilePresetById.has(value as TilePresetId);
}

/**
 * Presets ordered by coverage so a fill level can pick the nearest band.
 * Multiple presets can share a coverage band; the generator chooses among
 * them with the seeded random stream.
 */
export const tilePresetsByCoverage: readonly TilePreset[] = [...tilePresets].sort(
  (first, second) => first.coverage - second.coverage,
);

export function getTilePresetsForFillLevel(
  fillLevel: number,
  pool: readonly TilePreset[] = tilePresets,
): readonly TilePreset[] {
  if (pool.length === 0) {
    return [];
  }

  let bestDistance = Number.POSITIVE_INFINITY;

  for (const preset of pool) {
    bestDistance = Math.min(bestDistance, Math.abs(preset.coverage - fillLevel));
  }

  const tolerance = 0.08;

  return pool.filter(
    (preset) => Math.abs(preset.coverage - fillLevel) <= bestDistance + tolerance,
  );
}

export type TileDrawContext = {
  accent: string;
  base: string;
  context: CanvasRenderingContext2D;
  height: number;
  rotation: TileRotation;
  width: number;
  x: number;
  y: number;
};

function withTileTransform(
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): (tile: TileDrawContext) => void {
  return (tile) => {
    const { context, height, rotation, width, x, y } = tile;

    context.save();
    context.translate(x + width / 2, y + height / 2);

    if (rotation !== 0) {
      context.rotate((rotation * Math.PI) / 180);
    }

    const rotatedWidth = rotation === 90 || rotation === 270 ? height : width;
    const rotatedHeight = rotation === 90 || rotation === 270 ? width : height;

    context.translate(-rotatedWidth / 2, -rotatedHeight / 2);
    draw(context, rotatedWidth, rotatedHeight);
    context.restore();
  };
}

const drawAccent: Record<TilePresetId, (tile: TileDrawContext) => void> = {
  checker: withTileTransform((context, width, height) => {
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    context.fillRect(0, 0, halfWidth, halfHeight);
    context.fillRect(halfWidth, halfHeight, halfWidth, halfHeight);
  }),
  diagonal: withTileTransform((context, width, height) => {
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
    context.fill();
  }),
  "diagonal-alt": withTileTransform((context, width, height) => {
    context.beginPath();
    context.moveTo(width, 0);
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
    context.fill();
  }),
  dot: withTileTransform((context, width, height) => {
    context.beginPath();
    context.ellipse(
      width / 2,
      height / 2,
      width * 0.2,
      height * 0.2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }),
  empty: () => {},
  "half-circle": withTileTransform((context, width, height) => {
    context.beginPath();
    context.ellipse(width / 2, height, width / 2, height / 2, 0, Math.PI, 0);
    context.closePath();
    context.fill();
  }),
  "half-horizontal": withTileTransform((context, width, height) => {
    context.fillRect(0, height / 2, width, height / 2);
  }),
  "half-vertical": withTileTransform((context, width, height) => {
    context.fillRect(width / 2, 0, width / 2, height);
  }),
  "quarter-circle": withTileTransform((context, width, height) => {
    context.beginPath();
    context.moveTo(0, height);
    context.ellipse(0, height, width, height, 0, -Math.PI / 2, 0);
    context.lineTo(0, height);
    context.closePath();
    context.fill();
  }),
  ring: withTileTransform((context, width, height) => {
    const outerRadiusX = width * 0.34;
    const outerRadiusY = height * 0.34;
    const innerRadiusX = width * 0.18;
    const innerRadiusY = height * 0.18;

    context.beginPath();
    context.ellipse(width / 2, height / 2, outerRadiusX, outerRadiusY, 0, 0, Math.PI * 2);
    context.ellipse(
      width / 2,
      height / 2,
      innerRadiusX,
      innerRadiusY,
      0,
      0,
      Math.PI * 2,
      true,
    );
    context.fill("evenodd");
  }),
  solid: withTileTransform((context, width, height) => {
    context.fillRect(0, 0, width, height);
  }),
  stripes: withTileTransform((context, width, height) => {
    const stripeCount = 4;
    const stripeWidth = width / (stripeCount * 2);

    for (let index = 0; index < stripeCount; index += 1) {
      context.fillRect(index * stripeWidth * 2, 0, stripeWidth, height);
    }
  }),
};

export function drawTilePreset(presetId: TilePresetId, tile: TileDrawContext): void {
  const { context, height, width, x, y } = tile;

  context.fillStyle = tile.base;
  context.fillRect(x, y, width, height);

  if (presetId === "empty") {
    return;
  }

  // Every motif is constructed inside the tile bounds (rotation swaps the
  // width/height it draws against), so no per-cell clip is needed; clipping
  // tens of thousands of cells dominates the draw cost at stress sizes.
  context.fillStyle = tile.accent;
  drawAccent[presetId](tile);
}
