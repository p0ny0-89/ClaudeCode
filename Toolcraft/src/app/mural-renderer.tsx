import * as React from "react";

import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import type { ToolcraftMediaAsset, ToolcraftState } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import {
  getArtworkSampleCacheKey,
  sampleArtworkToCellGrid,
} from "./mural/artwork-sampler";
import { generateMuralTilePlan } from "./mural/generate";
import {
  getMuralGridFromSettings,
  muralTargets,
  parseMuralSettings,
} from "./mural/mural-state";
import { drawMural } from "./mural/render";
import type { CellSampleGrid } from "./mural/sampling";

export function getMuralArtworkAsset(
  state: ToolcraftState,
): ToolcraftMediaAsset | undefined {
  const imageAssets = state.mediaAssets.filter(
    (asset) => asset.assetKind !== "file" && asset.mimeType.startsWith("image/"),
  );
  const targeted = imageAssets.filter(
    (asset) => asset.sourceTarget === muralTargets.artworkSource,
  );

  return (targeted.length > 0 ? targeted : imageAssets).at(-1);
}

function getRenderScale(state: ToolcraftState): number {
  const value = state.values["canvas.renderScale"];
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed)) {
    return 2;
  }

  return Math.min(2, Math.max(1, parsed));
}

/**
 * Product renderer: draws the generated tile mural into a Canvas 2D backing
 * sized by canvas.size * renderScale. Artwork sampling is cached by media
 * identity + grid shape + placement so slider drags only reassign modules
 * and redraw, never re-decode or re-sample the artwork.
 */
export function MuralRenderer(): React.JSX.Element {
  const { state } = useToolcraft();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const sampleCacheRef = React.useRef<{
    grid: CellSampleGrid | null;
    key: string;
  }>({ grid: null, key: "" });
  const [sampleVersion, setSampleVersion] = React.useState(0);

  const settings = React.useMemo(() => parseMuralSettings(state.values), [state.values]);
  const grid = React.useMemo(() => getMuralGridFromSettings(settings), [settings]);
  const artworkAsset = getMuralArtworkAsset(state);
  const sampleKey = getArtworkSampleCacheKey(
    artworkAsset,
    grid.columns,
    grid.rows,
    settings.scaleMode,
  );

  React.useEffect(() => {
    let cancelled = false;

    if (!artworkAsset) {
      if (sampleCacheRef.current.key !== sampleKey) {
        sampleCacheRef.current = { grid: null, key: sampleKey };
        setSampleVersion((version) => version + 1);
      }

      return;
    }

    if (sampleCacheRef.current.key === sampleKey) {
      return;
    }

    void sampleArtworkToCellGrid({
      asset: artworkAsset,
      columns: grid.columns,
      rows: grid.rows,
      scaleMode: settings.scaleMode,
    })
      .then((cellGrid) => {
        if (cancelled) {
          return;
        }

        sampleCacheRef.current = { grid: cellGrid, key: sampleKey };
        setSampleVersion((version) => version + 1);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        sampleCacheRef.current = { grid: null, key: sampleKey };
        setSampleVersion((version) => version + 1);
      });

    return () => {
      cancelled = true;
    };
  }, [artworkAsset, grid.columns, grid.rows, sampleKey, settings.scaleMode]);

  const renderScale = getRenderScale(state);
  const canvasWidth = Math.max(1, Math.round(state.canvas.size.width));
  const canvasHeight = Math.max(1, Math.round(state.canvas.size.height));
  const backingWidth = Math.max(1, Math.round(canvasWidth * renderScale));
  const backingHeight = Math.max(1, Math.round(canvasHeight * renderScale));
  const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });

  const drawFrameRef = React.useRef<number | null>(null);

  // Coalesce redraws to one per animation frame: high-frequency slider drags
  // schedule many renders, but only the latest scheduled draw runs, so the
  // stress grid never builds a backlog of full-grid redraws.
  React.useEffect(() => {
    if (drawFrameRef.current !== null) {
      cancelAnimationFrame(drawFrameRef.current);
    }

    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null;

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");

      if (!canvas || !context) {
        return;
      }

      const samples =
        sampleCacheRef.current.key === sampleKey ? sampleCacheRef.current.grid : null;
      const plan = generateMuralTilePlan(grid, samples, settings.generation);

      drawMural({
        context,
        grid,
        height: backingHeight,
        includeBackground,
        plan,
        settings,
        width: backingWidth,
      });
    });

    return () => {
      if (drawFrameRef.current !== null) {
        cancelAnimationFrame(drawFrameRef.current);
        drawFrameRef.current = null;
      }
    };
  }, [
    backingHeight,
    backingWidth,
    grid,
    includeBackground,
    sampleKey,
    sampleVersion,
    settings,
  ]);

  return (
    <canvas
      data-toolcraft-product-output=""
      height={backingHeight}
      ref={canvasRef}
      style={{ display: "block", height: "100%", width: "100%" }}
      width={backingWidth}
    />
  );
}
