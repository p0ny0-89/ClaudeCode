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

interface Props {
    content: React.ReactNode
    interaction: Interaction
    behavior: Behavior
    tiltLimit: number
    scale: number
    perspective: number
    speed: number
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
 * 3D Tilt — Effect wrapper component.
 *
 * Connect any content into the "Content" slot and it becomes
 * the surface that tilts in 3D. Supports cursor tracking on
 * desktop and a smooth auto-animation for mobile / tablet.
 */
export default function Tilt3D(props: Props) {
    const {
        content,
        interaction = "cursor",
        behavior = "follow",
        tiltLimit = 20,
        scale: hoverScale = 1.1,
        perspective = 5000,
        speed = 0.5,
        style,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const rafId = useRef(0)
    const loopRunning = useRef(false)
    const hovering = useRef(false)

    const target = useRef({ rx: 0, ry: 0, s: 1 })
    const current = useRef({ rx: 0, ry: 0, s: 1 })

    // Latest props in a ref so animation callbacks stay stable
    const cfg = useRef({
        interaction,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
    })
    cfg.current = {
        interaction,
        behavior,
        tiltLimit,
        hoverScale,
        perspective,
        speed,
    }

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    // ── Render Loop ─────────────────────────────────────

    const tick = useCallback((time: number) => {
        const el = surfaceRef.current
        if (!el) return

        const { interaction: mode, tiltLimit: limit, speed: spd } = cfg.current
        const c = current.current
        const t = target.current

        // Auto mode: drive target with organic Lissajous motion,
        // but lerp to neutral when hovered so users can read content.
        if (mode === "auto" && !hovering.current) {
            const sec = time * 0.001 * spd
            t.rx = Math.sin(sec * 0.6 + 0.3) * limit * AUTO_INTENSITY
            t.ry = Math.cos(sec * 0.4) * limit * AUTO_INTENSITY
            t.s = 1
        }

        // Lerp current → target
        const smooth =
            hovering.current || mode === "auto"
                ? ACTIVE_SMOOTHING
                : RETURN_SMOOTHING

        c.rx = lerp(c.rx, t.rx, smooth)
        c.ry = lerp(c.ry, t.ry, smooth)
        c.s = lerp(c.s, t.s, smooth)

        el.style.transform = `rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale(${c.s.toFixed(4)})`

        // Stop when settled (auto never settles)
        const settled =
            Math.abs(c.rx - t.rx) < SETTLE_THRESHOLD &&
            Math.abs(c.ry - t.ry) < SETTLE_THRESHOLD &&
            Math.abs(c.s - t.s) < SETTLE_THRESHOLD

        // Auto always keeps the loop alive so it can resume after hover.
        // Cursor mode stops the loop once settled.
        if (settled && mode !== "auto") {
            c.rx = t.rx
            c.ry = t.ry
            c.s = t.s
            el.style.transform = `rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.s})`
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

    // ── Pointer Handlers (Cursor mode) ──────────────────

    const onPointerEnter = useCallback(() => {
        if (isCanvas) return
        const mode = cfg.current.interaction
        hovering.current = true

        if (mode === "cursor") {
            target.current.s = cfg.current.hoverScale
        } else if (mode === "auto") {
            // Pause: lerp to neutral
            target.current.rx = 0
            target.current.ry = 0
            target.current.s = 1
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

            target.current.rx = -ny * cfg.current.tiltLimit * dir
            target.current.ry = nx * cfg.current.tiltLimit * dir
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
        }
        // For auto mode the loop is already running and will
        // resume Lissajous motion now that hovering is false.
        startLoop()
    }, [isCanvas, startLoop])

    // ── Auto Animation Start ────────────────────────────

    useEffect(() => {
        if (interaction !== "auto" || isCanvas) return
        target.current = { rx: 0, ry: 0, s: 1 }
        current.current = { rx: 0, ry: 0, s: 1 }
        startLoop()
        return () => {
            cancelAnimationFrame(rafId.current)
            loopRunning.current = false
        }
    }, [interaction, isCanvas, startLoop])

    // ── Reset on Mode Change ────────────────────────────

    useEffect(() => {
        target.current = { rx: 0, ry: 0, s: 1 }
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
                    transformStyle: "preserve-3d",
                    willChange: "transform",
                }}
            >
                {content}
            </div>
        </div>
    )
}

// ─── Framer Property Controls ─────────────────────────────

addPropertyControls(Tilt3D, {
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
})
