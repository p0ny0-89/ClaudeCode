import { createToolcraftPngExportCanvas } from "@/toolcraft/runtime";
import type { ToolcraftState } from "@/toolcraft/runtime";
import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { sampleArtworkToCellGrid } from "./mural/artwork-sampler";
import { generateMuralTilePlan } from "./mural/generate";
import { getMuralArtworkAsset } from "./mural-renderer";
import { getMuralGridFromSettings, parseMuralSettings } from "./mural/mural-state";
import { drawMural } from "./mural/render";
import type { CellSampleGrid } from "./mural/sampling";
import { buildMuralTileSchedule } from "./mural/schedule";

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sampleCurrentArtwork(state: ToolcraftState): Promise<CellSampleGrid | null> {
  const settings = parseMuralSettings(state.values);
  const grid = getMuralGridFromSettings(settings);
  const asset = getMuralArtworkAsset(state);

  if (!asset) {
    return null;
  }

  try {
    return await sampleArtworkToCellGrid({
      asset,
      columns: grid.columns,
      rows: grid.rows,
      scaleMode: settings.scaleMode,
    });
  } catch {
    return null;
  }
}

export type MuralImageExportEncoding = {
  extension: "jpg" | "png";
  /** JPEG has no alpha channel, so background exclusion only applies to PNG. */
  forcesBackground: boolean;
  mimeType: "image/jpeg" | "image/png";
};

export function getMuralImageExportEncoding(format: unknown): MuralImageExportEncoding {
  if (format === "jpg") {
    return { extension: "jpg", forcesBackground: true, mimeType: "image/jpeg" };
  }

  return { extension: "png", forcesBackground: false, mimeType: "image/png" };
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Mural image export produced no data."));
      }
    }, mimeType);
  });
}

export async function exportMuralImage(
  state: ToolcraftState,
  reportProgress: (progress: number) => void,
): Promise<void> {
  reportProgress(0.05);

  const settings = parseMuralSettings(state.values);
  const grid = getMuralGridFromSettings(settings);
  const samples = await sampleCurrentArtwork(state);

  reportProgress(0.35);

  const plan = generateMuralTilePlan(grid, samples, settings.generation);
  const encoding = getMuralImageExportEncoding(state.values["export.image.format"]);
  const includeBackgroundValue = state.values["export.includeBackground"];
  const includeBackground = encoding.forcesBackground
    ? true
    : includeBackgroundValue !== false;
  const imageResolution = String(state.values["export.image.resolution"] ?? "4k");

  const canvas = createToolcraftPngExportCanvas({
    background: settings.background,
    includeBackground,
    // drawMural clears the surface before painting, so it must draw the
    // background itself instead of relying on the helper's pre-fill.
    render: ({ context, cssHeight, cssWidth }) => {
      drawMural({
        context,
        grid,
        height: cssHeight,
        includeBackground,
        plan,
        settings,
        width: cssWidth,
      });
    },
    resolution: imageResolution,
    state,
  });

  reportProgress(0.7);

  const blob = await canvasToBlob(canvas, encoding.mimeType);

  reportProgress(0.9);
  downloadBlob(blob, `tile-mural.${encoding.extension}`);
  reportProgress(1);
}

export async function exportMuralSchedule(
  state: ToolcraftState,
  reportProgress: (progress: number) => void,
): Promise<void> {
  reportProgress(0.1);

  const settings = parseMuralSettings(state.values);
  const grid = getMuralGridFromSettings(settings);
  const samples = await sampleCurrentArtwork(state);

  reportProgress(0.5);

  const plan = generateMuralTilePlan(grid, samples, settings.generation);
  const schedule = buildMuralTileSchedule(grid, plan, settings);
  const blob = new Blob([JSON.stringify(schedule, null, 2)], {
    type: "application/json",
  });

  reportProgress(0.9);
  downloadBlob(blob, "tile-mural-schedule.json");
  reportProgress(1);
}

export function handleMuralPanelAction(
  context: ToolcraftPanelActionContext,
): PromiseLike<unknown> | void {
  if (context.action.value === "export-png") {
    return exportMuralImage(context.state, context.reportProgress);
  }

  if (context.action.value === "export-json") {
    return exportMuralSchedule(context.state, context.reportProgress);
  }
}
