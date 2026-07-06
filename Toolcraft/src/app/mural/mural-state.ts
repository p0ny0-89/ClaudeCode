import {
  isMuralMappingMode,
  isMuralModuleMode,
  type MuralGenerationSettings,
} from "./generate";
import { computeMuralGrid, type MuralGrid } from "./grid";
import { isArtworkScaleMode, type ArtworkScaleMode } from "./sampling";
import { isTilePresetId, type TilePresetId } from "./tile-presets";
import {
  isWallUnit,
  parseDimension,
  parseNonNegativeDimension,
  type WallUnit,
} from "./units";

export type MuralPreviewMode = "artwork" | "grid" | "mural";

export function isMuralPreviewMode(value: unknown): value is MuralPreviewMode {
  return value === "artwork" || value === "grid" || value === "mural";
}

export const muralTargets = {
  accentColor: "colors.accent",
  artworkSource: "artwork.source",
  background: "appearance.background",
  baseColor: "colors.base",
  contrast: "mapping.contrast",
  density: "modules.density",
  groutColor: "tiles.groutColor",
  groutSpacing: "tiles.grout",
  imageFormat: "export.image.format",
  imageResolution: "export.image.resolution",
  includeBackground: "export.includeBackground",
  mappingMode: "mapping.mode",
  moduleMode: "modules.mode",
  previewMode: "artwork.previewMode",
  randomness: "modules.randomness",
  scaleMode: "artwork.scaleMode",
  seed: "modules.seed",
  singleModule: "modules.single",
  threshold: "mapping.threshold",
  tileHeight: "tiles.height",
  tileWidth: "tiles.width",
  useSourceColors: "colors.useSource",
  wallHeight: "wall.height",
  wallUnit: "wall.unit",
  wallWidth: "wall.width",
} as const;

export const muralDefaults = {
  accentColor: "#D9482B",
  background: "#111114",
  baseColor: "#F4EFE6",
  contrast: 20,
  density: 50,
  groutColor: "#101014",
  groutSpacing: 0.25,
  mappingMode: "brightness" as const,
  moduleMode: "mixed" as const,
  previewMode: "mural" as const,
  randomness: 25,
  scaleMode: "fill" as const,
  seed: 47,
  singleModule: "solid" as const,
  threshold: 50,
  tileHeight: 4,
  tileWidth: 4,
  wallHeight: 72,
  wallUnit: "in" as const,
  wallWidth: 96,
} as const;

export type MuralSettings = {
  accentColor: string;
  background: string;
  baseColor: string;
  generation: MuralGenerationSettings;
  groutColor: string;
  groutSpacing: number;
  previewMode: MuralPreviewMode;
  scaleMode: ArtworkScaleMode;
  tileHeight: number;
  tileWidth: number;
  useSourceColors: boolean;
  wallHeight: number;
  wallUnit: WallUnit;
  wallWidth: number;
};

function parseHexColor(value: unknown, fallback: string): string {
  const hex =
    typeof value === "object" && value !== null && "hex" in value
      ? (value as { hex?: unknown }).hex
      : value;

  if (typeof hex === "string" && /^#[0-9a-fA-F]{3,8}$/.test(hex)) {
    return hex;
  }

  return fallback;
}

function parsePercent(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, parsed));
}

function parseSeed(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(9999, Math.round(parsed)));
}

export function parseMuralSettings(values: Record<string, unknown>): MuralSettings {
  const mappingModeValue = values[muralTargets.mappingMode];
  const moduleModeValue = values[muralTargets.moduleMode];
  const singleModuleValue = values[muralTargets.singleModule];
  const previewModeValue = values[muralTargets.previewMode];
  const scaleModeValue = values[muralTargets.scaleMode];
  const wallUnitValue = values[muralTargets.wallUnit];

  const singleModule: TilePresetId = isTilePresetId(singleModuleValue)
    ? singleModuleValue
    : muralDefaults.singleModule;

  return {
    accentColor: parseHexColor(values[muralTargets.accentColor], muralDefaults.accentColor),
    background: parseHexColor(values[muralTargets.background], muralDefaults.background),
    baseColor: parseHexColor(values[muralTargets.baseColor], muralDefaults.baseColor),
    generation: {
      contrast: parsePercent(values[muralTargets.contrast], muralDefaults.contrast),
      density: parsePercent(values[muralTargets.density], muralDefaults.density),
      mappingMode: isMuralMappingMode(mappingModeValue)
        ? mappingModeValue
        : muralDefaults.mappingMode,
      moduleMode: isMuralModuleMode(moduleModeValue)
        ? moduleModeValue
        : muralDefaults.moduleMode,
      randomness: parsePercent(values[muralTargets.randomness], muralDefaults.randomness),
      seed: parseSeed(values[muralTargets.seed], muralDefaults.seed),
      singleModule,
      threshold: parsePercent(values[muralTargets.threshold], muralDefaults.threshold),
    },
    groutColor: parseHexColor(values[muralTargets.groutColor], muralDefaults.groutColor),
    groutSpacing: parseNonNegativeDimension(
      values[muralTargets.groutSpacing],
      muralDefaults.groutSpacing,
    ),
    previewMode: isMuralPreviewMode(previewModeValue)
      ? previewModeValue
      : muralDefaults.previewMode,
    scaleMode: isArtworkScaleMode(scaleModeValue)
      ? scaleModeValue
      : muralDefaults.scaleMode,
    tileHeight: parseDimension(values[muralTargets.tileHeight], muralDefaults.tileHeight),
    tileWidth: parseDimension(values[muralTargets.tileWidth], muralDefaults.tileWidth),
    useSourceColors: values[muralTargets.useSourceColors] === true,
    wallHeight: parseDimension(values[muralTargets.wallHeight], muralDefaults.wallHeight),
    wallUnit: isWallUnit(wallUnitValue) ? wallUnitValue : muralDefaults.wallUnit,
    wallWidth: parseDimension(values[muralTargets.wallWidth], muralDefaults.wallWidth),
  };
}

export function getMuralGridFromSettings(settings: MuralSettings): MuralGrid {
  return computeMuralGrid({
    groutSpacing: settings.groutSpacing,
    tileHeight: settings.tileHeight,
    tileWidth: settings.tileWidth,
    wallHeight: settings.wallHeight,
    wallWidth: settings.wallWidth,
  });
}
