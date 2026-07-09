import {
  Hand,
  PaintBucket,
  Pipette,
  SquareDashedMousePointer,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import type { ToolcraftState } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import { clearPaintedTiles, fillSelectedTiles } from "./app-export";
import { muralDefaults, muralTargets, parseMuralSettings } from "./mural/mural-state";
import type { MuralPaintTool } from "./mural/mural-state";

type ToolDef = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tool: MuralPaintTool;
};

const TOOLS: readonly ToolDef[] = [
  { icon: Hand, label: "Pan", tool: "pan" },
  { icon: SquareDashedMousePointer, label: "Select", tool: "select" },
  { icon: PaintBucket, label: "Paint", tool: "paint" },
];

function normalizeHex(value: string): string | null {
  const trimmed = value.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed;

    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return null;
}

function getPaintColor(state: ToolcraftState): string {
  const value = state.values[muralTargets.paintColor];
  const hex =
    typeof value === "object" && value !== null && "hex" in value
      ? (value as { hex?: unknown }).hex
      : value;

  return typeof hex === "string" && /^#[0-9a-fA-F]{3,8}$/.test(hex)
    ? hex.toUpperCase()
    : muralDefaults.paintColor;
}

const toolButtonBase =
  "flex size-9 items-center justify-center rounded-md transition-colors";

/**
 * Floating bottom-center paint toolbar. It is rendered from within
 * canvasContent (so it shares the Toolcraft runtime context) but portaled to
 * document.body, so it floats over the canvas without living inside the
 * product canvas surface or ending up in exports. All state is runtime state
 * driven through runtime commands.
 */
