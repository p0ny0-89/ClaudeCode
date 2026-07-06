---
name: brainstorming
description: Shape Toolcraft app behavior before writing code — product behavior, canvas sizing mode, panels, media flow, controls, export/copy behavior, renderer technique, timeline/layer choice, and ambiguous requirements.
---

# Brainstorming

Before writing or changing a Toolcraft app spec, decide and record:

1. Product behavior: what the app creates or edits, and the user-visible result.
2. Canvas sizing mode: `editable-output` for product/export apps; `intrinsic-media` only for true media viewers; `fixed-output` only for non-product fixtures.
3. Panels: controls sections grouped by product entity/workflow stage; layers and timeline only when product behavior requires them.
4. Media flow: uploads through `fileDrop`, default assets through `media.defaultAssets`, no invented canvas placeholder artwork before real content exists.
5. Controls: map every product need to a built-in control by value model (see `docs/toolcraft/schema-reference.md`).
6. Export/copy behavior: still apps expose Export PNG with the Background and Image Export sections; animated apps add video export plus the top timeline.
7. Renderer technique: choose DOM/SVG/Canvas 2D/WebGL from workload evidence and write the Renderer Technique Decision Matrix.
8. Ambiguity: decisions covered by the Toolcraft contract, prompt, or reference are recorded in the spec and not re-asked.

Output: an app spec section (see `docs/tile-mural-spec.md`) recording these decisions before implementation.
