// ─── Page Choreographer — Transition Overrides ──────────────────────────────
// Apply these overrides to any Frame on the canvas to register it as a
// transition target. No wrapping or nesting required.
//
// How to use:
//   1. Select any Frame on the canvas
//   2. In the properties panel, find "Code Overrides"
//   3. Select this file
//   4. Choose an override (e.g. "FadeUp", "MaskRevealX", etc.)
//
// The override registers the frame with Page Choreographer for
// coordinated enter/exit animations.

import * as React from "react"
import type { ComponentType } from "react"

const STORE_KEY = "__pageChoreographerStore"

function getStore(): any {
    if (typeof window !== "undefined" && (window as any)[STORE_KEY]) {
        return (window as any)[STORE_KEY]
    }
    return null
}

var idCounter = 0
function useStableId() {
    var ref = React.useRef("")
    if (ref.current === "") {
        idCounter += 1
        ref.current = "ov-" + idCounter
    }
    return ref.current
}

// ─── Core override factory ───────────────────────────────────────────────────

function createTransitionOverride(options: {
    enterPreset: string
    exitPreset: string
    enterEnabled: boolean
    exitEnabled: boolean
}) {
    return function (): any {
        var id = useStableId()
        var attrName = "data-choreographer-id"

        React.useEffect(function () {
            var store = getStore()
            if (!store) return

            // Find the DOM element via the data attribute we set
            var el = document.querySelector(
                "[" + attrName + '="' + id + '"]'
            ) as HTMLDivElement | null

            if (!el) return

            store.registerTarget({
                id: id,
                ref: { current: el },
                group: "default",
                enterPreset: options.enterPreset,
                exitPreset: options.exitPreset,
                enterEnabled: options.enterEnabled,
                exitEnabled: options.exitEnabled,
                sortPriority: 0,
                delayOffset: 0,
                mobileEnabled: true,
                visibilityThreshold: 0.1,
            })

            // Set initial hidden state for enter
            if (options.enterEnabled) {
                var cfg = store.getConfig()
                var kf = store.getEnterKeyframes(options.enterPreset, cfg)
                for (var k in kf.from) {
                    if (kf.from.hasOwnProperty(k)) {
                        ;(el.style as any)[k] = kf.from[k]
                    }
                }
            }

            return function () {
                var s = getStore()
                if (s) s.unregisterTarget(id)
            }
        }, [id])

        // Return props that get merged onto the Frame
        var result: any = {}
        result[attrName] = id
        return result
    }
}

// ─── Enter + Exit overrides (most common) ────────────────────────────────────

// Fade Up enter + Rise Wave exit (the default workhorse)
export function FadeUp(): any {
    return createTransitionOverride({
        enterPreset: "fadeUp",
        exitPreset: "riseWave",
        enterEnabled: true,
        exitEnabled: true,
    })()
}

// Mask Reveal X enter + Rise Wave exit
export function MaskRevealX(): any {
    return createTransitionOverride({
        enterPreset: "maskRevealX",
        exitPreset: "riseWave",
        enterEnabled: true,
        exitEnabled: true,
    })()
}

// Mask Reveal Y enter + Rise Wave exit
export function MaskRevealY(): any {
    return createTransitionOverride({
        enterPreset: "maskRevealY",
        exitPreset: "riseWave",
        enterEnabled: true,
        exitEnabled: true,
    })()
}

// Fade Up enter + Blur Lift exit
export function FadeUpBlurLift(): any {
    return createTransitionOverride({
        enterPreset: "fadeUp",
        exitPreset: "blurLift",
        enterEnabled: true,
        exitEnabled: true,
    })()
}

// Fade Up enter + Scale Fade Grid exit
export function FadeUpScaleFade(): any {
    return createTransitionOverride({
        enterPreset: "fadeUp",
        exitPreset: "scaleFadeGrid",
        enterEnabled: true,
        exitEnabled: true,
    })()
}

// ─── Enter-only overrides ────────────────────────────────────────────────────

export function EnterFadeUp(): any {
    return createTransitionOverride({
        enterPreset: "fadeUp",
        exitPreset: "riseWave",
        enterEnabled: true,
        exitEnabled: false,
    })()
}

export function EnterMaskRevealX(): any {
    return createTransitionOverride({
        enterPreset: "maskRevealX",
        exitPreset: "riseWave",
        enterEnabled: true,
        exitEnabled: false,
    })()
}

export function EnterMaskRevealY(): any {
    return createTransitionOverride({
        enterPreset: "maskRevealY",
        exitPreset: "riseWave",
        enterEnabled: true,
        exitEnabled: false,
    })()
}

// ─── Exit-only overrides ─────────────────────────────────────────────────────

export function ExitRiseWave(): any {
    return createTransitionOverride({
        enterPreset: "fadeUp",
        exitPreset: "riseWave",
        enterEnabled: false,
        exitEnabled: true,
    })()
}

export function ExitBlurLift(): any {
    return createTransitionOverride({
        enterPreset: "fadeUp",
        exitPreset: "blurLift",
        enterEnabled: false,
        exitEnabled: true,
    })()
}

export function ExitScaleFade(): any {
    return createTransitionOverride({
        enterPreset: "fadeUp",
        exitPreset: "scaleFadeGrid",
        enterEnabled: false,
        exitEnabled: true,
    })()
}
