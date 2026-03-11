import { addPropertyControls, ControlType, RenderTarget } from "framer"
import React, { useRef, useEffect, useCallback } from "react"

// ─── Constants ────────────────────────────────────────────

const ACTIVE_SMOOTHING = 0.08
const RETURN_SMOOTHING = 0.05
const AUTO_INTENSITY = 0.5
const SETTLE_THRESHOLD = 0.01

const ALLOWED_MEDIA = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "mp4",
    "webm",
]

const VIDEO_EXTS = /\.(mp4|webm|mov|ogg)(\?|$)/i

// ─── Types ────────────────────────────────────────────────

type Interaction = "auto" | "cursor"
type Behavior = "follow" | "repel"
type ParallaxSource = "tilt" | "cursor"
type ParallaxDirection = "toward" | "away"
type ParallaxTracking = "hover" | "page"
type HoverParallax = "off" | "cursor" | "auto"
type BlendMode =
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "soft-light"
    | "hard-light"
    | "difference"
    | "exclusion"
    | "lighten"
    | "darken"

interface Props {
    children: React.ReactNode
    background: string
    tilt: boolean
    interaction: Interaction
    behavior: Behavior
    tiltLimit: number
    scale: number
    perspective: number
    speed: number
    parallax: boolean
    parallaxSource: ParallaxSource
    parallaxTracking: ParallaxTracking
    hoverParallax: HoverParallax
    parallaxDirection: ParallaxDirection
    parallaxAmount: number
    parallaxSmoothing: number
    layers: number
    mid1: string
    mid2: string
    mid3: string
    contentBlend: BlendMode
    mid1Blend: BlendMode
    mid2Blend: BlendMode
    mid3Blend: BlendMode
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
 * DepthMotionCMS — CMS-optimised multi-layer tilt and parallax.
 *
 * Designed for use inside CMS collections. Unlike DepthMotionStacked,
 * this variant uses no ComponentInstance slots, so content can be
 * nested via the Framer layers panel (drag layers inside). Background
 * and mid-layers accept image or video files that can be bound
 * directly to CMS media fields.
 *
 * Structure in Framer:
 *   → Drag your content layers directly into this component
 *   → Turn Parallax on and upload/bind a Background media file
 *   → Set Layers (1–3) and upload/bind mid-layer media files
 *   → All layers shift at auto-calculated depth rates
 */
export default function DepthMotionCMS(props: Props) {
    const {
        children,
        background,
        tilt = true,
        interaction = "cursor",
        behavior = "follow",
        tiltLimit = 20,
        scale: hoverScale = 1.1,
        perspective = 5000,
        speed = 0.5,
        parallax = false,
        parallaxSource = "tilt",
        parallaxTracking = "hover",
        hoverParallax = "off",
        parallaxDirection = "toward",
        parallaxAmount = 20,
        parallaxSmoothing = 0.5,
        layers = 0,
        mid1,
        mid2,
        mid3,
        contentBlend = "normal",
        mid1Blend = "normal",
        mid2Blend = "normal",
        mid3Blend = "normal",
        style,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const bgRef = useRef<HTMLDivElement>(null)
    const mid1Ref = useRef<HTMLDivElement>(null)
    const mid2Ref = useRef<HTMLDivElement>(null)
    const mid3Ref = useRef<HTMLDivElement>(null)
    const fgRef = useRef<HTMLDivElement>(null)
    const rafId = useRef(0)
    const loopRunning = useRef(false)
    const hovering = useRef(false)

    // Tilt state (applied to the surface)
    const target = useRef({ rx: 0, ry: 0, s: 1 })
    const current = useRef({ rx: 0, ry: 0, s: 1 })

    // Parallax state — one normalised vector, split at render time
    // into depth-weighted translations for each layer.
    const pTarget = useRef({ tx: 0, ty: 0 })
    const pCurrent = useRef({ tx: 0, ty: 0 })

    // Latest props in a ref so callbacks stay stable
    const cfg = useRef({
        tilt,
        interaction,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
        parallax,
        parallaxSource,
        parallaxTracking,
        hoverParallax,
        parallaxDirection,
        parallaxAmount,
        parallaxSmoothing,
        layers,
    })
    cfg.current = {
        tilt,
        interaction,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
        parallax,
        parallaxSource,
        parallaxTracking,
        hoverParallax,
        parallaxDirection,
        parallaxAmount,
        parallaxSmoothing,
        layers,
    }

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    // ── Render Loop ─────────────────────────────────────

    const tick = useCallback((time: number) => {
        const el = surfaceRef.current
        if (!el) return

        const {
            tilt: tiltEnabled,
            interaction: mode,
            tiltLimit: limit,
            speed: spd,
            parallax: pEnabled,
            parallaxSource: pSource,
            parallaxAmount: pAmt,
            parallaxDirection: pDir,
            parallaxSmoothing: pSmooth,
            layers: lc,
        } = cfg.current

        const c = current.current
        const t = target.current
        const pc = pCurrent.current
        const pt = pTarget.current

        // Auto tilt: organic Lissajous, paused on hover
        if (tiltEnabled && mode === "auto" && !hovering.current) {
            const sec = time * 0.001 * spd
            t.rx = Math.sin(sec * 0.6 + 0.3) * limit * AUTO_INTENSITY
            t.ry = Math.cos(sec * 0.4) * limit * AUTO_INTENSITY
            t.s = 1
        }

        // ── Parallax target computation ───────────────────
        if (pEnabled) {
            if (tiltEnabled && mode === "auto" && hovering.current) {
                // Hover state in auto tilt mode — depends on hoverParallax
                const hpMode = cfg.current.hoverParallax
                if (hpMode === "off") {
                    // Parallax also pauses
                    pt.tx = 0
                    pt.ty = 0
                } else if (hpMode === "auto") {
                    // Phantom Lissajous: compute what tilt *would* be,
                    // derive parallax from it (tilt itself stays neutral)
                    const sec = time * 0.001 * spd
                    const phRx =
                        Math.sin(sec * 0.6 + 0.3) * limit * AUTO_INTENSITY
                    const phRy =
                        Math.cos(sec * 0.4) * limit * AUTO_INTENSITY
                    const dirMul = pDir === "away" ? -1 : 1
                    const nRy = limit > 0 ? phRy / limit : 0
                    const nRx = limit > 0 ? phRx / limit : 0
                    pt.tx = nRy * pAmt * dirMul
                    pt.ty = -nRx * pAmt * dirMul
                }
                // "cursor" — pTarget driven by onPointerMove, skip
            } else if (
                tiltEnabled &&
                (mode === "auto" || pSource === "tilt")
            ) {
                // Derive parallax from current tilt target
                const dirMul = pDir === "away" ? -1 : 1
                const nRy = limit > 0 ? t.ry / limit : 0
                const nRx = limit > 0 ? t.rx / limit : 0
                pt.tx = nRy * pAmt * dirMul
                pt.ty = -nRx * pAmt * dirMul
            }
            // Tilt off + source "tilt": no branch fires → parallax stays at 0
            // Source "cursor": pTarget set by pointer handlers
        }

        // ── Lerp tilt ───────────────────────────────────
        if (tiltEnabled) {
            const smooth =
                hovering.current || mode === "auto"
                    ? ACTIVE_SMOOTHING
                    : RETURN_SMOOTHING

            c.rx = lerp(c.rx, t.rx, smooth)
            c.ry = lerp(c.ry, t.ry, smooth)
            c.s = lerp(c.s, t.s, smooth)

            el.style.transform = `rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale(${c.s.toFixed(4)})`
        } else {
            // Tilt off — clear any stale rotation
            c.rx = 0
            c.ry = 0
            c.s = 1
            t.rx = 0
            t.ry = 0
            t.s = 1
            el.style.transform = ""
        }

        // ── Lerp parallax (multi-layer depth split) ──────
        if (pEnabled) {
            const pLerp = 0.15 - pSmooth * 0.13
            pc.tx = lerp(pc.tx, pt.tx, pLerp)
            pc.ty = lerp(pc.ty, pt.ty, pLerp)

            // Total layers: background + mid layers + foreground
            const n = 2 + lc
            // Depth factor for layer at index i: -0.5 + i / (n - 1)
            // bg (i=0) → -0.5, fg (i=n-1) → +0.5

            // Background — always deepest
            if (bgRef.current) {
                bgRef.current.style.transform =
                    `translate3d(${(-0.5 * pc.tx).toFixed(2)}px, ${(-0.5 * pc.ty).toFixed(2)}px, 0)`
            }

            // Mid layers — auto-distributed between bg and fg
            if (lc >= 1 && mid1Ref.current) {
                const f = -0.5 + 1 / (n - 1)
                mid1Ref.current.style.transform =
                    `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
            }
            if (lc >= 2 && mid2Ref.current) {
                const f = -0.5 + 2 / (n - 1)
                mid2Ref.current.style.transform =
                    `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
            }
            if (lc >= 3 && mid3Ref.current) {
                const f = -0.5 + 3 / (n - 1)
                mid3Ref.current.style.transform =
                    `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
            }

            // Foreground — always shallowest
            if (fgRef.current) {
                fgRef.current.style.transform =
                    `translate3d(${(0.5 * pc.tx).toFixed(2)}px, ${(0.5 * pc.ty).toFixed(2)}px, 0)`
            }
        }

        // ── Settle check ────────────────────────────────
        const tiltSettled =
            !tiltEnabled ||
            (Math.abs(c.rx - t.rx) < SETTLE_THRESHOLD &&
                Math.abs(c.ry - t.ry) < SETTLE_THRESHOLD &&
                Math.abs(c.s - t.s) < SETTLE_THRESHOLD)

        const parallaxSettled =
            !pEnabled ||
            (Math.abs(pc.tx - pt.tx) < SETTLE_THRESHOLD &&
                Math.abs(pc.ty - pt.ty) < SETTLE_THRESHOLD)

        const autoKeepAlive = tiltEnabled && mode === "auto"

        if (tiltSettled && parallaxSettled && !autoKeepAlive) {
            // Snap to exact values
            if (tiltEnabled) {
                c.rx = t.rx
                c.ry = t.ry
                c.s = t.s
                el.style.transform = `rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.s})`
            }

            if (pEnabled) {
                pc.tx = pt.tx
                pc.ty = pt.ty

                const n = 2 + lc

                if (bgRef.current)
                    bgRef.current.style.transform =
                        `translate3d(${(-0.5 * pc.tx).toFixed(2)}px, ${(-0.5 * pc.ty).toFixed(2)}px, 0)`

                if (lc >= 1 && mid1Ref.current) {
                    const f = -0.5 + 1 / (n - 1)
                    mid1Ref.current.style.transform =
                        `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
                }
                if (lc >= 2 && mid2Ref.current) {
                    const f = -0.5 + 2 / (n - 1)
                    mid2Ref.current.style.transform =
                        `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
                }
                if (lc >= 3 && mid3Ref.current) {
                    const f = -0.5 + 3 / (n - 1)
                    mid3Ref.current.style.transform =
                        `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
                }

                if (fgRef.current)
                    fgRef.current.style.transform =
                        `translate3d(${(0.5 * pc.tx).toFixed(2)}px, ${(0.5 * pc.ty).toFixed(2)}px, 0)`
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
        const tiltOn = cfg.current.tilt
        const mode = cfg.current.interaction
        hovering.current = true

        if (tiltOn && mode === "cursor") {
            target.current.s = cfg.current.hoverScale
        } else if (tiltOn && mode === "auto") {
            target.current.rx = 0
            target.current.ry = 0
            target.current.s = 1
            // Only kill parallax when hover parallax is off.
            // "cursor" and "auto" keep parallax alive during hover.
            if (
                !cfg.current.parallax ||
                cfg.current.hoverParallax === "off"
            ) {
                pTarget.current.tx = 0
                pTarget.current.ty = 0
            }
        }
        startLoop()
    }, [isCanvas, startLoop])

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (isCanvas) return
            const tiltOn = cfg.current.tilt
            const mode = cfg.current.interaction

            // What does this event need to drive?
            const needsTilt = tiltOn && mode === "cursor"
            const needsCursorParallax =
                cfg.current.parallax &&
                cfg.current.parallaxSource === "cursor" &&
                cfg.current.parallaxTracking === "hover" &&
                !(tiltOn && mode === "auto")
            const needsHoverCursorParallax =
                tiltOn &&
                mode === "auto" &&
                cfg.current.parallax &&
                cfg.current.hoverParallax === "cursor"

            if (
                !needsTilt &&
                !needsCursorParallax &&
                !needsHoverCursorParallax
            )
                return

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

            // Tilt rotation — only in cursor tilt mode
            if (needsTilt) {
                const dir = cfg.current.behavior === "repel" ? -1 : 1
                target.current.rx = -ny * cfg.current.tiltLimit * dir
                target.current.ry = nx * cfg.current.tiltLimit * dir
            }

            // Cursor-source parallax (hover tracking, or hover-cursor in auto)
            if (needsCursorParallax || needsHoverCursorParallax) {
                const pDir =
                    cfg.current.parallaxDirection === "away" ? -1 : 1
                const pAmt = cfg.current.parallaxAmount
                pTarget.current.tx = nx * pAmt * pDir
                pTarget.current.ty = ny * pAmt * pDir
            }

            startLoop()
        },
        [isCanvas, startLoop]
    )

    const onPointerLeave = useCallback(() => {
        if (isCanvas) return
        const tiltOn = cfg.current.tilt
        const mode = cfg.current.interaction
        hovering.current = false

        // Reset tilt to neutral
        if (tiltOn && mode === "cursor") {
            target.current.rx = 0
            target.current.ry = 0
            target.current.s = 1
        }

        // Reset cursor-source parallax on leave (hover tracking only).
        // Page tracking keeps going via global listener.
        // In auto tilt mode, the tick loop resumes tilt-derived parallax.
        if (
            cfg.current.parallax &&
            cfg.current.parallaxSource === "cursor" &&
            cfg.current.parallaxTracking !== "page" &&
            !(tiltOn && mode === "auto")
        ) {
            pTarget.current.tx = 0
            pTarget.current.ty = 0
        }

        startLoop()
    }, [isCanvas, startLoop])

    // ── Auto Tilt Animation Start ─────────────────────────

    useEffect(() => {
        if (!tilt || interaction !== "auto" || isCanvas) return
        target.current = { rx: 0, ry: 0, s: 1 }
        current.current = { rx: 0, ry: 0, s: 1 }
        pTarget.current = { tx: 0, ty: 0 }
        pCurrent.current = { tx: 0, ty: 0 }
        startLoop()
        return () => {
            cancelAnimationFrame(rafId.current)
            loopRunning.current = false
        }
    }, [tilt, interaction, isCanvas, startLoop])

    // ── Reset on Mode / Tilt Change ──────────────────────

    useEffect(() => {
        target.current = { rx: 0, ry: 0, s: 1 }
        pTarget.current = { tx: 0, ty: 0 }
        startLoop()
    }, [tilt, interaction, startLoop])

    // ── Page-level Parallax Tracking ─────────────────────

    useEffect(() => {
        if (isCanvas) return
        if (
            !parallax ||
            parallaxSource !== "cursor" ||
            parallaxTracking !== "page" ||
            (tilt && interaction === "auto")
        )
            return

        const onGlobalMove = (e: PointerEvent) => {
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

            const pDir =
                cfg.current.parallaxDirection === "away" ? -1 : 1
            const pAmt = cfg.current.parallaxAmount
            pTarget.current.tx = nx * pAmt * pDir
            pTarget.current.ty = ny * pAmt * pDir
            startLoop()
        }

        window.addEventListener("pointermove", onGlobalMove)
        return () => window.removeEventListener("pointermove", onGlobalMove)
    }, [
        tilt,
        parallax,
        parallaxSource,
        parallaxTracking,
        interaction,
        isCanvas,
        startLoop,
    ])

    // ── Cleanup ─────────────────────────────────────────

    useEffect(() => () => cancelAnimationFrame(rafId.current), [])

    // ── Empty State ─────────────────────────────────────

    if (!children) {
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
                Drag content inside →
            </div>
        )
    }

    // ── Render ──────────────────────────────────────────

    const containerStyle: React.CSSProperties = {
        ...style,
        ...(tilt ? { perspective: `${perspective}px` } : {}),
        overflow: "visible",
    }

    // When parallax is off, render flat (no layer splitting).
    if (!parallax) {
        return (
            <div
                ref={containerRef}
                style={containerStyle}
                onPointerEnter={onPointerEnter}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
            >
                <div
                    ref={surfaceRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        willChange: tilt ? "transform" : undefined,
                    }}
                >
                    {children}
                </div>
            </div>
        )
    }

    // Shared style for mid-layer divs
    const midLayerBase: React.CSSProperties = {
        position: "absolute",
        inset: `${-parallaxAmount * 0.6}px`,
        willChange: "transform",
    }

    // Parallax on: multi-layer structure.
    // DOM order = visual stack order (bottom to top):
    // Background → Layer 1 → Layer 2 → Layer 3 → Content
    return (
        <div
            ref={containerRef}
            style={containerStyle}
            onPointerEnter={onPointerEnter}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
        >
            <div
                ref={surfaceRef}
                style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    isolation: "isolate",
                    willChange: tilt ? "transform" : undefined,
                }}
            >
                {/* Background layer — deepest, shifts most opposite */}
                {background && (
                    <div
                        ref={bgRef}
                        style={{
                            position: "absolute",
                            // Oversized so translated edges stay covered
                            inset: `${-parallaxAmount * 0.6}px`,
                            willChange: "transform",
                        }}
                    >
                        <Media src={background} />
                    </div>
                )}

                {/* Mid layers — auto-distributed depth between bg and fg */}
                {layers >= 1 && mid1 && (
                    <div
                        ref={mid1Ref}
                        style={{
                            ...midLayerBase,
                            mixBlendMode:
                                mid1Blend !== "normal"
                                    ? mid1Blend
                                    : undefined,
                        }}
                    >
                        <Media src={mid1} />
                    </div>
                )}
                {layers >= 2 && mid2 && (
                    <div
                        ref={mid2Ref}
                        style={{
                            ...midLayerBase,
                            mixBlendMode:
                                mid2Blend !== "normal"
                                    ? mid2Blend
                                    : undefined,
                        }}
                    >
                        <Media src={mid2} />
                    </div>
                )}
                {layers >= 3 && mid3 && (
                    <div
                        ref={mid3Ref}
                        style={{
                            ...midLayerBase,
                            mixBlendMode:
                                mid3Blend !== "normal"
                                    ? mid3Blend
                                    : undefined,
                        }}
                    >
                        <Media src={mid3} />
                    </div>
                )}

                {/* Foreground / content layer — shallowest, shifts with motion */}
                <div
                    ref={fgRef}
                    style={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                        willChange: "transform",
                        mixBlendMode:
                            contentBlend !== "normal"
                                ? contentBlend
                                : undefined,
                    }}
                >
                    {children}
                </div>
            </div>
        </div>
    )
}

