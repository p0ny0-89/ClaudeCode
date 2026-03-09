// SliceDisplace — Framer Code Component
// A horizontal/vertical slice displacement effect wrapper.
// Duplicates children into N clipped bands, each offset independently
// on hover or auto-play to produce a clean "poster typography" distortion.

import { addPropertyControls, ControlType } from "framer"
import {
    useState,
    useEffect,
    useMemo,
    useRef,
    type CSSProperties,
    type ReactNode,
} from "react"

// ---------------------------------------------------------------------------
// Seeded pseudo-random number generator (mulberry32)
// Produces a deterministic sequence so the motion pattern stays stable
// across re-renders and feels "designed" rather than arbitrary.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
    let s = seed | 0
    return () => {
        s = (s + 0x6d2b79f5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ---------------------------------------------------------------------------
// Offset calculator
// Produces an array of per-slice displacement values (in px).
// Blends a deterministic wave pattern with seeded randomness.
// Center slices get the strongest displacement (sin-curve bias).
// ---------------------------------------------------------------------------
function calculateSliceOffsets(
    count: number,
    intensity: number,
    randomness: number,
    directionMode: "mixed" | "left" | "right",
    seed: number
): number[] {
    if (count <= 0) return []
    const rng = mulberry32(seed)

    return Array.from({ length: count }, (_, i) => {
        // Normalised position (0 → 1)
        const t = count > 1 ? i / (count - 1) : 0.5

        // Center-bias envelope: peaks at 1 in the middle, 0 at edges
        const centerBias = Math.sin(t * Math.PI)

        // Deterministic wave component — alternates direction per slice
        const waveSign = i % 2 === 0 ? 1 : -1
        const waveOffset = centerBias * intensity * waveSign

        // Seeded random component
        const randomValue = (rng() - 0.5) * 2
        const randomOffset = randomValue * intensity * centerBias

        // Blend wave and random according to the randomness dial
        let offset =
            waveOffset * (1 - randomness) + randomOffset * randomness

        // Constrain direction
        if (directionMode === "left") {
            offset = -Math.abs(offset)
        } else if (directionMode === "right") {
            offset = Math.abs(offset)
        }
        // "mixed" keeps the natural alternating / random pattern

        return offset
    })
}

// ---------------------------------------------------------------------------
// Touch-device detection helper
// ---------------------------------------------------------------------------
function isTouchDevice(): boolean {
    if (typeof window === "undefined") return false
    return "ontouchstart" in window || navigator.maxTouchPoints > 0
}

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------
interface SliceDisplaceProps {
    children?: ReactNode
    triggerMode?: "hover" | "auto" | "hoverAndAuto"
    intensity?: number
    slices?: number
    sliceDirection?: "horizontal" | "vertical"
    duration?: number
    loop?: boolean
    loopDelay?: number
    stagger?: number
    randomness?: number
    directionMode?: "mixed" | "left" | "right"
    scaleOnActive?: number
    skewOnActive?: number
    edgeFeather?: number
    overflowSafe?: boolean
    disablePointerEventsOnSlices?: boolean
    autoPlayOnMobile?: boolean
    style?: CSSProperties
}

// ---------------------------------------------------------------------------
// Easing curves
// ---------------------------------------------------------------------------
const EASE_ACTIVATE = "cubic-bezier(0.22, 1, 0.36, 1)" // smooth ease-out
const EASE_SETTLE = "cubic-bezier(0.25, 1.12, 0.5, 1)" // slight overshoot settle

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function SliceDisplace(props: SliceDisplaceProps) {
    const {
        children,
        triggerMode = "hover",
        intensity: rawIntensity = 40,
        slices: rawSlices = 8,
        sliceDirection = "horizontal",
        duration: rawDuration = 600,
        loop = true,
        loopDelay: rawLoopDelay = 1200,
        stagger: rawStagger = 30,
        randomness: rawRandomness = 0.3,
        directionMode = "mixed",
        scaleOnActive = 1,
        skewOnActive = 0,
        edgeFeather: rawEdgeFeather = 0,
        overflowSafe = true,
        disablePointerEventsOnSlices = false,
        autoPlayOnMobile = true,
        style,
    } = props

    // Clamp / sanitise inputs
    const sliceCount = Math.max(1, Math.min(50, Math.round(rawSlices)))
    const intensity = Math.max(0, rawIntensity)
    const duration = Math.max(50, rawDuration)
    const loopDelay = Math.max(0, rawLoopDelay)
    const stagger = Math.max(0, rawStagger)
    const randomness = Math.max(0, Math.min(1, rawRandomness))
    const edgeFeather = Math.max(0, Math.min(50, rawEdgeFeather))

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    const [isHovered, setIsHovered] = useState(false)
    const [autoActive, setAutoActive] = useState(false)
    const mountedRef = useRef(true)

    // Stable seed — generated once per component instance so the offset
    // pattern is deterministic but unique per usage on the page.
    const seed = useMemo(
        () => Math.floor(Math.random() * 100000),
        []
    )

    // Pre-calculate per-slice displacement values
    const offsets = useMemo(
        () =>
            calculateSliceOffsets(
                sliceCount,
                intensity,
                randomness,
                directionMode,
                seed
            ),
        [sliceCount, intensity, randomness, directionMode, seed]
    )

    // -----------------------------------------------------------------------
    // Determine whether auto-play should run
    // -----------------------------------------------------------------------
    const shouldAutoPlay = useMemo(() => {
        if (triggerMode === "auto") return true
        if (triggerMode === "hoverAndAuto") return true
        // Fallback: promote hover-only to auto on touch devices
        if (
            triggerMode === "hover" &&
            autoPlayOnMobile &&
            isTouchDevice()
        )
            return true
        return false
    }, [triggerMode, autoPlayOnMobile])

    // -----------------------------------------------------------------------
    // Auto-play cycling effect
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!shouldAutoPlay || !loop) {
            // If auto but not looping, fire once then stop
            if (shouldAutoPlay && !loop) {
                const id = window.setTimeout(() => {
                    if (mountedRef.current) setAutoActive(true)
                }, 300)
                return () => window.clearTimeout(id)
            }
            setAutoActive(false)
            return
        }

        let cancelled = false
        let timeoutId: number

        const cycle = () => {
            if (cancelled) return

            // Activate slices
            setAutoActive(true)

            // Total time for all slices to finish animating in
            const activateTime = duration + stagger * sliceCount

            // Hold displaced state briefly (30% of duration)
            const holdTime = duration * 0.3

            timeoutId = window.setTimeout(() => {
                if (cancelled) return
                // Deactivate — triggers the settle animation
                setAutoActive(false)

                // Wait for settle animation + loop delay before next cycle
                const settleTime = duration * 1.2
                timeoutId = window.setTimeout(() => {
                    if (cancelled) return
                    cycle()
                }, settleTime + loopDelay)
            }, activateTime + holdTime)
        }

        // Kick off after a short initial pause
        timeoutId = window.setTimeout(cycle, 400)

        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
        }
    }, [shouldAutoPlay, loop, loopDelay, duration, stagger, sliceCount])

    // Cleanup mounted ref
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    // -----------------------------------------------------------------------
    // Activation level (0 → idle, 1 → full effect)
    // -----------------------------------------------------------------------
    let activationLevel = 0

    if (triggerMode === "hover") {
        activationLevel = isHovered ? 1 : 0
        // Promote to auto on touch
        if (autoPlayOnMobile && isTouchDevice()) {
            activationLevel = autoActive ? 1 : 0
        }
    } else if (triggerMode === "auto") {
        activationLevel = autoActive ? 1 : 0
    } else if (triggerMode === "hoverAndAuto") {
        // Hover overrides auto; auto runs at reduced intensity
        activationLevel = isHovered ? 1 : autoActive ? 0.35 : 0
    }

    // Is the effect currently "settling back" to idle?
    const isSettling = activationLevel === 0

    // -----------------------------------------------------------------------
    // Container style
    // -----------------------------------------------------------------------
    const containerStyle: CSSProperties = {
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: overflowSafe ? "hidden" : "visible",
        ...style,
        // Override overflow if overflowSafe is explicitly set
        ...(overflowSafe ? { overflow: "hidden" } : {}),
    }

    // Edge feather — gradient mask on the container perimeter
    if (edgeFeather > 0) {
        const dir =
            sliceDirection === "horizontal" ? "to bottom" : "to right"
        const mask = `linear-gradient(${dir}, transparent, black ${edgeFeather}%, black ${100 - edgeFeather}%, transparent)`
        containerStyle.WebkitMaskImage = mask
        containerStyle.maskImage = mask
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    // Early-out: if there are no children, render an empty container
    if (!children) {
        return <div style={containerStyle} />
    }

    // If only 1 slice, render children directly (no effect)
    if (sliceCount === 1) {
        return <div style={containerStyle}>{children}</div>
    }

    return (
        <div
            style={containerStyle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {Array.from({ length: sliceCount }, (_, i) => {
                // --- Clip-path calculation ---
                const bandPercent = 100 / sliceCount
                const start = i * bandPercent
                const end = (i + 1) * bandPercent

                // Extend each edge by 0.5px to prevent subpixel seams
                // between adjacent slices. First/last edges stay flush.
                const extendTop = i > 0 ? "0.5px" : "0px"
                const extendBottom =
                    i < sliceCount - 1 ? "0.5px" : "0px"

                let clipPath: string
                if (sliceDirection === "horizontal") {
                    // inset(top right bottom left)
                    clipPath = `inset(calc(${start}% - ${extendTop}) 0% calc(${100 - end}% - ${extendBottom}) 0%)`
                } else {
                    // Vertical bands: inset left/right instead
                    clipPath = `inset(0% calc(${100 - end}% - ${extendBottom}) 0% calc(${start}% - ${extendTop}))`
                }

                // --- Displacement ---
                const displacement = offsets[i] * activationLevel
                const scaleVal =
                    1 + (scaleOnActive - 1) * activationLevel
                const skewVal = skewOnActive * activationLevel

                let transform: string
                if (sliceDirection === "horizontal") {
                    transform = `translate3d(${displacement}px, 0, 0)`
                    if (scaleVal !== 1) transform += ` scale(${scaleVal})`
                    if (skewVal !== 0)
                        transform += ` skewX(${skewVal}deg)`
                } else {
                    transform = `translate3d(0, ${displacement}px, 0)`
                    if (scaleVal !== 1) transform += ` scale(${scaleVal})`
                    if (skewVal !== 0)
                        transform += ` skewY(${skewVal}deg)`
                }

                // --- Subtle per-slice opacity variation ---
                // More displaced slices get slightly darker — max 7% reduction
                const opacityDrop =
                    intensity > 0
                        ? (Math.abs(offsets[i]) / intensity) *
                          0.07 *
                          activationLevel
                        : 0
                const opacity = 1 - opacityDrop

                // --- Transition timing ---
                const delay = stagger * i
                const easing = isSettling ? EASE_SETTLE : EASE_ACTIVATE
                const dur = isSettling
                    ? duration * 1.15
                    : duration

                const sliceStyle: CSSProperties = {
                    // First slice is relative to establish intrinsic size;
                    // all others overlay it absolutely.
                    position: i === 0 ? "relative" : "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    clipPath,
                    WebkitClipPath: clipPath,
                    transform,
                    opacity,
                    transition: [
                        `transform ${dur}ms ${easing} ${delay}ms`,
                        `opacity ${dur}ms ease ${delay}ms`,
                    ].join(", "),
                    willChange: "transform",
                    // clip-path clips the pointer-event hit area as well,
                    // so each slice only captures events within its visible
                    // band region. This preserves interactivity when idle.
                    pointerEvents: disablePointerEventsOnSlices
                        ? "none"
                        : "auto",
                }

                return (
                    <div key={i} style={sliceStyle}>
                        {children}
                    </div>
                )
            })}
        </div>
    )
}

// Default frame size on the Framer canvas
SliceDisplace.defaultProps = {
    width: 400,
    height: 300,
}

// ---------------------------------------------------------------------------
// Framer property controls
// ---------------------------------------------------------------------------
addPropertyControls(SliceDisplace, {
    children: {
        type: ControlType.ComponentInstance,
        title: "Content",
    },

    // --- Trigger ---
    triggerMode: {
        type: ControlType.Enum,
        title: "Trigger",
        options: ["hover", "auto", "hoverAndAuto"],
        optionTitles: ["Hover", "Auto", "Hover + Auto"],
        defaultValue: "hover",
    },

    // --- Geometry ---
    slices: {
        type: ControlType.Number,
        title: "Slices",
        defaultValue: 8,
        min: 2,
        max: 40,
        step: 1,
    },
    sliceDirection: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["horizontal", "vertical"],
        optionTitles: ["Horizontal", "Vertical"],
        defaultValue: "horizontal",
    },

    // --- Displacement ---
    intensity: {
        type: ControlType.Number,
        title: "Intensity",
        defaultValue: 40,
        min: 0,
        max: 300,
        step: 1,
        unit: "px",
    },
    directionMode: {
        type: ControlType.Enum,
        title: "Offset Dir",
        options: ["mixed", "left", "right"],
        optionTitles: ["Mixed", "Left / Up", "Right / Down"],
        defaultValue: "mixed",
    },
    randomness: {
        type: ControlType.Number,
        title: "Randomness",
        defaultValue: 0.3,
        min: 0,
        max: 1,
        step: 0.05,
    },

    // --- Timing ---
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 600,
        min: 50,
        max: 3000,
        step: 50,
        unit: "ms",
    },
    stagger: {
        type: ControlType.Number,
        title: "Stagger",
        defaultValue: 30,
        min: 0,
        max: 200,
        step: 5,
        unit: "ms",
    },

    // --- Loop ---
    loop: {
        type: ControlType.Boolean,
        title: "Loop",
        defaultValue: true,
        hidden: (props) => props.triggerMode === "hover",
    },
    loopDelay: {
        type: ControlType.Number,
        title: "Loop Delay",
        defaultValue: 1200,
        min: 0,
        max: 5000,
        step: 100,
        unit: "ms",
        hidden: (props) =>
            props.triggerMode === "hover" || props.loop === false,
    },

    // --- Transform extras ---
    scaleOnActive: {
        type: ControlType.Number,
        title: "Scale",
        defaultValue: 1,
        min: 0.9,
        max: 1.15,
        step: 0.005,
    },
    skewOnActive: {
        type: ControlType.Number,
        title: "Skew",
        defaultValue: 0,
        min: -10,
        max: 10,
        step: 0.5,
        unit: "°",
    },

    // --- Visual polish ---
    edgeFeather: {
        type: ControlType.Number,
        title: "Edge Feather",
        defaultValue: 0,
        min: 0,
        max: 30,
        step: 1,
        unit: "%",
    },

    // --- Behaviour flags ---
    overflowSafe: {
        type: ControlType.Boolean,
        title: "Clip Overflow",
        defaultValue: true,
    },
    disablePointerEventsOnSlices: {
        type: ControlType.Boolean,
        title: "Disable Pointer",
        defaultValue: false,
        description:
            "Disable pointer events on the sliced layers so content behind remains interactive.",
    },
    autoPlayOnMobile: {
        type: ControlType.Boolean,
        title: "Auto on Mobile",
        defaultValue: true,
        hidden: (props) => props.triggerMode !== "hover",
        description:
            "Automatically play the effect on touch devices where hover is unavailable.",
    },
})
