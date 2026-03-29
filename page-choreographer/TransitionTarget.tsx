// ─── Page Choreographer — Transition Target (Sibling Scanner) ────────────────
// Drop this component INTO any frame alongside your content. It automatically
// registers all sibling elements (the other children of the same parent) as
// transition targets. No wrapping required.
//
// Example:
//   Frame (your layout)
//     ├── Card 1          ← auto-registered
//     ├── Card 2          ← auto-registered
//     ├── Card 3          ← auto-registered
//     └── TransitionTarget ← invisible scanner (configure presets here)

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

const STORE_KEY = "__pageChoreographerStore"

function getStore(): any {
    if (typeof window !== "undefined" && (window as any)[STORE_KEY]) {
        return (window as any)[STORE_KEY]
    }
    return null
}

var groupCounter = 0

function useStableGroupId() {
    var ref = React.useRef("")
    if (ref.current === "") {
        groupCounter += 1
        ref.current = "scan-" + groupCounter
    }
    return ref.current
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionTarget(props: any) {
    var {
        group = "default",
        enterPreset = "fadeUp",
        exitPreset = "riseWave",
        enterEnabled = true,
        exitEnabled = true,
        mobileEnabled = true,
        sortPriority = 0,
        delayOffset = 0,
        visibilityThreshold = 0.1,
        style,
    } = props

    var markerRef = React.useRef<HTMLDivElement>(null)
    var baseId = useStableGroupId()
    var registeredIds = React.useRef<string[]>([])

    React.useEffect(function () {
        var store = getStore()
        var marker = markerRef.current
        if (!store || !marker) return

        var parent = marker.parentElement
        if (!parent) return

        // Unregister any previous targets from this scanner
        unregisterAll(store)

        // Find all sibling elements (skip the invisible marker itself)
        var children = parent.children
        var siblingIndex = 0

        for (var i = 0; i < children.length; i++) {
            var child = children[i] as HTMLElement
            if (child === marker) continue

            var targetId = baseId + "-" + siblingIndex
            siblingIndex++

            store.registerTarget({
                id: targetId,
                ref: { current: child },
                group: group,
                enterPreset: enterPreset,
                exitPreset: exitPreset,
                enterEnabled: enterEnabled,
                exitEnabled: exitEnabled,
                sortPriority: sortPriority,
                delayOffset: delayOffset,
                mobileEnabled: mobileEnabled,
                visibilityThreshold: visibilityThreshold,
            })

            registeredIds.current.push(targetId)

            // Set initial hidden state for enter animation
            if (enterEnabled) {
                var cfg = store.getConfig()
                var kf = store.getEnterKeyframes(enterPreset, cfg)
                for (var k in kf.from) {
                    if (kf.from.hasOwnProperty(k)) {
                        ;(child.style as any)[k] = kf.from[k]
                    }
                }
            }
        }

        // Watch for siblings being added/removed (e.g. CMS items loading)
        var observer: MutationObserver | null = null
        if (typeof MutationObserver !== "undefined") {
            observer = new MutationObserver(function () {
                rescan()
            })
            observer.observe(parent, { childList: true })
        }

        function rescan() {
            var s = getStore()
            if (!s || !marker) return

            var p = marker.parentElement
            if (!p) return

            // Unregister old
            unregisterAll(s)

            var ch = p.children
            var idx = 0
            for (var j = 0; j < ch.length; j++) {
                var el = ch[j] as HTMLElement
                if (el === marker) continue

                var tid = baseId + "-" + idx
                idx++

                s.registerTarget({
                    id: tid,
                    ref: { current: el },
                    group: group,
                    enterPreset: enterPreset,
                    exitPreset: exitPreset,
                    enterEnabled: enterEnabled,
                    exitEnabled: exitEnabled,
                    sortPriority: sortPriority,
                    delayOffset: delayOffset,
                    mobileEnabled: mobileEnabled,
                    visibilityThreshold: visibilityThreshold,
                })

                registeredIds.current.push(tid)

                if (enterEnabled) {
                    var c = s.getConfig()
                    var kf2 = s.getEnterKeyframes(enterPreset, c)
                    for (var k2 in kf2.from) {
                        if (kf2.from.hasOwnProperty(k2)) {
                            ;(el.style as any)[k2] = kf2.from[k2]
                        }
                    }
                }
            }
        }

        return function () {
            if (observer) observer.disconnect()
            unregisterAll(getStore())
        }
    }, [
        baseId, group, enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority,
        delayOffset, mobileEnabled, visibilityThreshold,
    ])

    function unregisterAll(store: any) {
        if (!store) return
        var ids = registeredIds.current
        for (var i = 0; i < ids.length; i++) {
            store.unregisterTarget(ids[i])
        }
        registeredIds.current = []
    }

    // Render as invisible — takes no space in the parent layout
    return (
        <div
            ref={markerRef}
            style={{
                ...style,
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
                position: "absolute",
                opacity: 0,
            }}
        />
    )
}

TransitionTarget.displayName = "Transition Target"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(TransitionTarget, {
    group: {
        type: ControlType.String,
        title: "Group",
        defaultValue: "default",
    },
    enterPreset: {
        type: ControlType.Enum,
        title: "Enter Preset",
        defaultValue: "fadeUp",
        options: ["fadeUp", "maskRevealX", "maskRevealY"],
        optionTitles: ["Fade Up", "Mask Reveal X", "Mask Reveal Y"],
    },
    exitPreset: {
        type: ControlType.Enum,
        title: "Exit Preset",
        defaultValue: "riseWave",
        options: ["riseWave", "blurLift", "scaleFadeGrid"],
        optionTitles: ["Rise Wave", "Blur Lift", "Scale Fade Grid"],
    },
    enterEnabled: {
        type: ControlType.Boolean,
        title: "Enter",
        defaultValue: true,
    },
    exitEnabled: {
        type: ControlType.Boolean,
        title: "Exit",
        defaultValue: true,
    },
    mobileEnabled: {
        type: ControlType.Boolean,
        title: "Mobile",
        defaultValue: true,
    },
    sortPriority: {
        type: ControlType.Number,
        title: "Priority",
        defaultValue: 0,
        min: -10,
        max: 10,
        step: 1,
    },
    delayOffset: {
        type: ControlType.Number,
        title: "Delay Offset",
        defaultValue: 0,
        min: -1,
        max: 2,
        step: 0.01,
        unit: "s",
    },
    visibilityThreshold: {
        type: ControlType.Number,
        title: "Visibility",
        defaultValue: 0.1,
        min: 0,
        max: 1,
        step: 0.05,
    },
})
