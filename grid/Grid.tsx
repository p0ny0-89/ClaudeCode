import { addPropertyControls, ControlType } from "framer"
import { motion } from "framer-motion"
import { useEffect, useMemo, useRef, useState } from "react"

type GridStyle = "solid" | "dashed" | "crosshair" | "dot"
type Direction = "top" | "bottom" | "left" | "right" | "center" | "random"
type Effect = "fade" | "draw" | "both"
type MorphTo = "none" | "crosshair" | "dot"
type Easing =
    | "linear"
    | "easeIn"
    | "easeOut"
    | "easeInOut"
    | "circIn"
    | "circOut"
    | "circInOut"
    | "backIn"
    | "backOut"
    | "backInOut"
    | "anticipate"

interface Props {
    gridStyle: GridStyle
    color: string
    lineWidth: number
    gridSizeX: number
    gridSizeY: number
    crosshairSize: number
    dashLength: number
    animate: boolean
    effect: Effect
    direction: Direction
    duration: number
    stagger: number
    easing: Easing
    morphTo: MorphTo
    holdDuration: number
    morphDuration: number
    morphEasing: Easing
}

type LineItem = {
    kind: "line"
    key: string
    x1: number
    y1: number
    x2: number
    y2: number
    anchor: { x: number; y: number }
}
type PointItem = {
    kind: "point"
    key: string
    cx: number
    cy: number
}
type HalfItem = {
    kind: "half"
    key: string
    // Anchor endpoint (stays fixed during morph)
    x1: number
    y1: number
    // Initial free endpoint (cell midpoint)
    x2Initial: number
    y2Initial: number
    // Morphed free endpoint (anchor + stub, or anchor itself for dot)
    x2Morph: number
    y2Morph: number
}
type Item = LineItem | PointItem

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 400
 * @framerIntrinsicHeight 300
 */
