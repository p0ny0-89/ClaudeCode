import { addPropertyControls, ControlType, RenderTarget } from "framer"
import React, { useRef, useEffect, useCallback, useState } from "react"

// ─── Constants ────────────────────────────────────────────

const ACTIVE_SMOOTHING = 0.08
const RETURN_SMOOTHING = 0.05
const OPACITY_SMOOTHING = 0.1
const SETTLE_THRESHOLD = 0.01

const VIDEO_EXTS = /\.(mp4|webm|mov|ogg)(\?|$)/i

// ─── Types ────────────────────────────────────────────────

type Behavior = "follow" | "repel"
type OverlayMode = "cursor" | "stationary"
type OverlayDirection = "toward" | "away"
type TransitionType = "instant" | "fade" | "slide" | "push"
type TransitionDirection = "left" | "right" | "up" | "down"
type SlideInput = "images" | "videos"
type ContentFit = "fill" | "fit"
type AlignX = "left" | "center" | "right"
type AlignY = "top" | "center" | "bottom"

const ALLOWED_VIDEO = ["mp4", "webm"]
const ALLOWED_MEDIA = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "mp4", "webm"]

interface Props {
    // ── Media ─────────────────────────────────────────
    background: string
    backgroundVideo: string

    // Slide configuration
    slideCount: number
    slideInput: SlideInput // Panel visibility toggle only

    // Image slots (ControlType.Image → binds to CMS Image fields)
    slide1Img: string
    slide2Img: string
    slide3Img: string
    slide4Img: string
    slide5Img: string

    // Video slots (ControlType.File → binds to CMS File/Video fields)
    slide1Vid: string
    slide2Vid: string
    slide3Vid: string
    slide4Vid: string
    slide5Vid: string

    // ── Slide Behavior ────────────────────────────────
    transition: TransitionType
    transitionDirection: TransitionDirection
    slideDuration: number
    transitionSpeed: number

    // ── Card ──────────────────────────────────────────
    backgroundRadius: number
    borderEnabled: boolean
    borderWidth: number
    borderColor: string
    shadowEnabled: boolean
    shadowX: number
    shadowY: number
    shadowBlur: number
    shadowSpread: number
    shadowColor: string

    // ── Overlay ───────────────────────────────────────
    overlaySize: number
    overlayRadius: number
    contentFit: ContentFit
    alignX: AlignX
    alignY: AlignY
    overlayMode: OverlayMode

    // ── Overlay Motion ────────────────────────────────
    overlayAmount: number
    overlayDirection: OverlayDirection
    overlaySmoothing: number

    // ── Reveal on View ────────────────────────────────
    autoplay: boolean

    // ── Tilt ──────────────────────────────────────────
    tilt: boolean
    behavior: Behavior
    tiltLimit: number
    scale: number
    perspective: number

    style?: React.CSSProperties
}

// ─── Helpers ──────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi)
}

/** Renders an <img> or <video> based on the file extension. */
function Media({
    src,
    objectFit = "cover",
    objectPosition,
    style,
}: {
    src: string
    objectFit?: "cover" | "contain"
    objectPosition?: string
    style?: React.CSSProperties
}) {
    const base: React.CSSProperties = {
        width: "100%",
        height: "100%",
        objectFit,
        objectPosition,
        display: "block",
        ...style,
    }

    if (VIDEO_EXTS.test(src)) {
        return (
            <video
                src={src}
                style={base}
                autoPlay
                muted
                loop
                playsInline
            />
        )
    }

    return <img src={src} style={base} alt="" />
}

// ─── Slide Transition Styles ─────────────────────────────

/** Compute the enter-from and exit-to transforms for directional transitions. */
function getDirectionTransforms(dir: TransitionDirection) {
    switch (dir) {
        case "left":
            return { enter: "translate3d(100%,0,0)", exit: "translate3d(-100%,0,0)" }
        case "right":
            return { enter: "translate3d(-100%,0,0)", exit: "translate3d(100%,0,0)" }
        case "up":
            return { enter: "translate3d(0,100%,0)", exit: "translate3d(0,-100%,0)" }
        case "down":
            return { enter: "translate3d(0,-100%,0)", exit: "translate3d(0,100%,0)" }
    }
}

