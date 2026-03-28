// ─── Page Choreographer — Shared Types ───────────────────────────────────────

export type StaggerDirection =
    | "leftToRight"
    | "rightToLeft"
    | "topToBottom"
    | "bottomToTop"
    | "rowMajor"
    | "columnMajor"

export type ExitPreset = "riseWave" | "blurLift" | "scaleFadeGrid"

export type EnterPreset = "fadeUp" | "maskRevealX" | "maskRevealY"

export type AnimationPhase = "idle" | "entering" | "exiting" | "done"

// Use a plain object type instead of React.RefObject to avoid needing
// a React import in this utility file.
export interface TargetRef {
    current: HTMLDivElement | null
}

export interface TargetConfig {
    id: string
    ref: TargetRef
    group: string
    enterPreset: EnterPreset
    exitPreset: ExitPreset
    enterEnabled: boolean
    exitEnabled: boolean
    sortPriority: number
    delayOffset: number
    mobileEnabled: boolean
    visibilityThreshold: number
}

export interface ChoreographerConfig {
    duration: number
    stagger: number
    easing: number[]

    staggerDirection: StaggerDirection
    onlyAnimateInView: boolean

    lockInteractionsDuringExit: boolean

    distance: number
    blurAmount: number
    scaleFrom: number

    respectReducedMotion: boolean

    enterDuration: number | null
    enterEasing: number[] | null
    exitDuration: number | null
    exitEasing: number[] | null
}

// Preset keyframes use CSS property names (not framer-motion shorthand).
// These are fed directly to the Web Animations API.
export interface PresetKeyframes {
    from: Record<string, string>
    to: Record<string, string>
}

export type StoreListener = (phase: AnimationPhase) => void

export const DEFAULT_CONFIG: ChoreographerConfig = {
    duration: 0.6,
    stagger: 0.06,
    easing: [0.4, 0, 0.2, 1],

    staggerDirection: "leftToRight",
    onlyAnimateInView: true,

    lockInteractionsDuringExit: true,

    distance: 40,
    blurAmount: 8,
    scaleFrom: 0.92,

    respectReducedMotion: true,

    enterDuration: null,
    enterEasing: null,
    exitDuration: null,
    exitEasing: null,
}
