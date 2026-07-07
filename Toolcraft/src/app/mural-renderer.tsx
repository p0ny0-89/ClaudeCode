import * as React from "react";

import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import type {
  ToolcraftCommand,
  ToolcraftMediaAsset,
  ToolcraftState,
} from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import {
  getArtworkSampleCacheKey,
  sampleArtworkToCellGrid,
} from "./mural/artwork-sampler";
import { generateMuralTilePlan, type MuralTilePlan } from "./mural/generate";
import {
  computeMuralCanvasLayout,
  locateTileCell,
  locateTileCellsInRect,
  type MuralGrid,
  type MuralLayoutRect,
} from "./mural/grid";
import {
  getMuralGridFromSettings,
  muralTargets,
  parseMuralSettings,
  type MuralSettings,
} from "./mural/mural-state";
import {
  applySelectionChange,
  getTileCellKey,
  getTileOverrideKey,
  type SelectionMode,
} from "./mural/overrides";
import { drawMural } from "./mural/render";
import type { CellSampleGrid, RepeatPeriodCells } from "./mural/sampling";
import { getTilePreset } from "./mural/tile-presets";

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

type SampleCacheEntry = {
  grid: CellSampleGrid | null;
  key: string;
  repeatPeriod: RepeatPeriodCells | null;
};

type MarqueeDragState = {
  mode: SelectionMode;
  pointerId: number;
  startX: number;
  startY: number;
};

/** The color a tile visually reads as, used by the eyedropper tool. */
export function getCellPickColor(
  plan: MuralTilePlan,
  grid: MuralGrid,
  settings: MuralSettings,
  row: number,
  column: number,
): string {
  const cell = plan.cells[row * grid.columns + column];

  if (!cell) {
    return settings.baseColor;
  }

  if (cell.overrideHex) {
    return cell.overrideHex;
  }

  if (getTilePreset(cell.presetId).coverage === 0) {
    return settings.baseColor;
  }

  return settings.useSourceColors && cell.sampledHex
    ? cell.sampledHex
    : settings.accentColor;
}

/**
 * Middle-mouse drag pans the canvas viewport exactly like the runtime's
 * left-drag pan, dispatched through the runtime canvas commands.
 */
