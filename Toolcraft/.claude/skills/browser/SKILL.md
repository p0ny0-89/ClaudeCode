---
name: browser
description: Verify the generated Toolcraft UI in a running local browser after implementation — real interactions against the dev server, not only typecheck/build output.
---

# Browser

After implementation, verify the running app in a real browser:

1. Start the app with `pnpm dev` (or let Playwright's web server boot it) and confirm the Toolcraft server identity endpoint plus the `toolcraft-app-title` marker before trusting a port.
2. Interact with the real UI: upload media, drag sliders mid-gesture, switch selects/segments, toggle switches, click export actions, and use toolbar zoom/pan.
3. Prove product output changed with the shared product-observable helpers (`expectToolcraftProductObservableToChange`, `getToolcraftProductObservableSnapshot`), not DOM text or state dumps.
4. The default functional gate is `pnpm test:browser` (excludes `browser perf:` tests). The full performance checkpoint runs through the agent-controlled browser when available, with `pnpm verify:perf` as the Playwright fallback.
5. Scroll panel fields into view before raw mouse drags; locator clicks auto-scroll but `page.mouse` does not.
