import { addPropertyControls, ControlType, RenderTarget } from "framer"
import React, { useRef, useEffect, useCallback } from "react"

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

interface Props {
    content: React.ReactNode
    background: React.ReactNode
    interaction: Interaction
    behavior: Behavior
    tiltLimit: number
    scale: number
    perspective: number
    speed: number
    parallax: boolean
    parallaxSource: ParallaxSource
    parallaxTracking: ParallaxTracking
    parallaxDirection: ParallaxDirection
    parallaxAmount: number
    parallaxSmoothing: number
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

/**
 * 3D Tilt + Parallax — Enhanced effect wrapper.
 *
 * When Parallax is on, two slots appear: a Background layer and
 * a Content (foreground) layer. The tilt rotates them together
 * as one surface, but each layer translates at a different rate
 * to produce real depth separation.
 *
 * Structure in Framer:
 *   → Connect your image / fill into the Background slot
 *   → Connect your foreground elements into the Content slot
 *   → Turn Parallax on
 *   → The two layers will shift apart as the card tilts
 */
export default function Tilt3DParallax(props: Props) {
    const {
        content,
        background,
        interaction = "cursor",
        behavior = "follow",
        tiltLimit = 20,
        scale: hoverScale = 1.1,
        perspective = 5000,
        speed = 0.5,
        parallax = false,
        parallaxSource = "tilt",
        parallaxTracking = "hover",
        parallaxDirection = "toward",
        parallaxAmount = 20,
        parallaxSmoothing = 0.5,
        style,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const bgRef = useRef<HTMLDivElement>(null)
    const fgRef = useRef<HTMLDivElement>(null)
    const rafId = useRef(0)
    const loopRunning = useRef(false)
    const hovering = useRef(false)

    // Tilt state (applied to the surface)
    const target = useRef({ rx: 0, ry: 0, s: 1 })
    const current = useRef({ rx: 0, ry: 0, s: 1 })

    // Parallax state — one normalised vector, split at render time
    // into opposite translations for bg (−) and fg (+).
    const pTarget = useRef({ tx: 0, ty: 0 })
    const pCurrent = useRef({ tx: 0, ty: 0 })

    // Latest props in a ref so callbacks stay stable
    const cfg = useRef({
        interaction,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
        parallax,
        parallaxSource,
        parallaxTracking,
        parallaxDirection,
        parallaxAmount,
        parallaxSmoothing,
    })
    cfg.current = {
        interaction,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
        parallax,
        parallaxSource,
        parallaxTracking,
        parallaxDirection,
        parallaxAmount,
        parallaxSmoothing,
    }

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    // ── Render Loop ─────────────────────────────────────

    const tick = useCallback((time: number) => {
        const el = surfaceRef.current
        if (!el) return

        const {
            interaction: mode,
            tiltLimit: limit,
            speed: spd,
            parallax: pEnabled,
            parallaxSource: pSource,
            parallaxAmount: pAmt,
            parallaxDirection: pDir,
            parallaxSmoothing: pSmooth,
        } = cfg.current

        const c = current.current
        const t = target.current
        const pc = pCurrent.current
        const pt = pTarget.current

        // Auto: organic Lissajous, paused on hover
        if (mode === "auto" && !hovering.current) {
            const sec = time * 0.001 * spd
            t.rx = Math.sin(sec * 0.6 + 0.3) * limit * AUTO_INTENSITY
            t.ry = Math.cos(sec * 0.4) * limit * AUTO_INTENSITY
            t.s = 1
        }

        // Derive parallax from tilt when source is "tilt", or
        // always in Auto (no cursor to track). When source is
        // "cursor", pTarget was already set by onPointerMove.
        if (pEnabled && (mode === "auto" || pSource === "tilt")) {
            const dirMul = pDir === "away" ? -1 : 1
            const nRy = limit > 0 ? t.ry / limit : 0
            const nRx = limit > 0 ? t.rx / limit : 0
            pt.tx = nRy * pAmt * dirMul
            pt.ty = -nRx * pAmt * dirMul
        }

        // ── Lerp tilt ───────────────────────────────────
        const smooth =
            hovering.current || mode === "auto"
                ? ACTIVE_SMOOTHING
                : RETURN_SMOOTHING

        c.rx = lerp(c.rx, t.rx, smooth)
        c.ry = lerp(c.ry, t.ry, smooth)
        c.s = lerp(c.s, t.s, smooth)

        // Tilt applies to the whole surface
        el.style.transform = `rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale(${c.s.toFixed(4)})`

        // ── Lerp parallax (two-layer split) ─────────────
        if (pEnabled) {
            const pLerp = 0.15 - pSmooth * 0.13
            pc.tx = lerp(pc.tx, pt.tx, pLerp)
            pc.ty = lerp(pc.ty, pt.ty, pLerp)

            const halfTx = pc.tx * 0.5
            const halfTy = pc.ty * 0.5

            // Background shifts opposite, foreground shifts with
            if (bgRef.current) {
                bgRef.current.style.transform =
                    `translate3d(${(-halfTx).toFixed(2)}px, ${(-halfTy).toFixed(2)}px, 0)`
            }
            if (fgRef.current) {
                fgRef.current.style.transform =
                    `translate3d(${halfTx.toFixed(2)}px, ${halfTy.toFixed(2)}px, 0)`
            }
        }

        // ── Settle check ────────────────────────────────
        const tiltSettled =
            Math.abs(c.rx - t.rx) < SETTLE_THRESHOLD &&
            Math.abs(c.ry - t.ry) < SETTLE_THRESHOLD &&
            Math.abs(c.s - t.s) < SETTLE_THRESHOLD

        const parallaxSettled =
            !pEnabled ||
            (Math.abs(pc.tx - pt.tx) < SETTLE_THRESHOLD &&
                Math.abs(pc.ty - pt.ty) < SETTLE_THRESHOLD)

        if (tiltSettled && parallaxSettled && mode !== "auto") {
            // Snap to exact values
            c.rx = t.rx
            c.ry = t.ry
            c.s = t.s
            el.style.transform = `rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.s})`

            if (pEnabled) {
                pc.tx = pt.tx
                pc.ty = pt.ty
                const hx = pc.tx * 0.5
                const hy = pc.ty * 0.5
                if (bgRef.current)
                    bgRef.current.style.transform =
                        `translate3d(${(-hx).toFixed(2)}px, ${(-hy).toFixed(2)}px, 0)`
                if (fgRef.current)
                    fgRef.current.style.transform =
                        `translate3d(${hx.toFixed(2)}px, ${hy.toFixed(2)}px, 0)`
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
        const mode = cfg.current.interaction
        hovering.current = true

        if (mode === "cursor") {
            target.current.s = cfg.current.hoverScale
        } else if (mode === "auto") {
            target.current.rx = 0
            target.current.ry = 0
            target.current.s = 1
            pTarget.current.tx = 0
            pTarget.current.ty = 0
        }
        startLoop()
    }, [isCanvas, startLoop])

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (cfg.current.interaction !== "cursor" || isCanvas) return
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
            const dir = cfg.current.behavior === "repel" ? -1 : 1

            // Tilt
            target.current.rx = -ny * cfg.current.tiltLimit * dir
            target.current.ry = nx * cfg.current.tiltLimit * dir

            // Parallax — only set directly when source is "cursor" and
            // tracking is "hover". When "page", the global listener handles it.
            // When source is "tilt", the tick loop derives it.
            if (
                cfg.current.parallax &&
                cfg.current.parallaxSource === "cursor" &&
                cfg.current.parallaxTracking === "hover"
            ) {
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
        hovering.current = false

        if (cfg.current.interaction === "cursor") {
            target.current.rx = 0
            target.current.ry = 0
            target.current.s = 1
            // Only reset parallax on leave when tracking is "hover".
            // In "page" mode the global listener keeps driving it.
            if (cfg.current.parallaxTracking !== "page") {
                pTarget.current.tx = 0
                pTarget.current.ty = 0
            }
        }
        startLoop()
    }, [isCanvas, startLoop])

    // ── Auto Animation Start ────────────────────────────

    useEffect(() => {
        if (interaction !== "auto" || isCanvas) return
        target.current = { rx: 0, ry: 0, s: 1 }
        current.current = { rx: 0, ry: 0, s: 1 }
        pTarget.current = { tx: 0, ty: 0 }
        pCurrent.current = { tx: 0, ty: 0 }
        startLoop()
        return () => {
            cancelAnimationFrame(rafId.current)
            loopRunning.current = false
        }
    }, [interaction, isCanvas, startLoop])

    // ── Reset on Mode Change ────────────────────────────

    useEffect(() => {
        target.current = { rx: 0, ry: 0, s: 1 }
        pTarget.current = { tx: 0, ty: 0 }
        startLoop()
    }, [interaction, startLoop])

    // ── Page-level Parallax Tracking ─────────────────────

    useEffect(() => {
        if (isCanvas) return
        if (
            !parallax ||
            parallaxSource !== "cursor" ||
            parallaxTracking !== "page" ||
            interaction === "auto"
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
                Connect content →
            </div>
        )
    }

    // ── Render ──────────────────────────────────────────

    // When parallax is off, render flat (no layer splitting).
    if (!parallax) {
        return (
            <div
                ref={containerRef}
                style={{
                    ...style,
                    perspective: `${perspective}px`,
                    overflow: "visible",
                }}
                onPointerEnter={onPointerEnter}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
            >
                <div
                    ref={surfaceRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        willChange: "transform",
                    }}
                >
                    {content}
                </div>
            </div>
        )
    }

    // Parallax on: two-layer structure.
    // Background + foreground get independent translations,
    // surface gets the shared tilt rotation.
    return (
        <div
            ref={containerRef}
            style={{
                ...style,
                perspective: `${perspective}px`,
                overflow: "visible",
            }}
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
                    overflow: "hidden",
                    willChange: "transform",
                }}
            >
                {/* Background layer — shifts opposite to foreground */}
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
                        {background}
                    </div>
                )}

