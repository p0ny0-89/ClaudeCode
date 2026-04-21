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

// ────────────────────────────────────────────────────────────────────
// Cross-component channel (pub-sub)
//
// The slideshow publishes its active index to a named channel. Other
// components on the page (e.g. SlideshowFollower below) subscribe to
// that channel and react without sharing a React tree.
// ────────────────────────────────────────────────────────────────────

type IndexListener = (index: number) => void

interface ChannelStore {
    index: number
    listeners: Set<IndexListener>
}

const globalKey = "__overlapSlideshowChannels__"
const globalScope = globalThis as unknown as {
    [globalKey]?: Record<string, ChannelStore>
}
if (!globalScope[globalKey]) globalScope[globalKey] = {}
const channelRegistry = globalScope[globalKey]!

function getChannel(name: string): ChannelStore {
    let store = channelRegistry[name]
    if (!store) {
        store = { index: 0, listeners: new Set() }
        channelRegistry[name] = store
    }
    return store
}

function publishChannelIndex(name: string, index: number) {
    const store = getChannel(name)
    if (store.index === index) return
    store.index = index
    store.listeners.forEach((l) => l(index))
}

function useChannelIndex(name: string): number {
    const [index, setIndex] = useState<number>(() => getChannel(name).index)
    useEffect(() => {
        const store = getChannel(name)
        const listener: IndexListener = (i) => setIndex(i)
        store.listeners.add(listener)
        // Re-sync to the current value on (re)subscribe
        setIndex(store.index)
        return () => {
            store.listeners.delete(listener)
        }
    }, [name])
    return index
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
    channel?: string
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
        channel = "default",
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
        style,
    } = props

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
    const [hasAdvanced, setHasAdvanced] = useState(false)
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

    // Broadcast the active index to any subscribers on this channel
    // (e.g. a SlideshowFollower component elsewhere on the page) and
    // fire the matching "Activate Card N" event so Framer's native
    // Interactions panel can respond (e.g. Set Variable → switch a
    // native text component's variant).
    useEffect(() => {
        publishChannelIndex(channel, activeIndex)
        const handler = activateHandlersRef.current[activeIndex]
        if (handler) handler()
    }, [channel, activeIndex])

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
                dragDirectionLock
                dragConstraints={{
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                }}
                dragElastic={dragElastic}
                dragMomentum={false}
                onDragEnd={(_e, info) => {
                    if (!enableDrag) return
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
                    setActiveIndex((prev) => {
                        const nextIdx = prev + step
                        if (infinite) {
                            setHasAdvanced(true)
                            return (
                                ((nextIdx % count) + count) % count
                            )
                        }
                        if (nextIdx < 0 || nextIdx >= count) return prev
                        setHasAdvanced(true)
                        return nextIdx
                    })
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

                    let animateTarget: Record<
                        string,
                        number | number[]
                    >
                    if (!hasEntered) {
                        animateTarget = {
                            x: preEntrancePose.x,
                            y: preEntrancePose.y,
                            scale: preEntrancePose.scale,
                            opacity: preEntrancePose.opacity,
                        }
                    } else if (isEntering && isMultiStage) {
                        animateTarget = {
                            x: [
                                preEntrancePose.x,
                                mainEntrancePose.x,
                                finalPose.x,
                            ],
                            y: [
                                preEntrancePose.y,
                                mainEntrancePose.y,
                                finalPose.y,
                            ],
                            scale: [
                                preEntrancePose.scale,
                                mainEntrancePose.scale,
                                finalPose.scale,
                            ],
                            opacity: [
                                preEntrancePose.opacity,
                                mainEntrancePose.opacity,
                                finalPose.opacity,
                            ],
                        }
                    } else {
                        animateTarget = {
                            x: finalPose.x,
                            y: finalPose.y,
                            scale: finalPose.scale,
                            opacity: 1,
                        }
                    }

                    const sequenceDuration = isMultiStage
                        ? preEntranceDuration + entranceDuration
                        : entranceDuration
                    const transitionObj =
                        isEntering && isMultiStage
                            ? {
                                  duration: sequenceDuration,
                                  times: [
                                      0,
                                      preEntranceDuration /
                                          sequenceDuration,
                                      1,
                                  ],
                                  delay: cardStaggerDelay,
                                  ease: [0.32, 0.72, 0, 1] as [
                                      number,
                                      number,
                                      number,
                                      number
                                  ],
                              }
                            : {
                                  duration: isEntering
                                      ? entranceDuration
                                      : transitionDuration,
                                  delay: cardStaggerDelay,
                                  ease: [0.32, 0.72, 0, 1] as [
                                      number,
                                      number,
                                      number,
                                      number
                                  ],
                              }

                    return (
                        <motion.div
                            key={i}
                            onClick={() => {
                                if (!isActive) goTo(i)
                            }}
                            initial={
                                entranceMode === "none"
                                    ? false
                                    : {
                                          x: preEntrancePose.x,
                                          y: preEntrancePose.y,
                                          scale: preEntrancePose.scale,
                                          opacity: preEntrancePose.opacity,
                                      }
                            }
                            animate={{
                                ...animateTarget,
                                zIndex: 1000 - absOffset,
                            }}
                            transition={transitionObj}
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
                                className="overlap-slideshow-card-fill"
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
                                    className="overlap-slideshow-card-fill"
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
    channel: {
        type: ControlType.String,
        title: "Channel",
        description:
            "Name this slideshow publishes on. Give a SlideshowFollower the same Channel to link them.",
        defaultValue: "default",
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
})

// ────────────────────────────────────────────────────────────────────
// SlideshowFollower
//
// Listens to a channel and instantly swaps between a list of component
// instances — one per slideshow card index. Use this anywhere on the
// page (outside the slideshow) to mirror the active card without the
// slideshow's crossfade.
//
// Usage:
// 1. Give your slideshow a Channel name (e.g. "hero").
// 2. Add a SlideshowFollower to your layout and set its Channel to the
//    same name.
// 3. In the follower's "Items" array, add one component instance per
//    card — in the same order as the slideshow's Idle Cards. Each item
//    should already be pre-set to the variant you want shown for that
//    card (since Framer can't switch a linked component's variant at
//    runtime, you supply the target variant directly).
// ────────────────────────────────────────────────────────────────────

interface FollowerProps {
    channel?: string
    items?: React.ReactNode[]
    fallbackIndex?: number
    wrap?: boolean
    style?: React.CSSProperties
}

export function SlideshowFollower(props: FollowerProps) {
    const {
        channel = "default",
        items = [],
        fallbackIndex = 0,
        wrap = true,
        style,
    } = props

    const liveIndex = useChannelIndex(channel)

    if (items.length === 0) {
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
                    fontSize: 12,
                    background: "rgba(127,127,127,0.06)",
                    border: "1px dashed rgba(127,127,127,0.35)",
                    borderRadius: 6,
                    padding: 12,
                    textAlign: "center",
                    boxSizing: "border-box",
                }}
            >
                Add one item per slideshow card, then set Channel to
                match the slideshow.
            </div>
        )
    }

    let index = liveIndex
    if (index < 0 || index >= items.length) {
        index = wrap
            ? ((liveIndex % items.length) + items.length) % items.length
            : Math.min(Math.max(0, fallbackIndex), items.length - 1)
    }

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                ...style,
            }}
        >
            {items[index]}
        </div>
    )
}

SlideshowFollower.displayName = "Slideshow Follower"

addPropertyControls(SlideshowFollower, {
    channel: {
        type: ControlType.String,
        title: "Channel",
        description:
            "Must match the Channel set on the Overlap Slideshow you want to follow.",
        defaultValue: "default",
    },
    items: {
        type: ControlType.Array,
        title: "Items",
        description:
            "One per slideshow card, in the same order. Pre-set each item to the variant you want shown when its card is active.",
        control: { type: ControlType.ComponentInstance },
    },
    wrap: {
        type: ControlType.Boolean,
        title: "Wrap Out-of-Range",
        description:
            "If the slideshow has more cards than items here, wrap around instead of falling back.",
        defaultValue: true,
    },
    fallbackIndex: {
        type: ControlType.Number,
        title: "Fallback Index",
        description:
            "Used when the active index is out of range and Wrap is off.",
        defaultValue: 0,
        min: 0,
        max: 99,
        step: 1,
        hidden: (p: FollowerProps) => !!p.wrap,
    },
})
