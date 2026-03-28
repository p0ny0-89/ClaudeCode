import * as React from "react"
import { addPropertyControls, ControlType } from "framer"
import { choreographerStore } from "./choreographer_store"

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionLink(props: any) {
    const {
        children,
        href = "/",
        openInNewTab = false,
        exitTimeout = 3,
        style,
    } = props

    const isNavigating = React.useRef(false)
    const [busy, setBusy] = React.useState(false)

    const handleClick = React.useCallback(
        function (e: any) {
            if (openInNewTab) {
                window.open(href, "_blank", "noopener")
                return
            }

            e.preventDefault()

            if (isNavigating.current) return
            isNavigating.current = true
            setBusy(true)

            // If no targets registered, navigate immediately
            if (choreographerStore.getTargetCount() === 0) {
                window.location.href = href
                return
            }

            // Race exit vs safety timeout
            Promise.race([
                choreographerStore.playExit(),
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

// ─── Property Controls ───────────────────────────────────────────────────────

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