function useMiddleMousePan(
  dispatch: React.Dispatch<ToolcraftCommand>,
  offsetRef: React.MutableRefObject<{ x: number; y: number }>,
): void {
  React.useEffect(() => {
    let drag: { originX: number; originY: number; startX: number; startY: number } | null =
      null;

    const isInsideViewport = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      Boolean(target.closest('[data-slot="toolcraft-runtime-canvas"]'));

    const handleMouseDown = (event: MouseEvent) => {
      // Block the browser's middle-click autoscroll inside the viewport.
      if (event.button === 1 && isInsideViewport(event.target)) {
        event.preventDefault();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 1 || !isInsideViewport(event.target)) {
        return;
      }

      event.preventDefault();
      drag = {
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
        startX: event.clientX,
        startY: event.clientY,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drag) {
        return;
      }

      dispatch({
        offset: {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
        type: "canvas.setOffset",
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 1) {
        drag = null;
      }
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
    };
  }, [dispatch, offsetRef]);
}

/**
 * Product renderer: draws the generated tile mural into a Canvas 2D backing
 * sized by canvas.size * renderScale, and hosts the manual tile tools
 * (select marquee, paint bucket, eyedropper). Artwork sampling is cached by
 * media identity + grid shape + placement so slider drags only reassign
 * modules and redraw, never re-decode or re-sample the artwork. Redraws are
 * coalesced to one per animation frame.
 */
export function MuralRenderer(): React.JSX.Element {
  const { dispatch, state } = useToolcraft();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const sampleCacheRef = React.useRef<SampleCacheEntry>({
    grid: null,
    key: "",
    repeatPeriod: null,
  });
  const [sampleVersion, setSampleVersion] = React.useState(0);
  const [marqueeRect, setMarqueeRect] = React.useState<MuralLayoutRect | null>(null);
  const marqueeDragRef = React.useRef<MarqueeDragState | null>(null);
  const paintDragPointerRef = React.useRef<number | null>(null);
  const lastPlanRef = React.useRef<MuralTilePlan | null>(null);
  const offsetRef = React.useRef(state.canvas.offset);

  offsetRef.current = state.canvas.offset;

  const settings = React.useMemo(() => parseMuralSettings(state.values), [state.values]);
  const grid = React.useMemo(() => getMuralGridFromSettings(settings), [settings]);
  const artworkAsset = getMuralArtworkAsset(state);
  const sampleKey = getArtworkSampleCacheKey(
    artworkAsset,
    grid.columns,
    grid.rows,
    settings.scaleMode,
    settings.placement,
  );

  useMiddleMousePan(dispatch, offsetRef);

  React.useEffect(() => {
    let cancelled = false;

    if (!artworkAsset) {
      if (sampleCacheRef.current.key !== sampleKey) {
        sampleCacheRef.current = { grid: null, key: sampleKey, repeatPeriod: null };
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
      placement: settings.placement,
      rows: grid.rows,
      scaleMode: settings.scaleMode,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        sampleCacheRef.current = {
          grid: result.cellGrid,
          key: sampleKey,
          repeatPeriod: result.repeatPeriod,
        };
        setSampleVersion((version) => version + 1);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        sampleCacheRef.current = { grid: null, key: sampleKey, repeatPeriod: null };
        setSampleVersion((version) => version + 1);
      });

    return () => {
      cancelled = true;
    };
  }, [artworkAsset, grid.columns, grid.rows, sampleKey, settings.placement, settings.scaleMode]);

  const renderScale = getRenderScale(state);
  const canvasWidth = Math.max(1, Math.round(state.canvas.size.width));
  const canvasHeight = Math.max(1, Math.round(state.canvas.size.height));
  const backingWidth = Math.max(1, Math.round(canvasWidth * renderScale));
  const backingHeight = Math.max(1, Math.round(canvasHeight * renderScale));
  const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });

  const buildPlan = React.useCallback((): MuralTilePlan => {
    const cache = sampleCacheRef.current;
    const samples = cache.key === sampleKey ? cache.grid : null;
    const repeatPeriod =
      settings.scaleMode === "repeat" && cache.key === sampleKey
        ? cache.repeatPeriod
        : null;
    const plan = generateMuralTilePlan(grid, samples, settings.generation, {
      overrides: settings.overrides,
      repeatPeriod,
    });

    lastPlanRef.current = plan;

    return plan;
  }, [grid, sampleKey, settings]);

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

      drawMural({
        context,
        grid,
        height: backingHeight,
        includeBackground,
        overlay: {
          marqueeRect,
          selectionKeys: new Set(settings.selection),
        },
        plan: buildPlan(),
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
    buildPlan,
    grid,
    includeBackground,
    marqueeRect,
    sampleKey,
    sampleVersion,
    settings,
  ]);

  const toBackingPoint = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      return {
        x: ((event.clientX - rect.left) / rect.width) * backingWidth,
        y: ((event.clientY - rect.top) / rect.height) * backingHeight,
      };
    },
    [backingHeight, backingWidth],
  );

  const paintCellAtPoint = React.useCallback(
    (point: { x: number; y: number }): void => {
      const layout = computeMuralCanvasLayout(grid, backingWidth, backingHeight);
      const cell = locateTileCell(grid, layout, point.x, point.y);

      if (!cell) {
        return;
      }

      const cache = sampleCacheRef.current;
      const repeatPeriod =
        settings.scaleMode === "repeat" && cache.key === sampleKey
          ? cache.repeatPeriod
          : null;
      const key = getTileOverrideKey(cell.row, cell.column, repeatPeriod);

      if (settings.overrides[key] === settings.paintColor) {
        return;
      }

      dispatch({
        label: "Paint tile",
        target: muralTargets.paintOverrides,
        type: "controls.setValue",
        value: { ...settings.overrides, [key]: settings.paintColor },
      });
    },
    [backingHeight, backingWidth, dispatch, grid, sampleKey, settings],
  );

  const pickCellAtPoint = React.useCallback(
    (point: { x: number; y: number }): void => {
      const layout = computeMuralCanvasLayout(grid, backingWidth, backingHeight);
      const cell = locateTileCell(grid, layout, point.x, point.y);
      const plan = lastPlanRef.current;

      if (!cell || !plan) {
        return;
      }

      dispatch({
        label: "Pick tile color",
        target: muralTargets.paintColor,
        type: "controls.setValue",
        value: { hex: getCellPickColor(plan, grid, settings, cell.row, cell.column) },
      });
    },
    [backingHeight, backingWidth, dispatch, grid, settings],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0 || settings.paintTool === "pan") {
      return;
    }

    const point = toBackingPoint(event);

    if (!point) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (settings.paintTool === "paint") {
      paintDragPointerRef.current = event.pointerId;
      paintCellAtPoint(point);
      return;
    }

    if (settings.paintTool === "pick") {
      pickCellAtPoint(point);
      return;
    }

    marqueeDragRef.current = {
      mode: event.shiftKey ? "add" : event.ctrlKey || event.metaKey ? "subtract" : "replace",
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
    };
    setMarqueeRect({ height: 0, width: 0, x: point.x, y: point.y });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (paintDragPointerRef.current === event.pointerId) {
      const point = toBackingPoint(event);

      if (point) {
        paintCellAtPoint(point);
      }

      return;
    }

    const drag = marqueeDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const point = toBackingPoint(event);

    if (point) {
      setMarqueeRect({
        height: point.y - drag.startY,
        width: point.x - drag.startX,
        x: drag.startX,
        y: drag.startY,
      });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (paintDragPointerRef.current === event.pointerId) {
      paintDragPointerRef.current = null;
      return;
    }

    const drag = marqueeDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    marqueeDragRef.current = null;

    const point = toBackingPoint(event);
    const rect: MuralLayoutRect = point
      ? {
          height: point.y - drag.startY,
          width: point.x - drag.startX,
          x: drag.startX,
          y: drag.startY,
        }
      : { height: 0, width: 0, x: drag.startX, y: drag.startY };

    setMarqueeRect(null);

    const layout = computeMuralCanvasLayout(grid, backingWidth, backingHeight);
    const cells = locateTileCellsInRect(grid, layout, rect);
    const changedKeys = cells.map((cell) => getTileCellKey(cell.row, cell.column));
    const nextSelection = applySelectionChange(settings.selection, changedKeys, drag.mode);

    dispatch({
      history: "skip",
      target: muralTargets.paintSelection,
      type: "controls.setValue",
      value: nextSelection,
    });
  };

  return (
    <canvas
      data-mural-tool={settings.paintTool}
      data-toolcraft-product-output=""
      height={backingHeight}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={canvasRef}
      style={{ display: "block", height: "100%", width: "100%" }}
      width={backingWidth}
    />
  );
}