export function MuralToolbar(): React.ReactElement | null {
  const { dispatch, state } = useToolcraft();
  const [colorOpen, setColorOpen] = React.useState(false);
  // Portal into the runtime app container (inside the React root) rather than
  // document.body: React 19 delegates events on the root container, so a
  // portal outside it would never receive clicks. The runtime app container
  // is still outside the product canvas surface, so the toolbar stays out of
  // the canvas and exports.
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setContainer(
      document.querySelector<HTMLElement>('[data-slot="toolcraft-runtime-app"]') ??
        document.body,
    );
  }, []);

  const settings = parseMuralSettings(state.values);
  const activeTool = settings.paintTool;
  const paintColor = getPaintColor(state);
  const hasSelection = settings.selection.length > 0;
  const hasOverrides = Object.keys(settings.overrides).length > 0;

  if (!container) {
    return null;
  }

  function setTool(tool: MuralPaintTool): void {
    setColorOpen(false);
    dispatch({
      history: "skip",
      label: "Select tile tool",
      target: muralTargets.paintTool,
      type: "controls.setValue",
      value: tool,
    });
  }

  function setColor(hex: string): void {
    dispatch({
      label: "Set paint color",
      target: muralTargets.paintColor,
      type: "controls.setValue",
      value: { hex },
    });
  }

  function startEyedropper(): void {
    setColorOpen(false);
    // The renderer samples the next clicked tile into the paint color and
    // returns to the Paint tool, so the eyedropper reads as a color picker.
    dispatch({
      history: "skip",
      label: "Eyedropper",
      target: muralTargets.paintTool,
      type: "controls.setValue",
      value: "pick",
    });
  }

  const showColor = activeTool === "paint" || activeTool === "select";
  const presetSwatches = [
    { color: settings.accentColor, name: "Accent" },
    { color: settings.baseColor, name: "Base" },
    { color: settings.groutColor, name: "Grout" },
    { color: "#FFFFFF", name: "White" },
    { color: "#111114", name: "Black" },
  ];

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center"
      data-mural-toolbar=""
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_60%,transparent)] bg-[color:color-mix(in_oklab,var(--background)_88%,transparent)] p-1.5 shadow-lg backdrop-blur-md">
        {TOOLS.map(({ icon: Icon, label, tool }) => {
          const active = activeTool === tool || (tool === "paint" && activeTool === "pick");

          return (
            <button
              aria-label={label}
              aria-pressed={active}
              className={`${toolButtonBase} ${
                active
                  ? "bg-[color:var(--foreground)] text-[color:var(--background)]"
                  : "text-[color:var(--foreground)] hover:bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
              }`}
              data-mural-tool-button={tool}
              key={tool}
              onClick={() => setTool(tool)}
              title={label}
              type="button"
            >
              <Icon className="size-4" />
            </button>
          );
        })}

        {showColor ? (
          <>
            <div className="mx-0.5 h-6 w-px bg-[color:color-mix(in_oklab,var(--border)_60%,transparent)]" />
            <div className="relative">
              <button
                aria-label="Paint color"
                className="flex size-9 items-center justify-center rounded-md hover:bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
                data-mural-color-swatch=""
                onClick={() => setColorOpen((open) => !open)}
                title="Paint color"
                type="button"
              >
                <span
                  className="size-5 rounded-full border border-[color:color-mix(in_oklab,var(--border)_80%,transparent)]"
                  style={{ backgroundColor: paintColor }}
                />
              </button>

              {colorOpen ? (
                <MuralColorPopover
                  onClose={() => setColorOpen(false)}
                  onEyedropper={startEyedropper}
                  onSetColor={setColor}
                  presetSwatches={presetSwatches}
                  value={paintColor}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {activeTool === "select" ? (
          <>
            <div className="mx-0.5 h-6 w-px bg-[color:color-mix(in_oklab,var(--border)_60%,transparent)]" />
            <button
              aria-label="Fill selected"
              className={`${toolButtonBase} ${
                hasSelection
                  ? "text-[color:var(--foreground)] hover:bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
                  : "cursor-not-allowed text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)]"
              }`}
              disabled={!hasSelection}
              onClick={() => void fillSelectedTiles({ dispatch, state })}
              title="Fill selected tiles"
              type="button"
            >
              <PaintBucket className="size-4" />
            </button>
            <button
              aria-label="Clear painted"
              className={`${toolButtonBase} ${
                hasOverrides || hasSelection
                  ? "text-[color:var(--foreground)] hover:bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
                  : "cursor-not-allowed text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)]"
              }`}
              disabled={!hasOverrides && !hasSelection}
              onClick={() => clearPaintedTiles({ dispatch, state })}
              title="Clear painted tiles"
              type="button"
            >
              <Trash2 className="size-4" />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    container,
  );
}

function MuralColorPopover({
  onClose,
  onEyedropper,
  onSetColor,
  presetSwatches,
  value,
}: {
  onClose: () => void;
  onEyedropper: () => void;
  onSetColor: (hex: string) => void;
  presetSwatches: readonly { color: string; name: string }[];
  value: string;
}): React.ReactElement {
  const [hexDraft, setHexDraft] = React.useState(value);

  React.useEffect(() => {
    setHexDraft(value);
  }, [value]);

  function commitHex(next: string): void {
    const normalized = normalizeHex(next);

    if (normalized) {
      onSetColor(normalized);
    } else {
      setHexDraft(value);
    }
  }

  return (
    <div
      className="absolute bottom-11 left-1/2 flex w-56 -translate-x-1/2 flex-col gap-2 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_60%,transparent)] bg-[color:var(--background)] p-3 shadow-xl"
      data-mural-color-popover=""
    >
      <div className="flex items-center gap-2">
        <input
          aria-label="Paint color picker"
          className="size-9 shrink-0 cursor-pointer rounded-md border border-[color:color-mix(in_oklab,var(--border)_70%,transparent)] bg-transparent"
          onChange={(event) => onSetColor(event.target.value.toUpperCase())}
          type="color"
          value={value}
        />
        <input
          aria-label="Paint color hex"
          className="min-w-0 flex-1 rounded-md border border-[color:color-mix(in_oklab,var(--border)_70%,transparent)] bg-transparent px-2 py-1.5 font-mono text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--link)]"
          onBlur={() => commitHex(hexDraft)}
          onChange={(event) => setHexDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex(event.currentTarget.value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          value={hexDraft}
        />
        <button
          aria-label="Eyedropper"
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--border)_70%,transparent)] text-[color:var(--foreground)] hover:bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
          data-mural-eyedropper=""
          onClick={onEyedropper}
          title="Sample a tile color"
          type="button"
        >
          <Pipette className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {presetSwatches.map((swatch) => (
          <button
            aria-label={swatch.name}
            className="size-6 rounded-full border border-[color:color-mix(in_oklab,var(--border)_80%,transparent)] transition-transform hover:scale-110"
            key={swatch.name}
            onClick={() => onSetColor(swatch.color.toUpperCase())}
            style={{ backgroundColor: swatch.color }}
            title={swatch.name}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
