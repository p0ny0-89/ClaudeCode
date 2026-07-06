---
name: figma
description: Inspect actual Figma structure through the Figma MCP before implementing Figma-referenced Toolcraft apps; screenshots are only for final visual QA.
---

# Figma

When a prompt references a Figma URL:

1. Use the connected Figma MCP tools (`get_design_context`, `get_metadata`, `get_variable_defs`, `get_screenshot`) to read the actual node, layer tree, component instances, variants, text nodes, variables, styles, and assets.
2. Treat the Figma file structure as the design source of truth; never implement from a screenshot, exported PNG, or visual memory.
3. If the URL is not node-specific, inspect the file/page metadata and choose the relevant node only when unambiguous; otherwise ask for a node-specific link.
4. Record the inspected node ids and extracted values (colors, spacing, typography, geometry) in the app spec before implementation.
5. Use screenshots only for final visual QA after the structure-based implementation.
