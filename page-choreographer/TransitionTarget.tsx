// ─── Page Choreographer — Transition Target ──────────────────────────────────
// Wrap any element (text, card, image, CMS item) with TransitionTarget to
// register it for choreographed page transitions.
//
// Usage: Drag TransitionTarget onto the canvas, then nest your content inside
// it. The choreographer will animate this wrapper on enter/exit.

import { useEffect, useRef, useId } from "react"
import { addPropertyControls, ControlType } from "framer"
import { choreographerStore } from "./choreographer-store"
import type { EnterPreset, ExitPreset } from "./choreographer-types"
import { resolveEnterPreset } from "./choreographer-presets"
import { DEFAULT_CONFIG } from "./choreographer-types"

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
    children: React.ReactNode

    // Identity
    group: string

    // Presets
    enterPreset: EnterPreset
    exitPreset: ExitPreset

    // Participation
    enterEnabled: boolean
    exitEnabled: boolean
    mobileEnabled: boolean

    // Tuning
    sortPriority: number
    delayOffset: number
    visibilityThreshold: number

    // Layout
    style: React.CSSProperties
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionTarget(props: Props) {
    const {
        children,
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

    const ref = useRef<HTMLDivElement>(null)
    const stableId = useId()

    // Register on mount, unregister on unmount
    useEffect(() => {
        const id = stableId

        choreographerStore.registerTarget({
            id,
            ref: ref as React.RefObject<HTMLDivElement>,
            group,
            enterPreset,
            exitPreset,
            enterEnabled,
            exitEnabled,
            sortPriority,
            delayOffset,
            mobileEnabled,
            visibilityThreshold,
        })

        return () => {
            choreographerStore.unregisterTarget(id)
        }
    }, [
        stableId,
        group,
        enterPreset,
        exitPreset,
        enterEnabled,
        exitEnabled,
        sortPriority,
        delayOffset,
        mobileEnabled,
        visibilityThreshold,
    ])

    // Set initial hidden state for enter animations.
    // This prevents content from flashing in its final position before the
    // choreographer has a chance to animate it.
    useEffect(() => {
        if (!enterEnabled || !ref.current) return

        const el = ref.current
        const config = choreographerStore.getConfig()
        const preset = resolveEnterPreset(enterPreset, config)

        // Apply the "from" state as inline styles
        for (const [key, value] of Object.entries(preset.from)) {
            if (key === "y") {
                el.style.transform = `translateY(${value}px)`
            } else if (key === "x") {
                el.style.transform = `translateX(${value}px)`
            } else if (key === "scale") {
                el.style.transform = `scale(${value})`
            } else if (key === "opacity") {
                el.style.opacity = String(value)
            } else if (key === "filter") {
                el.style.filter = String(value)
            } else if (key === "clipPath") {
                el.style.clipPath = String(value)
            }
        }
    }, [enterEnabled, enterPreset])

    return (
        <div
            ref={ref}
            style={{
                ...style,
                // Ensure the wrapper doesn't add unwanted layout.
                // "contents" is ideal but breaks ref measurement, so we use
                // a block-level wrapper that passes through width/height.
                width: "100%",
                height: "100%",
                position: "relative",
                willChange: "transform, opacity, filter, clip-path",
            }}
        >
            {children}
        </div>
    )
}

// ─── Display name ────────────────────────────────────────────────────────────

TransitionTarget.displayName = "Transition Target"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(TransitionTarget, {
    children: {
        type: ControlType.ComponentInstance,
        title: "Content",
    },

    // ── Identity ─────────────────────────────────────────────────────────
    group: {
        type: ControlType.String,
        title: "Group",
        defaultValue: "default",
        description: "Group name for filtering targets (future use)",
    },

    // ── Presets ──────────────────────────────────────────────────────────
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

    // ── Participation ────────────────────────────────────────────────────
    enterEnabled: {
        type: ControlType.Boolean,
        title: "Enter",
        defaultValue: true,
        description: "Animate on page enter",
    },
    exitEnabled: {
        type: ControlType.Boolean,
        title: "Exit",
        defaultValue: true,
        description: "Animate on page exit",
    },
    mobileEnabled: {
        type: ControlType.Boolean,
        title: "Mobile",
        defaultValue: true,
        description: "Enable transitions on mobile viewports",
    },

    // ── Tuning ───────────────────────────────────────────────────────────
    sortPriority: {
        type: ControlType.Number,
        title: "Priority",
        defaultValue: 0,
        min: -10,
        max: 10,
        step: 1,
        description: "Lower = animates earlier in the stagger sequence",
    },
    delayOffset: {
        type: ControlType.Number,
        title: "Delay Offset",
        defaultValue: 0,
        min: -1,
        max: 2,
        step: 0.01,
        unit: "s",
        description: "Extra delay added to this target's stagger position",
    },
    visibilityThreshold: {
        type: ControlType.Number,
        title: "Visibility",
        defaultValue: 0.1,
        min: 0,
        max: 1,
        step: 0.05,
        description: "Fraction of element that must be in-view to animate",
    },
})
