import type { MuralTilePlan } from "./generate";
import type { MuralGrid } from "./grid";
import type { MuralSettings } from "./mural-state";
import { getTilePreset } from "./tile-presets";
import { wallUnitSuffixes } from "./units";

export type MuralTileScheduleEntry = {
  accentColor: string;
  baseColor: string;
  column: number;
  preset: string;
  presetLabel: string;
  rotation: number;
  row: number;
  sampledColor: string | null;
};

export type MuralTileSchedule = {
  grid: {
    columns: number;
    rows: number;
    totalTiles: number;
  };
  groutColor: string;
  groutSpacing: number;
  presetCounts: Readonly<Partial<Record<string, number>>>;
  tiles: readonly MuralTileScheduleEntry[];
  tileSize: {
    height: number;
    width: number;
  };
  unit: string;
  wall: {
    height: number;
    width: number;
  };
};

/**
 * Builds the fabrication/install schedule: one entry per tile with its grid
 * coordinate, chosen module, rotation, and colors.
 */
export function buildMuralTileSchedule(
  grid: MuralGrid,
  plan: MuralTilePlan,
  settings: MuralSettings,
): MuralTileSchedule {
  return {
    grid: {
      columns: grid.columns,
      rows: grid.rows,
      totalTiles: grid.totalTiles,
    },
    groutColor: settings.groutColor,
    groutSpacing: grid.groutSpacing,
    presetCounts: plan.presetCounts,
    tiles: plan.cells.map((cell) => ({
      accentColor:
        settings.useSourceColors && cell.sampledHex
          ? cell.sampledHex
          : settings.accentColor,
      baseColor: settings.baseColor,
      column: cell.column,
      preset: cell.presetId,
      presetLabel: getTilePreset(cell.presetId).label,
      rotation: cell.rotation,
      row: cell.row,
      sampledColor: cell.sampledHex,
    })),
    tileSize: {
      height: grid.tileHeight,
      width: grid.tileWidth,
    },
    unit: wallUnitSuffixes[settings.wallUnit],
    wall: {
      height: grid.wallHeight,
      width: grid.wallWidth,
    },
  };
}
