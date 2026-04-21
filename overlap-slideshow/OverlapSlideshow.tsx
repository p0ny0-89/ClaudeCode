import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { motion } from "framer-motion"

/**
 * OverlapSlideshow
 *
 * A slideshow where the active card is centered and adjacent cards
 * overlap + scale down in steps. Each card slot takes two component
 * instances: an Idle variant (shown when not focused) and an Active
 * variant (shown when focused) — the two crossfade on focus change.
 *
 * To use:
 * 1. In Framer, create a Code File and paste this whole file in.
 * 2. Drop the component on your canvas.
 * 3. In the property panel, add your cards to "Idle Cards" and their
 *    matching active versions to "Active Cards" in the SAME order.
 *
 * Notes:
 * - Idle Cards and Active Cards are matched by index. Missing Active
 *   entries are tolerated (the Idle variant stays visible when active).
 * - Size each card visually by setting Card Width / Card Height in the
 *   property panel — cards render inside a fixed-size frame.
 */

type Direction = "horizontal" | "vertical"

interface Props {
    cards?: React.ReactNode[]
    activeCards?: React.ReactNode[]
    direction?: Direction
    cardWidth?: number
    cardHeight?: number
    overlap?: number
    scaleStep?: number
    visibleNeighbors?: number
    transitionDuration?: number
    initialIndex?: number
    infinite?: boolean
    autoPlay?: boolean
    autoPlayDelay?: number
    pauseOnHover?: boolean
    scrollDriven?: boolean
    scrollThreshold?: number
    style?: React.CSSProperties
}

