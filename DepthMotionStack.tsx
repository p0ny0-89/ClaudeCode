import { addPropertyControls, ControlType, RenderTarget } from "framer"
import React, { useRef, useEffect, useCallback, useId } from "react"

// ─── Constants ────────────────────────────────────────────

const ACTIVE_SMOOTHING = 0.08
const RETURN_SMOOTHING = 0.05
const AUTO_INTENSITY = 0.5
const SETTLE_THRESHOLD = 0.01

// ─── Types ────────────────────────────────────────────────

type Interaction = "auto" | "cursor"
type Behavior = "follow" | "repel"
type ParallaxSource = "tilt" | "cursor"
type ParallaxDirection = "toward" | "away"
type ParallaxTracking = "hover" | "page"
type HoverParallax = "off" | "cursor" | "auto"
type Activation = "hover" | "always" | "click"
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
    content: React.ReactNode
    background: React.ReactNode
    tilt: boolean
    interaction: Interaction
    behavior: Behavior
    touchDrag: boolean
    tiltLimit: number
    scale: number
    perspective: number
    speed: number
    parallax: boolean
    activation: Activation
    parallaxSource: ParallaxSource
    parallaxTracking: ParallaxTracking
    hoverParallax: HoverParallax
    parallaxDirection: ParallaxDirection
    parallaxAmount: number
    parallaxSmoothing: number
    layers: number
    mid1: React.ReactNode
    mid2: React.ReactNode
    mid3: React.ReactNode
    mid4: React.ReactNode
    mid5: React.ReactNode
    clipContent: boolean
    contentBlend: BlendMode
    mid1Blend: BlendMode
    mid2Blend: BlendMode
    mid3Blend: BlendMode
    mid4Blend: BlendMode
    mid5Blend: BlendMode
    contentOpacity: number
    mid1Opacity: number
    mid2Opacity: number
    mid3Opacity: number
    mid4Opacity: number
    mid5Opacity: number
    bgOpacity: number
    style?: React.CSSProperties
}

// ─── Helpers ──────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi)
}

// ─── Component ────────────────────────────────────────────

