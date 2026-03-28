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

// ─── Stable ID counter ──────────────────────────────────────────────────────

var idCounter = 0

function useStableId() {
    var ref = React.useRef("")
    if (ref.current === "") {
        idCounter += 1
        ref.current = "target-" + idCounter
    }
    return ref.current
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransitionTarget(props: any) {
    var {
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

    var ref = React.useRef<HTMLDivElement>(null)
    var id = useStableId()

    // Register with store
    React.useEffect(function () {
        var store = getStore()
        if (!store) return

        store.registerTarget({
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
            var s = getStore()
            if (s) s.unregisterTarget(id)
        }
    }, [
        id, group, enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority,
        delayOffset, mobileEnabled, visibilityThreshold,
    ])

    // Set initial hidden state for enter animations
    React.useEffect(function () {
        if (!enterEnabled || !ref.current) return

        var store = getStore()
        if (!store) return

        var cfg = store.getConfig()
        var kf = store.getEnterKeyframes(enterPreset, cfg)

        var el = ref.current
        for (var k in kf.from) {
            if (kf.from.hasOwnProperty(k)) {
                ;(el.style as any)[k] = kf.from[k]
            }
        }
    }, [enterEnabled, enterPreset])

    return (
        <div ref={ref} style={style}>
            {children}
        </div>
    )
}

TransitionTarget.displayName = "Transition Target"

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
