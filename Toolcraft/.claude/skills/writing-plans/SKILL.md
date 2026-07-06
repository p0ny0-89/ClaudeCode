---
name: writing-plans
description: Turn an approved Toolcraft app spec into a deterministic implementation plan covering app files, tests, build, and browser verification.
---

# Writing Plans

Turn the approved spec into a step-ordered plan before editing code:

1. List the exact files to create or edit under `src/app`, `src/routes`, and `e2e`; never plan edits to `src/toolcraft`.
2. Order steps by dependency: pure product modules → schema → renderer/`canvasContent` → export actions → acceptance/performance matrices → unit tests → browser tests.
3. For every schema control, name its acceptance row, automated test, and browser test up front.
4. Classify the verification tier (Tier 0–4 from `AGENTS.md`) and name the commands to run: targeted vitest, `pnpm verify:quick`, `pnpm verify:final`, browser performance checkpoint.
5. Name the completion bar: `pnpm verify:final` green, browser performance checkpoint recorded, worklog updated to `Mode: product`, and `pnpm dev` serving the app.

Output: a plan whose steps can be executed and checked off without further product decisions.
