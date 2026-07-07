import type { MuralGrid } from "./grid";
import { getTileOverrideKey, type TileOverrideMap } from "./overrides";
import {
  applyContrast,
  getCellSample,
  getSampleLuminance,
  sampleToHex,
  type CellSampleGrid,
  type RepeatPeriodCells,
} from "./sampling";
import {
  getTilePreset,
  getTilePresetsForFillLevel,
  tilePresets,
  type TilePresetId,
  type TileRotation,
} from "./tile-presets";

export type MuralMappingMode = "brightness" | "threshold";

export function isMuralMappingMode(value: unknown): value is MuralMappingMode {
  return value === "brightness" || value === "threshold";
}

export type MuralModuleMode = "mixed" | "single";

export function isMuralModuleMode(value: unknown): value is MuralModuleMode {
  return value === "mixed" || value === "single";
}

export type MuralGenerationSettings = {
  contrast: number;
  density: number;
  mappingMode: MuralMappingMode;
  moduleMode: MuralModuleMode;
  randomness: number;
  seed: number;
  singleModule: TilePresetId;
  threshold: number;
};

export type MuralTileCell = {
  column: number;
  fillLevel: number;
  /** Manual paint override color; when set the cell renders as a solid fill. */
  overrideHex: string | null;
  presetId: TilePresetId;
  rotation: TileRotation;
  row: number;
  sampledHex: string | null;
};

export type MuralOverrideOptions = {
  overrides: TileOverrideMap;
  /** Pattern period for repeat mode so overrides follow repeated instances. */
  repeatPeriod: RepeatPeriodCells | null;
};

export type MuralTilePlan = {
  cells: readonly MuralTileCell[];
  presetCounts: Readonly<Partial<Record<TilePresetId, number>>>;
};

/**
 * Deterministic per-cell random stream: the same seed, row, and column
 * always produce the same value so regeneration is repeatable.
 */
export function cellRandom(seed: number, row: number, column: number, salt = 0): number {
  let hash = Math.imul(seed + 374761393, 668265263);

  hash = Math.imul(hash ^ (row + 1), 2246822519);
  hash = Math.imul(hash ^ (column + 1), 3266489917);
  hash = Math.imul(hash ^ (salt + 668265263), 2654435761);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822519);
  hash ^= hash >>> 13;

  return (hash >>> 0) / 4294967296;
}

const rotations: readonly TileRotation[] = [0, 90, 180, 270];

/**
 * Neutral fill level used when no artwork sample exists for a cell. Keeps
 * every mapping and module control observable before an upload, so the app
 * behaves as a pure modular pattern generator until artwork drives it.
 */
const NEUTRAL_FILL_LEVEL = 0.5;

function getCellFillLevel(
  samples: CellSampleGrid | null,
  row: number,
  column: number,
  settings: MuralGenerationSettings,
): { fillLevel: number; sampledHex: string | null } {
  const sample = samples ? getCellSample(samples, row, column) : null;

  if (!sample) {
    return { fillLevel: NEUTRAL_FILL_LEVEL, sampledHex: null };
  }

  const luminance = applyContrast(getSampleLuminance(sample), settings.contrast);
  const fillLevel = 1 - luminance;

  if (settings.mappingMode === "threshold") {
    const threshold = Math.max(0, Math.min(100, settings.threshold)) / 100;

    return {
      fillLevel: fillLevel >= threshold ? 1 : 0,
      sampledHex: sampleToHex(sample),
    };
  }

  return { fillLevel, sampledHex: sampleToHex(sample) };
}

function applyDensityBias(fillLevel: number, density: number): number {
  const bias = (Math.max(0, Math.min(100, density)) - 50) / 50;

  return Math.max(0, Math.min(1, fillLevel + bias * 0.5));
}

function pickPreset(
  fillLevel: number,
  settings: MuralGenerationSettings,
  row: number,
  column: number,
): TilePresetId {
  if (settings.moduleMode === "single") {
    if (fillLevel <= 0.02) {
      return "empty";
    }

    return settings.singleModule;
  }

  const candidates = getTilePresetsForFillLevel(fillLevel, tilePresets);

  if (candidates.length === 0) {
    return "empty";
  }

  const randomness = Math.max(0, Math.min(100, settings.randomness)) / 100;
  const roll = cellRandom(settings.seed, row, column, 1);

  if (randomness > 0 && roll < randomness) {
    const jitteredFill = Math.max(
      0,
      Math.min(1, fillLevel + (cellRandom(settings.seed, row, column, 2) - 0.5) * 0.6),
    );
    const jitteredCandidates = getTilePresetsForFillLevel(jitteredFill, tilePresets);

    if (jitteredCandidates.length > 0) {
      const index = Math.floor(
        cellRandom(settings.seed, row, column, 3) * jitteredCandidates.length,
      );

      return jitteredCandidates[Math.min(index, jitteredCandidates.length - 1)]!.id;
    }
  }

  const index = Math.floor(
    cellRandom(settings.seed, row, column, 4) * candidates.length,
  );

  return candidates[Math.min(index, candidates.length - 1)]!.id;
}

function pickRotation(
  presetId: TilePresetId,
  settings: MuralGenerationSettings,
  row: number,
  column: number,
): TileRotation {
  if (!getTilePreset(presetId).rotatable) {
    return 0;
  }

  const index = Math.floor(cellRandom(settings.seed, row, column, 5) * rotations.length);

  return rotations[Math.min(index, rotations.length - 1)]!;
}

export function generateMuralTilePlan(
  grid: MuralGrid,
  samples: CellSampleGrid | null,
  settings: MuralGenerationSettings,
  overrideOptions?: MuralOverrideOptions,
): MuralTilePlan {
  const cells: MuralTileCell[] = [];
  const presetCounts: Partial<Record<TilePresetId, number>> = {};
  const overrides = overrideOptions?.overrides ?? {};
  const hasOverrides = Object.keys(overrides).length > 0;

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const overrideHex = hasOverrides
        ? (overrides[
            getTileOverrideKey(row, column, overrideOptions?.repeatPeriod ?? null)
          ] ?? null)
        : null;

      if (overrideHex) {
        presetCounts.solid = (presetCounts.solid ?? 0) + 1;
        cells.push({
          column,
          fillLevel: 1,
          overrideHex,
          presetId: "solid",
          rotation: 0,
          row,
          sampledHex: null,
        });
        continue;
      }

      const { fillLevel, sampledHex } = getCellFillLevel(samples, row, column, settings);
      const biasedFill = applyDensityBias(fillLevel, settings.density);
      const presetId = pickPreset(biasedFill, settings, row, column);
      const rotation = pickRotation(presetId, settings, row, column);

      presetCounts[presetId] = (presetCounts[presetId] ?? 0) + 1;
      cells.push({
        column,
        fillLevel: biasedFill,
        overrideHex: null,
        presetId,
        rotation,
        row,
        sampledHex,
      });
    }
  }

  return { cells, presetCounts };
}
