// ─── Page Choreographer — Transition Link (Page-Level Click Interceptor) ─────
// Drop this ONCE on any page (like Page Choreographer). It automatically
// intercepts clicks on all internal <a> links and plays exit animations
// before navigating. No wrapping or nesting required.
//
// How it works:
//   1. Listens for click events on the document via event delegation
//   2. When an internal <a> link is clicked, prevents default navigation
//   3. Calls store.playExit() to animate all registered targets out
//   4. After exit completes (or timeout), navigates to the destination
//
// Skips:
//   - External links (different origin)
//   - Links with target="_blank"
//   - Links with data-no-exit attribute
//   - Anchor/hash links on the same page
//   - Clicks with modifier keys (Ctrl, Cmd, Shift)

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

const STORE_KEY = "__pageChoreographerStore"

function getStore(): any {
    if (typeof window !== "undefined" && (window as any)[STORE_KEY]) {
        return (window as any)[STORE_KEY]
    }
    return null
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionLink(props: any) {
    var {
        exitTimeout = 3,
        interceptAll = true,
        linkSelector = "",
        style,
    } = props

    var isNavigating = React.useRef(false)

    React.useEffect(function () {
        function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
            // Walk up from click target to find the nearest <a> tag
            var node = target as HTMLElement | null
            while (node && node !== document.body) {
                if (node.tagName === "A") return node as HTMLAnchorElement
                node = node.parentElement
            }
            return null
        }

        function shouldIntercept(anchor: HTMLAnchorElement): boolean {
            var href = anchor.href
            if (!href) return false

            // Skip links with data-no-exit attribute
            if (anchor.hasAttribute("data-no-exit")) return false

            // Skip target="_blank" links
            if (anchor.target === "_blank") return false

            // Skip external links (different origin)
            try {
                var url = new URL(href, window.location.origin)
                if (url.origin !== window.location.origin) return false

                // Skip hash-only links on the same page
                if (url.pathname === window.location.pathname && url.hash) return false
            } catch (e) {
                return false
            }

            // If not intercepting all, check against custom selector
            if (!interceptAll && linkSelector) {
                try {
                    if (!anchor.matches(linkSelector)) return false
                } catch (e) {
                    return false
                }
            }

            return true
        }

        function handleClick(e: MouseEvent) {
            // Skip if modifier keys held (open in new tab, etc.)
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

            var anchor = findAnchor(e.target)
            if (!anchor) return
            if (!shouldIntercept(anchor)) return

            // Already navigating — don't double-trigger
            if (isNavigating.current) {
                e.preventDefault()
                return
            }

            var store = getStore()

            // No store or no targets — let normal navigation happen
            if (!store || store.getTargetCount() === 0) return

            e.preventDefault()
            isNavigating.current = true

            var destination = anchor.href

            // Race exit animation vs safety timeout
            Promise.race([
                store.playExit(),
                new Promise(function (resolve) {
                    setTimeout(resolve, exitTimeout * 1000)
                }),
            ])
                .then(function () {
                    window.location.href = destination
                })
                .catch(function () {
                    window.location.href = destination
                })
        }

        document.addEventListener("click", handleClick, true)

        return function () {
            document.removeEventListener("click", handleClick, true)
            isNavigating.current = false
        }
    }, [exitTimeout, interceptAll, linkSelector])

    // Invisible — no layout impact
    return (
        <div
            style={{
                ...style,
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
                position: "absolute",
            }}
        />
    )
}

TransitionLink.displayName = "Transition Link"

addPropertyControls(TransitionLink, {
    exitTimeout: {
        type: ControlType.Number,
        title: "Timeout",
        defaultValue: 3,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: "s",
    },
    interceptAll: {
        type: ControlType.Boolean,
        title: "All Links",
        defaultValue: true,
    },
    linkSelector: {
        type: ControlType.String,
        title: "Selector",
        defaultValue: "",
        hidden: function (props: any) { return props.interceptAll !== false },
    },
})