// @framerSupportedLayoutWidth any
// @framerSupportedLayoutHeight any
// @framerIntrinsicWidth 400
// @framerIntrinsicHeight 400
// @framerDisableUnlink
export default function DepthMotionStack(props: Props) {
    const {
        content,
        background,
        tilt = true,
        interaction = "cursor",
        behavior = "follow",
        touchDrag = false,
        tiltLimit = 20,
        scale: hoverScale = 1.1,
        perspective = 5000,
        speed = 0.5,
        parallax = false,
        activation = "hover" as Activation,
        parallaxSource = "tilt",
        parallaxTracking = "hover",
        hoverParallax = "off",
        parallaxDirection = "toward",
        parallaxAmount = 20,
        parallaxSmoothing = 0.5,
        layers: layerCount = 0,
        mid1 = null,
        mid2 = null,
        mid3 = null,
        mid4 = null,
        mid5 = null,
        clipContent = false,
        contentBlend = "normal",
        mid1Blend = "normal" as BlendMode,
        mid2Blend = "normal" as BlendMode,
        mid3Blend = "normal" as BlendMode,
        mid4Blend = "normal" as BlendMode,
        mid5Blend = "normal" as BlendMode,
        contentOpacity = 100,
        mid1Opacity = 100,
        mid2Opacity = 100,
        mid3Opacity = 100,
        mid4Opacity = 100,
        mid5Opacity = 100,
        bgOpacity = 100,
        style,
    } = props

    // Build ordered arrays from individual layer props
    const midLayersArr = [mid1, mid2, mid3, mid4, mid5].slice(0, layerCount)
    const midBlendsArr = [mid1Blend, mid2Blend, mid3Blend, mid4Blend, mid5Blend].slice(0, layerCount)
    const midOpacitiesArr = [mid1Opacity, mid2Opacity, mid3Opacity, mid4Opacity, mid5Opacity].slice(0, layerCount)

    // Scoped CSS classes to force Framer slot children to fill their layer.
    // bgFillClass uses min-width/min-height so the background's intrinsic
    // dimensions flow through for auto-sizing, while still stretching when
    // the component has explicit dimensions set on canvas.
    const scopeId = useId().replace(/:/g, "")
    const fillClass = `dms-fill-${scopeId}`
    const bgFillClass = `dms-bgfill-${scopeId}`

    const containerRef = useRef<HTMLDivElement>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const bgRef = useRef<HTMLDivElement>(null)
    const midRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null])
    const fgRef = useRef<HTMLDivElement>(null)
    const rafId = useRef(0)
    const loopRunning = useRef(false)
    const hovering = useRef(false)
    const touchCaptured = useRef(false)
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const holdStart = useRef<{ x: number; y: number; pointerId: number; target: HTMLElement } | null>(null)

    // Cached bounding rect — avoids getBoundingClientRect() feedback
    // loop caused by 3D perspective distorting the projected rect
    const cachedRect = useRef<DOMRect | null>(null)

    // Tilt state (applied to the surface)
    const target = useRef({ rx: 0, ry: 0, s: 1 })
    const current = useRef({ rx: 0, ry: 0, s: 1 })

    // Parallax state — one normalised vector, split at render time
    // into depth-weighted translations for each layer.
    const pTarget = useRef({ tx: 0, ty: 0 })
    const pCurrent = useRef({ tx: 0, ty: 0 })

    // Click-to-activate toggle state
    const clickActive = useRef(false)

    // Latest props in a ref so callbacks stay stable
    const cfg = useRef({
        tilt,
        interaction,
        behavior,
        touchDrag,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
        parallax,
        activation,
        parallaxSource,
        parallaxTracking,
        hoverParallax,
        parallaxDirection,
        parallaxAmount,
        parallaxSmoothing,
        layerCount,
    })
    cfg.current = {
        tilt,
        interaction,
        behavior,
        touchDrag,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
        parallax,
        activation,
        parallaxSource,
        parallaxTracking,
        hoverParallax,
        parallaxDirection,
        parallaxAmount,
        parallaxSmoothing,
        layerCount,
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
            layerCount: lc,
        } = cfg.current

        const c = current.current
        const t = target.current
        const pc = pCurrent.current
        const pt = pTarget.current

        // Auto tilt: organic Lissajous, paused on hover (except "always" activation)
        if (tiltEnabled && mode === "auto" && (!hovering.current || cfg.current.activation === "always")) {
            const sec = time * 0.001 * spd
            t.rx = Math.sin(sec * 0.6 + 0.3) * limit * AUTO_INTENSITY
            t.ry = Math.cos(sec * 0.4) * limit * AUTO_INTENSITY
            t.s = 1
        }

        // ── Parallax target computation ───────────────────
        // In "always" activation, page-level listener sets pTarget directly — skip tick-based computation.
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
            // Depth factor for layer at index i: -1 to +1
            // bg (i=0) → -1, fg (i=n-1) → +1

            // Background — always deepest
            if (bgRef.current) {
                bgRef.current.style.transform =
                    `translate3d(${(-1 * pc.tx).toFixed(2)}px, ${(-1 * pc.ty).toFixed(2)}px, 0)`
            }

            // Mid layers — auto-distributed between bg and fg
            for (let i = 0; i < lc; i++) {
                const ref = midRefs.current[i]
                if (ref) {
                    const f = -1 + (i + 1) / (n - 1) * 2
                    ref.style.transform =
                        `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
                }
            }

            // Foreground — always shallowest
            if (fgRef.current) {
                fgRef.current.style.transform =
                    `translate3d(${(1 * pc.tx).toFixed(2)}px, ${(1 * pc.ty).toFixed(2)}px, 0)`
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

        if (tiltSettled && parallaxSettled && !autoKeepAlive && !hovering.current) {
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
                        `translate3d(${(-1 * pc.tx).toFixed(2)}px, ${(-1 * pc.ty).toFixed(2)}px, 0)`

                for (let i = 0; i < lc; i++) {
                    const ref = midRefs.current[i]
                    if (ref) {
                        const f = -1 + (i + 1) / (n - 1) * 2
                        ref.style.transform =
                            `translate3d(${(f * pc.tx).toFixed(2)}px, ${(f * pc.ty).toFixed(2)}px, 0)`
                    }
                }

                if (fgRef.current)
                    fgRef.current.style.transform =
                        `translate3d(${(1 * pc.tx).toFixed(2)}px, ${(1 * pc.ty).toFixed(2)}px, 0)`
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
        const act = cfg.current.activation

        // Only set hover state in "hover" mode (always/click manage their own)
        if (act === "hover") {
            hovering.current = true
        }

        const el = containerRef.current
        if (el) cachedRect.current = el.getBoundingClientRect()

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

    const cancelHold = useCallback(() => {
        if (holdTimer.current) {
            clearTimeout(holdTimer.current)
            holdTimer.current = null
        }
        holdStart.current = null
    }, [])

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (isCanvas) return

            // Cancel hold if finger moves too far before activation
            if (holdStart.current && !touchCaptured.current && e.pointerType === "touch") {
                const dx = e.clientX - holdStart.current.x
                const dy = e.clientY - holdStart.current.y
                if (dx * dx + dy * dy > HOLD_SLOP * HOLD_SLOP) {
                    cancelHold()
                    return
                }
            }

            const tiltOn = cfg.current.tilt
            const mode = cfg.current.interaction
            const act = cfg.current.activation

            // What does this event need to drive?
            const needsTilt = tiltOn && mode === "cursor"
            const needsCursorParallax =
                cfg.current.parallax &&
                cfg.current.parallaxSource === "cursor" &&
                !(tiltOn && mode === "auto") &&
                (act === "always" ||
                    (act === "hover" && cfg.current.parallaxTracking === "hover") ||
                    (act === "click" && clickActive.current))
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
        [isCanvas, startLoop, cancelHold]
    )

    const onPointerLeave = useCallback(() => {
        if (isCanvas) return
        // Don't reset during active touch drag — finger may leave bounds
        if (touchCaptured.current) return
        const tiltOn = cfg.current.tilt
        const mode = cfg.current.interaction
        const act = cfg.current.activation

        if (act === "hover") {
            // Standard hover: reset everything
            hovering.current = false
            cachedRect.current = null

            if (tiltOn && mode === "cursor") {
                target.current.rx = 0
                target.current.ry = 0
                target.current.s = 1
            }

            if (
                cfg.current.parallax &&
                cfg.current.parallaxSource === "cursor" &&
                cfg.current.parallaxTracking !== "page" &&
                !(tiltOn && mode === "auto")
            ) {
                pTarget.current.tx = 0
                pTarget.current.ty = 0
            }
        } else if (act === "click" && !clickActive.current) {
            cachedRect.current = null
        }
        // "always" and click-active: keep parallax at last position

        startLoop()
    }, [isCanvas, startLoop])

    // ── Touch Drag Handlers (hold-to-activate) ─────────────
    // A brief hold (~300 ms) with minimal movement activates the
    // effect.  Quick swipes pass through as normal page scrolls.

    const HOLD_DELAY = 300   // ms before activation
    const HOLD_SLOP  = 10    // px movement tolerance during hold

    const activateTouch = useCallback(
        (pointerId: number, el: HTMLElement) => {
            el.setPointerCapture(pointerId)
            touchCaptured.current = true
            hovering.current = true

            const container = containerRef.current
            if (container) cachedRect.current = container.getBoundingClientRect()

            if (cfg.current.tilt) {
                target.current.s = cfg.current.hoverScale
            }

            startLoop()
        },
        [startLoop]
    )


    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (isCanvas) return

            // Click-to-activate for mouse (non-touch) events
            if (cfg.current.activation === "click" && e.pointerType !== "touch") {
                clickActive.current = !clickActive.current
                if (clickActive.current) {
                    hovering.current = true
                    const el = containerRef.current
                    if (el) cachedRect.current = el.getBoundingClientRect()
                } else {
                    hovering.current = false
                    pTarget.current.tx = 0
                    pTarget.current.ty = 0
                }
                startLoop()
                return
            }

            // Touch drag hold-to-activate
            if (!cfg.current.touchDrag) return
            if (cfg.current.interaction !== "cursor") return
            if (e.pointerType !== "touch") return

            // Record start position and begin hold timer
            holdStart.current = {
                x: e.clientX,
                y: e.clientY,
                pointerId: e.pointerId,
                target: e.target as HTMLElement,
            }

            holdTimer.current = setTimeout(() => {
                const hs = holdStart.current
                if (hs) activateTouch(hs.pointerId, hs.target)
                holdTimer.current = null
            }, HOLD_DELAY)
        },
        [isCanvas, activateTouch, startLoop]
    )

    const onPointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (isCanvas) return
            if (!cfg.current.touchDrag) return
            if (e.pointerType !== "touch") return

            cancelHold()

            if (touchCaptured.current) {
                ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
                touchCaptured.current = false
                hovering.current = false
                cachedRect.current = null

                // Reset tilt
                if (cfg.current.tilt && cfg.current.interaction === "cursor") {
                    target.current.rx = 0
                    target.current.ry = 0
                    target.current.s = 1
                }

                // Reset cursor-source parallax
                if (
                    cfg.current.parallax &&
                    cfg.current.parallaxSource === "cursor" &&
                    cfg.current.parallaxTracking !== "page"
                ) {
                    pTarget.current.tx = 0
                    pTarget.current.ty = 0
                }

                startLoop()
            }
        },
        [isCanvas, startLoop, cancelHold]
    )

    // ── Block scroll, context menu & selection during active touch drag ──
    useEffect(() => {
        const el = containerRef.current
        if (!el || !touchDrag || interaction !== "cursor") return

        // Only block touchmove (scroll) when the effect is actually active
        const blockMove = (e: TouchEvent) => {
            if (touchCaptured.current) e.preventDefault()
        }
        const block = (e: Event) => {
            if (touchCaptured.current) e.preventDefault()
        }

        el.addEventListener("touchmove", blockMove, { passive: false })
        el.addEventListener("contextmenu", block)
        el.addEventListener("selectstart", block)

        return () => {
            el.removeEventListener("touchmove", blockMove)
            el.removeEventListener("contextmenu", block)
            el.removeEventListener("selectstart", block)
            if (holdTimer.current) clearTimeout(holdTimer.current)
        }
    }, [touchDrag, interaction])

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

    // ── Activation Mode: "Always" ────────────────────────

    useEffect(() => {
        if (isCanvas || activation !== "always") return
        hovering.current = true
        startLoop()
    }, [activation, isCanvas, startLoop])

    // ── Activation Mode Reset ────────────────────────────

    useEffect(() => {
        clickActive.current = false
        if (activation !== "always") {
            hovering.current = false
        }
        startLoop()
    }, [activation, startLoop])

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
            const rect =
                cachedRect.current ||
                containerRef.current?.getBoundingClientRect()
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

    if (!content) {
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
                Select content →
            </div>
        )
    }

    // ── Render ──────────────────────────────────────────

    const touchActive = touchDrag && interaction === "cursor"
    const containerStyle: React.CSSProperties = {
        ...style,
        ...(tilt ? { perspective: `${perspective}px` } : {}),
        overflow: "visible",
        ...(touchActive
            ? ({
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                  WebkitTapHighlightColor: "transparent",
              } as React.CSSProperties)
            : {}),
    }

    // When Framer provides explicit dimensions (Fixed / Fill), all slot
    // children must be 100% to fill responsively. When the component is
    // in Fit mode (no explicit width), the background's intrinsic
    // dimensions should flow through to auto-size the component.
    const isAutoSize = style?.width === undefined || style?.width === "auto"
    const bgClass = isAutoSize ? bgFillClass : fillClass

    const fillStyle = (
        <style>{`
.${fillClass} > * { width: 100% !important; height: 100% !important; pointer-events: auto !important; }
.${bgFillClass} > * { min-width: 100% !important; min-height: 100% !important; pointer-events: auto !important; }
        `}</style>
    )

    // When parallax is off, render flat (no layer splitting).
    if (!parallax) {
        return (
            <div
                ref={containerRef}
                style={containerStyle}
                onPointerEnter={onPointerEnter}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {fillStyle}
                <div
                    ref={surfaceRef}
                    className={bgClass}
                    style={{
                        width: "100%",
                        height: "100%",
                        overflow: clipContent ? "hidden" : "visible",
                        willChange: tilt ? "transform" : undefined,
                        ...(touchActive ? { pointerEvents: "none" as const } : {}),
                    }}
                >
                    {content}
                </div>
            </div>
        )
    }

    // Grid cell style — all layers overlap in the same cell.
    // pointer-events: none on wrapper so stacked layers don't block each other;
    // children get pointer-events: auto via CSS class below.
    const gridCell: React.CSSProperties = {
        gridRow: 1,
        gridColumn: 1,
        willChange: "transform",
        pointerEvents: "none",
    }

    // Parallax on: multi-layer structure (CSS Grid stacking).
    // All layers overlap in a single grid cell. The background's
    // intrinsic dimensions size the component when in Fit mode.
    // DOM order = visual stack order (bottom to top):
    // Background → Layer 1 → Layer 2 → Layer 3 → Content
    return (
        <div
            ref={containerRef}
            style={containerStyle}
            onPointerEnter={onPointerEnter}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            {fillStyle}
            <div
                ref={surfaceRef}
                style={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    isolation: "isolate",
                    willChange: tilt ? "transform" : undefined,
                    ...(touchActive ? { pointerEvents: "none" as const } : {}),
                }}
            >
                {/* Background layer — sizing reference.
                    In Fit mode (auto-size), uses bgFillClass so the slot
                    child's intrinsic dimensions flow through. In Fixed/Fill
                    mode, uses fillClass so content fills responsively. */}
                <div
                    ref={bgRef}
                    className={bgClass}
                    style={{
                        ...gridCell,
                        overflow: clipContent ? "hidden" : "visible",
                        opacity: bgOpacity < 100 ? bgOpacity / 100 : undefined,
                    }}
                >
                    {background}
                </div>

                {/* Mid layers — overlay on the bg via grid stacking */}
                {midLayersArr.map((layer, i) =>
                    layer ? (
                        <div
                            key={i}
                            ref={(el) => {
                                midRefs.current[i] = el
                            }}
                            className={fillClass}
                            style={{
                                ...gridCell,
                                overflow: clipContent ? "hidden" : "visible",
                                mixBlendMode:
                                    midBlendsArr[i] !== "normal"
                                        ? midBlendsArr[i]
                                        : undefined,
                                opacity: midOpacitiesArr[i] < 100 ? midOpacitiesArr[i] / 100 : undefined,
                            }}
                        >
                            {layer}
                        </div>
                    ) : null
                )}

                {/* Foreground / content — topmost layer */}
                <div
                    ref={fgRef}
                    className={fillClass}
                    style={{
                        ...gridCell,
                        overflow: clipContent ? "hidden" : "visible",
                        mixBlendMode:
                            contentBlend !== "normal"
                                ? contentBlend
                                : undefined,
                        opacity: contentOpacity < 100 ? contentOpacity / 100 : undefined,
                    }}
                >
                    {content}
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

addPropertyControls(DepthMotionStack, {
    content: {
        type: ControlType.ComponentInstance,
        title: "Foreground",
    },

    contentBlend: {
        type: ControlType.Enum,
        title: "Foreground Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax,
    },
    contentOpacity: {
        type: ControlType.Number,
        title: "Foreground Opacity",
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hidden: (props: any) => !props.parallax,
    },

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
        title: "Motion Mode",
        options: ["cursor", "auto"],
        optionTitles: ["Cursor", "Auto"],
        displaySegmentedControl: true,
        defaultValue: "cursor",
        description:
            "Cursor responds to pointer movement. Auto plays motion automatically and works well on touch devices.",
        hidden: (props: any) => !props.tilt,
    },

    behavior: {
        type: ControlType.Enum,
        title: "Cursor Behavior",
        options: ["follow", "repel"],
        optionTitles: ["Follow", "Repel"],
        displaySegmentedControl: true,
        defaultValue: "follow",
        description:
            "Follow moves toward the pointer. Repel moves away from it.",
        hidden: (props: any) =>
            !props.tilt || props.interaction === "auto",
    },

    touchDrag: {
        type: ControlType.Boolean,
        title: "Touch Drag",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
        description:
            "Enables finger drag to control tilt on touch devices.",
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
        description: "Lower values increase depth distortion.",
        hidden: (props: any) => !props.tilt,
    },

    // ── Clip ──────────────────────────────────────────────

    clipContent: {
        type: ControlType.Boolean,
        title: "Clip Content",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        description:
            "Clips layers to the component frame. Turn off to let content extend beyond for hologram effects.",
    },

    // ── Parallax ────────────────────────────────────────

    parallax: {
        type: ControlType.Boolean,
        title: "Parallax",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
    },

    activation: {
        type: ControlType.Enum,
        title: "Activation",
        options: ["hover", "always", "click"],
        optionTitles: ["Hover", "Always", "Click"],
        defaultValue: "hover",
        description:
            "Hover activates on mouse enter. Always tracks cursor across the page. Click toggles on/off.",
        hidden: (props: any) => !props.parallax,
    },

    // ── Layer stack ────────────────────────────────────────

    layers: {
        type: ControlType.Number,
        title: "Mid Layers",
        defaultValue: 0,
        min: 0,
        max: 5,
        step: 1,
        displayStepper: true,
        description:
            "Add up to 5 depth layers between background and foreground.",
        hidden: (props: any) => !props.parallax,
    },

    mid1: {
        type: ControlType.ComponentInstance,
        title: "Layer 1",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 1,
    },
    mid1Blend: {
        type: ControlType.Enum,
        title: "Layer 1 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 1,
    },
    mid1Opacity: {
        type: ControlType.Number,
        title: "Layer 1 Opacity",
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 1,
    },

    mid2: {
        type: ControlType.ComponentInstance,
        title: "Layer 2",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 2,
    },
    mid2Blend: {
        type: ControlType.Enum,
        title: "Layer 2 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 2,
    },
    mid2Opacity: {
        type: ControlType.Number,
        title: "Layer 2 Opacity",
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 2,
    },

    mid3: {
        type: ControlType.ComponentInstance,
        title: "Layer 3",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 3,
    },
    mid3Blend: {
        type: ControlType.Enum,
        title: "Layer 3 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 3,
    },
    mid3Opacity: {
        type: ControlType.Number,
        title: "Layer 3 Opacity",
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 3,
    },

    mid4: {
        type: ControlType.ComponentInstance,
        title: "Layer 4",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 4,
    },
    mid4Blend: {
        type: ControlType.Enum,
        title: "Layer 4 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 4,
    },
    mid4Opacity: {
        type: ControlType.Number,
        title: "Layer 4 Opacity",
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 4,
    },

    mid5: {
        type: ControlType.ComponentInstance,
        title: "Layer 5",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 5,
    },
    mid5Blend: {
        type: ControlType.Enum,
        title: "Layer 5 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 5,
    },
    mid5Opacity: {
        type: ControlType.Number,
        title: "Layer 5 Opacity",
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 5,
    },

    // Background — deepest layer
    background: {
        type: ControlType.ComponentInstance,
        title: "Background",
        hidden: (props: any) => !props.parallax,
    },
    bgOpacity: {
        type: ControlType.Number,
        title: "Background Opacity",
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        hidden: (props: any) => !props.parallax,
    },

    // ── Motion behavior ─────────────────────────────────

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
            !props.parallax ||
            props.parallaxSource !== "cursor" ||
            props.activation === "always",
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
        title: "Parallax Amount",
        defaultValue: 20,
        min: 1,
        max: 300,
        step: 5,
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