export function Grid(props: Props) {
    const {
        gridStyle,
        color,
        lineWidth,
        gridSizeX,
        gridSizeY,
        crosshairSize,
        dashLength,
        animate,
        effect,
        direction,
        duration,
        stagger,
        easing,
        morphTo,
        holdDuration,
        morphDuration,
        morphEasing,
    } = props

    const useFade = animate && (effect === "fade" || effect === "both")
    const useDraw = animate && (effect === "draw" || effect === "both")
    const isLineGrid = gridStyle === "solid" || gridStyle === "dashed"
    const morphActive = animate && isLineGrid && morphTo !== "none"

    const ref = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({ w: 0, h: 0 })

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const update = () =>
            setSize({ w: el.offsetWidth, h: el.offsetHeight })
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const items = useMemo<Item[]>(() => {
        const { w, h } = size
        if (w === 0 || h === 0) return []
        const sx = Math.max(gridSizeX, 1)
        const sy = Math.max(gridSizeY, 1)

        if (gridStyle === "solid" || gridStyle === "dashed") {
            const out: Item[] = []
            for (let x = 0; x <= w + 0.5; x += sx) {
                out.push({
                    kind: "line",
                    key: `v-${x}`,
                    x1: x,
                    y1: 0,
                    x2: x,
                    y2: h,
                    anchor: { x, y: h / 2 },
                })
            }
            for (let y = 0; y <= h + 0.5; y += sy) {
                out.push({
                    kind: "line",
                    key: `h-${y}`,
                    x1: 0,
                    y1: y,
                    x2: w,
                    y2: y,
                    anchor: { x: w / 2, y },
                })
            }
            return out
        }

        const out: Item[] = []
        for (let y = 0; y <= h + 0.5; y += sy) {
            for (let x = 0; x <= w + 0.5; x += sx) {
                out.push({
                    kind: "point",
                    key: `p-${x}-${y}`,
                    cx: x,
                    cy: y,
                })
            }
        }
        return out
    }, [size, gridStyle, gridSizeX, gridSizeY])

    const randomOrder = useMemo(() => {
        const n = items.length
        const arr = Array.from({ length: n }, (_, i) => i)
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
        return arr
    }, [items, direction])

    const total = items.length
    const totalSpread = stagger * Math.max(total - 1, 1)

    // Intersection points used by the dot-morph layer.
    const morphPoints = useMemo<PointItem[]>(() => {
        if (!morphActive || morphTo !== "dot") return []
        const { w, h } = size
        if (w === 0 || h === 0) return []
        const sx = Math.max(gridSizeX, 1)
        const sy = Math.max(gridSizeY, 1)
        const out: PointItem[] = []
        for (let y = 0; y <= h + 0.5; y += sy) {
            for (let x = 0; x <= w + 0.5; x += sx) {
                out.push({ kind: "point", key: `m-${x}-${y}`, cx: x, cy: y })
            }
        }
        return out
    }, [morphActive, morphTo, size, gridSizeX, gridSizeY])

    // Half segments — two per cell along each axis, anchored to intersections.
    // Hidden during entry (full lines do the drawing); shown at morph moment
    // and animate their free endpoints inward to form the target shape.
    const halves = useMemo<HalfItem[]>(() => {
        if (!morphActive) return []
        const { w, h } = size
        if (w === 0 || h === 0) return []
        const sx = Math.max(gridSizeX, 1)
        const sy = Math.max(gridSizeY, 1)
        const stubH =
            morphTo === "crosshair"
                ? Math.min(crosshairSize / 2, sx / 2)
                : 0
        const stubV =
            morphTo === "crosshair"
                ? Math.min(crosshairSize / 2, sy / 2)
                : 0

        const xs: number[] = []
        for (let x = 0; x <= w + 0.5; x += sx) xs.push(x)
        const ys: number[] = []
        for (let y = 0; y <= h + 0.5; y += sy) ys.push(y)

        const out: HalfItem[] = []

        // Horizontal halves (along each y row)
        for (const y of ys) {
            for (let i = 0; i < xs.length - 1; i++) {
                const xL = xs[i]
                const xR = xs[i + 1]
                const xMid = (xL + xR) / 2
                out.push({
                    kind: "half",
                    key: `hr-${i}-${y}`,
                    x1: xL,
                    y1: y,
                    x2Initial: xMid,
                    y2Initial: y,
                    x2Morph: xL + stubH,
                    y2Morph: y,
                })
                out.push({
                    kind: "half",
                    key: `hl-${i}-${y}`,
                    x1: xR,
                    y1: y,
                    x2Initial: xMid,
                    y2Initial: y,
                    x2Morph: xR - stubH,
                    y2Morph: y,
                })
            }
        }

        // Vertical halves (along each x column)
        for (const x of xs) {
            for (let i = 0; i < ys.length - 1; i++) {
                const yT = ys[i]
                const yB = ys[i + 1]
                const yMid = (yT + yB) / 2
                out.push({
                    kind: "half",
                    key: `vd-${x}-${i}`,
                    x1: x,
                    y1: yT,
                    x2Initial: x,
                    y2Initial: yMid,
                    x2Morph: x,
                    y2Morph: yT + stubV,
                })
                out.push({
                    kind: "half",
                    key: `vu-${x}-${i}`,
                    x1: x,
                    y1: yB,
                    x2Initial: x,
                    y2Initial: yMid,
                    x2Morph: x,
                    y2Morph: yB - stubV,
                })
            }
        }

        return out
    }, [morphActive, morphTo, size, gridSizeX, gridSizeY, crosshairSize])

    // Phase machine: enter -> morphed (after entry + hold).
    const [phase, setPhase] = useState<"enter" | "morphed">("enter")
    const entryEnd = duration + totalSpread
    useEffect(() => {
        setPhase("enter")
        if (!morphActive) return
        const delayMs = (entryEnd + holdDuration) * 1000
        const t = setTimeout(() => setPhase("morphed"), delayMs)
        return () => clearTimeout(t)
    }, [
        morphActive,
        morphTo,
        entryEnd,
        holdDuration,
        gridStyle,
        gridSizeX,
        gridSizeY,
        size.w,
        size.h,
        animate,
    ])

    const delayFor = (
        anchor: { x: number; y: number },
        index: number
    ): number => {
        if (!animate) return 0
        const { w, h } = size
        let t = 0
        switch (direction) {
            case "top":
                t = h ? anchor.y / h : 0
                break
            case "bottom":
                t = h ? 1 - anchor.y / h : 0
                break
            case "left":
                t = w ? anchor.x / w : 0
                break
            case "right":
                t = w ? 1 - anchor.x / w : 0
                break
            case "center": {
                const dx = anchor.x - w / 2
                const dy = anchor.y - h / 2
                const d = Math.sqrt(dx * dx + dy * dy)
                const max = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2)
                t = max ? d / max : 0
                break
            }
            case "random":
                t =
                    randomOrder[index] !== undefined
                        ? randomOrder[index] / Math.max(total - 1, 1)
                        : 0
                break
        }
        return t * totalSpread
    }

    const lineInitial = animate
        ? {
              ...(useFade && { opacity: 0 }),
              ...(useDraw && { pathLength: 0 }),
          }
        : false
    const lineEntered = animate
        ? {
              ...(useFade && { opacity: 1 }),
              ...(useDraw && { pathLength: 1 }),
          }
        : undefined
    // When the grid morphs, lines fade out (keep pathLength 1 so they don't redraw).
    const lineMorphed = {
        opacity: 0,
        ...(useDraw && { pathLength: 1 }),
    }
    const lineTarget =
        morphActive && phase === "morphed" ? lineMorphed : lineEntered

    const dotInitial = animate
        ? {
              ...(useFade && { opacity: 0 }),
              ...(useDraw && { scale: 0 }),
          }
        : false
    const dotTarget = animate
        ? {
              ...(useFade && { opacity: 1 }),
              ...(useDraw && { scale: 1 }),
          }
        : undefined

    // Dot-marker layer (only used when morphTo === "dot"). Markers fade + scale
    // in over the same morph window while halves retract to length 0.
    const markerInitial = { opacity: 0, scale: 0 }
    const markerTarget =
        phase === "morphed" ? { opacity: 1, scale: 1 } : markerInitial
    const dotMorphTransition = {
        duration: morphDuration,
        ease: morphEasing,
    }
    // Lines snap out the moment morph begins; halves take over instantly at
    // full extent and animate their endpoints inward.
    const lineMorphTransition = { opacity: { duration: 0 } }
    const halfTransition = {
        opacity: { duration: 0 },
        x2: { duration: morphDuration, ease: morphEasing },
        y2: { duration: morphDuration, ease: morphEasing },
    }

    return (
        <div
            ref={ref}
            style={{
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                overflow: "hidden",
            }}
        >
            {size.w > 0 && size.h > 0 && (
                <svg
                    width={size.w}
                    height={size.h}
                    style={{ display: "block" }}
                >
                    {items.map((item, i) => {
                        if (item.kind === "line") {
                            const delay = delayFor(item.anchor, i)
                            const isVertical = item.x1 === item.x2
                            // Flip line origin so draw direction follows the chosen direction
                            let { x1, y1, x2, y2 } = item
                            if (useDraw) {
                                if (
                                    isVertical &&
                                    direction === "bottom"
                                ) {
                                    ;[y1, y2] = [y2, y1]
                                } else if (
                                    !isVertical &&
                                    direction === "right"
                                ) {
                                    ;[x1, x2] = [x2, x1]
                                }
                            }
                            return (
                                <motion.line
                                    key={item.key}
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke={color}
                                    strokeWidth={lineWidth}
                                    strokeDasharray={
                                        gridStyle === "dashed" && !useDraw
                                            ? `${dashLength} ${dashLength}`
                                            : undefined
                                    }
                                    initial={lineInitial}
                                    animate={lineTarget}
                                    transition={
                                        phase === "morphed"
                                            ? lineMorphTransition
                                            : {
                                                  duration,
                                                  delay,
                                                  ease: easing,
                                              }
                                    }
                                />
                            )
                        }

                        const delay = delayFor(
                            { x: item.cx, y: item.cy },
                            i
                        )

                        if (gridStyle === "dot") {
                            return (
                                <motion.circle
                                    key={item.key}
                                    cx={item.cx}
                                    cy={item.cy}
                                    r={lineWidth}
                                    fill={color}
                                    initial={dotInitial}
                                    animate={dotTarget}
                                    transition={{
                                        duration,
                                        delay,
                                        ease: easing,
                                    }}
                                />
                            )
                        }

                        // Crosshair: render 4 arms originating from the center
                        // so pathLength draws each arm outward from the intersection.
                        const s = crosshairSize / 2
                        const arms: [number, number, number, number][] = [
                            [item.cx, item.cy, item.cx - s, item.cy],
                            [item.cx, item.cy, item.cx + s, item.cy],
                            [item.cx, item.cy, item.cx, item.cy - s],
                            [item.cx, item.cy, item.cx, item.cy + s],
                        ]
                        return (
                            <g key={item.key}>
                                {arms.map(([ax1, ay1, ax2, ay2], a) => (
                                    <motion.line
                                        key={a}
                                        x1={ax1}
                                        y1={ay1}
                                        x2={ax2}
                                        y2={ay2}
                                        stroke={color}
                                        strokeWidth={lineWidth}
                                        initial={lineInitial}
                                        animate={lineTarget}
                                        transition={
                                            phase === "morphed"
                                                ? lineMorphTransition
                                                : {
                                                      duration,
                                                      delay,
                                                      ease: easing,
                                                  }
                                        }
                                    />
                                ))}
                            </g>
                        )
                    })}

                    {/* Halves: hidden during entry, take over at morph
                        moment and retract their free endpoints inward.
                        For crosshair morph they leave stubs at intersections
                        (forming the crosshair). For dot morph they retract to
                        zero length while the dot markers below fade in. */}
                    {morphActive &&
                        halves.map((half) => (
                            <motion.line
                                key={half.key}
                                x1={half.x1}
                                y1={half.y1}
                                stroke={color}
                                strokeWidth={lineWidth}
                                initial={{
                                    x2: half.x2Initial,
                                    y2: half.y2Initial,
                                    opacity: 0,
                                }}
                                animate={
                                    phase === "morphed"
                                        ? {
                                              x2: half.x2Morph,
                                              y2: half.y2Morph,
                                              opacity: 1,
                                          }
                                        : {
                                              x2: half.x2Initial,
                                              y2: half.y2Initial,
                                              opacity: 0,
                                          }
                                }
                                transition={halfTransition}
                            />
                        ))}

                    {/* Dot markers (only for dot morph). Fade + scale in as
                        halves retract to nothing. */}
                    {morphActive &&
                        morphTo === "dot" &&
                        morphPoints.map((p) => (
                            <motion.circle
                                key={p.key}
                                cx={p.cx}
                                cy={p.cy}
                                r={lineWidth}
                                fill={color}
                                initial={markerInitial}
                                animate={markerTarget}
                                transition={dotMorphTransition}
                                style={{
                                    transformBox: "fill-box",
                                    transformOrigin: "center",
                                }}
                            />
                        ))}
                </svg>
            )}
        </div>
    )
}

