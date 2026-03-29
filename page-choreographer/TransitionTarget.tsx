// ─── Page Choreographer — Transition Target (Sibling Scanner) ────────────────
// Drop this component INTO any frame alongside your content.
//
// Scan Modes:
//   "Siblings"  — registers direct siblings (cards, text blocks, etc.)
//   "CMS Items" — goes one level deeper into the CMS collection wrapper
//                  to find and register individual CMS items
//
// Example (Siblings mode):
//   Frame
//     ├── Card 1           ← registered
//     ├── Card 2           ← registered
//     └── TransitionTarget ← scanner
//
// Example (CMS Items mode):
//   Projects Section
//     ├── [CMS Collection]       ← skipped (wrapper)
//     │     ├── Project Card 1   ← registered
//     │     ├── Project Card 2   ← registered
//     │     └── Project Card 3   ← registered
//     ├── Load More              ← skipped
//     └── TransitionTarget       ← scanner

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

var STORE_KEY = "__pageChoreographerStore"

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

// ─── Collect target elements based on scan mode ──────────────────────────────

function collectTargets(
    parent: HTMLElement,
    marker: HTMLElement,
    scanMode: string
): HTMLElement[] {
    var targets: HTMLElement[] = []

    if (scanMode === "cmsItems") {
        // CMS mode: find the sibling with the most children (the collection
        // wrapper) and register its children as individual targets.
        var bestSibling: HTMLElement | null = null
        var bestCount = 0

        for (var i = 0; i < parent.children.length; i++) {
            var child = parent.children[i] as HTMLElement
            if (child === marker) continue
            if (child.children.length > bestCount) {
                bestCount = child.children.length
                bestSibling = child
            }
        }

        if (bestSibling && bestCount > 0) {
            for (var j = 0; j < bestSibling.children.length; j++) {
                targets.push(bestSibling.children[j] as HTMLElement)
            }
        }
    } else {
        // Siblings mode: register all direct siblings
        for (var k = 0; k < parent.children.length; k++) {
            var el = parent.children[k] as HTMLElement
            if (el === marker) continue
            targets.push(el)
        }
    }

    return targets
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionTarget(props: any) {
    var {
        scanMode = "siblings",
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

    function unregisterAll(store: any) {
        if (!store) return
        var ids = registeredIds.current
        for (var i = 0; i < ids.length; i++) {
            store.unregisterTarget(ids[i])
        }
        registeredIds.current = []
    }

    function registerElements(elements: HTMLElement[], store: any) {
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i]
            var targetId = baseId + "-" + i

            store.registerTarget({
                id: targetId,
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

            registeredIds.current.push(targetId)

            // Set initial hidden state for enter
            if (enterEnabled) {
                var cfg = store.getConfig()
                var kf = store.getEnterKeyframes(enterPreset, cfg)
                for (var k in kf.from) {
                    if (kf.from.hasOwnProperty(k)) {
                        ;(el.style as any)[k] = kf.from[k]
                    }
                }
            }
        }
    }

    React.useEffect(function () {
        var store = getStore()
        var marker = markerRef.current
        if (!store || !marker) return

        var parent = marker.parentElement
        if (!parent) return

        unregisterAll(store)

        var targets = collectTargets(parent, marker, scanMode)
        registerElements(targets, store)

        // Watch for children being added/removed (CMS items loading)
        var observeTarget = parent
        if (scanMode === "cmsItems") {
            // For CMS mode, also observe the collection wrapper
            var best: HTMLElement | null = null
            var bestN = 0
            for (var i = 0; i < parent.children.length; i++) {
                var ch = parent.children[i] as HTMLElement
                if (ch === marker) continue
                if (ch.children.length > bestN) {
                    bestN = ch.children.length
                    best = ch
                }
            }
            if (best) observeTarget = best
        }

        var observer: MutationObserver | null = null
        if (typeof MutationObserver !== "undefined") {
            observer = new MutationObserver(function () {
                var s = getStore()
                if (!s || !marker) return
                var p = marker.parentElement
                if (!p) return
                unregisterAll(s)
                var t = collectTargets(p, marker, scanMode)
                registerElements(t, s)
            })
            observer.observe(observeTarget, { childList: true })
        }

        return function () {
            if (observer) observer.disconnect()
            unregisterAll(getStore())
        }
    }, [
        baseId, scanMode, group, enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority,
        delayOffset, mobileEnabled, visibilityThreshold,
    ])

    // Invisible marker
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
    scanMode: {
        type: ControlType.Enum,
        title: "Scan Mode",
        defaultValue: "siblings",
        options: ["siblings", "cmsItems"],
        optionTitles: ["Siblings", "CMS Items"],
        description: "Siblings: registers direct siblings. CMS Items: finds items inside the CMS collection wrapper.",
    },
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
