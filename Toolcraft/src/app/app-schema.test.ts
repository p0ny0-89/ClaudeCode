import { describe, expect, it } from "vitest";

import { getToolcraftControlOrderTargets } from "./app-acceptance";
import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("appSchema", () => {
  it("keeps the mandatory runtime setup contract for the mural app", () => {
    expect(appSchema.canvas.draggable).toBe(true);
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.canvas.renderScale.enabled).toBe(true);
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.panels.controls?.sections[0]?.controls.settingsTransfer).toMatchObject({
      target: "runtime.settingsTransfer",
      type: "settingsTransfer",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasWidth).toMatchObject({
      target: "canvas.size.width",
      type: "text",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasHeight).toMatchObject({
      target: "canvas.size.height",
      type: "text",
    });
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toBeUndefined();
    expect(appSchema.toolbar).toEqual({
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    });
  });

  it("declares the mural product sections in workflow order", () => {
    const sectionTitles =
      appSchema.panels.controls?.sections.map((section) => section.title) ?? [];

    expect(sectionTitles).toEqual([
      "Setup",
      "Artwork",
      "Artwork Placement",
      "Wall Surface",
      "Tile Grid",
      "Tile Mapping",
      "Tile Modules",
      "Tile Painting",
      "Tile Colors",
      "Background",
      "Image Export",
      "Export",
    ]);
  });

  it("orders visible product controls by decision flow", () => {
    const orderTargets = getToolcraftControlOrderTargets(appSchema);
    const productTargets = orderTargets.filter(
      (target) =>
        !target.startsWith("runtime.") &&
        !target.startsWith("canvas.") &&
        !target.startsWith("panels.") &&
        target !== "export.actions",
    );

    expect(productTargets).toEqual([
      "artwork.source",
      "artwork.scaleMode",
      "artwork.previewMode",
      "artwork.scale",
      "artwork.padding",
      "artwork.spacing",
      "wall.unit",
      "wall.width",
      "wall.height",
      "tiles.width",
      "tiles.height",
      "tiles.grout",
      "tiles.groutColor",
      "mapping.mode",
      "mapping.threshold",
      "mapping.contrast",
      "modules.mode",
      "modules.single",
      "modules.density",
      "modules.randomness",
      "modules.seed",
      "paint.tool",
      "paint.color",
      "paint.actions",
      "colors.base",
      "colors.accent",
      "colors.useSource",
      "export.includeBackground",
      "appearance.background",
      "export.image.format",
      "export.image.resolution",
    ]);
  });

  it("gates dependent branch controls with visibleWhen", () => {
    const sections = appSchema.panels.controls?.sections ?? [];
    const mappingSection = sections.find((section) => section.title === "Tile Mapping");
    const modulesSection = sections.find((section) => section.title === "Tile Modules");

    expect(mappingSection?.controls.thresholdLevel?.visibleWhen).toEqual({
      equals: "threshold",
      target: "mapping.mode",
    });
    expect(modulesSection?.controls.singleModule?.visibleWhen).toEqual({
      equals: "single",
      target: "modules.mode",
    });
  });

  it("exposes export png and export json sticky footer actions", () => {
    const sections = appSchema.panels.controls?.sections ?? [];
    const exportSection = sections.find((section) =>
      Object.values(section.controls).some((control) => control.type === "panelActions"),
    );
    const actionsControl = exportSection
      ? Object.values(exportSection.controls).find(
          (control) => control.type === "panelActions",
        )
      : undefined;
    const actionValues = (actionsControl?.actions ?? []).map((action) =>
      typeof action === "string" ? action : action.value,
    );

    expect(actionValues).toEqual(["export-json", "export-png"]);
  });

  it("classifies every visible non-action control for performance coverage", () => {
    const sections = appSchema.panels.controls?.sections ?? [];

    for (const section of sections) {
      if (section.title === "Setup") {
        continue;
      }

      for (const [controlId, control] of Object.entries(section.controls)) {
        if (control.type === "panelActions") {
          continue;
        }

        expect(
          control.performanceRole,
          `${controlId} must declare a performanceRole`,
        ).toBeDefined();
        expect(
          control.performanceReason,
          `${controlId} must declare a performanceReason`,
        ).toBeDefined();
      }
    }
  });

  it("keeps workload targets aligned between schema and performance config", () => {
    expect(appPerformance.workloadTargets).toEqual([
      "artwork.scaleMode",
      "artwork.previewMode",
      "artwork.scale",
      "artwork.padding",
      "artwork.spacing",
      "wall.width",
      "wall.height",
      "tiles.width",
      "tiles.height",
      "modules.density",
      "export.image.resolution",
    ]);
    expect(appPerformance.usesCustomRenderer).toBe(true);
    expect(appPerformance.rendererStrategy).toBe("canvas-2d");
  });
});
