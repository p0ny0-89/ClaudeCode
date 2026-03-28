// ─── Page Choreographer — Main Orchestrator ──────────────────────────────────
// Place one PageChoreographer component per page (or on a shared layout).
// It configures shared transition settings and triggers enter animations on
// mount. Renders as an invisible element — no visual footprint.

import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"
import { choreographerStore } from "./choreographer-store"
import type { StaggerDirection, ChoreographerConfig } from "./choreographer-types"

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
    // Timing
    duration: number
    stagger: number
    easingPreset: "smooth" | "snappy" | "dramatic" | "gentle" | "linear"

    // Stagger
    staggerDirection: StaggerDirection
    onlyAnimateInView: boolean

    // Motion values
    distance: number
    blurAmount: number
    scaleFrom: number

    // Behavior
    lockInteractionsDuringExit: boolean
    respectReducedMotion: boolean
    autoPlayEnter: boolean
    enterDelay: number

    // Canvas indicator
    style: React.CSSProperties
}

// ─── Easing presets (cubic-bezier) ───────────────────────────────────────────

const EASING_MAP: Record<string, number[]> = {
    smooth: [0.4, 0, 0.2, 1],       // Material standard
    snappy: [0.16, 1, 0.3, 1],      // Framer-style overshoot feel
    dramatic: [0.76, 0, 0.24, 1],   // Strong ease-in-out
    gentle: [0.25, 0.1, 0.25, 1],   // Subtle, classic
    linear: [0, 0, 1, 1],
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PageChoreographer(props: Props) {
    const {
        duration = 0.6,
        stagger = 0.06,
        easingPreset = "smooth",
        staggerDirection = "leftToRight",
        onlyAnimateInView = true,
        distance = 40,
        blurAmount = 8,
        scaleFrom = 0.92,
        lockInteractionsDuringExit = true,
        respectReducedMotion = true,
        autoPlayEnter = true,
        enterDelay = 0.05,
        style,
    } = props

    const hasPlayed = useRef(false)

    // Push config to the singleton store whenever props change
    useEffect(() => {
        const easing = EASING_MAP[easingPreset] ?? EASING_MAP.smooth

        const config: Partial<ChoreographerConfig> = {
            duration,
            stagger,
            easing,
            staggerDirection,
            onlyAnimateInView,
            distance,
            blurAmount,
            scaleFrom,
            lockInteractionsDuringExit,
            respectReducedMotion,
        }

        choreographerStore.updateConfig(config)
    }, [
        duration,
        stagger,
        easingPreset,
        staggerDirection,
        onlyAnimateInView,
        distance,
        blurAmount,
        scaleFrom,
        lockInteractionsDuringExit,
        respectReducedMotion,
    ])

    // Auto-play enter on mount
    useEffect(() => {
        if (!autoPlayEnter || hasPlayed.current) return
        hasPlayed.current = true

        // Small delay ensures all TransitionTargets have registered.
        // Two rAF frames + configurable delay covers React commit + layout.
        const scheduleEnter = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const delayMs = enterDelay * 1000
                    if (delayMs > 0) {
                        setTimeout(() => choreographerStore.playEnter(), delayMs)
                    } else {
                        choreographerStore.playEnter()
                    }
                })
            })
        }

        scheduleEnter()

        return () => {
            choreographerStore.cancelActive()
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            choreographerStore.reset()
        }
    }, [])

    // Invisible in production — shows a label on the Framer canvas
    return (
        <div
            style={{
                ...style,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                minHeight: 40,
                pointerEvents: "none",
                userSelect: "none",
            }}
        >
            <div
                style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px dashed rgba(99, 102, 241, 0.3)",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "rgba(99, 102, 241, 0.6)",
                    fontFamily: "Inter, system-ui, sans-serif",
                    letterSpacing: "0.02em",
                }}
            >
                Page Choreographer
            </div>
        </div>
    )
}

// ─── Display name ────────────────────────────────────────────────────────────

PageChoreographer.displayName = "Page Choreographer"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(PageChoreographer, {
    // ── Timing ───────────────────────────────────────────────────────────
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0.6,
        min: 0.1,
        max: 3,
        step: 0.05,
        unit: "s",
        description: "Base animation duration for each element",
    },
    stagger: {
        type: ControlType.Number,
        title: "Stagger",
        defaultValue: 0.06,
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "s",
        description: "Delay between each element in the sequence",
    },
    easingPreset: {
        type: ControlType.Enum,
        title: "Easing",
        defaultValue: "smooth",
        options: ["smooth", "snappy", "dramatic", "gentle", "linear"],
        optionTitles: ["Smooth", "Snappy", "Dramatic", "Gentle", "Linear"],
    },

    // ── Stagger ──────────────────────────────────────────────────────────
    staggerDirection: {
        type: ControlType.Enum,
        title: "Stagger Order",
        defaultValue: "leftToRight",
        options: [
            "leftToRight",
            "rightToLeft",
            "topToBottom",
            "bottomToTop",
            "rowMajor",
            "columnMajor",
        ],
        optionTitles: [
            "Left → Right",
            "Right → Left",
            "Top → Bottom",
            "Bottom → Top",
            "Row Major",
            "Column Major",
        ],
    },
    onlyAnimateInView: {
        type: ControlType.Boolean,
        title: "In-View Only",
        defaultValue: true,
        description: "Only animate elements visible in the viewport",
    },

    // ── Motion Values ────────────────────────────────────────────────────
    distance: {
        type: ControlType.Number,
        title: "Distance",
        defaultValue: 40,
        min: 0,
        max: 200,
        step: 5,
        unit: "px",
        description: "Translate distance for movement-based presets",
    },
    blurAmount: {
        type: ControlType.Number,
        title: "Blur Amount",
        defaultValue: 8,
        min: 0,
        max: 30,
        step: 1,
        unit: "px",
        description: "Blur intensity for Blur Lift preset",
    },
    scaleFrom: {
        type: ControlType.Number,
        title: "Scale From",
        defaultValue: 0.92,
        min: 0.5,
        max: 1.5,
        step: 0.01,
        description: "Scale value for Scale Fade Grid preset",
    },

    // ── Behavior ─────────────────────────────────────────────────────────
    lockInteractionsDuringExit: {
        type: ControlType.Boolean,
        title: "Lock During Exit",
        defaultValue: true,
        description: "Prevent clicks while exit animation plays",
    },
    respectReducedMotion: {
        type: ControlType.Boolean,
        title: "Reduced Motion",
        defaultValue: true,
        description: "Honor prefers-reduced-motion accessibility setting",
    },
    autoPlayEnter: {
        type: ControlType.Boolean,
        title: "Auto Enter",
        defaultValue: true,
        description: "Automatically play enter animations on page load",
    },
    enterDelay: {
        type: ControlType.Number,
        title: "Enter Delay",
        defaultValue: 0.05,
        min: 0,
        max: 2,
        step: 0.05,
        unit: "s",
        description: "Wait before starting enter sequence",
    },
})
