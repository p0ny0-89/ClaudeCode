import * as React from "react"
import { addPropertyControls, ControlType } from "framer"
import { choreographerStore } from "./choreographer_store"
import { resolveEnterPreset } from "./choreographer_presets"

// ─── Stable ID counter (avoids React.useId which needs React 18+) ───────────

let idCounter = 0

function useStableId(): string {
    const ref = React.useRef("")
    if (ref.current === "") {
        idCounter += 1
        ref.current = "choreographer-target-" + idCounter
    }
    return ref.current
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionTarget(props: any) {
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

    const ref = React.useRef<HTMLDivElement>(null)
    const id = useStableId()

    // Register with store
    React.useEffect(function () {
        choreographerStore.registerTarget({
            id: id,
            ref: ref,
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

        return function () {
            choreographerStore.unregisterTarget(id)
        }
    }, [
        id, group, enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority,
        delayOffset, mobileEnabled, visibilityThreshold,
    ])

    // Set initial hidden state for enter animations
    React.useEffect(function () {
        if (!enterEnabled || !ref.current) return

        var el = ref.current
        var config = choreographerStore.getConfig()
        var preset = resolveEnterPreset(enterPreset, config)

        for (var key in preset.from) {
            if (preset.from.hasOwnProperty(key)) {
                ;(el.style as any)[key] = preset.from[key]
            }
        }
    }, [enterEnabled, enterPreset])

    return (
        <div
            ref={ref}
            style={{
                ...style,
                width: "100%",
                height: "100%",
                position: "relative",
            }}
        >
            {children}
        </div>
    )
}

TransitionTarget.displayName = "Transition Target"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(TransitionTarget, {
    children: {
        type: ControlType.ComponentInstance,
        title: "Content",
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
