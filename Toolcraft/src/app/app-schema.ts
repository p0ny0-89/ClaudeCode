import { defineToolcraft } from "@/toolcraft/runtime";

import { muralDefaults, muralTargets } from "./mural/mural-state";
import { tilePresets } from "./mural/tile-presets";

const modulePresetOptions = tilePresets.map((preset) => ({
  label: preset.label,
  value: preset.id,
}));

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    renderScale: true,
    sizing: { mode: "editable-output" },
    upload: true,
  },
  export: {
    png: {
      background: "include",
    },
  },
  panels: {
    controls: {
      sections: [
        {
          title: "Artwork",
          controls: {
            artworkSource: {
              assetKind: "image",
              label: "Source image",
              orderRole: "input",
              performanceReason:
                "Upload decodes and resamples once per media change; results are cached by media identity plus grid shape, so ordinary interactions stay light. The media-import scenario measures the heavy 4K import path.",
              performanceRole: "responsiveness",
              target: muralTargets.artworkSource,
              type: "fileDrop",
            },
          },
        },
        {
          title: "Artwork Placement",
          controls: {
            artworkScaleMode: {
              defaultValue: muralDefaults.scaleMode,
              label: "Placement",
              options: [
                { label: "Fit", value: "fit" },
                { label: "Fill", value: "fill" },
                { label: "Repeat", value: "repeat" },
              ],
              orderRole: "mode",
              performanceReason:
                "Changing placement re-runs the artwork downsample into the cell grid (repeat draws the most placements) before modules reassign and the mural redraws.",
              performanceRole: "workload",
              target: muralTargets.scaleMode,
              type: "segmented",
            },
            artworkPreviewMode: {
              defaultValue: muralDefaults.previewMode,
              description:
                "Artwork maps the sampled image to tile cells, Grid shows the bare tile layout, Mural shows the generated tile modules, Labels overlays each tile's install coordinate (A3) for fabrication.",
              label: "View",
              options: [
                { label: "Artwork", value: "artwork" },
                { label: "Grid", value: "grid" },
                { label: "Mural", value: "mural" },
                { label: "Labels", value: "labels" },
              ],
              orderRole: "mode",
              performanceReason:
                "Switching the view redraws every tile cell; the Mural view draws the most shapes per cell.",
              performanceRole: "workload",
              target: muralTargets.previewMode,
              type: "segmented",
            },
            artworkScale: {
              defaultValue: muralDefaults.artworkScale,
              description:
                "Size multiplier on top of the chosen placement, so artwork like a logo can sit smaller than the full wall.",
              label: "Size",
              max: 400,
              min: 25,
              orderRole: "strength",
              performanceReason:
                "Dragging size re-runs the cached artwork downsample and redraws the grid live.",
              performanceRole: "workload",
              step: 1,
              target: muralTargets.artworkScale,
              type: "slider",
              unit: "%",
            },
            artworkPadding: {
              defaultValue: muralDefaults.artworkPadding,
              description:
                "Empty tile cells kept clear around the artwork on every side of the wall.",
              label: "Padding",
              max: 12,
              min: 0,
              orderRole: "detail",
              performanceReason:
                "Dragging padding re-runs the cached artwork downsample and redraws the grid live.",
              performanceRole: "workload",
              step: 1,
              target: muralTargets.artworkPadding,
              type: "slider",
              unit: "tiles",
              variant: "discrete",
            },
            repeatSpacing: {
              defaultValue: muralDefaults.repeatSpacing,
              description:
                "Tile cells between repeated artwork instances, separate from the outer padding.",
              label: "Spacing",
              max: 12,
              min: 0,
              orderRole: "detail",
              performanceReason:
                "Dragging spacing re-runs the cached artwork downsample and redraws the grid live.",
              performanceRole: "workload",
              step: 1,
              target: muralTargets.repeatSpacing,
              type: "slider",
              unit: "tiles",
              variant: "discrete",
              visibleWhen: {
                equals: "repeat",
                target: muralTargets.scaleMode,
              },
            },
          },
        },
        {
          title: "Wall Surface",
          controls: {
            wallUnit: {
              defaultValue: muralDefaults.wallUnit,
              label: "Unit",
              options: [
                { label: "Inches", value: "in" },
                { label: "Feet", value: "ft" },
                { label: "Millimeters", value: "mm" },
                { label: "Centimeters", value: "cm" },
              ],
              orderRole: "mode",
              performanceReason:
                "The unit only relabels physical dimensions; tile counts come from dimension ratios.",
              performanceRole: "responsiveness",
              target: muralTargets.wallUnit,
              type: "select",
            },
            wallWidth: {
              commitMode: "setting",
              defaultValue: String(muralDefaults.wallWidth),
              label: "Wall width",
              orderRole: "primary",
              performanceReason:
                "A wider wall multiplies the tile column count and the number of drawn tile cells.",
              performanceRole: "workload",
              target: muralTargets.wallWidth,
              type: "text",
            },
            wallHeight: {
              commitMode: "setting",
              defaultValue: String(muralDefaults.wallHeight),
              label: "Wall height",
              orderRole: "primary",
              performanceReason:
                "A taller wall multiplies the tile row count and the number of drawn tile cells.",
              performanceRole: "workload",
              target: muralTargets.wallHeight,
              type: "text",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["wallWidth", "wallHeight"],
              layout: "inline",
            },
          ],
        },
        {
          title: "Tile Grid",
          controls: {
            tileWidth: {
              commitMode: "setting",
              defaultValue: String(muralDefaults.tileWidth),
              label: "Tile width",
              orderRole: "primary",
              performanceReason:
                "Smaller tiles increase the column count and the number of drawn tile cells.",
              performanceRole: "workload",
              target: muralTargets.tileWidth,
              type: "text",
            },
            tileHeight: {
              commitMode: "setting",
              defaultValue: String(muralDefaults.tileHeight),
              label: "Tile height",
              orderRole: "primary",
              performanceReason:
                "Smaller tiles increase the row count and the number of drawn tile cells.",
              performanceRole: "workload",
              target: muralTargets.tileHeight,
              type: "text",
            },
            groutSpacing: {
              commitMode: "setting",
              defaultValue: String(muralDefaults.groutSpacing),
              description:
                "Physical gap between tiles in the selected unit. The grout color fills this gap and the wall margin behind the tile layout.",
              label: "Grout gap",
              orderRole: "primary",
              performanceReason:
                "Grout spacing slightly changes tile counts but stays a single static redraw.",
              performanceRole: "responsiveness",
              target: muralTargets.groutSpacing,
              type: "text",
            },
            groutColor: {
              defaultValue: { hex: muralDefaults.groutColor },
              label: "Grout color",
              orderRole: "color",
              performanceReason:
                "Grout color changes one fill style in a single static redraw.",
              performanceRole: "responsiveness",
              target: muralTargets.groutColor,
              type: "color",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["tileWidth", "tileHeight"],
              layout: "inline",
            },
            {
              columns: 2,
              controls: ["groutSpacing", "groutColor"],
              layout: "inline",
            },
          ],
        },
        {
          title: "Tile Mapping",
          controls: {
            mappingMode: {
              defaultValue: muralDefaults.mappingMode,
              description:
                "Brightness maps darker artwork areas to denser tile modules; Threshold splits the artwork into solid and empty tiles at a cut-off level.",
              label: "Mode",
              options: [
                { label: "Brightness", value: "brightness" },
                { label: "Threshold", value: "threshold" },
              ],
              orderRole: "mode",
              performanceReason:
                "The mapping mode changes per-cell module assignment in one regeneration pass.",
              performanceRole: "responsiveness",
              target: muralTargets.mappingMode,
              type: "select",
            },
            thresholdLevel: {
              defaultValue: muralDefaults.threshold,
              label: "Threshold",
              max: 100,
              min: 0,
              orderRole: "primary",
              performanceReason:
                "Dragging the threshold reassigns tile modules live across the whole grid.",
              performanceRole: "responsiveness",
              step: 1,
              target: muralTargets.threshold,
              type: "slider",
              unit: "%",
              visibleWhen: {
                equals: "threshold",
                target: muralTargets.mappingMode,
              },
            },
            contrast: {
              defaultValue: muralDefaults.contrast,
              label: "Contrast",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Dragging contrast rescales sampled luminance and reassigns tile modules live.",
              performanceRole: "responsiveness",
              step: 1,
              target: muralTargets.contrast,
              type: "slider",
              unit: "%",
            },
          },
        },
        {
          title: "Tile Modules",
          controls: {
            moduleMode: {
              defaultValue: muralDefaults.moduleMode,
              description:
                "Mixed builds the mural from the whole geometric module library; Single repeats one chosen module across the wall.",
              label: "Module set",
              options: [
                { label: "Mixed modules", value: "mixed" },
                { label: "Single module", value: "single" },
              ],
              orderRole: "mode",
              performanceReason:
                "Switching the module set reassigns tile modules in one regeneration pass.",
              performanceRole: "responsiveness",
              target: muralTargets.moduleMode,
              type: "select",
            },
            singleModule: {
              defaultValue: muralDefaults.singleModule,
              label: "Motif",
              options: modulePresetOptions,
              orderRole: "primary",
              performanceReason:
                "Choosing a module redraws the same tile grid with a different motif.",
              performanceRole: "responsiveness",
              target: muralTargets.singleModule,
              type: "select",
              visibleWhen: {
                equals: "single",
                target: muralTargets.moduleMode,
              },
            },
            density: {
              defaultValue: muralDefaults.density,
              description:
                "Biases cells toward denser or emptier modules on top of the sampled artwork fill.",
              label: "Density",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Dragging density reassigns tile modules live across the whole grid; density 100 forces the solid-heavy branch on every cell.",
              performanceRole: "workload",
              step: 1,
              target: muralTargets.density,
              type: "slider",
              unit: "%",
            },
            randomness: {
              defaultValue: muralDefaults.randomness,
              label: "Randomness",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Dragging randomness reassigns tile modules live across the whole grid.",
              performanceRole: "responsiveness",
              step: 1,
              target: muralTargets.randomness,
              type: "slider",
              unit: "%",
            },
            seed: {
              defaultValue: muralDefaults.seed,
              description:
                "Seed for the repeatable random stream; the same seed always regenerates the same mural.",
              label: "Seed",
              max: 9999,
              min: 1,
              orderRole: "advanced",
              performanceReason:
                "Dragging the seed reassigns tile modules live across the whole grid.",
              performanceRole: "responsiveness",
              step: 1,
              target: muralTargets.seed,
              type: "slider",
            },
          },
        },
        {
          title: "Tile Colors",
          controls: {
            baseColor: {
              defaultValue: { hex: muralDefaults.baseColor },
              label: "Base",
              orderRole: "color",
              performanceReason:
                "Base color changes one fill style in a single static redraw.",
              performanceRole: "responsiveness",
              target: muralTargets.baseColor,
              type: "color",
            },
            accentColor: {
              defaultValue: { hex: muralDefaults.accentColor },
              label: "Accent",
              orderRole: "color",
              performanceReason:
                "Accent color changes one fill style in a single static redraw.",
              performanceRole: "responsiveness",
              target: muralTargets.accentColor,
              type: "color",
            },
            useSourceColors: {
              defaultValue: false,
              description:
                "Each tile motif samples its accent color from the uploaded artwork instead of the shared accent color.",
              label: "Source colors",
              orderRole: "detail",
              performanceReason:
                "Sampled accent colors reuse the cached per-cell samples in a single redraw.",
              performanceRole: "responsiveness",
              target: muralTargets.useSourceColors,
              type: "switch",
            },
          },
        },
        {
          title: "Image Export",
          controls: {
            imageFormat: {
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
              orderRole: "mode",
              performanceReason:
                "The export format only affects the export encoding pass, not the live preview.",
              performanceRole: "responsiveness",
              target: muralTargets.imageFormat,
              type: "select",
            },
            imageResolution: {
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              orderRole: "mode",
              performanceReason:
                "The export resolution scales the export render pass up to an 8192px long edge; the live preview is unchanged.",
              performanceRole: "workload",
              target: muralTargets.imageResolution,
              type: "select",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["imageFormat", "imageResolution"],
              layout: "inline",
            },
          ],
        },
        {
          title: "Export",
          controls: {
            exportActions: {
              actions: [
                {
                  icon: "upload-simple",
                  label: "Export JSON",
                  value: "export-json",
                  variant: "outline",
                },
                {
                  icon: "upload-simple",
                  label: "Export PNG",
                  value: "export-png",
                },
              ],
              target: "export.actions",
              type: "panelActions",
            },
          },
        },
      ],
      title: "Tile Mural",
    },
  },
  settingsTransfer: "auto",
  toolbar: {
    history: true,
    radar: true,
    theme: true,
    zoom: true,
  },
});