// ─── Blend Mode Options (shared) ─────────────────────────

const BLEND_OPTIONS = [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "soft-light",
    "hard-light",
    "difference",
    "exclusion",
    "lighten",
    "darken",
]

const BLEND_TITLES = [
    "Normal",
    "Multiply",
    "Screen",
    "Overlay",
    "Soft Light",
    "Hard Light",
    "Difference",
    "Exclusion",
    "Lighten",
    "Darken",
]

// ─── Framer Property Controls ─────────────────────────────

addPropertyControls(DepthMotionCMS, {
    // No "content" slot — content is nested via the layers panel (children)

    // ── Tilt ─────────────────────────────────────────────

    tilt: {
        type: ControlType.Boolean,
        title: "Tilt",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },

    interaction: {
        type: ControlType.Enum,
        title: "Interaction",
        options: ["auto", "cursor"],
        optionTitles: ["Auto", "Cursor"],
        defaultValue: "cursor",
        hidden: (props: any) => !props.tilt,
    },

    behavior: {
        type: ControlType.Enum,
        title: "Behavior",
        options: ["follow", "repel"],
        optionTitles: ["Follow", "Repel"],
        displaySegmentedControl: true,
        defaultValue: "follow",
        hidden: (props: any) =>
            !props.tilt || props.interaction === "auto",
    },

    speed: {
        type: ControlType.Number,
        title: "Speed",
        defaultValue: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
        hidden: (props: any) =>
            !props.tilt || props.interaction !== "auto",
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
        hidden: (props: any) =>
            !props.tilt || props.interaction === "auto",
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

    // ── Parallax ────────────────────────────────────────

    parallax: {
        type: ControlType.Boolean,
        title: "Parallax",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
    },

    // ── Layer stack (panel reads top → bottom = front → back) ──

    // Content blend (foreground — topmost layer)
    contentBlend: {
        type: ControlType.Enum,
        title: "Content Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax,
    },

    layers: {
        type: ControlType.Number,
        title: "Layers",
        defaultValue: 0,
        min: 0,
        max: 3,
        step: 1,
        displayStepper: true,
        hidden: (props: any) => !props.parallax,
    },

    // Layer 3 — shallowest mid-layer (closest to content)
    mid3: {
        type: ControlType.File,
        title: "Layer 3",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) => !props.parallax || props.layers < 3,
    },

    mid3Blend: {
        type: ControlType.Enum,
        title: "Layer 3 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || props.layers < 3,
    },

    // Layer 2 — middle mid-layer
    mid2: {
        type: ControlType.File,
        title: "Layer 2",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) => !props.parallax || props.layers < 2,
    },

    mid2Blend: {
        type: ControlType.Enum,
        title: "Layer 2 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || props.layers < 2,
    },

    // Layer 1 — deepest mid-layer (closest to background)
    mid1: {
        type: ControlType.File,
        title: "Layer 1",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) => !props.parallax || props.layers < 1,
    },

    mid1Blend: {
        type: ControlType.Enum,
        title: "Layer 1 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || props.layers < 1,
    },

    // Background — deepest layer
    background: {
        type: ControlType.File,
        title: "Background",
        allowedFileTypes: ALLOWED_MEDIA,
        hidden: (props: any) => !props.parallax,
    },

    // ── Motion behavior ─────────────────────────────────

    parallaxSource: {
        type: ControlType.Enum,
        title: "Source",
        options: ["tilt", "cursor"],
        optionTitles: ["Tilt", "Cursor"],
        displaySegmentedControl: true,
        defaultValue: "tilt",
        hidden: (props: any) => !props.parallax,
    },

    hoverParallax: {
        type: ControlType.Enum,
        title: "Hover Parallax",
        options: ["off", "cursor", "auto"],
        optionTitles: ["Off", "Cursor", "Auto"],
        defaultValue: "off",
        hidden: (props: any) =>
            !props.parallax ||
            !props.tilt ||
            props.interaction !== "auto",
    },

    parallaxTracking: {
        type: ControlType.Enum,
        title: "Tracking",
        options: ["hover", "page"],
        optionTitles: ["Hover", "Page"],
        displaySegmentedControl: true,
        defaultValue: "hover",
        hidden: (props: any) =>
            !props.parallax || props.parallaxSource !== "cursor",
    },

    parallaxDirection: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["toward", "away"],
        optionTitles: ["Toward", "Away"],
        displaySegmentedControl: true,
        defaultValue: "toward",
        hidden: (props: any) => !props.parallax,
    },

    // ── Motion tuning ───────────────────────────────────

    parallaxAmount: {
        type: ControlType.Number,
        title: "Amount",
        defaultValue: 20,
        min: 1,
        max: 60,
        step: 1,
        unit: "px",
        displayStepper: true,
        hidden: (props: any) => !props.parallax,
    },

    parallaxSmoothing: {
        type: ControlType.Number,
        title: "Smoothing",
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        hidden: (props: any) => !props.parallax,
    },
})