/**
 * Compute inline styles for a slide based on its position relative
 * to the active slide. Uses CSS transitions for smooth animations.
 */
function getSlideStyle(
    index: number,
    active: number,
    total: number,
    type: TransitionType,
    dir: TransitionDirection,
    speed: number
): React.CSSProperties {
    const isCurrent = index === active
    const isPrev = index === (active - 1 + total) % total

    const base: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
    }

    switch (type) {
        case "instant":
            return {
                ...base,
                opacity: isCurrent ? 1 : 0,
                visibility: isCurrent ? "visible" : "hidden",
            }

        case "fade":
            return {
                ...base,
                opacity: isCurrent ? 1 : 0,
                zIndex: isCurrent ? 1 : 0,
                transition: isCurrent || isPrev
                    ? `opacity ${speed}s ease`
                    : "none",
            }

        case "slide": {
            const { enter } = getDirectionTransforms(dir)
            if (isCurrent) {
                return {
                    ...base,
                    transform: "translate3d(0,0,0)",
                    zIndex: 2,
                    transition: `transform ${speed}s ease`,
                }
            }
            if (isPrev) {
                return {
                    ...base,
                    transform: "translate3d(0,0,0)",
                    zIndex: 1,
                    transition: "none",
                }
            }
            // Offscreen: pre-positioned at entry point, no transition
            return {
                ...base,
                transform: enter,
                zIndex: 0,
                transition: "none",
            }
        }

        case "push": {
            const { enter, exit } = getDirectionTransforms(dir)
            if (isCurrent) {
                return {
                    ...base,
                    transform: "translate3d(0,0,0)",
                    zIndex: 1,
                    transition: `transform ${speed}s ease`,
                }
            }
            if (isPrev) {
                return {
                    ...base,
                    transform: exit,
                    zIndex: 1,
                    transition: `transform ${speed}s ease`,
                }
            }
            // Offscreen: pre-positioned at entry point
            return {
                ...base,
                transform: enter,
                zIndex: 0,
                transition: "none",
            }
        }
    }
}

// ─── Component ────────────────────────────────────────────

/**
 * CmsMotionPro — CMS-friendly hover-reveal card with 3D tilt
 * and slideshow overlay.
 *
 * A background thumbnail is always visible. On hover, a secondary
 * overlay fades in showing up to 5 media slides that auto-cycle
 * with configurable transitions (instant, fade, slide, push).
 *
 * Dual-input slides: bind CMS Image fields to image slots AND
 * CMS File/Video fields to video slots. At runtime, video takes
 * priority per slot — projects without video gracefully fall back
 * to images.
 *
 * Features:
 *   → Dual CMS-bindable media slots (image + video per slide)
 *   → Configurable transitions (instant, fade, slide, push)
 *   → Border stroke and drop shadow card styling
 *   → 3D tilt with cursor tracking
 *   → Reveal on View for mobile/tablet (IntersectionObserver)
 */
