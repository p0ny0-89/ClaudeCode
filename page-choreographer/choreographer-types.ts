// ─── Page Choreographer — Shared Types ───────────────────────────────────────
// Core type definitions for the Page Choreographer transition system.

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

// ─── Target configuration ────────────────────────────────────────────────────

export interface TargetConfig {
    id: string
    ref: React.RefObject<HTMLDivElement>
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

// ─── Choreographer configuration ─────────────────────────────────────────────

export interface ChoreographerConfig {
    // Timing
    duration: number
    stagger: number
    easing: number[] // cubic-bezier [x1, y1, x2, y2]

    // Stagger
    staggerDirection: StaggerDirection
    onlyAnimateInView: boolean

    // Interaction
    lockInteractionsDuringExit: boolean

    // Motion values
    distance: number
    blurAmount: number
    scaleFrom: number

    // Accessibility
    respectReducedMotion: boolean

    // Enter-specific
    enterDuration: number | null // null = use main duration
    enterEasing: number[] | null // null = use main easing

    // Exit-specific
    exitDuration: number | null
    exitEasing: number[] | null
}

// ─── Preset keyframes ────────────────────────────────────────────────────────

export interface PresetKeyframes {
    from: Record<string, string | number>
    to: Record<string, string | number>
}

// ─── Store listener ──────────────────────────────────────────────────────────

export type StoreListener = (phase: AnimationPhase) => void

// ─── Default configuration ───────────────────────────────────────────────────

export const DEFAULT_CONFIG: ChoreographerConfig = {
    duration: 0.6,
    stagger: 0.06,
    easing: [0.4, 0, 0.2, 1], // material standard

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