export default function OverlapSlideshow(props: Props) {
    const {
        cards = [],
        activeCards = [],
        direction = "horizontal",
        cardWidth = 400,
        cardHeight = 300,
        overlap = 80,
        scaleStep = 0.85,
        visibleNeighbors = 2,
        transitionDuration = 0.4,
        initialIndex = 0,
        infinite = false,
        autoPlay = false,
        autoPlayDelay = 3,
        pauseOnHover = true,
        scrollDriven = false,
        scrollThreshold = 120,
        style,
    } = props

    const count = cards.length
    const isHorizontal = direction === "horizontal"

    const [activeIndex, setActiveIndex] = useState(
        Math.min(Math.max(0, initialIndex), Math.max(0, count - 1))
    )
    const [hasAdvanced, setHasAdvanced] = useState(false)
    const [isHovered, setIsHovered] = useState(false)

    const containerRef = useRef<HTMLDivElement | null>(null)
    const scrollAccumRef = useRef(0)
    const wheelCooldownRef = useRef(0)

    // Keep active index valid when count or initial index changes
    useEffect(() => {
        if (count === 0) return
        setActiveIndex((prev) => Math.min(Math.max(0, prev), count - 1))
    }, [count])

    useEffect(() => {
        if (count === 0) return
        setActiveIndex(Math.min(Math.max(0, initialIndex), count - 1))
        setHasAdvanced(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialIndex])

    const goTo = useCallback(
        (nextIndex: number) => {
            if (count === 0) return
            setActiveIndex((prev) => {
                let clamped: number
                if (infinite) {
                    clamped = ((nextIndex % count) + count) % count
                } else {
                    clamped = Math.min(Math.max(0, nextIndex), count - 1)
                }
                if (clamped !== prev) setHasAdvanced(true)
                return clamped
            })
        },
        [count, infinite]
    )

    // Auto-play
    useEffect(() => {
        if (!autoPlay || count < 2) return
        if (pauseOnHover && isHovered) return
        // Disable auto-play while editing on the canvas
        if (RenderTarget.current() === RenderTarget.canvas) return

        const id = window.setInterval(() => {
            setActiveIndex((prev) => {
                const nextIdx = prev + 1
                if (infinite) {
                    setHasAdvanced(true)
                    return ((nextIdx % count) + count) % count
                }
                if (nextIdx >= count) return prev
                setHasAdvanced(true)
                return nextIdx
            })
        }, Math.max(200, autoPlayDelay * 1000))

        return () => window.clearInterval(id)
    }, [autoPlay, autoPlayDelay, count, infinite, isHovered, pauseOnHover])

    // Scroll-driven navigation
    useEffect(() => {
        if (!scrollDriven) return
        const el = containerRef.current
        if (!el) return

        const handleWheel = (e: WheelEvent) => {
            const primary = isHorizontal
                ? Math.abs(e.deltaX) > Math.abs(e.deltaY)
                    ? e.deltaX
                    : e.deltaY
                : e.deltaY
            if (primary === 0) return

            e.preventDefault()

            const now = performance.now()
            if (now - wheelCooldownRef.current < transitionDuration * 1000) {
                return
            }

            scrollAccumRef.current += primary
            if (Math.abs(scrollAccumRef.current) >= scrollThreshold) {
                const step = scrollAccumRef.current > 0 ? 1 : -1
                scrollAccumRef.current = 0
                wheelCooldownRef.current = now
                setActiveIndex((prev) => {
                    const nextIdx = prev + step
                    if (infinite) {
                        setHasAdvanced(true)
                        return ((nextIdx % count) + count) % count
                    }
                    if (nextIdx < 0 || nextIdx >= count) return prev
                    setHasAdvanced(true)
                    return nextIdx
                })
            }
        }

        el.addEventListener("wheel", handleWheel, { passive: false })
        return () => el.removeEventListener("wheel", handleWheel)
    }, [
        scrollDriven,
        scrollThreshold,
        isHorizontal,
        count,
        infinite,
        transitionDuration,
    ])

    // Empty state
    if (count === 0) {
        return (
            <div
                style={{
                    ...style,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8a8a8a",
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    fontSize: 13,
                    background: "rgba(127,127,127,0.06)",
                    border: "1px dashed rgba(127,127,127,0.35)",
                    borderRadius: 8,
                    padding: 16,
                    textAlign: "center",
                    boxSizing: "border-box",
                }}
            >
                Add cards to the "Idle Cards" and "Active Cards" arrays
                in the property panel.
            </div>
        )
    }

    const getOffset = (i: number) => {
        let offset = i - activeIndex
        if (infinite && hasAdvanced && count > 1) {
            const half = count / 2
            if (offset > half) offset -= count
            else if (offset < -half) offset += count
        }
        return offset
    }

    // Stride so the *first* neighbor overlaps the active card by exactly
    // `overlap` pixels edge-to-edge. Cards beyond ±1 use the same stride
    // (visually fine; they're already small and partially hidden).
    const strideH = cardWidth / 2 - overlap + (cardWidth * scaleStep) / 2
    const strideV = cardHeight / 2 - overlap + (cardHeight * scaleStep) / 2

    return (
        <div
            ref={containerRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                ...style,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: 0,
                    height: 0,
                }}
            >
                {cards.map((card, i) => {
                    const offset = getOffset(i)
                    const absOffset = Math.abs(offset)

                    if (absOffset > visibleNeighbors) return null

                    const scale = Math.pow(scaleStep, absOffset)
                    const x = isHorizontal ? offset * strideH : 0
                    const y = isHorizontal ? 0 : offset * strideV
                    const isActive = offset === 0
                    const activeCard = activeCards[i]

                    return (
                        <motion.div
                            key={i}
                            onClick={() => {
                                if (!isActive) goTo(i)
                            }}
                            initial={false}
                            animate={{
                                x,
                                y,
                                scale,
                                zIndex: 1000 - absOffset,
                            }}
                            transition={{
                                duration: transitionDuration,
                                ease: [0.32, 0.72, 0, 1],
                            }}
                            style={{
                                position: "absolute",
                                width: cardWidth,
                                height: cardHeight,
                                left: -cardWidth / 2,
                                top: -cardHeight / 2,
                                cursor: isActive ? "default" : "pointer",
                                willChange: "transform",
                            }}
                        >
                            {/* Idle layer */}
                            <motion.div
                                animate={{ opacity: isActive ? 0 : 1 }}
                                transition={{
                                    duration: transitionDuration,
                                }}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    width: "100%",
                                    height: "100%",
                                    pointerEvents: isActive
                                        ? "none"
                                        : "auto",
                                }}
                            >
                                {card}
                            </motion.div>

                            {/* Active layer (crossfades in when focused) */}
                            {activeCard ? (
                                <motion.div
                                    animate={{ opacity: isActive ? 1 : 0 }}
                                    transition={{
                                        duration: transitionDuration,
                                    }}
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        width: "100%",
                                        height: "100%",
                                        pointerEvents: isActive
                                            ? "auto"
                                            : "none",
                                    }}
                                >
                                    {activeCard}
                                </motion.div>
                            ) : null}
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}

OverlapSlideshow.displayName = "Overlap Slideshow"

addPropertyControls(OverlapSlideshow, {
    cards: {
        type: ControlType.Array,
        title: "Idle Cards",
        control: { type: ControlType.ComponentInstance },
    },
    activeCards: {
        type: ControlType.Array,
        title: "Active Cards",
        description:
            "Matched to Idle Cards by order. Shown while that card is focused.",
        control: { type: ControlType.ComponentInstance },
    },
    direction: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["horizontal", "vertical"],
        optionTitles: ["Horizontal", "Vertical"],
        defaultValue: "horizontal",
        displaySegmentedControl: true,
    },
    cardWidth: {
        type: ControlType.Number,
        title: "Card Width",
        defaultValue: 400,
        min: 40,
        max: 4000,
        step: 10,
        unit: "px",
    },
    cardHeight: {
        type: ControlType.Number,
        title: "Card Height",
        defaultValue: 300,
        min: 40,
        max: 4000,
        step: 10,
        unit: "px",
    },
    overlap: {
        type: ControlType.Number,
        title: "Overlap",
        description: "Pixels the active card overlaps its neighbors.",
        defaultValue: 80,
        min: 0,
        max: 1000,
        step: 1,
        unit: "px",
    },
    scaleStep: {
        type: ControlType.Number,
        title: "Scale Step",
        description: "Scale multiplier per step from active (0.85 = 85%).",
        defaultValue: 0.85,
        min: 0.3,
        max: 1,
        step: 0.01,
    },
    visibleNeighbors: {
        type: ControlType.Number,
        title: "Visible Neighbors",
        description: "How many cards to render on each side of active.",
        defaultValue: 2,
        min: 1,
        max: 6,
        step: 1,
        displayStepper: true,
    },
    transitionDuration: {
        type: ControlType.Number,
        title: "Transition",
        defaultValue: 0.4,
        min: 0.05,
        max: 2,
        step: 0.05,
        unit: "s",
    },
    initialIndex: {
        type: ControlType.Number,
        title: "Start Index",
        defaultValue: 0,
        min: 0,
        max: 99,
        step: 1,
    },
    infinite: {
        type: ControlType.Boolean,
        title: "Infinite Loop",
        description:
            "Wrap around once you've advanced past the start. The first neighbor slot before card 1 is empty until then.",
        defaultValue: false,
    },
    autoPlay: {
        type: ControlType.Boolean,
        title: "Auto Play",
        defaultValue: false,
    },
    autoPlayDelay: {
        type: ControlType.Number,
        title: "Pause Duration",
        defaultValue: 3,
        min: 0.5,
        max: 60,
        step: 0.5,
        unit: "s",
        hidden: (p: Props) => !p.autoPlay,
    },
    pauseOnHover: {
        type: ControlType.Boolean,
        title: "Pause on Hover",
        defaultValue: true,
        hidden: (p: Props) => !p.autoPlay,
    },
    scrollDriven: {
        type: ControlType.Boolean,
        title: "Scroll Driven",
        description:
            "Wheel / trackpad scroll over the component advances cards.",
        defaultValue: false,
    },
    scrollThreshold: {
        type: ControlType.Number,
        title: "Scroll Distance",
        description: "Pixels of wheel delta to trigger the next card.",
        defaultValue: 120,
        min: 20,
        max: 2000,
        step: 10,
        unit: "px",
        hidden: (p: Props) => !p.scrollDriven,
    },
})