                {/* Foreground / content layer — shifts with motion */}
                <div
                    ref={fgRef}
                    style={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                        willChange: "transform",
                    }}
                >
                    {content}
                </div>
            </div>
        </div>
    )
}

// ─── Framer Property Controls ─────────────────────────────

addPropertyControls(Tilt3DParallax, {
    content: {
        type: ControlType.ComponentInstance,
        title: "Content",
    },

    // ── Interaction ─────────────────────────────────────

    interaction: {
        type: ControlType.Enum,
        title: "Interaction",
        options: ["auto", "cursor"],
        optionTitles: ["Auto", "Cursor"],
        defaultValue: "cursor",
    },

    // ── Behavior ────────────────────────────────────────

    behavior: {
        type: ControlType.Enum,
        title: "Behavior",
        options: ["follow", "repel"],
        optionTitles: ["Follow", "Repel"],
        displaySegmentedControl: true,
        defaultValue: "follow",
        hidden: (props: any) => props.interaction === "auto",
    },

    // ── Speed (Auto only) ───────────────────────────────

    speed: {
        type: ControlType.Number,
        title: "Speed",
        defaultValue: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
        hidden: (props: any) => props.interaction !== "auto",
    },

    // ── Tilt Limit ──────────────────────────────────────

    tiltLimit: {
        type: ControlType.Number,
        title: "Tilt Limit",
        defaultValue: 20,
        min: 1,
        max: 45,
        step: 1,
        unit: "°",
        displayStepper: true,
    },

    // ── Scale ───────────────────────────────────────────

    scale: {
        type: ControlType.Number,
        title: "Scale",
        defaultValue: 1.1,
        min: 1,
        max: 2,
        step: 0.05,
        displayStepper: true,
        hidden: (props: any) => props.interaction === "auto",
    },

    // ── Perspective ─────────────────────────────────────

    perspective: {
        type: ControlType.Number,
        title: "Perspective",
        defaultValue: 5000,
        min: 100,
        max: 10000,
        step: 100,
        description: "Depth strength",
    },

    // ── Parallax ────────────────────────────────────────

    parallax: {
        type: ControlType.Boolean,
        title: "Parallax",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
    },

    background: {
        type: ControlType.ComponentInstance,
        title: "Background",
        hidden: (props: any) => !props.parallax,
    },

    parallaxSource: {
        type: ControlType.Enum,
        title: "Source",
        options: ["tilt", "cursor"],
        optionTitles: ["Tilt", "Cursor"],
        displaySegmentedControl: true,
        defaultValue: "tilt",
        hidden: (props: any) =>
            !props.parallax || props.interaction === "auto",
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
            props.interaction === "auto",
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
