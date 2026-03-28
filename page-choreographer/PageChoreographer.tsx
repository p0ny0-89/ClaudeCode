import * as React from "react"
import { addPropertyControls, ControlType } from "framer"
import { choreographerStore } from "./choreographer_store"

// ─── Easing presets ──────────────────────────────────────────────────────────

const EASING_MAP: Record<string, number[]> = {
    smooth: [0.4, 0, 0.2, 1],
    snappy: [0.16, 1, 0.3, 1],
    dramatic: [0.76, 0, 0.24, 1],
    gentle: [0.25, 0.1, 0.25, 1],
    linear: [0, 0, 1, 1],
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PageChoreographer(props: any) {
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

    const hasPlayed = React.useRef(false)

    // Push config to store whenever props change
    React.useEffect(() => {
        const easing = EASING_MAP[easingPreset] || EASING_MAP.smooth

        choreographerStore.updateConfig({
            duration: duration,
            stagger: stagger,
            easing: easing,
            staggerDirection: staggerDirection,
            onlyAnimateInView: onlyAnimateInView,
            distance: distance,
            blurAmount: blurAmount,
            scaleFrom: scaleFrom,
            lockInteractionsDuringExit: lockInteractionsDuringExit,
            respectReducedMotion: respectReducedMotion,
        })
    }, [
        duration, stagger, easingPreset, staggerDirection,
        onlyAnimateInView, distance, blurAmount, scaleFrom,
        lockInteractionsDuringExit, respectReducedMotion,
    ])

    // Auto-play enter on mount
    React.useEffect(() => {
        if (!autoPlayEnter || hasPlayed.current) return
        hasPlayed.current = true

        // Two rAF frames ensures targets have registered
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var delayMs = enterDelay * 1000
                if (delayMs > 0) {
                    setTimeout(function () {
                        choreographerStore.playEnter()
                    }, delayMs)
                } else {
                    choreographerStore.playEnter()
                }
            })
        })

        return function () {
            choreographerStore.cancelActive()
        }
    }, [])

    // Reset on unmount
    React.useEffect(function () {
        return function () {
            choreographerStore.reset()
        }
    }, [])

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

PageChoreographer.displayName = "Page Choreographer"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(PageChoreographer, {
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0.6,
        min: 0.1,
        max: 3,
        step: 0.05,
        unit: "s",
    },
    stagger: {
        type: ControlType.Number,
        title: "Stagger",
        defaultValue: 0.06,
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "s",
    },
    easingPreset: {
        type: ControlType.Enum,
        title: "Easing",
        defaultValue: "smooth",
        options: ["smooth", "snappy", "dramatic", "gentle", "linear"],
        optionTitles: ["Smooth", "Snappy", "Dramatic", "Gentle", "Linear"],
    },
    staggerDirection: {
        type: ControlType.Enum,
        title: "Stagger Order",
        defaultValue: "leftToRight",
        options: [
            "leftToRight", "rightToLeft", "topToBottom",
            "bottomToTop", "rowMajor", "columnMajor",
        ],
        optionTitles: [
            "Left → Right", "Right → Left", "Top → Bottom",
            "Bottom → Top", "Row Major", "Column Major",
        ],
    },
    onlyAnimateInView: {
        type: ControlType.Boolean,
        title: "In-View Only",
        defaultValue: true,
    },
    distance: {
        type: ControlType.Number,
        title: "Distance",
        defaultValue: 40,
        min: 0,
        max: 200,
        step: 5,
        unit: "px",
    },
    blurAmount: {
        type: ControlType.Number,
        title: "Blur Amount",
        defaultValue: 8,
        min: 0,
        max: 30,
        step: 1,
        unit: "px",
    },
    scaleFrom: {
        type: ControlType.Number,
        title: "Scale From",
        defaultValue: 0.92,
        min: 0.5,
        max: 1.5,
        step: 0.01,
    },
    lockInteractionsDuringExit: {
        type: ControlType.Boolean,
        title: "Lock During Exit",
        defaultValue: true,
    },
    respectReducedMotion: {
        type: ControlType.Boolean,
        title: "Reduced Motion",
        defaultValue: true,
    },
    autoPlayEnter: {
        type: ControlType.Boolean,
        title: "Auto Enter",
        defaultValue: true,
    },
    enterDelay: {
        type: ControlType.Number,
        title: "Enter Delay",
        defaultValue: 0.05,
        min: 0,
        max: 2,
        step: 0.05,
        unit: "s",
    },
})
