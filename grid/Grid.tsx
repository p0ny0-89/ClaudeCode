import { addPropertyControls, ControlType } from "framer"
import { motion } from "framer-motion"
import { useEffect, useMemo, useRef, useState } from "react"

type GridStyle = "solid" | "dashed" | "crosshair" | "dot"
type Direction = "top" | "bottom" | "left" | "right" | "center" | "random"
type Effect = "fade" | "draw" | "both"
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
    } = props

    const useFade = animate && (effect === "fade" || effect === "both")
    const useDraw = animate && (effect === "draw" || effect === "both")

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
    const lineTarget = animate
        ? {
              ...(useFade && { opacity: 1 }),
              ...(useDraw && { pathLength: 1 }),
          }
        : undefined
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
                                    transition={{
                                        duration,
                                        delay,
                                        ease: easing,
                                    }}
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
                                        transition={{
                                            duration,
                                            delay,
                                            ease: easing,
                                        }}
                                    />
                                ))}
                            </g>
                        )
                    })}
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
})
