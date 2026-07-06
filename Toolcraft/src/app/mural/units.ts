export type WallUnit = "cm" | "ft" | "in" | "mm";

export const wallUnitLabels: Record<WallUnit, string> = {
  cm: "Centimeters",
  ft: "Feet",
  in: "Inches",
  mm: "Millimeters",
};

export const wallUnitSuffixes: Record<WallUnit, string> = {
  cm: "cm",
  ft: "ft",
  in: "in",
  mm: "mm",
};

export function isWallUnit(value: unknown): value is WallUnit {
  return value === "cm" || value === "ft" || value === "in" || value === "mm";
}

export function parseDimension(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function parseNonNegativeDimension(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export function formatDimension(value: number, unit: WallUnit): string {
  const rounded = Math.round(value * 100) / 100;

  return `${rounded} ${wallUnitSuffixes[unit]}`;
}
