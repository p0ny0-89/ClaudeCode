import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import {
    motion,
    animate,
    useMotionValue,
    useTransform,
    useVelocity,
    useSpring,
    useDragControls,
    type MotionValue,
} from "framer-motion"

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

type EntranceMode =
    | "none"
    | "stackCenter"
    | "thumbnailRow"
    | "fadeInPlace"
    | "dealFromEdge"

type EntranceTrigger = "onMount" | "layerInView" | "sectionInView"

interface CardPose {
    x: number
    y: number
    scale: number
    opacity: number
}

function getEntrancePose(
    mode: EntranceMode,
    offset: number,
    cardWidth: number,
    cardHeight: number,
    isHorizontal: boolean,
    finalPose: { x: number; y: number; scale: number }
): CardPose {
    switch (mode) {
        case "stackCenter":
            return { x: 0, y: 0, scale: 0.6, opacity: 0 }
        case "thumbnailRow": {
            const thumbScale = 0.35
            const thumbStride = isHorizontal
                ? cardWidth * thumbScale + 16
                : cardHeight * thumbScale + 16
            return {
                x: isHorizontal ? offset * thumbStride : 0,
                y: isHorizontal ? 0 : offset * thumbStride,
                scale: thumbScale,
                opacity: 1,
            }
        }
        case "fadeInPlace":
            return { ...finalPose, opacity: 0 }
        case "dealFromEdge":
            return {
                x: isHorizontal ? -2000 : finalPose.x,
                y: isHorizontal ? finalPose.y : -2000,
                scale: finalPose.scale * 0.9,
                opacity: 0,
            }
        case "none":
        default:
            return { ...finalPose, opacity: 1 }
    }
}

// Compute the center-position of a card at |offset| steps from active,
// walking outward while keeping `overlap` pixels of edge-to-edge overlap
// between every adjacent pair. A fixed stride is correct only for ±1;
// beyond that, each card's scaled half-width changes, so we accumulate.
function computeCardCenter(
    absOffset: number,
    cardSize: number,
    overlap: number,
    scaleStep: number
): number {
    if (absOffset === 0) return 0
    let pos = cardSize / 2 // start at the active card's outward edge
    for (let k = 1; k <= absOffset; k++) {
        pos -= overlap
        const halfScaled = (cardSize * Math.pow(scaleStep, k)) / 2
        pos += halfScaled // reach this card's center
        if (k < absOffset) {
            pos += halfScaled // continue to its outward edge for the next hop
        }
    }
    return pos
}

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
    enableDrag?: boolean
    dragThreshold?: number
    dragElastic?: number
    entranceMode?: EntranceMode
    entranceTrigger?: EntranceTrigger
    entranceDuration?: number
    entranceDelay?: number
    preEntranceMode?: EntranceMode
    preEntranceDuration?: number
    stagger?: boolean
    staggerDelay?: number
    parallaxStrength?: number
    clipCards?: boolean
    // Native-Framer event triggers. Each fires when that card becomes
    // the active one. Wire them to Set Variable actions in Framer's
    // Interactions panel to drive a variable that your native text
    // component binds its variant to.
    onActivateCard1?: () => void
    onActivateCard2?: () => void
    onActivateCard3?: () => void
    onActivateCard4?: () => void
    onActivateCard5?: () => void
    onActivateCard6?: () => void
    onActivateCard7?: () => void
    onActivateCard8?: () => void
    onActivateCard9?: () => void
    onActivateCard10?: () => void
    onActivateCard11?: () => void
    onActivateCard12?: () => void
    // Fired when the mouse enters / leaves the currently-active
    // (focused) card. Wire to Set Variable in Framer's Interactions
    // panel to drive a cursor variant, a hover text, etc.
    onActiveCardHoverStart?: () => void
    onActiveCardHoverEnd?: () => void
    style?: React.CSSProperties
}

