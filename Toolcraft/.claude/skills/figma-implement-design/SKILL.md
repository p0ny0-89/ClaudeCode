---
name: figma-implement-design
description: Translate inspected Figma structure into Toolcraft schema, renderer, and verification coverage with structure-faithful values.
---

# Figma Implement Design

After inspecting the Figma structure with the `figma` skill:

1. Map Figma frames/components to Toolcraft surfaces: product output belongs in `canvasContent`; settings and inputs become schema controls in entity-grouped sections.
2. Carry exact values from the inspected structure — colors, dimensions, spacing, radii, typography — into schema `defaultValue`s and renderer constants; do not eyeball them.
3. Use built-in controls for every editable design parameter (`color`, `fontPicker`, `gradient`, `slider`, `select`) per `docs/toolcraft/schema-reference.md`.
4. Keep the Toolcraft runtime shell; never rebuild Figma chrome as app UI on the canvas.
5. Add acceptance rows and browser tests proving each translated design parameter drives the rendered product output, and finish with visual QA against a Figma screenshot.
