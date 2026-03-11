import { addPropertyControls, ControlType, RenderTarget } from "framer"
import React, { useRef, useEffect, useCallback } from "react"

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

const ALLOWED_VIDEO = ["mp4", "webm"]

interface Props {
    // Media (Image + Video fallback for CMS binding flexibility)
    background: string
    backgroundVideo: string
    overlay: string
    overlayVideo: string

    // Border Radius
    backgroundRadius: number
    overlayRadius: number

    // Overlay
    overlaySize: number
    overlayMode: OverlayMode
    overlayAmount: number
    overlayDirection: OverlayDirection
    overlaySmoothing: number

    // Autoplay (viewport-based)
    autoplay: boolean

    // Tilt
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
    style,
}: {
    src: string
    style?: React.CSSProperties
}) {
    const base: React.CSSProperties = {
        width: "100%",
        height: "100%",
        objectFit: "cover",
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

// ─── Component ────────────────────────────────────────────

/**
 * CmsMotion — CMS-friendly hover-reveal card with 3D tilt.
 *
 * A background thumbnail is always visible. On hover, a secondary
 * overlay media fades in and optionally follows the cursor. The
 * entire card tilts in 3D. All media inputs use ControlType.Image
 * for native CMS field binding — no ComponentInstance slots.
 *
 * Structure in Framer:
 *   → Bind a CMS image/video to Background (always visible)
 *   → Bind a CMS image/video to Overlay (revealed on hover)
 *   → Adjust overlay size, border radii, and cursor-follow settings
 *   → Toggle tilt on/off and tune the 3D effect
 */
export default function CmsMotion(props: Props) {
    const {
        background,
        backgroundVideo,
        overlay,
        overlayVideo,
        backgroundRadius = 0,
        overlayRadius = 0,
        overlaySize = 80,
        overlayMode = "cursor",
        overlayAmount = 100,
        overlayDirection = "toward",
        overlaySmoothing = 0.5,
        autoplay = false,
        tilt = true,
        behavior = "follow",
        tiltLimit = 20,
        scale: hoverScale = 1.1,
        perspective = 5000,
        style,
    } = props

    // Resolve media: video takes priority over image
    const bgSrc = backgroundVideo || background
    const overlaySrc = overlayVideo || overlay

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

    // Latest props in a ref so callbacks stay stable
    const cfg = useRef({
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
    })
    cfg.current = {
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
    }

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

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

        if (tiltSettled && posSettled && opacitySettled) {
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

        // Fade overlay in
        overlayOpTarget.current = 1

        // Tilt hover scale
        if (cfg.current.tilt) {
            tiltTarget.current.s = cfg.current.hoverScale
        }

        startLoop()
    }, [isCanvas, startLoop])

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (isCanvas) return

            const el = containerRef.current
            if (!el) return

            const rect = el.getBoundingClientRect()
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
            // Max offset = half the gap between overlay and card edge
            // Amount (0–100%) controls how much of that range is used
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

        // Reset tilt
        tiltTarget.current.rx = 0
        tiltTarget.current.ry = 0
        tiltTarget.current.s = 1

        // Reset overlay position (cursor no longer tracked)
        overlayPosTarget.current.tx = 0
        overlayPosTarget.current.ty = 0

        // If autoplay is active and card is in view, keep overlay
        // visible (stationary) instead of fading out
        if (cfg.current.autoplay && inView.current) {
            // Overlay stays at opacity 1, centered
        } else {
            overlayOpTarget.current = 0
        }

        startLoop()
    }, [isCanvas, startLoop])

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
                    startLoop()
                } else if (!entry.isIntersecting) {
                    // Card left viewport — fade overlay out
                    overlayOpTarget.current = 0
                    overlayPosTarget.current.tx = 0
                    overlayPosTarget.current.ty = 0
                    startLoop()
                }
            },
            { threshold: 0.5 }
        )

        observer.observe(el)
        return () => observer.disconnect()
    }, [autoplay, isCanvas, startLoop])

    // ── Cleanup ──────────────────────────────────────────

    useEffect(() => () => cancelAnimationFrame(rafId.current), [])

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
            onPointerEnter={onPointerEnter}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
        >
            {/* Surface tilts — NO overflow hidden here so 3D isn't flattened */}
            <div
                ref={surfaceRef}
                style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    willChange: tilt ? "transform" : undefined,
                }}
            >
                {/* Clip div — border radius + overflow hidden contained here */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        overflow: "hidden",
                        borderRadius: backgroundRadius,
                    }}
                >
                    {/* Background — always visible */}
                    <div style={{ position: "absolute", inset: 0 }}>
                        <Media src={bgSrc} />
                    </div>

                    {/* Overlay — fades in on hover, optionally follows cursor */}
                    {overlaySrc && (
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
                                    borderRadius: overlayRadius,
                                    overflow: "hidden",
                                }}
                            >
                                <Media src={overlaySrc} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Framer Property Controls ─────────────────────────────

addPropertyControls(CmsMotion, {
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

    overlay: {
        type: ControlType.Image,
        title: "Overlay Image",
    },

    overlayVideo: {
        type: ControlType.File,
        title: "Overlay Video",
        allowedFileTypes: ALLOWED_VIDEO,
    },

    // ── Border Radius ────────────────────────────────────

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

    overlayRadius: {
        type: ControlType.Number,
        title: "Overlay Radius",
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 1,
        unit: "px",
        displayStepper: true,
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
    },

    overlayMode: {
        type: ControlType.Enum,
        title: "Overlay Mode",
        options: ["cursor", "stationary"],
        optionTitles: ["Cursor", "Stationary"],
        displaySegmentedControl: true,
        defaultValue: "cursor",
    },

    overlayAmount: {
        type: ControlType.Number,
        title: "Distance",
        defaultValue: 100,
        min: 0,
        max: 150,
        step: 5,
        unit: "%",
        hidden: (props: any) => props.overlayMode === "stationary",
    },

    overlayDirection: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["toward", "away"],
        optionTitles: ["Toward", "Away"],
        displaySegmentedControl: true,
        defaultValue: "toward",
        hidden: (props: any) => props.overlayMode === "stationary",
    },

    overlaySmoothing: {
        type: ControlType.Number,
        title: "Smoothing",
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
    },

    // ── Autoplay ──────────────────────────────────────────

    autoplay: {
        type: ControlType.Boolean,
        title: "Autoplay",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        description: "Show overlay when card scrolls into view (mobile/tablet friendly)",
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
        title: "Behavior",
        options: ["follow", "repel"],
        optionTitles: ["Follow", "Repel"],
        displaySegmentedControl: true,
        defaultValue: "follow",
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
        description: "Depth strength",
        hidden: (props: any) => !props.tilt,
    },
})
