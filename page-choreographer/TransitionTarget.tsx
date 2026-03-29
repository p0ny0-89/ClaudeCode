// ─── Page Choreographer — Transition Target (Sibling Scanner) ────────────────
// Drop this INTO any frame alongside your content. It walks UP past Framer's
// internal wrappers to find the real parent container, then scans its children.
//
// Scan Modes:
//   "Siblings"  — registers all children of the parent container
//   "CMS Items" — goes one level deeper into the CMS collection wrapper
//                  to register individual CMS items

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

// ─── Find the real parent container ──────────────────────────────────────────
// Framer wraps each code component in 1-2 container divs. We walk up the
// DOM until we find a parent that has more than just our wrapper as a child.
// That's the actual layout container (e.g. "Projects").

function findRealParent(marker: HTMLElement): HTMLElement | null {
    var node = marker.parentElement
    var maxDepth = 5 // safety limit

    while (node && maxDepth > 0) {
        // Count children that aren't tiny/invisible wrappers
        var significantChildren = 0
        for (var i = 0; i < node.children.length; i++) {
            significantChildren++
        }

        // If this parent has multiple children, it's likely the real container
        if (significantChildren > 1) {
            return node
        }

        node = node.parentElement
        maxDepth--
    }

    return node
}

// ─── Collect target elements ─────────────────────────────────────────────────

function isMarkerOrWrapper(el: HTMLElement, marker: HTMLElement): boolean {
    return el === marker || el.contains(marker)
}

// Drill down through single-child wrappers until reaching a level with
// multiple children. Framer wraps CMS collections in several nested divs.
//   wrapper1 → wrapper2 → wrapper3 → [Card1, Card2, Card3, ...]
// This function returns [Card1, Card2, Card3, ...].
function drillDown(node: HTMLElement, maxDepth: number): HTMLElement[] {
    if (maxDepth <= 0) return [node]

    // Multiple children = we found the actual items
    if (node.children.length > 1) {
        var items: HTMLElement[] = []
        for (var i = 0; i < node.children.length; i++) {
            items.push(node.children[i] as HTMLElement)
        }
        return items
    }

    // Single child = keep drilling
    if (node.children.length === 1) {
        return drillDown(node.children[0] as HTMLElement, maxDepth - 1)
    }

    // Leaf node
    return [node]
}

function collectTargets(
    parent: HTMLElement,
    marker: HTMLElement,
    scanMode: string
): HTMLElement[] {
    var targets: HTMLElement[] = []

    if (scanMode === "cmsItems") {
        // CMS mode: find the sibling branch with the most items, drilling
        // through any single-child wrappers Framer adds.
        var bestItems: HTMLElement[] = []

        for (var i = 0; i < parent.children.length; i++) {
            var child = parent.children[i] as HTMLElement
            if (isMarkerOrWrapper(child, marker)) continue

            var items = drillDown(child, 8)
            if (items.length > bestItems.length) {
                bestItems = items
            }
        }

        targets = bestItems
    } else {
        // Siblings mode: all children except the marker wrapper
        for (var k = 0; k < parent.children.length; k++) {
            var el = parent.children[k] as HTMLElement
            if (isMarkerOrWrapper(el, marker)) continue
            targets.push(el)
        }
    }

    return targets
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionTarget(props: any) {
    var {
        scanMode = "cmsItems",
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

    var markerRef = React.useRef(null) as React.MutableRefObject<HTMLDivElement | null>
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

            // Set initial hidden state for enter animation
            if (enterEnabled) {
                try {
                    var cfg = store.getConfig()
                    var kf = store.getEnterKeyframes(enterPreset, cfg)
                    for (var k in kf.from) {
                        if (kf.from.hasOwnProperty(k)) {
                            ;(el.style as any)[k] = kf.from[k]
                        }
                    }
                } catch (e) {
                    // Silently skip if keyframes fail
                }
            }
        }
    }

    React.useEffect(function () {
        var store = getStore()
        var marker = markerRef.current
        if (!store || !marker) return

        // Walk up past Framer's wrappers to find the real container
        var parent = findRealParent(marker)
        if (!parent) return

        unregisterAll(store)

        var targets = collectTargets(parent, marker, scanMode)
        registerElements(targets, store)

        // Watch for children being added/removed (CMS load-more, etc.)
        var observeTarget = parent
        if (scanMode === "cmsItems") {
            // Also observe the collection wrapper for CMS item changes
            for (var i = 0; i < parent.children.length; i++) {
                var ch = parent.children[i] as HTMLElement
                if (isMarkerOrWrapper(ch, marker)) continue
                if (ch.children.length > 1) {
                    observeTarget = ch
                    break
                }
            }
        }

        var observer: MutationObserver | null = null
        try {
            if (typeof MutationObserver !== "undefined") {
                observer = new MutationObserver(function () {
                    var s = getStore()
                    if (!s || !marker) return
                    var p = findRealParent(marker)
                    if (!p) return
                    unregisterAll(s)
                    var t = collectTargets(p, marker, scanMode)
                    registerElements(t, s)
                })
                observer.observe(observeTarget, { childList: true })
            }
        } catch (e) {
            // MutationObserver not available or failed
        }

        return function () {
            if (observer) {
                try { observer.disconnect() } catch (e) {}
            }
            unregisterAll(getStore())
        }
    }, [
        baseId, scanMode, group, enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority,
        delayOffset, mobileEnabled, visibilityThreshold,
    ])

    // Invisible — no layout impact
    return (
        <div
            ref={markerRef}
            style={{
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
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
        defaultValue: "cmsItems",
        options: ["siblings", "cmsItems"],
        optionTitles: ["Siblings", "CMS Items"],
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
