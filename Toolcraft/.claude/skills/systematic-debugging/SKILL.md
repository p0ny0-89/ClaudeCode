---
name: systematic-debugging
description: Investigate root cause before fixing broken controls, failed tests, build failures, visual regressions, export bugs, or runtime issues in Toolcraft apps.
---

# Systematic Debugging

Before changing code to fix a failure:

1. Reproduce it with the smallest command: a single vitest test, one Playwright test with `-g`, or a targeted browser interaction.
2. Read the exact failure evidence: validator message, ARIA snapshot in `test-results/*/error-context.md`, Playwright trace, or console/server logs.
3. Form a hypothesis about the owning layer: product module math, schema declaration, renderer state/caching, runtime contract, or test harness expectation.
4. Verify the hypothesis with a diagnostic probe (temporary diag test, DOM/state dump) before writing the fix; delete probes afterwards.
5. Fix the root cause in the owning layer. Do not silence validators, relax budgets, weaken assertions, or patch `src/toolcraft` for one app.
6. Re-run the failing check, then the surrounding tier checks, to prove the fix and catch regressions.

A fix that makes a test pass without explaining the original failure is not done.