export default function CmsMotionPro(props: Props) {
    const {
        background,
        backgroundVideo,
        backgroundRadius = 0,
        borderEnabled = false,
        borderWidth = 2,
        borderColor = "rgba(255,255,255,0.3)",
        shadowEnabled = false,
        shadowX = 0,
        shadowY = 4,
        shadowBlur = 20,
        shadowSpread = 0,
        shadowColor = "rgba(0,0,0,0.25)",
        slideCount: slideCountProp = 0,
        slide1Img,
        slide2Img,
        slide3Img,
        slide4Img,
        slide5Img,
        slide1Vid,
        slide2Vid,
        slide3Vid,
        slide4Vid,
        slide5Vid,
        overlaySize = 80,
        overlayRadius = 0,
        contentFit = "fill" as ContentFit,
        alignX = "center" as AlignX,
        alignY = "center" as AlignY,
        overlayMode = "cursor",
        overlayAmount = 100,
        overlayDirection = "toward",
        overlaySmoothing = 0.5,
        transition = "fade" as TransitionType,
        transitionDirection = "left" as TransitionDirection,
        slideDuration = 2,
        transitionSpeed = 0.5,
        autoplay = false,
        tilt = true,
        behavior = "follow",
        tiltLimit = 20,
        scale: hoverScale = 1.1,
        perspective = 5000,
        style,
    } = props

    // Resolve background media: video takes priority over image
    const bgSrc = backgroundVideo || background

    // ── Build merged slides array ─────────────────────
    // Collect ALL available media from both input sets.
    // Each slot can contribute both a video and an image.
    // Videos are gathered first, then images — so video
    // content plays first, followed by image content.
    const imgSlots = [slide1Img, slide2Img, slide3Img, slide4Img, slide5Img]
    const vidSlots = [slide1Vid, slide2Vid, slide3Vid, slide4Vid, slide5Vid]

    const activeSlides: string[] = []
    for (let i = 0; i < slideCountProp; i++) {
        if (vidSlots[i]) activeSlides.push(vidSlots[i])
    }
    for (let i = 0; i < slideCountProp; i++) {
        if (imgSlots[i]) activeSlides.push(imgSlots[i])
    }

    const slideCount = activeSlides.length
    const hasOverlay = slideCount > 0
    const mediaPosition = `${alignY} ${alignX}`

    // ── Refs ─────────────────────────────────────────────

    const containerRef = useRef<HTMLDivElement>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const rafId = useRef(0)
    const loopRunning = useRef(false)
    const hovering = useRef(false)

    // Tilt state
    const tiltTarget = useRef({ rx: 0, ry: 0, s: 1 })
    const tiltCurrent = useRef({ rx: 0, ry: 0, s: 1 })

    // Overlay position state (cursor tracking)
    const overlayPosTarget = useRef({ tx: 0, ty: 0 })
    const overlayPosCurrent = useRef({ tx: 0, ty: 0 })

    // Overlay opacity state (fade in/out)
    const overlayOpTarget = useRef(0)
    const overlayOpCurrent = useRef(0)

    // Autoplay viewport tracking
    const inView = useRef(false)

    // Slideshow state
    const [currentSlide, setCurrentSlide] = useState(0)
    const slideTimerRef = useRef<number | null>(null)
    const overlayActiveRef = useRef(false)

    // Cached bounding rect — avoids getBoundingClientRect() feedback
    // loop caused by 3D perspective distorting the projected rect
    const cachedRect = useRef<DOMRect | null>(null)

    // Latest props in a ref so callbacks stay stable
    const cfgVal = {
        tilt,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        overlayMode,
        overlayAmount,
        overlayDirection,
        overlaySmoothing,
        overlaySize,
        autoplay,
        slideCount,
        slideDuration,
    }
    const cfg = useRef(cfgVal)
    cfg.current = cfgVal

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    // ── Slideshow Timer ──────────────────────────────────

    const stopSlideTimer = useCallback(() => {
        if (slideTimerRef.current !== null) {
            clearInterval(slideTimerRef.current)
            slideTimerRef.current = null
        }
    }, [])

    const startSlideTimer = useCallback(() => {
        stopSlideTimer()
        if (cfg.current.slideCount < 2) return
        slideTimerRef.current = window.setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % cfg.current.slideCount)
        }, cfg.current.slideDuration * 1000)
    }, [stopSlideTimer])

    // ── Render Loop ─────────────────────────────────────

    const tick = useCallback(() => {
        const surface = surfaceRef.current
        const overlayEl = overlayRef.current

        // ── 1. Tilt interpolation ─────────────────────
        if (cfg.current.tilt && surface) {
            const smooth = hovering.current
                ? ACTIVE_SMOOTHING
                : RETURN_SMOOTHING

            const tc = tiltCurrent.current
            const tt = tiltTarget.current

            tc.rx = lerp(tc.rx, tt.rx, smooth)
            tc.ry = lerp(tc.ry, tt.ry, smooth)
            tc.s = lerp(tc.s, tt.s, smooth)

            surface.style.transform = `rotateX(${tc.rx.toFixed(2)}deg) rotateY(${tc.ry.toFixed(2)}deg) scale(${tc.s.toFixed(4)})`
        } else if (surface) {
            // Tilt off — clear stale transform
            const tc = tiltCurrent.current
            const tt = tiltTarget.current
            tc.rx = 0
            tc.ry = 0
            tc.s = 1
            tt.rx = 0
            tt.ry = 0
            tt.s = 1
            surface.style.transform = ""
        }

        // ── 2. Overlay position interpolation ─────────
        const oSmooth = cfg.current.overlaySmoothing
        const oLerp = 0.15 - oSmooth * 0.13

        const oc = overlayPosCurrent.current
        const ot = overlayPosTarget.current

        oc.tx = lerp(oc.tx, ot.tx, oLerp)
        oc.ty = lerp(oc.ty, ot.ty, oLerp)

        // ── 3. Overlay opacity interpolation ──────────
        overlayOpCurrent.current = lerp(
            overlayOpCurrent.current,
            overlayOpTarget.current,
            OPACITY_SMOOTHING
        )

        // ── Apply overlay styles ──────────────────────
        if (overlayEl) {
            overlayEl.style.transform = `translate3d(${oc.tx.toFixed(2)}px, ${oc.ty.toFixed(2)}px, 0)`
            overlayEl.style.opacity = overlayOpCurrent.current.toFixed(3)
        }

        // ── 4. Settle check ───────────────────────────
        const tc = tiltCurrent.current
        const tt = tiltTarget.current

        const tiltSettled =
            !cfg.current.tilt ||
            (Math.abs(tc.rx - tt.rx) < SETTLE_THRESHOLD &&
                Math.abs(tc.ry - tt.ry) < SETTLE_THRESHOLD &&
                Math.abs(tc.s - tt.s) < SETTLE_THRESHOLD)

        const posSettled =
            Math.abs(oc.tx - ot.tx) < SETTLE_THRESHOLD &&
            Math.abs(oc.ty - ot.ty) < SETTLE_THRESHOLD

        const opacitySettled =
            Math.abs(overlayOpCurrent.current - overlayOpTarget.current) <
            SETTLE_THRESHOLD

        if (tiltSettled && posSettled && opacitySettled && !hovering.current) {
            // Snap to exact values
            if (cfg.current.tilt && surface) {
                tc.rx = tt.rx
                tc.ry = tt.ry
                tc.s = tt.s
                surface.style.transform = `rotateX(${tc.rx}deg) rotateY(${tc.ry}deg) scale(${tc.s})`
            }
            oc.tx = ot.tx
            oc.ty = ot.ty
            overlayOpCurrent.current = overlayOpTarget.current

            if (overlayEl) {
                overlayEl.style.transform = `translate3d(${oc.tx}px, ${oc.ty}px, 0)`
                overlayEl.style.opacity = String(overlayOpCurrent.current)
            }

            loopRunning.current = false
        } else {
            rafId.current = requestAnimationFrame(tick)
        }
    }, [])

    const startLoop = useCallback(() => {
        if (loopRunning.current) return
        loopRunning.current = true
        rafId.current = requestAnimationFrame(tick)
    }, [tick])

    // ── Pointer Handlers ────────────────────────────────

    const onPointerEnter = useCallback(() => {
        if (isCanvas) return
        hovering.current = true

        // Cache rect once at hover start to avoid 3D-projected rect jitter
        const el = containerRef.current
        if (el) cachedRect.current = el.getBoundingClientRect()

        // Fade overlay in
        overlayOpTarget.current = 1

        // Tilt hover scale
        if (cfg.current.tilt) {
            tiltTarget.current.s = cfg.current.hoverScale
        }

        // Start slideshow
        overlayActiveRef.current = true
        setCurrentSlide(0)
        startSlideTimer()

        startLoop()
    }, [isCanvas, startLoop, startSlideTimer])

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (isCanvas) return

            const rect = cachedRect.current
            if (!rect) return
            const nx = clamp(
                ((e.clientX - rect.left) / rect.width - 0.5) * 2,
                -1,
                1
            )
            const ny = clamp(
                ((e.clientY - rect.top) / rect.height - 0.5) * 2,
                -1,
                1
            )

            // Drive tilt
            if (cfg.current.tilt) {
                const dir = cfg.current.behavior === "repel" ? -1 : 1
                tiltTarget.current.rx = -ny * cfg.current.tiltLimit * dir
                tiltTarget.current.ry = nx * cfg.current.tiltLimit * dir
            }

            // Drive overlay cursor tracking
            if (cfg.current.overlayMode === "cursor") {
                const oDir =
                    cfg.current.overlayDirection === "away" ? -1 : 1
                const sizeFrac = cfg.current.overlaySize / 100
                const maxTx = rect.width * (1 - sizeFrac) / 2
                const maxTy = rect.height * (1 - sizeFrac) / 2
                const pct = cfg.current.overlayAmount / 100
                overlayPosTarget.current.tx = nx * maxTx * pct * oDir
                overlayPosTarget.current.ty = ny * maxTy * pct * oDir
            }

            startLoop()
        },
        [isCanvas, startLoop]
    )

    const onPointerLeave = useCallback(() => {
        if (isCanvas) return
        hovering.current = false
        cachedRect.current = null

        // Reset tilt
        tiltTarget.current.rx = 0
        tiltTarget.current.ry = 0
        tiltTarget.current.s = 1

        // If autoplay is active and card is in view, keep overlay
        // visible (stationary) instead of fading out
        if (cfg.current.autoplay && inView.current) {
            overlayPosTarget.current.tx = 0
            overlayPosTarget.current.ty = 0
            // Keep slideshow running
        } else {
            // Fade out in place — don't reset position
            overlayOpTarget.current = 0
            overlayActiveRef.current = false
            stopSlideTimer()
        }

        startLoop()
    }, [isCanvas, startLoop, stopSlideTimer])

    // ── Reset on Tilt Change ─────────────────────────────

    useEffect(() => {
        tiltTarget.current = { rx: 0, ry: 0, s: 1 }
        startLoop()
    }, [tilt, startLoop])

    // ── Autoplay — IntersectionObserver ─────────────────

    useEffect(() => {
        if (!autoplay || isCanvas) return

        const el = containerRef.current
        if (!el) return

        const observer = new IntersectionObserver(
            ([entry]) => {
                inView.current = entry.isIntersecting

                if (entry.isIntersecting && !hovering.current) {
                    // Card scrolled into view — show overlay (stationary)
                    overlayOpTarget.current = 1
                    overlayActiveRef.current = true
                    setCurrentSlide(0)
                    startSlideTimer()
                    startLoop()
                } else if (!entry.isIntersecting) {
                    // Card left viewport — fade overlay out
                    overlayOpTarget.current = 0
                    overlayPosTarget.current.tx = 0
                    overlayPosTarget.current.ty = 0
                    overlayActiveRef.current = false
                    stopSlideTimer()
                    startLoop()
                }
            },
            { threshold: 0.5 }
        )

        observer.observe(el)
        return () => observer.disconnect()
    }, [autoplay, isCanvas, startLoop, startSlideTimer, stopSlideTimer])

    // ── Restart Timer on Duration / Slide Count Change ───

    useEffect(() => {
        if (overlayActiveRef.current && slideCount >= 2) {
            startSlideTimer()
        } else {
            stopSlideTimer()
        }
    }, [slideDuration, slideCount, startSlideTimer, stopSlideTimer])

    // ── Cleanup ──────────────────────────────────────────

    useEffect(
        () => () => {
            cancelAnimationFrame(rafId.current)
            if (slideTimerRef.current !== null) {
                clearInterval(slideTimerRef.current)
            }
        },
        []
    )

    // ── Box Shadow Computation ───────────────────────────

    // Drop shadow on the clip div (outer)
    const dropShadow =
        shadowEnabled
            ? `${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`
            : undefined

    // Border rendered as a separate overlay so it isn't covered by background media
    const borderShadow =
        borderEnabled && borderWidth > 0
            ? `inset 0 0 0 ${borderWidth}px ${borderColor}`
            : undefined

    // ── Empty State ──────────────────────────────────────

    if (!bgSrc) {
        return (
            <div
                style={{
                    ...style,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0, 0, 0, 0.03)",
                    borderRadius: 8,
                    color: "#999",
                    fontSize: 13,
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    border: "1px dashed rgba(0, 0, 0, 0.1)",
                    minHeight: 100,
                }}
            >
                Upload or bind media →
            </div>
        )
    }

    // ── Render ───────────────────────────────────────────

    return (
        <div
            ref={containerRef}
            style={{
                ...style,
                ...(tilt ? { perspective: `${perspective}px` } : {}),
                overflow: "visible",
            }}
        >
            {/* Surface tilts — NO overflow hidden here so 3D isn't flattened */}
            <div
                ref={surfaceRef}
                style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    willChange: tilt ? "transform" : undefined,
                    pointerEvents: "none",
                }}
            >
                {/* Clip div — border radius + overflow hidden for background */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        overflow: "hidden",
                        borderRadius: backgroundRadius,
                        boxShadow: dropShadow,
                    }}
                >
                    {/* Background — always visible */}
                    <div style={{ position: "absolute", inset: 0 }}>
                        <Media src={bgSrc} />
                    </div>

                    {/* Border stroke — rendered on top of background so it's always visible */}
                    {borderShadow && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: backgroundRadius,
                                boxShadow: borderShadow,
                                pointerEvents: "none",
                            }}
                        />
                    )}
                </div>

                {/* Overlay — outside clip div so it can overflow past card edges */}
                {hasOverlay && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            pointerEvents: "none",
                        }}
                    >
                        <div
                            ref={overlayRef}
                            style={{
                                width: `${overlaySize}%`,
                                height: `${overlaySize}%`,
                                opacity: 0,
                                willChange: "transform, opacity",
                            }}
                        >
                            {/* Slides wrapper — clips slide transitions */}
                            <div
                                style={{
                                    position: "relative",
                                    width: "100%",
                                    height: "100%",
                                    overflow: "hidden",
                                    borderRadius: overlayRadius,
                                }}
                            >
                                {activeSlides.length === 1 ? (
                                    // Single slide — no transitions needed
                                    <Media
                                        src={activeSlides[0]}
                                        objectFit={contentFit === "fit" ? "contain" : "cover"}
                                        objectPosition={mediaPosition}
                                    />
                                ) : (
                                    // Multiple slides — CSS transitions
                                    activeSlides.map((src, i) => (
                                        <div
                                            key={i}
                                            style={getSlideStyle(
                                                i,
                                                currentSlide,
                                                activeSlides.length,
                                                transition,
                                                transitionDirection,
                                                transitionSpeed
                                            )}
                                        >
                                            <Media
                                                src={src}
                                                objectFit={contentFit === "fit" ? "contain" : "cover"}
                                                objectPosition={mediaPosition}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Hit-area — flat 2D rect on top, unaffected by 3D tilt */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 1,
                }}
                onPointerEnter={onPointerEnter}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
            />
        </div>
    )
}