// ────────────────────────────────────────────────────────────────────
// CardItem — renders one card. Each card owns motion values for its
// x/y/scale/opacity so the inner content layer can read them via
// useTransform and translate in the opposite direction by
// parallaxStrength. It also reads the stage drag motion values so the
// parallax applies during user drag as well as during tween-based
// index changes (click, wheel, auto-play).
// ────────────────────────────────────────────────────────────────────

interface CardItemProps {
    idleContent: React.ReactNode
    activeContent: React.ReactNode | undefined
    isActive: boolean
    zIndex: number
    cardWidth: number
    cardHeight: number
    transitionDuration: number
    parallaxStrength: number
    clipCards: boolean
    stageDragX: MotionValue<number>
    stageDragY: MotionValue<number>
    onSelect: () => void
    onActiveHoverStart: () => void
    onActiveHoverEnd: () => void
    finalPose: CardPose
    preEntrancePose: CardPose
    mainEntrancePose: CardPose
    entranceMode: EntranceMode
    isMultiStage: boolean
    hasEntered: boolean
    isEntering: boolean
    entranceDuration: number
    preEntranceDuration: number
    cardStaggerDelay: number
}

function CardItem(props: CardItemProps) {
    const {
        idleContent,
        activeContent,
        isActive,
        zIndex,
        cardWidth,
        cardHeight,
        transitionDuration,
        parallaxStrength,
        clipCards,
        stageDragX,
        stageDragY,
        onSelect,
        onActiveHoverStart,
        onActiveHoverEnd,
        finalPose,
        preEntrancePose,
        mainEntrancePose,
        entranceMode,
        isMultiStage,
        hasEntered,
        isEntering,
        entranceDuration,
        preEntranceDuration,
        cardStaggerDelay,
    } = props

    // Seed motion values with the initial pose. For entranceMode=none
    // we start directly at the final pose.
    const initialPose: CardPose =
        entranceMode === "none" ? finalPose : preEntrancePose

    const xMV = useMotionValue(initialPose.x)
    const yMV = useMotionValue(initialPose.y)
    const scaleMV = useMotionValue(initialPose.scale)
    const outerOpacityMV = useMotionValue(initialPose.opacity)
    // Ramp parallax in after the entrance finishes so the inner layer
    // doesn't get yanked around during a dramatic entrance pose change.
    const parallaxGate = useMotionValue(
        isEntering ? 0 : parallaxStrength
    )

    useEffect(() => {
        const ease: [number, number, number, number] = [
            0.32, 0.72, 0, 1,
        ]

        if (!hasEntered) {
            xMV.set(preEntrancePose.x)
            yMV.set(preEntrancePose.y)
            scaleMV.set(preEntrancePose.scale)
            outerOpacityMV.set(preEntrancePose.opacity)
            return
        }

        if (isEntering && isMultiStage) {
            const total = preEntranceDuration + entranceDuration
            const times = [
                0,
                preEntranceDuration / total,
                1,
            ]
            const common = {
                duration: total,
                times,
                ease,
                delay: cardStaggerDelay,
            }
            const ctrl = [
                animate(
                    xMV,
                    [
                        preEntrancePose.x,
                        mainEntrancePose.x,
                        finalPose.x,
                    ],
                    common
                ),
                animate(
                    yMV,
                    [
                        preEntrancePose.y,
                        mainEntrancePose.y,
                        finalPose.y,
                    ],
                    common
                ),
                animate(
                    scaleMV,
                    [
                        preEntrancePose.scale,
                        mainEntrancePose.scale,
                        finalPose.scale,
                    ],
                    common
                ),
                animate(
                    outerOpacityMV,
                    [
                        preEntrancePose.opacity,
                        mainEntrancePose.opacity,
                        1,
                    ],
                    common
                ),
            ]
            return () => ctrl.forEach((c) => c.stop())
        }

        if (isEntering) {
            const common = {
                duration: entranceDuration,
                ease,
                delay: cardStaggerDelay,
            }
            const ctrl = [
                animate(xMV, finalPose.x, common),
                animate(yMV, finalPose.y, common),
                animate(scaleMV, finalPose.scale, common),
                animate(outerOpacityMV, 1, common),
            ]
            return () => ctrl.forEach((c) => c.stop())
        }

        const common = { duration: transitionDuration, ease }
        const ctrl = [
            animate(xMV, finalPose.x, common),
            animate(yMV, finalPose.y, common),
            animate(scaleMV, finalPose.scale, common),
            animate(outerOpacityMV, 1, common),
        ]
        return () => ctrl.forEach((c) => c.stop())
    }, [
        hasEntered,
        isEntering,
        isMultiStage,
        finalPose.x,
        finalPose.y,
        finalPose.scale,
        preEntrancePose.x,
        preEntrancePose.y,
        preEntrancePose.scale,
        preEntrancePose.opacity,
        mainEntrancePose.x,
        mainEntrancePose.y,
        mainEntrancePose.scale,
        mainEntrancePose.opacity,
        entranceDuration,
        preEntranceDuration,
        transitionDuration,
        cardStaggerDelay,
        xMV,
        yMV,
        scaleMV,
        outerOpacityMV,
    ])

    // Ease the parallax gate to avoid popping when isEntering flips.
    useEffect(() => {
        const target = isEntering ? 0 : parallaxStrength
        const ctrl = animate(parallaxGate, target, {
            duration: 0.3,
            ease: [0.32, 0.72, 0, 1],
        })
        return () => ctrl.stop()
    }, [isEntering, parallaxStrength, parallaxGate])

    // Velocity-based parallax. Inner content offsets opposite to the
    // card's apparent motion speed — from its own tween (click / wheel /
    // auto-play) AND from the stage's drag. Always settles to 0 at rest,
    // so non-active cards don't look permanently shifted.
    const apparentX = useTransform<number, number>(
        [xMV, stageDragX],
        ([x, d]) => x + d
    )
    const apparentY = useTransform<number, number>(
        [yMV, stageDragY],
        ([y, d]) => y + d
    )
    const xVelocity = useVelocity(apparentX)
    const yVelocity = useVelocity(apparentY)
    const smoothXVel = useSpring(xVelocity, {
        damping: 50,
        stiffness: 500,
    })
    const smoothYVel = useSpring(yVelocity, {
        damping: 50,
        stiffness: 500,
    })
    // Scale factor: parallaxStrength is expressed in the UI as a 0–100
    // dial; multiply velocity (px/s) by 0.0004 * strength to keep the
    // per-frame offset visually subtle. At strength 20 and a moderate
    // 800 px/s transition, this yields ~6.4 px of lag.
    const innerX = useTransform<number, number>(
        [smoothXVel, parallaxGate],
        ([v, g]) => -v * g * 0.0004
    )
    const innerY = useTransform<number, number>(
        [smoothYVel, parallaxGate],
        ([v, g]) => -v * g * 0.0004
    )
    // Only overscale when we're also clipping — otherwise the
    // overscaled content would just visibly bleed past the card edge
    // even at rest.
    const shouldClip = parallaxStrength > 0 && clipCards
    const parallaxOverscale = shouldClip ? 1.05 : 1

    // Hover tracking — only fire the slideshow's hover events while the
    // mouse is over THIS card AND this card is the active one. We use
    // a ref + effect so a mid-hover isActive flip still fires start/end
    // correctly (e.g. scrolling cards under a stationary cursor).
    const [hovered, setHovered] = useState(false)
    const wasActiveHoverRef = useRef(false)
    useEffect(() => {
        const nowActiveHover = isActive && hovered
        if (nowActiveHover && !wasActiveHoverRef.current) {
            onActiveHoverStart()
            wasActiveHoverRef.current = true
        } else if (!nowActiveHover && wasActiveHoverRef.current) {
            onActiveHoverEnd()
            wasActiveHoverRef.current = false
        }
    }, [isActive, hovered, onActiveHoverStart, onActiveHoverEnd])

    return (
        <motion.div
            onClick={() => {
                if (!isActive) onSelect()
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                position: "absolute",
                width: cardWidth,
                height: cardHeight,
                left: -cardWidth / 2,
                top: -cardHeight / 2,
                cursor: isActive ? "default" : "pointer",
                willChange: "transform",
                x: xMV,
                y: yMV,
                scale: scaleMV,
                opacity: outerOpacityMV,
                zIndex,
                overflow: shouldClip ? "hidden" : undefined,
            }}
        >
            {/* Idle layer. Non-active cards deliberately block pointer
                events so inner links/buttons don't fire on the click
                that's meant to bring the card into focus. The outer
                motion.div's onClick handles the focus. */}
            <motion.div
                className="overlap-slideshow-card-fill"
                animate={{ opacity: isActive ? 0 : 1 }}
                transition={{ duration: transitionDuration }}
                style={{
                    position: "absolute",
                    inset: 0,
                    x: innerX,
                    y: innerY,
                    scale: parallaxOverscale,
                    pointerEvents: isActive ? "auto" : "none",
                }}
            >
                {idleContent}
            </motion.div>

            {/* Active layer (crossfades in when focused) */}
            {activeContent ? (
                <motion.div
                    className="overlap-slideshow-card-fill"
                    animate={{ opacity: isActive ? 1 : 0 }}
                    transition={{ duration: transitionDuration }}
                    style={{
                        position: "absolute",
                        inset: 0,
                        x: innerX,
                        y: innerY,
                        scale: parallaxOverscale,
                        pointerEvents: isActive ? "auto" : "none",
                    }}
                >
                    {activeContent}
                </motion.div>
            ) : null}
        </motion.div>
    )
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
        enableDrag = true,
        dragThreshold = 80,
        dragElastic = 0.3,
        entranceMode = "none",
        entranceTrigger = "onMount",
        entranceDuration = 0.7,
        entranceDelay = 0.1,
        preEntranceMode = "none",
        preEntranceDuration = 0.5,
        stagger = true,
        staggerDelay = 0.08,
        parallaxStrength = 0,
        clipCards = false,
        onActivateCard1,
        onActivateCard2,
        onActivateCard3,
        onActivateCard4,
        onActivateCard5,
        onActivateCard6,
        onActivateCard7,
        onActivateCard8,
        onActivateCard9,
        onActivateCard10,
        onActivateCard11,
        onActivateCard12,
        onActiveCardHoverStart,
        onActiveCardHoverEnd,
        style,
    } = props

    // Keep hover handlers in a ref so CardItem's hover effect doesn't
    // re-run on every identity change of the callback prop.
    const hoverHandlersRef = useRef({
        start: onActiveCardHoverStart,
        end: onActiveCardHoverEnd,
    })
    hoverHandlersRef.current = {
        start: onActiveCardHoverStart,
        end: onActiveCardHoverEnd,
    }
    const handleActiveHoverStart = useCallback(() => {
        hoverHandlersRef.current.start?.()
    }, [])
    const handleActiveHoverEnd = useCallback(() => {
        hoverHandlersRef.current.end?.()
    }, [])

    const activateHandlers = [
        onActivateCard1,
        onActivateCard2,
        onActivateCard3,
        onActivateCard4,
        onActivateCard5,
        onActivateCard6,
        onActivateCard7,
        onActivateCard8,
        onActivateCard9,
        onActivateCard10,
        onActivateCard11,
        onActivateCard12,
    ]
    const activateHandlersRef = useRef(activateHandlers)
    activateHandlersRef.current = activateHandlers

    const count = cards.length
    const isHorizontal = direction === "horizontal"

    const [activeIndex, setActiveIndex] = useState(
        Math.min(Math.max(0, initialIndex), Math.max(0, count - 1))
    )
    // Becomes true the first time the active index actually wraps
    // around (from count-1 to 0, or 0 to count-1). Before that, offset
    // math is literal — no last-card-shows-before-first illusion.
    const [hasWrapped, setHasWrapped] = useState(false)
    const [isHovered, setIsHovered] = useState(false)

    const [hasEntered, setHasEntered] = useState(
        entranceMode === "none"
    )
    const [isEntering, setIsEntering] = useState(
        entranceMode !== "none"
    )

    const containerRef = useRef<HTMLDivElement | null>(null)
    const scrollAccumRef = useRef(0)
    const wheelCooldownRef = useRef(0)

    // Drag motion values on the stage wrapper — passed to each CardItem
    // so its inner content layer can parallax-lag against the drag.
    const stageDragX = useMotionValue(0)
    const stageDragY = useMotionValue(0)
    // Imperative drag controls so we can start drag from a bubbled
    // pointerdown on any child (instead of relying on framer-motion's
    // auto-listener, which some setups don't fire for mouse input).
    const dragControls = useDragControls()

    // Inject (once per document) a CSS rule that forces the linked
    // component inside each card slot to fill its frame. Without this
    // the component keeps its intrinsic design size, so Card Width /
    // Card Height would only move cards around, not resize them.
    useEffect(() => {
        if (typeof document === "undefined") return
        const styleId = "overlap-slideshow-card-fill-v1"
        if (document.getElementById(styleId)) return
        const styleEl = document.createElement("style")
        styleEl.id = styleId
        styleEl.textContent = `
            .overlap-slideshow-card-fill > * {
                width: 100% !important;
                height: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
            }
        `
        document.head.appendChild(styleEl)
    }, [])

    // Entrance animation — fire based on entranceTrigger, then set
    // hasEntered so cards animate from entrancePose → finalPose.
    useEffect(() => {
        if (entranceMode === "none") {
            setHasEntered(true)
            setIsEntering(false)
            return
        }
        setHasEntered(false)
        setIsEntering(true)

        let cancelled = false
        let timer: number | undefined
        const fire = () => {
            if (cancelled) return
            timer = window.setTimeout(() => {
                if (!cancelled) setHasEntered(true)
            }, Math.max(0, entranceDelay * 1000))
        }

        if (entranceTrigger === "onMount") {
            fire()
            return () => {
                cancelled = true
                if (timer) window.clearTimeout(timer)
            }
        }

        let targetEl: Element | null = containerRef.current
        if (entranceTrigger === "sectionInView" && containerRef.current) {
            let walk: HTMLElement | null = containerRef.current.parentElement
            while (walk && walk !== document.body) {
                if (
                    walk.tagName === "SECTION" ||
                    walk.classList.contains("framer-section") ||
                    walk.dataset?.framerName
                ) {
                    targetEl = walk
                    break
                }
                walk = walk.parentElement
            }
        }

        if (!targetEl || typeof IntersectionObserver === "undefined") {
            fire()
            return () => {
                cancelled = true
                if (timer) window.clearTimeout(timer)
            }
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    fire()
                    observer.disconnect()
                }
            },
            { threshold: 0.15 }
        )
        observer.observe(targetEl)

        return () => {
            cancelled = true
            if (timer) window.clearTimeout(timer)
            observer.disconnect()
        }
    }, [entranceMode, entranceTrigger, entranceDelay])

    // Once the entrance has started, clear the "isEntering" flag after
    // the entrance finishes so future index changes use the normal
    // transitionDuration (not entranceDuration + stagger).
    useEffect(() => {
        if (!hasEntered || !isEntering) return
        const isMultiStage =
            entranceMode !== "none" && preEntranceMode !== "none"
        const sequenceDuration = isMultiStage
            ? preEntranceDuration + entranceDuration
            : entranceDuration
        const maxStagger = stagger ? staggerDelay * visibleNeighbors : 0
        const totalMs =
            (sequenceDuration + maxStagger + 0.1) * 1000
        const t = window.setTimeout(() => setIsEntering(false), totalMs)
        return () => window.clearTimeout(t)
    }, [
        hasEntered,
        isEntering,
        entranceMode,
        preEntranceMode,
        entranceDuration,
        preEntranceDuration,
        stagger,
        staggerDelay,
        visibleNeighbors,
    ])

    // Fire the matching "Activate Card N" event so Framer's native
    // Interactions panel can respond (e.g. Set Variable → switch a
    // native text component's variant).
    useEffect(() => {
        const handler = activateHandlersRef.current[activeIndex]
        if (handler) handler()
    }, [activeIndex])

    // Keep active index valid when count or initial index changes
    useEffect(() => {
        if (count === 0) return
        setActiveIndex((prev) => Math.min(Math.max(0, prev), count - 1))
    }, [count])

    useEffect(() => {
        if (count === 0) return
        setActiveIndex(Math.min(Math.max(0, initialIndex), count - 1))
        setHasWrapped(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialIndex])

    // Step the index by ±1 (or more) and flag a wrap when the unclamped
    // value actually crossed the bounds. Clicks via goTo are absolute
    // jumps and never count as wraps.
    const stepActiveIndex = useCallback(
        (step: number) => {
            if (count === 0) return
            setActiveIndex((prev) => {
                const unclamped = prev + step
                if (infinite) {
                    const wrapped =
                        unclamped < 0 || unclamped >= count
                    if (wrapped) setHasWrapped(true)
                    return ((unclamped % count) + count) % count
                }
                return Math.min(
                    Math.max(0, unclamped),
                    count - 1
                )
            })
        },
        [count, infinite]
    )

    const goTo = useCallback(
        (nextIndex: number) => {
            if (count === 0) return
            setActiveIndex((prev) => {
                if (infinite) {
                    return (
                        ((nextIndex % count) + count) % count
                    )
                }
                return Math.min(
                    Math.max(0, nextIndex),
                    count - 1
                )
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
            stepActiveIndex(1)
        }, Math.max(200, autoPlayDelay * 1000))

        return () => window.clearInterval(id)
    }, [
        autoPlay,
        autoPlayDelay,
        count,
        infinite,
        isHovered,
        pauseOnHover,
        stepActiveIndex,
    ])

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
                stepActiveIndex(step)
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
        stepActiveIndex,
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
        if (infinite && count > 1) {
            const half = count / 2
            // Forward-wrap is always on: when active is near the end,
            // card 0 appears ahead so the loop is previewed in the
            // user's direction of travel.
            if (offset < -half) offset += count
            // Backward-wrap only activates after a real loop has
            // happened — no "last card before first" on first load.
            else if (hasWrapped && offset > half) offset -= count
        }
        return offset
    }

    // Positions are computed per card (see computeCardCenter) so that
    // every adjacent pair — not just active ↔ ±1 — overlaps by exactly
    // `overlap` pixels, even as each card's scaled half-width shrinks.

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
                // Contain the cards' stacking contexts so high z-index
                // values inside (up to 1000) don't compete with
                // page-level elements like custom cursors.
                isolation: "isolate",
                ...style,
            }}
        >
            <motion.div
                drag={
                    enableDrag
                        ? isHorizontal
                            ? "x"
                            : "y"
                        : false
                }
                dragListener={false}
                dragControls={dragControls}
                onPointerDown={(e) => {
                    if (!enableDrag) return
                    dragControls.start(e, {
                        snapToCursor: false,
                    })
                }}
                dragConstraints={{
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                }}
                dragElastic={dragElastic}
                dragMomentum={false}
                onDrag={(_e, info) => {
                    if (!enableDrag) return
                    // Mirror the live drag offset into our own motion
                    // values so CardItems can read them for parallax.
                    if (isHorizontal) stageDragX.set(info.offset.x)
                    else stageDragY.set(info.offset.y)
                }}
                onDragEnd={(_e, info) => {
                    if (!enableDrag) return
                    // Ease the parallax signal back to 0 so the inner
                    // content settles in sync with the stage.
                    animate(stageDragX, 0, {
                        duration: 0.3,
                        ease: [0.32, 0.72, 0, 1],
                    })
                    animate(stageDragY, 0, {
                        duration: 0.3,
                        ease: [0.32, 0.72, 0, 1],
                    })
                    const offset = isHorizontal
                        ? info.offset.x
                        : info.offset.y
                    const velocity = isHorizontal
                        ? info.velocity.x
                        : info.velocity.y
                    const crossedDistance =
                        Math.abs(offset) > dragThreshold
                    const crossedVelocity = Math.abs(velocity) > 500
                    if (!crossedDistance && !crossedVelocity) return
                    // Dragging left/up reveals the NEXT card (content
                    // shifts toward the start), so negative offset
                    // means advance.
                    const step = offset < 0 ? 1 : -1
                    stepActiveIndex(step)
                }}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    cursor: enableDrag ? "grab" : undefined,
                    touchAction: enableDrag
                        ? isHorizontal
                            ? "pan-y"
                            : "pan-x"
                        : undefined,
                }}
                whileDrag={{ cursor: "grabbing" }}
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
                    const sign = Math.sign(offset)
                    const centerDistance = computeCardCenter(
                        absOffset,
                        isHorizontal ? cardWidth : cardHeight,
                        overlap,
                        scaleStep
                    )
                    const x = isHorizontal ? sign * centerDistance : 0
                    const y = isHorizontal ? 0 : sign * centerDistance
                    const isActive = offset === 0
                    const activeCard = activeCards[i]

                    const finalPose: CardPose = {
                        x,
                        y,
                        scale,
                        opacity: 1,
                    }
                    const mainEntrancePose =
                        entranceMode === "none"
                            ? finalPose
                            : getEntrancePose(
                                  entranceMode,
                                  offset,
                                  cardWidth,
                                  cardHeight,
                                  isHorizontal,
                                  { x, y, scale }
                              )
                    const preEntrancePose =
                        preEntranceMode === "none"
                            ? mainEntrancePose
                            : getEntrancePose(
                                  preEntranceMode,
                                  offset,
                                  cardWidth,
                                  cardHeight,
                                  isHorizontal,
                                  { x, y, scale }
                              )

                    const isMultiStage =
                        entranceMode !== "none" &&
                        preEntranceMode !== "none"

                    const cardStaggerDelay =
                        isEntering && stagger
                            ? absOffset * staggerDelay
                            : 0

                    return (
                        <CardItem
                            key={i}
                            idleContent={card}
                            activeContent={activeCard}
                            isActive={isActive}
                            zIndex={1000 - absOffset}
                            cardWidth={cardWidth}
                            cardHeight={cardHeight}
                            transitionDuration={transitionDuration}
                            parallaxStrength={parallaxStrength}
                            clipCards={clipCards}
                            stageDragX={stageDragX}
                            stageDragY={stageDragY}
                            onSelect={() => goTo(i)}
                            onActiveHoverStart={handleActiveHoverStart}
                            onActiveHoverEnd={handleActiveHoverEnd}
                            finalPose={finalPose}
                            preEntrancePose={preEntrancePose}
                            mainEntrancePose={mainEntrancePose}
                            entranceMode={entranceMode}
                            isMultiStage={isMultiStage}
                            hasEntered={hasEntered}
                            isEntering={isEntering}
                            entranceDuration={entranceDuration}
                            preEntranceDuration={preEntranceDuration}
                            cardStaggerDelay={cardStaggerDelay}
                        />
                    )
                })}
                </div>
            </motion.div>
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
    enableDrag: {
        type: ControlType.Boolean,
        title: "Drag / Swipe",
        description:
            "Pointer / touch drag to advance cards. Works on mobile.",
        defaultValue: true,
    },
    dragThreshold: {
        type: ControlType.Number,
        title: "Drag Distance",
        description:
            "Pixels to drag before advancing one card (velocity can also trigger it).",
        defaultValue: 80,
        min: 10,
        max: 1000,
        step: 5,
        unit: "px",
        hidden: (p: Props) => !p.enableDrag,
    },
    dragElastic: {
        type: ControlType.Number,
        title: "Drag Resistance",
        description:
            "0 = no pull past constraints, 1 = fully follows finger. 0.3 is a moderate rubber-band.",
        defaultValue: 0.3,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: (p: Props) => !p.enableDrag,
    },
    entranceMode: {
        type: ControlType.Enum,
        title: "Entrance",
        description: "How cards appear when the slideshow loads.",
        options: [
            "none",
            "stackCenter",
            "thumbnailRow",
            "fadeInPlace",
            "dealFromEdge",
        ],
        optionTitles: [
            "None",
            "Stack from Center",
            "Thumbnail Row",
            "Fade in Place",
            "Deal from Edge",
        ],
        defaultValue: "none",
    },
    entranceTrigger: {
        type: ControlType.Enum,
        title: "Trigger",
        options: ["onMount", "layerInView", "sectionInView"],
        optionTitles: ["On Mount", "Layer in View", "Section in View"],
        defaultValue: "onMount",
        displaySegmentedControl: true,
        hidden: (p: Props) => p.entranceMode === "none",
    },
    entranceDuration: {
        type: ControlType.Number,
        title: "Enter Duration",
        defaultValue: 0.7,
        min: 0.1,
        max: 3,
        step: 0.05,
        unit: "s",
        hidden: (p: Props) => p.entranceMode === "none",
    },
    entranceDelay: {
        type: ControlType.Number,
        title: "Enter Delay",
        description: "Pre-roll before the entrance starts.",
        defaultValue: 0.1,
        min: 0,
        max: 3,
        step: 0.05,
        unit: "s",
        hidden: (p: Props) => p.entranceMode === "none",
    },
    preEntranceMode: {
        type: ControlType.Enum,
        title: "Pre-Entrance",
        description:
            "Optional first stage. Cards go Pre-Entrance pose → Entrance pose → final slideshow.",
        options: [
            "none",
            "stackCenter",
            "thumbnailRow",
            "fadeInPlace",
            "dealFromEdge",
        ],
        optionTitles: [
            "None",
            "Stack from Center",
            "Thumbnail Row",
            "Fade in Place",
            "Deal from Edge",
        ],
        defaultValue: "none",
        hidden: (p: Props) => p.entranceMode === "none",
    },
    preEntranceDuration: {
        type: ControlType.Number,
        title: "Pre-Enter Duration",
        description:
            "Time spent animating from Pre-Entrance pose to Entrance pose.",
        defaultValue: 0.5,
        min: 0.1,
        max: 3,
        step: 0.05,
        unit: "s",
        hidden: (p: Props) =>
            p.entranceMode === "none" ||
            p.preEntranceMode === "none",
    },
    stagger: {
        type: ControlType.Boolean,
        title: "Stagger",
        description:
            "Fire cards one after another. Cards closer to the active one animate first, outer cards follow.",
        defaultValue: true,
        hidden: (p: Props) => p.entranceMode === "none",
    },
    staggerDelay: {
        type: ControlType.Number,
        title: "Stagger Time",
        defaultValue: 0.08,
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "s",
        hidden: (p: Props) =>
            p.entranceMode === "none" || !p.stagger,
    },
    parallaxStrength: {
        type: ControlType.Number,
        title: "Parallax",
        description:
            "Inner content lags behind the card frame during any motion (drag, click, wheel, auto-play). 0 disables.",
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 1,
    },
    clipCards: {
        type: ControlType.Boolean,
        title: "Clip Cards",
        description:
            "Clip content to the card frame. Turn OFF if your cards have hover / scale effects that need to bleed past the edge. With clipping off, you may see a few pixels of background at the card edges during fast parallax motion.",
        defaultValue: false,
        hidden: (p: Props) => (p.parallaxStrength ?? 0) === 0,
    },
    onActivateCard1: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 1,
    },
    onActivateCard2: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 2,
    },
    onActivateCard3: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 3,
    },
    onActivateCard4: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 4,
    },
    onActivateCard5: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 5,
    },
    onActivateCard6: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 6,
    },
    onActivateCard7: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 7,
    },
    onActivateCard8: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 8,
    },
    onActivateCard9: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 9,
    },
    onActivateCard10: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 10,
    },
    onActivateCard11: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 11,
    },
    onActivateCard12: {
        type: ControlType.EventHandler,
        hidden: (p: Props) => (p.cards?.length ?? 0) < 12,
    },
    onActiveCardHoverStart: {
        type: ControlType.EventHandler,
    },
    onActiveCardHoverEnd: {
        type: ControlType.EventHandler,
    },
})