Grid.defaultProps = {
    gridStyle: "solid",
    color: "#000000",
    lineWidth: 1,
    gridSizeX: 40,
    gridSizeY: 40,
    crosshairSize: 8,
    dashLength: 4,
    animate: true,
    effect: "fade",
    direction: "top",
    duration: 0.6,
    stagger: 0.02,
    easing: "easeOut",
    morphTo: "none",
    holdDuration: 1.5,
    morphDuration: 0.6,
    morphEasing: "easeInOut",
}

addPropertyControls(Grid, {
    gridStyle: {
        type: ControlType.Enum,
        title: "Style",
        options: ["solid", "dashed", "crosshair", "dot"],
        optionTitles: ["Solid Line", "Dashed Line", "Crosshair", "Dot"],
        defaultValue: "solid",
    },
    color: {
        type: ControlType.Color,
        title: "Color",
        defaultValue: "#000000",
    },
    lineWidth: {
        type: ControlType.Number,
        title: "Width",
        defaultValue: 1,
        min: 0.5,
        max: 10,
        step: 0.5,
        displayStepper: true,
    },
    gridSizeX: {
        type: ControlType.Number,
        title: "Grid X",
        defaultValue: 40,
        min: 4,
        max: 500,
        step: 1,
        unit: "px",
    },
    gridSizeY: {
        type: ControlType.Number,
        title: "Grid Y",
        defaultValue: 40,
        min: 4,
        max: 500,
        step: 1,
        unit: "px",
    },
    crosshairSize: {
        type: ControlType.Number,
        title: "Crosshair",
        defaultValue: 8,
        min: 2,
        max: 100,
        step: 1,
        unit: "px",
        hidden: (p: Props) => p.gridStyle !== "crosshair",
    },
    dashLength: {
        type: ControlType.Number,
        title: "Dash",
        defaultValue: 4,
        min: 1,
        max: 40,
        step: 1,
        unit: "px",
        hidden: (p: Props) => p.gridStyle !== "dashed",
    },
    animate: {
        type: ControlType.Boolean,
        title: "Animate In",
        defaultValue: true,
    },
    effect: {
        type: ControlType.Enum,
        title: "Effect",
        options: ["fade", "draw", "both"],
        optionTitles: ["Fade", "Draw", "Fade + Draw"],
        defaultValue: "fade",
        hidden: (p: Props) => !p.animate,
    },
    direction: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["top", "bottom", "left", "right", "center", "random"],
        optionTitles: [
            "From Top",
            "From Bottom",
            "From Left",
            "From Right",
            "From Center",
            "Random",
        ],
        defaultValue: "top",
        hidden: (p: Props) => !p.animate,
    },
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0.6,
        min: 0,
        max: 5,
        step: 0.05,
        unit: "s",
        hidden: (p: Props) => !p.animate,
    },
    stagger: {
        type: ControlType.Number,
        title: "Stagger",
        defaultValue: 0.02,
        min: 0,
        max: 0.2,
        step: 0.005,
        unit: "s",
        hidden: (p: Props) => !p.animate,
    },
    easing: {
        type: ControlType.Enum,
        title: "Easing",
        options: [
            "linear",
            "easeIn",
            "easeOut",
            "easeInOut",
            "circIn",
            "circOut",
            "circInOut",
            "backIn",
            "backOut",
            "backInOut",
            "anticipate",
        ],
        defaultValue: "easeOut",
        hidden: (p: Props) => !p.animate,
    },
    morphTo: {
        type: ControlType.Enum,
        title: "Morph To",
        options: ["none", "crosshair", "dot"],
        optionTitles: ["None", "Crosshair", "Dot"],
        defaultValue: "none",
        hidden: (p: Props) =>
            !p.animate ||
            (p.gridStyle !== "solid" && p.gridStyle !== "dashed"),
    },
    holdDuration: {
        type: ControlType.Number,
        title: "Hold",
        defaultValue: 1.5,
        min: 0,
        max: 10,
        step: 0.1,
        unit: "s",
        hidden: (p: Props) =>
            !p.animate ||
            p.morphTo === "none" ||
            (p.gridStyle !== "solid" && p.gridStyle !== "dashed"),
    },
    morphDuration: {
        type: ControlType.Number,
        title: "Morph Dur.",
        defaultValue: 0.6,
        min: 0,
        max: 5,
        step: 0.05,
        unit: "s",
        hidden: (p: Props) =>
            !p.animate ||
            p.morphTo === "none" ||
            (p.gridStyle !== "solid" && p.gridStyle !== "dashed"),
    },
    morphEasing: {
        type: ControlType.Enum,
        title: "Morph Ease",
        options: [
            "linear",
            "easeIn",
            "easeOut",
            "easeInOut",
            "circIn",
            "circOut",
            "circInOut",
            "backIn",
            "backOut",
            "backInOut",
            "anticipate",
        ],
        defaultValue: "easeInOut",
        hidden: (p: Props) =>
            !p.animate ||
            p.morphTo === "none" ||
            (p.gridStyle !== "solid" && p.gridStyle !== "dashed"),
    },
})