// ─── Framer Property Controls ─────────────────────────────
//
// Ordered by mental setup flow:
//   1. Media → 2. Slide Behavior → 3. Card → 4. Overlay
//   → 5. Overlay Motion → 6. Reveal on View → 7. Tilt

addPropertyControls(CmsMotionPro, {
    // ── Media ────────────────────────────────────────────

    background: {
        type: ControlType.Image,
        title: "BG Image",
    },

    backgroundVideo: {
        type: ControlType.File,
        title: "BG Video",
        allowedFileTypes: ALLOWED_VIDEO,
    },

    slideCount: {
        type: ControlType.Number,
        title: "Slides",
        defaultValue: 0,
        min: 0,
        max: 5,
        step: 1,
        displayStepper: true,
    },

    slideInput: {
        type: ControlType.Enum,
        title: "Slide Input",
        options: ["images", "videos"],
        optionTitles: ["Images", "Videos"],
        displaySegmentedControl: true,
        defaultValue: "images",
        description: "Switch to bind CMS Image or Video fields. Both are used at runtime — video takes priority per slot.",
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    // Image slots (ControlType.Image → CMS Image field binding)
    slide1Img: {
        type: ControlType.Image,
        title: "Slide 1",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 1 || props.slideInput === "videos",
    },

    slide2Img: {
        type: ControlType.Image,
        title: "Slide 2",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 2 || props.slideInput === "videos",
    },

    slide3Img: {
        type: ControlType.Image,
        title: "Slide 3",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 3 || props.slideInput === "videos",
    },

    slide4Img: {
        type: ControlType.Image,
        title: "Slide 4",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 4 || props.slideInput === "videos",
    },

    slide5Img: {
        type: ControlType.Image,
        title: "Slide 5",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 5 || props.slideInput === "videos",
    },

    // Video slots (ControlType.File → CMS File/Video field binding)
    slide1Vid: {
        type: ControlType.File,
        title: "Slide 1",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 1 || props.slideInput !== "videos",
    },

    slide2Vid: {
        type: ControlType.File,
        title: "Slide 2",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 2 || props.slideInput !== "videos",
    },

    slide3Vid: {
        type: ControlType.File,
        title: "Slide 3",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 3 || props.slideInput !== "videos",
    },

    slide4Vid: {
        type: ControlType.File,
        title: "Slide 4",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 4 || props.slideInput !== "videos",
    },

    slide5Vid: {
        type: ControlType.File,
        title: "Slide 5",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 5 || props.slideInput !== "videos",
    },

    // ── Slide Behavior ──────────────────────────────────

    transition: {
        type: ControlType.Enum,
        title: "Transition",
        options: ["instant", "fade", "slide", "push"],
        optionTitles: ["Instant", "Fade", "Slide", "Push"],
        defaultValue: "fade",
        hidden: (props: any) => (props.slideCount ?? 0) < 2,
    },

    transitionDirection: {
        type: ControlType.Enum,
        title: "Slide Direction",
        options: ["left", "right", "up", "down"],
        optionTitles: ["Left", "Right", "Up", "Down"],
        defaultValue: "left",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 2 ||
            props.transition === "instant" ||
            props.transition === "fade",
    },

    slideDuration: {
        type: ControlType.Number,
        title: "Slide Duration",
        defaultValue: 2,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: "s",
        hidden: (props: any) => (props.slideCount ?? 0) < 2,
    },

    transitionSpeed: {
        type: ControlType.Number,
        title: "Transition Speed",
        defaultValue: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
        unit: "s",
        hidden: (props: any) => (props.slideCount ?? 0) < 2,
    },

    // ── Card ─────────────────────────────────────────────

    backgroundRadius: {
        type: ControlType.Number,
        title: "Card Radius",
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 1,
        unit: "px",
        displayStepper: true,
    },

    borderEnabled: {
        type: ControlType.Boolean,
        title: "Border",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
    },

    borderWidth: {
        type: ControlType.Number,
        title: "Border Width",
        defaultValue: 2,
        min: 1,
        max: 10,
        step: 1,
        unit: "px",
        displayStepper: true,
        hidden: (props: any) => !props.borderEnabled,
    },

    borderColor: {
        type: ControlType.Color,
        title: "Border Color",
        defaultValue: "rgba(255,255,255,0.3)",
        hidden: (props: any) => !props.borderEnabled,
    },

    shadowEnabled: {
        type: ControlType.Boolean,
        title: "Shadow",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
    },

    shadowX: {
        type: ControlType.Number,
        title: "Shadow X",
        defaultValue: 0,
        min: -50,
        max: 50,
        step: 1,
        hidden: (props: any) => !props.shadowEnabled,
    },

    shadowY: {
        type: ControlType.Number,
        title: "Shadow Y",
        defaultValue: 4,
        min: -50,
        max: 50,
        step: 1,
        hidden: (props: any) => !props.shadowEnabled,
    },

    shadowBlur: {
        type: ControlType.Number,
        title: "Shadow Blur",
        defaultValue: 20,
        min: 0,
        max: 100,
        step: 1,
        hidden: (props: any) => !props.shadowEnabled,
    },

    shadowSpread: {
        type: ControlType.Number,
        title: "Shadow Spread",
        defaultValue: 0,
        min: -50,
        max: 50,
        step: 1,
        hidden: (props: any) => !props.shadowEnabled,
    },

    shadowColor: {
        type: ControlType.Color,
        title: "Shadow Color",
        defaultValue: "rgba(0,0,0,0.25)",
        hidden: (props: any) => !props.shadowEnabled,
    },

    // ── Overlay ──────────────────────────────────────────

    overlaySize: {
        type: ControlType.Number,
        title: "Overlay Size",
        defaultValue: 80,
        min: 10,
        max: 100,
        step: 5,
        unit: "%",
        displayStepper: true,
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    overlayRadius: {
        type: ControlType.Number,
        title: "Overlay Radius",
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 1,
        unit: "px",
        displayStepper: true,
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    contentFit: {
        type: ControlType.Enum,
        title: "Media Fit",
        options: ["fill", "fit"],
        optionTitles: ["Fill", "Fit"],
        displaySegmentedControl: true,
        defaultValue: "fill",
        description:
            "Fill crops to fill the overlay. Fit shows the full image or video without cropping.",
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    alignX: {
        type: ControlType.Enum,
        title: "Align X",
        options: ["left", "center", "right"],
        optionTitles: ["Left", "Center", "Right"],
        displaySegmentedControl: true,
        defaultValue: "center",
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    alignY: {
        type: ControlType.Enum,
        title: "Align Y",
        options: ["top", "center", "bottom"],
        optionTitles: ["Top", "Center", "Bottom"],
        displaySegmentedControl: true,
        defaultValue: "center",
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    overlayMode: {
        type: ControlType.Enum,
        title: "Overlay Mode",
        options: ["cursor", "stationary"],
        optionTitles: ["Cursor", "Stationary"],
        displaySegmentedControl: true,
        defaultValue: "cursor",
        description: "Cursor: overlay follows pointer inside the card. Stationary: overlay stays fixed in place.",
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    // ── Overlay Motion ──────────────────────────────────

    overlayAmount: {
        type: ControlType.Number,
        title: "Travel",
        defaultValue: 100,
        min: 0,
        max: 150,
        step: 5,
        unit: "%",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 1 || props.overlayMode === "stationary",
    },

    overlayDirection: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["toward", "away"],
        optionTitles: ["Toward", "Away"],
        displaySegmentedControl: true,
        defaultValue: "toward",
        hidden: (props: any) =>
            (props.slideCount ?? 0) < 1 || props.overlayMode === "stationary",
    },

    overlaySmoothing: {
        type: ControlType.Number,
        title: "Smoothing",
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    // ── Reveal on View ──────────────────────────────────

    autoplay: {
        type: ControlType.Boolean,
        title: "Reveal on View",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        description:
            "Shows overlay when the card enters view. Useful on touch devices.",
        hidden: (props: any) => (props.slideCount ?? 0) < 1,
    },

    // ── Tilt ─────────────────────────────────────────────

    tilt: {
        type: ControlType.Boolean,
        title: "Tilt",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },

    behavior: {
        type: ControlType.Enum,
        title: "Tilt Behavior",
        options: ["follow", "repel"],
        optionTitles: ["Follow", "Repel"],
        displaySegmentedControl: true,
        defaultValue: "follow",
        description: "Follow tilts toward the pointer. Repel tilts away.",
        hidden: (props: any) => !props.tilt,
    },

    tiltLimit: {
        type: ControlType.Number,
        title: "Tilt Limit",
        defaultValue: 20,
        min: 1,
        max: 45,
        step: 1,
        unit: "°",
        displayStepper: true,
        hidden: (props: any) => !props.tilt,
    },

    scale: {
        type: ControlType.Number,
        title: "Scale",
        defaultValue: 1.1,
        min: 1,
        max: 2,
        step: 0.05,
        displayStepper: true,
        hidden: (props: any) => !props.tilt,
    },

    perspective: {
        type: ControlType.Number,
        title: "Perspective",
        defaultValue: 5000,
        min: 100,
        max: 10000,
        step: 100,
        description: "Higher values flatten the effect",
        hidden: (props: any) => !props.tilt,
    },
})
