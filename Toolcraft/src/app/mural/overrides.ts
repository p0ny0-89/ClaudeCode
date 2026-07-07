import type { RepeatPeriodCells } from "./sampling";

/** Manual paint overrides keyed by tile coordinate (or pattern coordinate). */
export type TileOverrideMap = Readonly<Record<string, string>>;

export type TileSelection = readonly string[];

export function getTileCellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function parseTileCellKey(key: string): { column: number; row: number } | null {
  const [rowPart, columnPart] = key.split(":");
  const row = Number.parseInt(rowPart ?? "", 10);
  const column = Number.parseInt(columnPart ?? "", 10);

  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0) {
    return null;
  }

  return { column, row };
}

/**
 * Override storage key for a tile. In repeat mode a painted tile applies to
 * the same position inside every repeated pattern instance, so keys are
 * pattern-relative; otherwise they are absolute tile coordinates.
 */
export function getTileOverrideKey(
  row: number,
  column: number,
  repeatPeriod: RepeatPeriodCells | null,
): string {
  if (!repeatPeriod) {
    return getTileCellKey(row, column);
  }

  return getTileCellKey(row % repeatPeriod.rows, column % repeatPeriod.columns);
}

export function parseTileOverrides(value: unknown): TileOverrideMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const overrides: Record<string, string> = {};

  for (const [key, colorValue] of Object.entries(value as Record<string, unknown>)) {
    if (
      parseTileCellKey(key) &&
      typeof colorValue === "string" &&
      /^#[0-9a-fA-F]{3,8}$/.test(colorValue)
    ) {
      overrides[key] = colorValue;
    }
  }

  return overrides;
}

export function parseTileSelection(value: unknown): TileSelection {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (key): key is string => typeof key === "string" && parseTileCellKey(key) !== null,
  );
}

export type SelectionMode = "add" | "replace" | "subtract";

export function applySelectionChange(
  current: TileSelection,
  changed: readonly string[],
  mode: SelectionMode,
): TileSelection {
  if (mode === "replace") {
    return [...new Set(changed)];
  }

  const next = new Set(current);

  for (const key of changed) {
    if (mode === "add") {
      next.add(key);
    } else {
      next.delete(key);
    }
  }

  return [...next];
}

/**
 * Converts selected absolute tile keys into override entries with the given
 * color, collapsing to pattern-relative keys in repeat mode so fills follow
 * the repeated instances.
 */
export function buildSelectionOverrides(
  selection: TileSelection,
  color: string,
  repeatPeriod: RepeatPeriodCells | null,
): TileOverrideMap {
  const overrides: Record<string, string> = {};

  for (const key of selection) {
    const cell = parseTileCellKey(key);

    if (!cell) {
      continue;
    }

    overrides[getTileOverrideKey(cell.row, cell.column, repeatPeriod)] = color;
  }

  return overrides;
}
