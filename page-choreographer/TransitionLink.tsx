// ─── Page Choreographer — Transition Link ────────────────────────────────────
// A link/button that triggers page exit animations before navigating.
// Place it anywhere on the page. On click it:
//   1. Tells the choreographer store to play the exit sequence
//   2. Waits for all exit animations to complete
//   3. Navigates to the target URL
//
// If no Page Choreographer is present (no targets registered), it navigates
// immediately — graceful degradation by design.

import { useCallback, useRef, useState } from "react"
import { addPropertyControls, ControlType } from "framer"
import { choreographerStore } from "./choreographer-store"

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
    children: React.ReactNode

    // Navigation
    href: string
    openInNewTab: boolean

    // Safety
    exitTimeout: number

    // Layout
    style: React.CSSProperties
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionLink(props: Props) {
    const {
        children,
        href = "/",
        openInNewTab = false,
        exitTimeout = 3,
        style,
    } = props

    const isNavigating = useRef(false)
    const [busy, setBusy] = useState(false)

    const handleClick = useCallback(
        async (e: React.MouseEvent) => {
            // Open-in-new-tab: no exit animation needed
            if (openInNewTab) {
                window.open(href, "_blank", "noopener")
                return
            }

            e.preventDefault()

            // Guard against double-clicks during exit
            if (isNavigating.current) return
            isNavigating.current = true
            setBusy(true)

            // If no targets are registered, navigate immediately
            if (choreographerStore.getTargetCount() === 0) {
                navigate(href)
                return
            }

            try {
                // Race exit animations against a safety timeout so we never
                // leave the user stranded on a frozen page.
                await Promise.race([
                    choreographerStore.playExit(),
                    new Promise<void>((resolve) =>
                        setTimeout(resolve, exitTimeout * 1000),
                    ),
                ])
            } catch {
                // If exit fails for any reason, still navigate
            }

            navigate(href)
        },
        [href, openInNewTab, exitTimeout],
    )

    return (
        <a
            href={href}
            onClick={handleClick}
            target={openInNewTab ? "_blank" : undefined}
            rel={openInNewTab ? "noopener noreferrer" : undefined}
            style={{
                ...style,
                display: "block",
                textDecoration: "none",
                color: "inherit",
                cursor: busy ? "wait" : "pointer",
                width: "100%",
                height: "100%",
            }}
            aria-busy={busy}
        >
            {children}
        </a>
    )
}

// ─── Navigation helper ───────────────────────────────────────────────────────

function navigate(href: string): void {
    // Framer sites: internal links are same-origin. Using window.location
    // triggers a full page load, which is correct for the "enter" animation
    // to fire on the next page.
    //
    // For SPA routing within Framer, there is no public router API.
    // window.location.href is the most reliable approach.
    window.location.href = href
}

// ─── Display name ────────────────────────────────────────────────────────────

TransitionLink.displayName = "Transition Link"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(TransitionLink, {
    children: {
        type: ControlType.ComponentInstance,
        title: "Content",
    },

    // ── Navigation ───────────────────────────────────────────────────────
    href: {
        type: ControlType.Link,
        title: "Link",
        defaultValue: "/",
        description: "Destination URL — use a page link or external URL",
    },
    openInNewTab: {
        type: ControlType.Boolean,
        title: "New Tab",
        defaultValue: false,
        description: "Open in new tab (skips exit animation)",
    },

    // ── Safety ───────────────────────────────────────────────────────────
    exitTimeout: {
        type: ControlType.Number,
        title: "Timeout",
        defaultValue: 3,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: "s",
        description: "Max wait time for exit animations before navigating",
    },
})
