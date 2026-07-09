import { createToolcraftPngExportCanvas } from "@/toolcraft/runtime";
import type { ToolcraftCommand, ToolcraftState } from "@/toolcraft/runtime";
import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";
import type * as React from "react";

/** The minimal runtime access the paint actions need, shared by the toolbar. */
export type MuralPaintContext = {
  dispatch: React.Dispatch<ToolcraftCommand>;
  state: ToolcraftState;
};

import {
  sampleArtworkToCellGrid,
  type ArtworkSampleResult,
} from "./mural/artwork-sampler";
import { generateMuralTilePlan, type MuralTilePlan } from "./mural/generate";
import { getMuralArtworkAsset } from "./mural-renderer";
import {
  getMuralGridFromSettings,
  muralTargets,
  parseMuralSettings,
  type MuralSettings,
} from "./mural/mural-state";
import { buildSelectionOverrides } from "./mural/overrides";
import { drawMural } from "./mural/render";
import { buildMuralTileSchedule } from "./mural/schedule";
import type { MuralGrid } from "./mural/grid";

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

type MuralRenderModel = {
  grid: MuralGrid;
  plan: MuralTilePlan;
  settings: MuralSettings;
};

async function sampleCurrentArtwork(
  state: ToolcraftState,
  settings: MuralSettings,
  grid: MuralGrid,
): Promise<ArtworkSampleResult> {
  const asset = getMuralArtworkAsset(state);

  if (!asset) {
    return { cellGrid: null, repeatPeriod: null };
  }

  try {
    return await sampleArtworkToCellGrid({
      asset,
      columns: grid.columns,
      placement: settings.placement,
      rows: grid.rows,
      scaleMode: settings.scaleMode,
    });
  } catch {
    return { cellGrid: null, repeatPeriod: null };
  }
}

/** Shared export/render model so PNG, JSON, and fill actions agree. */
async function buildMuralRenderModel(state: ToolcraftState): Promise<MuralRenderModel> {
  const settings = parseMuralSettings(state.values);
  const grid = getMuralGridFromSettings(settings);
  const sample = await sampleCurrentArtwork(state, settings, grid);
  const plan = generateMuralTilePlan(grid, sample.cellGrid, settings.generation, {
    overrides: settings.overrides,
    repeatPeriod: settings.scaleMode === "repeat" ? sample.repeatPeriod : null,
  });

  return { grid, plan, settings };
}

async function getRepeatPeriodForState(
  state: ToolcraftState,
  settings: MuralSettings,
  grid: MuralGrid,
): Promise<ArtworkSampleResult["repeatPeriod"]> {
  if (settings.scaleMode !== "repeat") {
    return null;
  }

  return (await sampleCurrentArtwork(state, settings, grid)).repeatPeriod;
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

  const { grid, plan, settings } = await buildMuralRenderModel(state);

  reportProgress(0.35);

  const encoding = getMuralImageExportEncoding(state.values["export.image.format"]);
  // There is no output background: PNG exports leave the area around the wall
  // transparent. JPEG has no alpha channel, so it fills that surround with the
  // grout color for a seamless edge instead.
  const includeBackground = encoding.forcesBackground;
  const imageResolution = String(state.values["export.image.resolution"] ?? "4k");

  const canvas = createToolcraftPngExportCanvas({
    background: settings.groutColor,
    includeBackground,
    render: ({ context, cssHeight, cssWidth }) => {
      drawMural({
        context,
        grid,
        height: cssHeight,
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

  const { grid, plan, settings } = await buildMuralRenderModel(state);

  reportProgress(0.5);

  const schedule = buildMuralTileSchedule(grid, plan, settings);
  const blob = new Blob([JSON.stringify(schedule, null, 2)], {
    type: "application/json",
  });

  reportProgress(0.9);
  downloadBlob(blob, "tile-mural-schedule.json");
  reportProgress(1);
}

/** Applies the paint color to every selected tile through the override map. */
export async function fillSelectedTiles(context: MuralPaintContext): Promise<void> {
  const { dispatch, state } = context;
  const settings = parseMuralSettings(state.values);

  if (settings.selection.length === 0) {
    return;
  }

  const grid = getMuralGridFromSettings(settings);
  const repeatPeriod = await getRepeatPeriodForState(state, settings, grid);
  const selectionOverrides = buildSelectionOverrides(
    settings.selection,
    settings.paintColor,
    repeatPeriod,
  );

  dispatch({
    label: "Fill selected tiles",
    target: muralTargets.paintOverrides,
    type: "controls.setValue",
    value: { ...settings.overrides, ...selectionOverrides },
  });
}

export function clearPaintedTiles(context: MuralPaintContext): void {
  const { dispatch, state } = context;
  const settings = parseMuralSettings(state.values);

  if (Object.keys(settings.overrides).length > 0) {
    dispatch({
      label: "Clear painted tiles",
      target: muralTargets.paintOverrides,
      type: "controls.setValue",
      value: {},
    });
  }

  if (settings.selection.length > 0) {
    dispatch({
      history: "skip",
      target: muralTargets.paintSelection,
      type: "controls.setValue",
      value: [],
    });
  }
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
