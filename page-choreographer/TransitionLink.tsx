import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

// ─── Access shared store from window (created by PageChoreographer) ──────────

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
        children,
        href = "/",
        openInNewTab = false,
        exitTimeout = 3,
        style,
    } = props

    var isNavigating = React.useRef(false)
    var [busy, setBusy] = React.useState(false)

    var handleClick = React.useCallback(
        function (e: any) {
            if (openInNewTab) {
                window.open(href, "_blank", "noopener")
                return
            }

            e.preventDefault()

            if (isNavigating.current) return
            isNavigating.current = true
            setBusy(true)

            var store = getStore()

            // No store or no targets — navigate immediately
            if (!store || store.getTargetCount() === 0) {
                window.location.href = href
                return
            }

            // Race exit vs safety timeout
            Promise.race([
                store.playExit(),
                new Promise(function (resolve) {
                    setTimeout(resolve, exitTimeout * 1000)
                }),
            ])
                .then(function () {
                    window.location.href = href
                })
                .catch(function () {
                    window.location.href = href
                })
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
        >
            {children}
        </a>
    )
}

TransitionLink.displayName = "Transition Link"

addPropertyControls(TransitionLink, {
    children: {
        type: ControlType.ComponentInstance,
        title: "Content",
    },
    href: {
        type: ControlType.String,
        title: "Link",
        defaultValue: "/",
    },
    openInNewTab: {
        type: ControlType.Boolean,
        title: "New Tab",
        defaultValue: false,
    },
    exitTimeout: {
        type: ControlType.Number,
        title: "Timeout",
        defaultValue: 3,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: "s",
    },
})
