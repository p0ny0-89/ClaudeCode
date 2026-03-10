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
type ParallaxDirection = "normal" | "reverse"

interface Props {
    content: React.ReactNode
    interaction: Interaction
    behavior: Behavior
    tiltLimit: number
    scale: number
    perspective: number
    speed: number
    parallax: boolean
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
 * Extends the Tilt3D architecture with a second motion layer
 * that translates the content in response to tilt, producing
 * a floating parallax depth effect.
 */
export default function Tilt3DParallax(props: Props) {
    const {
        content,
        interaction = "cursor",
        behavior = "follow",
        tiltLimit = 20,
        scale: hoverScale = 1.1,
        perspective = 5000,
        speed = 0.5,
        parallax = false,
        parallaxDirection = "reverse",
        parallaxAmount = 20,
        parallaxSmoothing = 0.5,
        style,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const rafId = useRef(0)
    const loopRunning = useRef(false)
    const hovering = useRef(false)

    // Tilt state
    const target = useRef({ rx: 0, ry: 0, s: 1 })
    const current = useRef({ rx: 0, ry: 0, s: 1 })

    // Parallax (translate) state
    const pTarget = useRef({ tx: 0, ty: 0 })
    const pCurrent = useRef({ tx: 0, ty: 0 })

    // Latest props in a ref so animation callbacks stay stable
    const cfg = useRef({
        interaction,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
        parallax,
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
            parallaxAmount: pAmt,
            parallaxDirection: pDir,
            parallaxSmoothing: pSmooth,
        } = cfg.current

        const c = current.current
        const t = target.current
        const pc = pCurrent.current
        const pt = pTarget.current

        // Auto mode: organic Lissajous, paused on hover
        if (mode === "auto" && !hovering.current) {
            const sec = time * 0.001 * spd
            t.rx = Math.sin(sec * 0.6 + 0.3) * limit * AUTO_INTENSITY
            t.ry = Math.cos(sec * 0.4) * limit * AUTO_INTENSITY
            t.s = 1

            // Derive parallax from auto tilt motion
            if (pEnabled) {
                const dirMul = pDir === "reverse" ? -1 : 1
                pt.tx = (t.ry / limit) * pAmt * dirMul
                pt.ty = (-t.rx / limit) * pAmt * dirMul
            }
        }

        // ── Lerp tilt ───────────────────────────────────
        const smooth =
            hovering.current || mode === "auto"
                ? ACTIVE_SMOOTHING
                : RETURN_SMOOTHING

        c.rx = lerp(c.rx, t.rx, smooth)
        c.ry = lerp(c.ry, t.ry, smooth)
        c.s = lerp(c.s, t.s, smooth)

        // ── Lerp parallax ───────────────────────────────
        // Map user-facing 0..1 smoothing → internal lerp factor.
        // 0 = responsive (0.15), 1 = very smooth (0.02)
        let transformStr = `rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale(${c.s.toFixed(4)})`

        if (pEnabled) {
            const pLerp = 0.15 - pSmooth * 0.13
            pc.tx = lerp(pc.tx, pt.tx, pLerp)
            pc.ty = lerp(pc.ty, pt.ty, pLerp)
            transformStr += ` translateX(${pc.tx.toFixed(2)}px) translateY(${pc.ty.toFixed(2)}px)`
        }

        el.style.transform = transformStr

        // ── Settle check ────────────────────────────────
        const tiltSettled =
            Math.abs(c.rx - t.rx) < SETTLE_THRESHOLD &&
            Math.abs(c.ry - t.ry) < SETTLE_THRESHOLD &&
            Math.abs(c.s - t.s) < SETTLE_THRESHOLD

        const parallaxSettled =
            !pEnabled ||
            (Math.abs(pc.tx - pt.tx) < SETTLE_THRESHOLD &&
                Math.abs(pc.ty - pt.ty) < SETTLE_THRESHOLD)

        // Auto keeps the loop alive; cursor stops once settled.
        if (tiltSettled && parallaxSettled && mode !== "auto") {
            c.rx = t.rx
            c.ry = t.ry
            c.s = t.s
            let finalT = `rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.s})`
            if (pEnabled) {
                pc.tx = pt.tx
                pc.ty = pt.ty
                finalT += ` translateX(${pc.tx.toFixed(2)}px) translateY(${pc.ty.toFixed(2)}px)`
            }
            el.style.transform = finalT
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
            // Pause auto: lerp tilt + parallax to neutral
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

            // Parallax
            if (cfg.current.parallax) {
                const pDir =
                    cfg.current.parallaxDirection === "reverse" ? -1 : 1
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
            pTarget.current.tx = 0
            pTarget.current.ty = 0
        }
        // Auto resumes Lissajous now that hovering is false.
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

    parallaxDirection: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["normal", "reverse"],
        optionTitles: ["Normal", "Reverse"],
        displaySegmentedControl: true,
        defaultValue: "reverse",
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
