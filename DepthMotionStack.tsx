import { addPropertyControls, ControlType, RenderTarget } from "framer"
import React, { useRef, useEffect, useCallback, useId, useState } from "react"

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
    | "color-dodge"
    | "color-burn"
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
    mid6: React.ReactNode
    mid7: React.ReactNode
    contentBlend: BlendMode
    mid1Blend: BlendMode
    mid2Blend: BlendMode
    mid3Blend: BlendMode
    mid4Blend: BlendMode
    mid5Blend: BlendMode
    mid6Blend: BlendMode
    mid7Blend: BlendMode
    // Per-layer advanced settings (collapsible ControlType.Object sections)
    contentAdvanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    mid1Advanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    mid2Advanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    mid3Advanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    mid4Advanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    mid5Advanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    mid6Advanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    mid7Advanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    bgAdvanced: { opacityIdle: number; opacityActive: number; scale: number; direction: "default" | "inverted"; responsiveSource: boolean }
    // Per-layer responsive source inputs
    contentDesktop: React.ReactNode
    contentTablet: React.ReactNode
    contentMobile: React.ReactNode
    mid1Desktop: React.ReactNode
    mid1Tablet: React.ReactNode
    mid1Mobile: React.ReactNode
    mid2Desktop: React.ReactNode
    mid2Tablet: React.ReactNode
    mid2Mobile: React.ReactNode
    mid3Desktop: React.ReactNode
    mid3Tablet: React.ReactNode
    mid3Mobile: React.ReactNode
    mid4Desktop: React.ReactNode
    mid4Tablet: React.ReactNode
    mid4Mobile: React.ReactNode
    mid5Desktop: React.ReactNode
    mid5Tablet: React.ReactNode
    mid5Mobile: React.ReactNode
    mid6Desktop: React.ReactNode
    mid6Tablet: React.ReactNode
    mid6Mobile: React.ReactNode
    mid7Desktop: React.ReactNode
    mid7Tablet: React.ReactNode
    mid7Mobile: React.ReactNode
    bgDesktop: React.ReactNode
    bgTablet: React.ReactNode
    bgMobile: React.ReactNode
    clipToForeground: boolean
    clipRadius: number
    alphaMask: string
    invertMask: boolean
    hoverStagger: number
    reverseStagger: boolean
    // ── Exposed activation events ──
    // These fire once on state transitions (not continuously).
    // Wired via ControlType.EventHandler, they appear in the
    // Framer Interactions panel so designers can trigger
    // transitions, overlays, or any parent-level behavior.
    onActivate?: () => void
    onDeactivate?: () => void
    style?: React.CSSProperties
}

// ─── Helpers ──────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi)
}

// ── Responsive source: breakpoint detection ──────────────
// Detects viewport width to select per-layer source variants.
// Breakpoint detection for responsive source selection.
// Uses component width when available (works on canvas + preview),
// falls back to window.innerWidth for initial render.
// Thresholds: Mobile <= 390px, Tablet <= 810px, Desktop > 810px.

type Breakpoint = "desktop" | "tablet" | "mobile"

function getBreakpointFromWidth(w: number): Breakpoint {
    if (w <= 390) return "mobile"
    if (w <= 810) return "tablet"
    return "desktop"
}

function getViewportBreakpoint(): Breakpoint {
    if (typeof window === "undefined") return "desktop"
    return getBreakpointFromWidth(window.innerWidth)
}

// Resolve responsive source: use breakpoint-specific source if available, fall back to primary
// Check if a Framer ComponentInstance slot has content.
// Unconnected slots may be null, undefined, or an empty array [].
function hasSlotContent(node: React.ReactNode): boolean {
    if (node == null) return false
    if (Array.isArray(node) && node.length === 0) return false
    return true
}

function resolveSource(
    primary: React.ReactNode,
    responsive: boolean,
    desktop: React.ReactNode,
    tablet: React.ReactNode,
    mobile: React.ReactNode,
    bp: Breakpoint
): React.ReactNode {
    if (!responsive) return primary
    // Cascade: mobile → tablet → desktop → primary
    // Each breakpoint falls back to the next larger if its slot is empty.
    if (bp === "mobile") {
        if (hasSlotContent(mobile)) return mobile
        if (hasSlotContent(tablet)) return tablet
        if (hasSlotContent(desktop)) return desktop
        return primary
    }
    if (bp === "tablet") {
        if (hasSlotContent(tablet)) return tablet
        if (hasSlotContent(desktop)) return desktop
        return primary
    }
    if (bp === "desktop") {
        if (hasSlotContent(desktop)) return desktop
        return primary
    }
    return primary
}

/**
 * Apply parallax translate3d + scale transforms to all layer refs (bg, mid[], fg).
 * Shared by the main tick loop and the settle-snap path to avoid duplication.
 */
function applyLayerTransforms(
    pc: { tx: number; ty: number },
    cf: { bg: number; mid: number[]; fg: number },
    cfgVal: any,
    refs: {
        bg: React.RefObject<HTMLDivElement>
        mid: React.MutableRefObject<(HTMLDivElement | null)[]>
        fg: React.RefObject<HTMLDivElement>
        fgContent: React.RefObject<HTMLDivElement>
        container: React.RefObject<HTMLDivElement>
    },
    bgScaleActive: number,
    cachedRect: DOMRect | null,
    lc: number,
): void {
    // Per-layer scale (percentage -> ratio)
    const midScales = [
        cfgVal.mid1Scale, cfgVal.mid2Scale, cfgVal.mid3Scale,
        cfgVal.mid4Scale, cfgVal.mid5Scale, cfgVal.mid6Scale,
        cfgVal.mid7Scale,
    ]
    const fgScale = (cfgVal.contentScale || 100) / 100
    const bgLayerScale = (cfgVal.bgScale || 100) / 100

    // Per-layer direction multiplier (1 = default, -1 = inverted)
    const midDirs = [
        cfgVal.mid1Direction, cfgVal.mid2Direction, cfgVal.mid3Direction,
        cfgVal.mid4Direction, cfgVal.mid5Direction, cfgVal.mid6Direction,
        cfgVal.mid7Direction,
    ]
    const bgDirMul = cfgVal.bgDirection === "inverted" ? -1 : 1

    if (refs.bg.current) {
        const tx = (cf.bg * pc.tx * bgDirMul).toFixed(2)
        const ty = (cf.bg * pc.ty * bgDirMul).toFixed(2)
        // Combine user bgScale with clip-mode auto-scale
        let totalBgScale = bgLayerScale
        if (bgScaleActive) {
            const rect = cachedRect || refs.container.current?.getBoundingClientRect()
            if (rect && rect.width > 0 && rect.height > 0) {
                const minDim = Math.min(rect.width, rect.height)
                totalBgScale *= 1 + (2 * cfgVal.parallaxAmount) / minDim
            }
        }
        const scaleStr = totalBgScale !== 1 ? ` scale(${totalBgScale.toFixed(4)})` : ""
        refs.bg.current.style.transform =
            `translate3d(${tx}px, ${ty}px, 0)${scaleStr}`
    }

    for (let i = 0; i < lc; i++) {
        const ref = refs.mid.current[i]
        if (ref) {
            const dirMul = midDirs[i] === "inverted" ? -1 : 1
            const s = (midScales[i] || 100) / 100
            const scaleStr = s !== 1 ? ` scale(${s.toFixed(4)})` : ""
            ref.style.transform =
                `translate3d(${(cf.mid[i] * pc.tx * dirMul).toFixed(2)}px, ${(cf.mid[i] * pc.ty * dirMul).toFixed(2)}px, 0)${scaleStr}`
        }
    }

    if (refs.fg.current) {
        const fgDirMul = cfgVal.contentDirection === "inverted" ? -1 : 1
        // In clip mode, fgRef is the clip container — direction + scale go on fgContentRef
        if (refs.fgContent.current && bgScaleActive) {
            // Clip container moves without direction/scale (affects all layers)
            refs.fg.current.style.transform =
                `translate3d(${(cf.fg * pc.tx).toFixed(2)}px, ${(cf.fg * pc.ty).toFixed(2)}px, 0)`
            // FG content gets its own direction offset + scale
            const dirTx = fgDirMul === -1 ? (cf.fg * pc.tx * -2).toFixed(2) : "0"
            const dirTy = fgDirMul === -1 ? (cf.fg * pc.ty * -2).toFixed(2) : "0"
            const scaleStr = fgScale !== 1 ? ` scale(${fgScale.toFixed(4)})` : ""
            const dirStr = fgDirMul === -1 ? `translate3d(${dirTx}px, ${dirTy}px, 0)` : ""
            refs.fgContent.current.style.transform = `${dirStr}${scaleStr}`.trim() || "none"
        } else {
            const fgTx = (cf.fg * pc.tx * fgDirMul).toFixed(2)
            const fgTy = (cf.fg * pc.ty * fgDirMul).toFixed(2)
            const scaleStr = fgScale !== 1 ? ` scale(${fgScale.toFixed(4)})` : ""
            refs.fg.current.style.transform =
                `translate3d(${fgTx}px, ${fgTy}px, 0)${scaleStr}`
        }
    }
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
        mid6 = null,
        mid7 = null,
        contentBlend = "normal",
        mid1Blend = "normal" as BlendMode,
        mid2Blend = "normal" as BlendMode,
        mid3Blend = "normal" as BlendMode,
        mid4Blend = "normal" as BlendMode,
        mid5Blend = "normal" as BlendMode,
        mid6Blend = "normal" as BlendMode,
        mid7Blend = "normal" as BlendMode,
        contentAdvanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        mid1Advanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        mid2Advanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        mid3Advanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        mid4Advanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        mid5Advanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        mid6Advanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        mid7Advanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        bgAdvanced = { opacityIdle: 100, opacityActive: 100, scale: 100, direction: "default" as const, responsiveSource: false },
        // Per-layer responsive source inputs
        contentDesktop = null,
        contentTablet = null,
        contentMobile = null,
        mid1Desktop = null,
        mid1Tablet = null,
        mid1Mobile = null,
        mid2Desktop = null,
        mid2Tablet = null,
        mid2Mobile = null,
        mid3Desktop = null,
        mid3Tablet = null,
        mid3Mobile = null,
        mid4Desktop = null,
        mid4Tablet = null,
        mid4Mobile = null,
        mid5Desktop = null,
        mid5Tablet = null,
        mid5Mobile = null,
        mid6Desktop = null,
        mid6Tablet = null,
        mid6Mobile = null,
        mid7Desktop = null,
        mid7Tablet = null,
        mid7Mobile = null,
        bgDesktop = null,
        bgTablet = null,
        bgMobile = null,
        clipToForeground = false,
        clipRadius = 0,
        alphaMask,
        invertMask = false,
        hoverStagger = 0,
        reverseStagger = false,
        onActivate,
        onDeactivate,
        style,
    } = props

    // Extract flat variable names from Advanced objects for compatibility with the rest of the code
    const contentOpacityIdle = contentAdvanced.opacityIdle
    const contentOpacityHover = contentAdvanced.opacityActive
    const contentScale = contentAdvanced.scale
    const contentDirection = contentAdvanced.direction
    const mid1OpacityIdle = mid1Advanced.opacityIdle
    const mid1OpacityHover = mid1Advanced.opacityActive
    const mid1Scale = mid1Advanced.scale
    const mid1Direction = mid1Advanced.direction
    const mid2OpacityIdle = mid2Advanced.opacityIdle
    const mid2OpacityHover = mid2Advanced.opacityActive
    const mid2Scale = mid2Advanced.scale
    const mid2Direction = mid2Advanced.direction
    const mid3OpacityIdle = mid3Advanced.opacityIdle
    const mid3OpacityHover = mid3Advanced.opacityActive
    const mid3Scale = mid3Advanced.scale
    const mid3Direction = mid3Advanced.direction
    const mid4OpacityIdle = mid4Advanced.opacityIdle
    const mid4OpacityHover = mid4Advanced.opacityActive
    const mid4Scale = mid4Advanced.scale
    const mid4Direction = mid4Advanced.direction
    const mid5OpacityIdle = mid5Advanced.opacityIdle
    const mid5OpacityHover = mid5Advanced.opacityActive
    const mid5Scale = mid5Advanced.scale
    const mid5Direction = mid5Advanced.direction
    const mid6OpacityIdle = mid6Advanced.opacityIdle
    const mid6OpacityHover = mid6Advanced.opacityActive
    const mid6Scale = mid6Advanced.scale
    const mid6Direction = mid6Advanced.direction
    const mid7OpacityIdle = mid7Advanced.opacityIdle
    const mid7OpacityHover = mid7Advanced.opacityActive
    const mid7Scale = mid7Advanced.scale
    const mid7Direction = mid7Advanced.direction
    const bgOpacityIdle = bgAdvanced.opacityIdle
    const bgOpacityHover = bgAdvanced.opacityActive
    const bgScale = bgAdvanced.scale
    const bgDirection = bgAdvanced.direction

    // Extract responsive source booleans from Advanced objects
    const contentResponsive = contentAdvanced.responsiveSource
    const mid1Responsive = mid1Advanced.responsiveSource
    const mid2Responsive = mid2Advanced.responsiveSource
    const mid3Responsive = mid3Advanced.responsiveSource
    const mid4Responsive = mid4Advanced.responsiveSource
    const mid5Responsive = mid5Advanced.responsiveSource
    const mid6Responsive = mid6Advanced.responsiveSource
    const mid7Responsive = mid7Advanced.responsiveSource
    const bgResponsive = bgAdvanced.responsiveSource

    // Build ordered arrays from individual layer props
    const midLayersArr = [mid1, mid2, mid3, mid4, mid5, mid6, mid7].slice(0, layerCount)
    const midBlendsArr = [mid1Blend, mid2Blend, mid3Blend, mid4Blend, mid5Blend, mid6Blend, mid7Blend].slice(0, layerCount)
    const midScalesArr = [mid1Scale, mid2Scale, mid3Scale, mid4Scale, mid5Scale, mid6Scale, mid7Scale].slice(0, layerCount)
    const fgScaleVal = (contentScale || 100) / 100
    const bgScaleVal = (bgScale || 100) / 100

    // ── Depth factors for parallax ──
    const totalLayers = 2 + layerCount
    // Depth factors: bg=-1, mid layers interpolated, fg=+1
    const depthFactors: number[] = [
        -1,
        ...Array.from({ length: layerCount }, (_, i) => 1 - (i + 1) / (totalLayers - 1) * 2),
        1,
    ]

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
    const midRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null, null, null])
    const fgRef = useRef<HTMLDivElement>(null)
    const fgContentRef = useRef<HTMLDivElement>(null)
    const rafId = useRef(0)
    const loopRunning = useRef(false)
    const hovering = useRef(false)
    const touchCaptured = useRef(false)
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const holdStart = useRef<{ x: number; y: number; pointerId: number; target: HTMLElement } | null>(null)
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Cached bounding rect
    const cachedRect = useRef<DOMRect | null>(null)

    // Tilt state (applied to the surface)
    const target = useRef({ rx: 0, ry: 0, s: 1 })
    const current = useRef({ rx: 0, ry: 0, s: 1 })

    // Parallax state
    const pTarget = useRef({ tx: 0, ty: 0 })
    const pCurrent = useRef({ tx: 0, ty: 0 })

    // Hover opacity blend factor — lerped from 0 (idle) to 1 (active) each frame
    const hoverOpTarget = useRef(0)
    const hoverOpCurrent = useRef(0)

    // Per-layer staggered hover: independent targets and current values
    // Order: [bg, mid1, mid2, ..., midN, fg]
    const layerHoverOps = useRef<number[]>([])
    const layerHoverTargets = useRef<number[]>([])
    const staggerTimers = useRef<ReturnType<typeof setTimeout>[]>([])
    const staggerPending = useRef(false)

    // ── Activation event emission ────────────────────────────
    // Tracks the last emitted state so events fire only on
    // actual transitions, not continuously while active.
    const lastEmittedActive = useRef<boolean | null>(null)
    const onActivateRef = useRef(onActivate)
    const onDeactivateRef = useRef(onDeactivate)
    onActivateRef.current = onActivate
    onDeactivateRef.current = onDeactivate

    // Call this whenever the activation state changes.
    // It deduplicates so the event fires exactly once per transition.
    const emitActivationEvent = useCallback((active: boolean) => {
        if (active === lastEmittedActive.current) return
        lastEmittedActive.current = active
        if (active) {
            onActivateRef.current?.()
        } else {
            onDeactivateRef.current?.()
        }
    }, [])

    // Trigger staggered layer transitions via setTimeout
    const triggerStagger = useCallback((target: 1 | 0, staggerMs: number, count: number, restartLoop: () => void, reverse: boolean) => {
        // Clear any pending stagger timers
        staggerTimers.current.forEach(t => clearTimeout(t))
        staggerTimers.current = []
        staggerPending.current = true

        // Ensure arrays are sized
        if (layerHoverTargets.current.length !== count) {
            layerHoverTargets.current = new Array(count).fill(target === 1 ? 0 : 1)
        }

        let pending = count
        const onFire = () => {
            pending--
            if (pending <= 0) staggerPending.current = false
            // Restart the animation loop in case it settled
            restartLoop()
        }

        // Build reveal order: fg, mid1, mid2, ..., midN, bg
        // Reversed: bg, midN, ..., mid2, mid1, fg
        const revealOrder: number[] = []
        if (!reverse) {
            revealOrder.push(count - 1) // fg first
            for (let m = 1; m < count - 1; m++) revealOrder.push(m) // mid1..midN
            revealOrder.push(0) // bg last
        } else {
            revealOrder.push(0) // bg first
            for (let m = count - 2; m >= 1; m--) revealOrder.push(m) // midN..mid1
            revealOrder.push(count - 1) // fg last
        }

        for (let i = 0; i < count; i++) {
            // Hover in: use reveal order
            // Hover out: reversed reveal order
            const orderIndex = target === 1 ? revealOrder[i] : revealOrder[count - 1 - i]
            const delay = i * staggerMs

            if (delay <= 0) {
                layerHoverTargets.current[orderIndex] = target
                onFire()
            } else {
                const timer = setTimeout(() => {
                    layerHoverTargets.current[orderIndex] = target
                    onFire()
                }, delay)
                staggerTimers.current.push(timer)
            }
        }
    }, [])

    // Click-to-activate toggle state
    const clickActive = useRef(false)

    // Effective depth factors for parallax (accounts for clip nesting)
    const clipFactorsRef = useRef({ bg: -1, mid: [] as number[], fg: 1 })

    // Clip-to-foreground: bg scale factor for parallax edge coverage
    const bgScaleRef = useRef(1)

    // Latest props in a ref so callbacks stay stable.
    // Initial value is a throwaway — overwritten immediately below every render.
    const cfg = useRef(null as any)
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
        contentOpacityIdle,
        contentOpacityHover,
        mid1OpacityIdle,
        mid1OpacityHover,
        mid2OpacityIdle,
        mid2OpacityHover,
        mid3OpacityIdle,
        mid3OpacityHover,
        mid4OpacityIdle,
        mid4OpacityHover,
        mid5OpacityIdle,
        mid5OpacityHover,
        mid6OpacityIdle,
        mid6OpacityHover,
        mid7OpacityIdle,
        mid7OpacityHover,
        bgOpacityIdle,
        bgOpacityHover,
        hoverStagger,
        reverseStagger,
        contentScale, contentDirection,
        mid1Scale, mid2Scale, mid3Scale, mid4Scale, mid5Scale, mid6Scale, mid7Scale,
        bgScale,
        mid1Direction, mid2Direction, mid3Direction, mid4Direction,
        mid5Direction, mid6Direction, mid7Direction,
        bgDirection,
    }
    clipFactorsRef.current = {
        bg: depthFactors[0],
        mid: depthFactors.slice(1, 1 + layerCount),
        fg: depthFactors[1 + layerCount],
    }
    bgScaleRef.current = clipToForeground && parallax ? 1 : 0

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    // ── Responsive source: breakpoint detection ──────────────
    // Primary: measure the component's own width via ResizeObserver (works
    // on both canvas and live preview). Falls back to window.innerWidth.
    const [breakpoint, setBreakpoint] = useState<Breakpoint>(getViewportBreakpoint)

    useEffect(() => {
        // Use window resize for live preview breakpoint detection.
        // This avoids ResizeObserver conflicts with interactive slot children.
        const onResize = () => {
            const bp = getViewportBreakpoint()
            setBreakpoint(prev => prev !== bp ? bp : prev)
        }
        window.addEventListener("resize", onResize)

        // For canvas: measure container width once after mount
        const el = containerRef.current
        if (el) {
            const w = el.getBoundingClientRect().width
            if (w > 0) {
                const bp = getBreakpointFromWidth(w)
                setBreakpoint(prev => prev !== bp ? bp : prev)
            }
        }

        return () => window.removeEventListener("resize", onResize)
    }, [])

    // Resolve per-layer sources based on breakpoint
    const resolvedContent = resolveSource(content, contentResponsive, contentDesktop, contentTablet, contentMobile, breakpoint)
    const resolvedMid1 = resolveSource(mid1, mid1Responsive, mid1Desktop, mid1Tablet, mid1Mobile, breakpoint)
    const resolvedMid2 = resolveSource(mid2, mid2Responsive, mid2Desktop, mid2Tablet, mid2Mobile, breakpoint)
    const resolvedMid3 = resolveSource(mid3, mid3Responsive, mid3Desktop, mid3Tablet, mid3Mobile, breakpoint)
    const resolvedMid4 = resolveSource(mid4, mid4Responsive, mid4Desktop, mid4Tablet, mid4Mobile, breakpoint)
    const resolvedMid5 = resolveSource(mid5, mid5Responsive, mid5Desktop, mid5Tablet, mid5Mobile, breakpoint)
    const resolvedMid6 = resolveSource(mid6, mid6Responsive, mid6Desktop, mid6Tablet, mid6Mobile, breakpoint)
    const resolvedMid7 = resolveSource(mid7, mid7Responsive, mid7Desktop, mid7Tablet, mid7Mobile, breakpoint)
    const resolvedBg = resolveSource(background, bgResponsive, bgDesktop, bgTablet, bgMobile, breakpoint)
    const resolvedMidLayersArr = [resolvedMid1, resolvedMid2, resolvedMid3, resolvedMid4, resolvedMid5, resolvedMid6, resolvedMid7].slice(0, layerCount)

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
        // Click mode: skip tilt-derived parallax when inactive
        const act = cfg.current.activation
        const clickGate = act !== "click" || clickActive.current
        if (pEnabled && clickGate) {
            if (tiltEnabled && mode === "auto" && hovering.current) {
                const hpMode = cfg.current.hoverParallax
                if (hpMode === "off") {
                    pt.tx = 0
                    pt.ty = 0
                } else if (hpMode === "auto") {
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
            } else if (
                tiltEnabled &&
                (mode === "auto" || pSource === "tilt")
            ) {
                const dirMul = pDir === "away" ? -1 : 1
                const nRy = limit > 0 ? t.ry / limit : 0
                const nRx = limit > 0 ? t.rx / limit : 0
                pt.tx = nRy * pAmt * dirMul
                pt.ty = -nRx * pAmt * dirMul
            }
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

            applyLayerTransforms(
                pc, clipFactorsRef.current, cfg.current,
                { bg: bgRef, mid: midRefs, fg: fgRef, fgContent: fgContentRef, container: containerRef },
                bgScaleRef.current, cachedRect.current, lc,
            )
        }

        // ── Lerp hover opacity (global + per-layer stagger) ──
        const hoSmooth = hovering.current ? ACTIVE_SMOOTHING : RETURN_SMOOTHING
        hoverOpCurrent.current = lerp(hoverOpCurrent.current, hoverOpTarget.current, hoSmooth)

        const ho = hoverOpCurrent.current

        // Read opacity config
        const {
            bgOpacityIdle: bgI, bgOpacityHover: bgH,
            contentOpacityIdle: fgI, contentOpacityHover: fgH,
            mid1OpacityIdle: m1I, mid1OpacityHover: m1H,
            mid2OpacityIdle: m2I, mid2OpacityHover: m2H,
            mid3OpacityIdle: m3I, mid3OpacityHover: m3H,
            mid4OpacityIdle: m4I, mid4OpacityHover: m4H,
            mid5OpacityIdle: m5I, mid5OpacityHover: m5H,
            mid6OpacityIdle: m6I, mid6OpacityHover: m6H,
            mid7OpacityIdle: m7I, mid7OpacityHover: m7H,
        } = cfg.current

        // Compute per-layer staggered hover factor
        const stagger = cfg.current.hoverStagger || 0
        const totalLayerCount = 2 + lc // bg + mids + fg

        // Ensure arrays are properly sized
        if (layerHoverOps.current.length !== totalLayerCount) {
            layerHoverOps.current = new Array(totalLayerCount).fill(0)
        }
        if (layerHoverTargets.current.length !== totalLayerCount) {
            layerHoverTargets.current = new Array(totalLayerCount).fill(0)
        }

        // Lerp each layer toward its individual target (set by setTimeout stagger)
        for (let li = 0; li < totalLayerCount; li++) {
            const target = stagger > 0 ? layerHoverTargets.current[li] : hoverOpTarget.current
            layerHoverOps.current[li] = lerp(layerHoverOps.current[li], target, hoSmooth)
        }

        // Apply interpolated opacity to each layer via DOM refs
        // bg = index 0
        const bgHo = stagger > 0 ? layerHoverOps.current[0] : ho
        if (bgRef.current) {
            const op = lerp(bgI, bgH, bgHo) / 100
            bgRef.current.style.opacity = op < 1 ? String(op.toFixed(3)) : "1"
        }

        // fg = last index — use fgContentRef in clip mode, fgRef otherwise
        const fgHo = stagger > 0 ? layerHoverOps.current[totalLayerCount - 1] : ho
        const fgOpEl = fgContentRef.current || fgRef.current
        if (fgOpEl) {
            const op = lerp(fgI, fgH, fgHo) / 100
            fgOpEl.style.opacity = op < 1 ? String(op.toFixed(3)) : "1"
        }

        // mid layers = indices 1..N
        const midIdleArr = [m1I, m2I, m3I, m4I, m5I, m6I, m7I]
        const midHoverArr = [m1H, m2H, m3H, m4H, m5H, m6H, m7H]
        for (let i = 0; i < lc; i++) {
            const ref = midRefs.current[i]
            if (ref) {
                const midHo = stagger > 0 ? layerHoverOps.current[i + 1] : ho
                const op = lerp(midIdleArr[i], midHoverArr[i], midHo) / 100
                ref.style.opacity = op < 1 ? String(op.toFixed(3)) : "1"
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

        let hoverOpSettled =
            Math.abs(hoverOpCurrent.current - hoverOpTarget.current) < SETTLE_THRESHOLD
        if (stagger > 0) {
            // Never settle while stagger timers are still pending
            if (staggerPending.current) {
                hoverOpSettled = false
            } else {
                for (let li = 0; li < totalLayerCount; li++) {
                    const lt = layerHoverTargets.current[li] ?? 0
                    if (Math.abs(layerHoverOps.current[li] - lt) >= SETTLE_THRESHOLD) {
                        hoverOpSettled = false
                        break
                    }
                }
            }
        }

        const autoKeepAlive = tiltEnabled && mode === "auto"

        // ── Settle: snap to final values and stop loop ──
        if (tiltSettled && parallaxSettled && hoverOpSettled && !autoKeepAlive && !hovering.current) {
            // Snap to exact target values to avoid sub-pixel drift, then stop the rAF loop.
            if (tiltEnabled) {
                c.rx = t.rx
                c.ry = t.ry
                c.s = t.s
                el.style.transform = `rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.s})`
            }

            if (pEnabled) {
                pc.tx = pt.tx
                pc.ty = pt.ty
                applyLayerTransforms(
                    pc, clipFactorsRef.current, cfg.current,
                    { bg: bgRef, mid: midRefs, fg: fgRef, fgContent: fgContentRef, container: containerRef },
                    bgScaleRef.current, cachedRect.current, lc,
                )
            }

            // Snap hover opacity
            hoverOpCurrent.current = hoverOpTarget.current
            const finalHo = hoverOpCurrent.current
            // Snap per-layer stagger ops to their individual targets
            for (let li = 0; li < totalLayerCount; li++) {
                const lt = stagger > 0 ? (layerHoverTargets.current[li] ?? 0) : finalHo
                layerHoverOps.current[li] = lt
            }
            const finalBgHo = stagger > 0 ? layerHoverOps.current[0] : finalHo
            const finalFgHo = stagger > 0 ? layerHoverOps.current[totalLayerCount - 1] : finalHo
            if (bgRef.current) {
                const op = lerp(bgI, bgH, finalBgHo) / 100
                bgRef.current.style.opacity = op < 1 ? String(op.toFixed(3)) : "1"
            }
            const fgSnapEl = fgContentRef.current || fgRef.current
            if (fgSnapEl) {
                const op = lerp(fgI, fgH, finalFgHo) / 100
                fgSnapEl.style.opacity = op < 1 ? String(op.toFixed(3)) : "1"
            }
            for (let i = 0; i < lc; i++) {
                const ref = midRefs.current[i]
                if (ref) {
                    const finalMidHo = stagger > 0 ? layerHoverOps.current[i + 1] : finalHo
                    const op = lerp(midIdleArr[i], midHoverArr[i], finalMidHo) / 100
                    ref.style.opacity = op < 1 ? String(op.toFixed(3)) : "1"
                }
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

        // Cancel any pending leave reset — prevents stutter from
        // brief pointerleave/pointerenter cycles at layer boundaries.
        if (leaveTimer.current) {
            clearTimeout(leaveTimer.current)
            leaveTimer.current = null
        }

        const tiltOn = cfg.current.tilt
        const mode = cfg.current.interaction
        const act = cfg.current.activation

        // Is the effect currently engaged?
        const isActive =
            act === "hover" ||
            act === "always" ||
            (act === "click" && clickActive.current)

        if (act === "hover") {
            if (!hovering.current) {
                const s = cfg.current.hoverStagger || 0
                if (s > 0) triggerStagger(1, s, 2 + cfg.current.layerCount, startLoop, cfg.current.reverseStagger)
            }
            hovering.current = true
            emitActivationEvent(true)
            hoverOpTarget.current = 1
        }

        const el = containerRef.current
        if (el) cachedRect.current = el.getBoundingClientRect()

        // Only apply tilt/scale when the effect is active
        if (isActive) {
            if (tiltOn && mode === "cursor") {
                target.current.s = cfg.current.hoverScale
            } else if (tiltOn && mode === "auto") {
                target.current.rx = 0
                target.current.ry = 0
                target.current.s = 1
                if (
                    !cfg.current.parallax ||
                    cfg.current.hoverParallax === "off"
                ) {
                    pTarget.current.tx = 0
                    pTarget.current.ty = 0
                }
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
            // Click mode gates all hover-triggered behavior behind clickActive
            const needsTilt =
                tiltOn &&
                mode === "cursor" &&
                (act !== "click" || clickActive.current)
            // "always": parallax tracks cursor inside the element (no page-level).
            // "click": only track when click-activated.
            // "hover": only when parallaxTracking === "hover".
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

            if (needsTilt) {
                const dir = cfg.current.behavior === "repel" ? -1 : 1
                target.current.rx = -ny * cfg.current.tiltLimit * dir
                target.current.ry = nx * cfg.current.tiltLimit * dir
            }

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

    const doLeave = useCallback(() => {
        leaveTimer.current = null
        const tiltOn = cfg.current.tilt
        const mode = cfg.current.interaction
        const act = cfg.current.activation

        if (act === "hover") {
            if (hovering.current) {
                const s = cfg.current.hoverStagger || 0
                if (s > 0) triggerStagger(0, s, 2 + cfg.current.layerCount, startLoop, cfg.current.reverseStagger)
            }
            hovering.current = false
            emitActivationEvent(false)
            hoverOpTarget.current = 0
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
        } else if (act === "click") {
            // Only reset tilt/parallax when click is NOT active.
            // When active, keep responding to cursor movement.
            if (!clickActive.current) {
                if (tiltOn && mode === "cursor") {
                    target.current.rx = 0
                    target.current.ry = 0
                    target.current.s = 1
                }
                if (
                    cfg.current.parallax &&
                    cfg.current.parallaxSource === "cursor" &&
                    cfg.current.parallaxTracking !== "page"
                ) {
                    pTarget.current.tx = 0
                    pTarget.current.ty = 0
                }
                cachedRect.current = null
            }
        } else if (act === "always") {
            // "Always" mode stays engaged — don't reset tilt or parallax on leave.
            // Parallax holds at last cursor position; auto-tilt keeps animating.
        }

        startLoop()
    }, [startLoop])

    const onPointerLeave = useCallback(() => {
        if (isCanvas) return
        if (touchCaptured.current) return

        // Debounce leave to prevent stutter from brief
        // pointerleave/pointerenter cycles at layer boundaries.
        if (leaveTimer.current) clearTimeout(leaveTimer.current)
        leaveTimer.current = setTimeout(doLeave, 50)
    }, [isCanvas, doLeave])

    // ── Touch Drag Handlers (hold-to-activate) ─────────────

    const HOLD_DELAY = 300
    const HOLD_SLOP  = 10

    const activateTouch = useCallback(
        (pointerId: number, el: HTMLElement) => {
            el.setPointerCapture(pointerId)
            touchCaptured.current = true
            if (!hovering.current) {
                const s = cfg.current.hoverStagger || 0
                if (s > 0) triggerStagger(1, s, 2 + cfg.current.layerCount, startLoop, cfg.current.reverseStagger)
            }
            hovering.current = true
            emitActivationEvent(true)
            hoverOpTarget.current = 1

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

            // Click mode: capture touch pointer for smooth parallax tracking
            // when active. Without capture, touch move events stop at element bounds.
            if (cfg.current.activation === "click" && e.pointerType === "touch" && clickActive.current) {
                try {
                    (e.target as HTMLElement).setPointerCapture(e.pointerId)
                    touchCaptured.current = true
                    cachedRect.current = containerRef.current?.getBoundingClientRect() ?? null
                } catch (_) {}
            }

            // Touch drag hold-to-activate
            if (!cfg.current.touchDrag) return
            if (cfg.current.interaction !== "cursor") return
            if (e.pointerType !== "touch") return

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
            if (e.pointerType !== "touch") return

            cancelHold()

            // Click mode: release touch capture on finger lift.
            // Don't deactivate — the component stays active until next tap.
            if (cfg.current.activation === "click" && touchCaptured.current) {
                try {
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId)
                } catch (_) {}
                touchCaptured.current = false
                // Reset tilt to center on release for a smooth settle
                if (cfg.current.tilt && cfg.current.interaction === "cursor") {
                    target.current.rx = 0
                    target.current.ry = 0
                }
                if (cfg.current.parallax && cfg.current.parallaxSource === "cursor") {
                    pTarget.current.tx = 0
                    pTarget.current.ty = 0
                }
                startLoop()
                return
            }

            // When touchDrag is off but activation is hover, a touch
            // triggered pointerenter (hover in) but pointerleave won't
            // fire reliably on mobile. Reset hover on touch up.
            if (!cfg.current.touchDrag) {
                if (cfg.current.activation === "hover" && hovering.current) {
                    hovering.current = false
                    emitActivationEvent(false)
                    hoverOpTarget.current = 0
                    const s = cfg.current.hoverStagger || 0
                    if (s > 0) triggerStagger(0, s, 2 + cfg.current.layerCount, startLoop, cfg.current.reverseStagger)
                    startLoop()
                }
                return
            }

            if (touchCaptured.current) {
                ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
                touchCaptured.current = false
                const s = cfg.current.hoverStagger || 0
                if (s > 0) triggerStagger(0, s, 2 + cfg.current.layerCount, startLoop, cfg.current.reverseStagger)
                hovering.current = false
                emitActivationEvent(false)
                hoverOpTarget.current = 0
                cachedRect.current = null

                if (cfg.current.tilt && cfg.current.interaction === "cursor") {
                    target.current.rx = 0
                    target.current.ry = 0
                    target.current.s = 1
                }

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
            staggerTimers.current.forEach(t => clearTimeout(t))
            staggerTimers.current = []
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

        // Immediately activate hover state + opacity (parallax tracks via onPointerMove)
        const s = cfg.current.hoverStagger || 0
        const count = 2 + cfg.current.layerCount
        if (s > 0) {
            triggerStagger(1, s, count, startLoop, cfg.current.reverseStagger)
        } else {
            // No stagger: set all per-layer targets to 1 immediately
            for (let i = 0; i < count; i++) {
                layerHoverTargets.current[i] = 1
                layerHoverOps.current[i] = 1
            }
        }
        hovering.current = true
        emitActivationEvent(true)
        hoverOpTarget.current = 1
        hoverOpCurrent.current = 1
        startLoop()
    }, [activation, isCanvas, startLoop])

    // ── Activation Mode Reset ────────────────────────────

    useEffect(() => {
        clickActive.current = false
        if (activation !== "always") {
            if (hovering.current) {
                const s = cfg.current.hoverStagger || 0
                if (s > 0) triggerStagger(0, s, 2 + cfg.current.layerCount, startLoop, cfg.current.reverseStagger)
            }
            hovering.current = false
            emitActivationEvent(false)
            hoverOpTarget.current = 0
        }
        startLoop()
    }, [activation, startLoop])

    // ── Click activation via native DOM listener ─────────
    // Uses a native 'click' listener on the container element to ensure
    // the event always fires regardless of Framer's event handling.

    useEffect(() => {
        if (isCanvas || activation !== "click") return
        const el = containerRef.current
        if (!el) return

        let lastClickTime = 0

        // Use document-level click in capture phase — this catches ALL clicks
        // regardless of where they land in the DOM tree, even inside Framer
        // component instances that might not bubble to our container.
        const handleDocClick = (e: MouseEvent) => {
            const clickedInside = el.contains(e.target as Node)

            if (clickedInside) {
                // Debounce: ignore clicks within 300ms
                const now = Date.now()
                if (now - lastClickTime < 300) return
                lastClickTime = now

                clickActive.current = !clickActive.current

                const s = cfg.current.hoverStagger || 0
                const count = 2 + cfg.current.layerCount

                if (clickActive.current) {
                    // Activate
                    if (s > 0) triggerStagger(1, s, count, startLoop, cfg.current.reverseStagger)
                    hovering.current = true
                    emitActivationEvent(true)
                    hoverOpTarget.current = 1
                    cachedRect.current = el.getBoundingClientRect()
                    if (cfg.current.tilt && cfg.current.interaction === "cursor") {
                        target.current.s = cfg.current.hoverScale
                    }
                } else {
                    // Deactivate
                    if (s > 0) triggerStagger(0, s, count, startLoop, cfg.current.reverseStagger)
                    hovering.current = false
                    emitActivationEvent(false)
                    hoverOpTarget.current = 0
                    target.current.rx = 0
                    target.current.ry = 0
                    target.current.s = 1
                    pTarget.current.tx = 0
                    pTarget.current.ty = 0
                    cachedRect.current = null
                }
                startLoop()
            } else {
                // Click outside — deactivate if active
                if (clickActive.current) {
                    clickActive.current = false
                    hovering.current = false
                    emitActivationEvent(false)
                    hoverOpTarget.current = 0
                    target.current.rx = 0
                    target.current.ry = 0
                    target.current.s = 1
                    pTarget.current.tx = 0
                    pTarget.current.ty = 0
                    cachedRect.current = null
                    startLoop()
                }
            }
        }

        document.addEventListener("click", handleDocClick, true)

        return () => {
            document.removeEventListener("click", handleDocClick, true)
        }
    }, [activation, isCanvas, startLoop])

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

    useEffect(() => () => {
        cancelAnimationFrame(rafId.current)
        if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }, [])

    // ── Copy fg slot child border-radius to clip wrapper ──
    // clipRadius prop provides the value directly (works on canvas + preview).
    // The useEffect is a fallback that reads from the fg slot child's DOM.
    useEffect(() => {
        if (!clipToForeground || !parallax) return
        if (clipRadius > 0) return // prop takes priority, skip DOM read
        const wrapper = fgRef.current
        const contentEl = fgContentRef.current
        if (!wrapper || !contentEl) return

        const slotChild = contentEl.firstElementChild as HTMLElement | null
        if (!slotChild) return

        const br = getComputedStyle(slotChild).borderRadius
        if (br && br !== "0px") {
            wrapper.style.borderRadius = br
        }

        return () => {
            if (wrapper) wrapper.style.borderRadius = ""
        }
    }, [clipToForeground, parallax, clipRadius])

    // ── Empty State ─────────────────────────────────────

    if (!resolvedContent) {
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
        ...(activation === "click" ? { cursor: "pointer" } : {}),
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
.${fillClass} > * { width: 100% !important; height: 100% !important; pointer-events: auto; }
.${bgFillClass} > * { min-width: 100% !important; min-height: 100% !important; pointer-events: auto; }
        `}</style>
    )

    // ── Convert B&W mask to alpha-channel mask (cross-browser) ──
    // mask-mode: luminance isn't supported on iOS Safari, so we convert
    // the luminance values to alpha via canvas once on load.
    const [processedMask, setProcessedMask] = useState<string | null>(null)

    useEffect(() => {
        if (!alphaMask) { setProcessedMask(null); return }

        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
            const canvas = document.createElement("canvas")
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext("2d")
            if (!ctx) return

            ctx.drawImage(img, 0, 0)
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const d = imgData.data

            for (let i = 0; i < d.length; i += 4) {
                // Convert luminance to alpha: bright = opaque, dark = transparent
                const luminance = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
                const alpha = invertMask ? 255 - luminance : luminance
                d[i] = 255     // R — white
                d[i + 1] = 255 // G — white
                d[i + 2] = 255 // B — white
                d[i + 3] = alpha
            }

            ctx.putImageData(imgData, 0, 0)
            setProcessedMask(canvas.toDataURL("image/png"))
        }
        img.src = alphaMask
    }, [alphaMask, invertMask])

    // Initial opacity values — "always" starts at hover values to prevent flicker
    const isAlways = activation === "always"
    const bgInitOp = isAlways ? bgOpacityHover : bgOpacityIdle
    const fgInitOp = isAlways ? contentOpacityHover : contentOpacityIdle
    const bgInitialOpacity = bgInitOp < 100 ? bgInitOp / 100 : undefined
    const fgInitialOpacity = fgInitOp < 100 ? fgInitOp / 100 : undefined
    const midIdleArr_ = [mid1OpacityIdle, mid2OpacityIdle, mid3OpacityIdle, mid4OpacityIdle, mid5OpacityIdle, mid6OpacityIdle, mid7OpacityIdle]
    const midHoverArr_ = [mid1OpacityHover, mid2OpacityHover, mid3OpacityHover, mid4OpacityHover, mid5OpacityHover, mid6OpacityHover, mid7OpacityHover]
    const midInitialOpacities = isAlways ? midHoverArr_ : midIdleArr_

    // When parallax is off, render flat (no layer splitting).
    if (!parallax) {
        return (
            <div
                ref={containerRef}
                style={containerStyle}
                onPointerEnter={onPointerEnter}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                onPointerDownCapture={onPointerDown}
                onPointerUpCapture={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {fillStyle}
                <div
                    ref={surfaceRef}
                    className={bgClass}
                    style={{
                        width: "100%",
                        height: "100%",
                        overflow: "visible",
                        willChange: tilt ? "transform" : undefined,
                        ...(touchActive ? { pointerEvents: "none" as const } : {}),
                    }}
                >
                    {resolvedContent}
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
        pointerEvents: "none",
    }

    // ── Parallax render ──────────────────────────────────────

    if (clipToForeground) {
        // Clip-to-foreground layout:
        // The fg wrapper acts as the clipping parent with overflow:hidden.
        // BG and mid layers are absolute children inside it, behind the
        // fg content. They inherit the fg's clip shape (including border-radius).
        // The fg content renders on top via position:relative and z-index.
        return (
            <div
                ref={containerRef}
                style={containerStyle}
                onPointerEnter={onPointerEnter}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                onPointerDownCapture={onPointerDown}
                onPointerUpCapture={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {fillStyle}
                <div
                    ref={surfaceRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        gridTemplate: "1fr / 1fr",
                        isolation: "isolate",
                        willChange: tilt ? "transform" : undefined,
                        ...(touchActive ? { pointerEvents: "none" as const } : {}),
                    }}
                >
                    {/* Foreground wrapper — clips all layers to its shape */}
                    <div
                        ref={fgRef}
                        className={fillClass}
                        style={{
                            ...gridCell,
                            overflow: "hidden",
                            position: "relative",
                            // Clip radius — prop value takes priority, useEffect fallback reads from DOM
                            ...(clipRadius > 0 ? { borderRadius: clipRadius } : {}),
                            // Hide until mask is ready to prevent unmasked flash
                            ...(alphaMask && !processedMask ? { visibility: "hidden" as const } : {}),
                            ...(processedMask ? {
                                WebkitMaskImage: `url(${processedMask})`,
                                maskImage: `url(${processedMask})`,
                                WebkitMaskSize: "100% 100%",
                                maskSize: "100% 100%",
                                WebkitMaskRepeat: "no-repeat",
                                maskRepeat: "no-repeat",
                            } : {}),
                        }}
                    >
                        {/* Background — scaled up by tick loop to cover parallax travel */}
                        {resolvedBg && (
                            <div
                                ref={bgRef}
                                className={fillClass}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    willChange: "transform",
                                    pointerEvents: "none",
                                    opacity: bgInitialOpacity,
                                    zIndex: 0,
                                    transform: bgScaleVal !== 1 ? `scale(${bgScaleVal})` : undefined,
                                }}
                            >
                                {resolvedBg}
                            </div>
                        )}

                        {/* Mid layers — behind fg content */}
                        {resolvedMidLayersArr.map((mid, i) => {
                            if (!mid) return null
                            const midOp = midInitialOpacities[i]
                            const midS = (midScalesArr[i] || 100) / 100
                            return (
                                <div
                                    key={`layer-mid-${i}`}
                                    ref={(el) => { midRefs.current[i] = el }}
                                    className={fillClass}
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        willChange: "transform",
                                        pointerEvents: "none",
                                        mixBlendMode: (midBlendsArr[i] !== "normal" ? midBlendsArr[i] : undefined) as any,
                                        opacity: midOp < 100 ? midOp / 100 : undefined,
                                        zIndex: layerCount - i,
                                        transform: midS !== 1 ? `scale(${midS})` : undefined,
                                    }}
                                >
                                    {mid}
                                </div>
                            )
                        })}

                        {/* FG content on top */}
                        <div ref={fgContentRef} className={fillClass} style={{
                            position: "relative",
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none",
                            zIndex: layerCount + 2,
                            opacity: fgInitialOpacity,
                            mixBlendMode: (contentBlend !== "normal" ? contentBlend : undefined) as any,
                            transform: fgScaleVal !== 1 ? `scale(${fgScaleVal})` : undefined,
                        }}>
                            {resolvedContent}
                        </div>

                    </div>

                </div>
            </div>
        )
    }

    // ── Flat parallax render (no clipping) ──────────────────

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
                {/* Background */}
                {resolvedBg && (
                    <div
                        ref={bgRef}
                        className={bgClass}
                        style={{
                            ...gridCell,
                            overflow: "visible",
                            opacity: bgInitialOpacity,
                            transform: bgScaleVal !== 1 ? `scale(${bgScaleVal})` : undefined,
                        }}
                    >
                        {resolvedBg}
                    </div>
                )}

                {/* Mid layers — reversed DOM order so Layer 1 (closest to fg)
                     is last in DOM = painted on top. Refs use original index
                     so parallax depth assignments stay correct. */}
                {[...resolvedMidLayersArr].reverse().map((mid, ri) => {
                    const i = layerCount - 1 - ri
                    if (!mid) return null
                    const midOp = midInitialOpacities[i]
                    const midS = (midScalesArr[i] || 100) / 100
                    return (
                        <div
                            key={`layer-mid-${i}`}
                            ref={(el) => { midRefs.current[i] = el }}
                            className={fillClass}
                            style={{
                                ...gridCell,
                                overflow: "visible",
                                mixBlendMode: (midBlendsArr[i] !== "normal" ? midBlendsArr[i] : undefined) as any,
                                opacity: midOp < 100 ? midOp / 100 : undefined,
                                transform: midS !== 1 ? `scale(${midS})` : undefined,
                            }}
                        >
                            {mid}
                        </div>
                    )
                })}

                {/* Foreground */}
                <div
                    ref={fgRef}
                    className={fillClass}
                    style={{
                        ...gridCell,
                        overflow: "visible",
                        mixBlendMode: (contentBlend !== "normal" ? contentBlend : undefined) as any,
                        opacity: fgInitialOpacity,
                        transform: fgScaleVal !== 1 ? `scale(${fgScaleVal})` : undefined,
                    }}
                >
                    {resolvedContent}
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
    "color-dodge",
    "color-burn",
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
    "Color Dodge",
    "Color Burn",
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
    contentAdvanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax,
    },
    contentDesktop: {
        type: ControlType.ComponentInstance,
        title: "FG Desktop",
        hidden: (props: any) => !props.parallax || !props.contentAdvanced?.responsiveSource,
    },
    contentTablet: {
        type: ControlType.ComponentInstance,
        title: "FG Tablet",
        hidden: (props: any) => !props.parallax || !props.contentAdvanced?.responsiveSource,
    },
    contentMobile: {
        type: ControlType.ComponentInstance,
        title: "FG Mobile",
        hidden: (props: any) => !props.parallax || !props.contentAdvanced?.responsiveSource,
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
        title: "Tilt Direction",
        options: ["follow", "repel"],
        optionTitles: ["Follow", "Repel"],
        displaySegmentedControl: true,
        defaultValue: "follow",
        description:
            "Follow tilts toward the pointer. Repel tilts away.",
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
        max: 7,
        step: 1,
        displayStepper: true,
        description:
            "Add up to 7 depth layers between background and foreground.",
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
    mid1Advanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 1,
    },
    mid1Desktop: {
        type: ControlType.ComponentInstance,
        title: "L1 Desktop",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 1 || !props.mid1Advanced?.responsiveSource,
    },
    mid1Tablet: {
        type: ControlType.ComponentInstance,
        title: "L1 Tablet",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 1 || !props.mid1Advanced?.responsiveSource,
    },
    mid1Mobile: {
        type: ControlType.ComponentInstance,
        title: "L1 Mobile",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 1 || !props.mid1Advanced?.responsiveSource,
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
    mid2Advanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 2,
    },
    mid2Desktop: {
        type: ControlType.ComponentInstance,
        title: "L2 Desktop",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 2 || !props.mid2Advanced?.responsiveSource,
    },
    mid2Tablet: {
        type: ControlType.ComponentInstance,
        title: "L2 Tablet",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 2 || !props.mid2Advanced?.responsiveSource,
    },
    mid2Mobile: {
        type: ControlType.ComponentInstance,
        title: "L2 Mobile",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 2 || !props.mid2Advanced?.responsiveSource,
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
    mid3Advanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 3,
    },
    mid3Desktop: {
        type: ControlType.ComponentInstance,
        title: "L3 Desktop",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 3 || !props.mid3Advanced?.responsiveSource,
    },
    mid3Tablet: {
        type: ControlType.ComponentInstance,
        title: "L3 Tablet",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 3 || !props.mid3Advanced?.responsiveSource,
    },
    mid3Mobile: {
        type: ControlType.ComponentInstance,
        title: "L3 Mobile",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 3 || !props.mid3Advanced?.responsiveSource,
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
    mid4Advanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 4,
    },
    mid4Desktop: {
        type: ControlType.ComponentInstance,
        title: "L4 Desktop",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 4 || !props.mid4Advanced?.responsiveSource,
    },
    mid4Tablet: {
        type: ControlType.ComponentInstance,
        title: "L4 Tablet",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 4 || !props.mid4Advanced?.responsiveSource,
    },
    mid4Mobile: {
        type: ControlType.ComponentInstance,
        title: "L4 Mobile",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 4 || !props.mid4Advanced?.responsiveSource,
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
    mid5Advanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 5,
    },
    mid5Desktop: {
        type: ControlType.ComponentInstance,
        title: "L5 Desktop",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 5 || !props.mid5Advanced?.responsiveSource,
    },
    mid5Tablet: {
        type: ControlType.ComponentInstance,
        title: "L5 Tablet",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 5 || !props.mid5Advanced?.responsiveSource,
    },
    mid5Mobile: {
        type: ControlType.ComponentInstance,
        title: "L5 Mobile",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 5 || !props.mid5Advanced?.responsiveSource,
    },

    mid6: {
        type: ControlType.ComponentInstance,
        title: "Layer 6",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 6,
    },
    mid6Blend: {
        type: ControlType.Enum,
        title: "Layer 6 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 6,
    },
    mid6Advanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 6,
    },
    mid6Desktop: {
        type: ControlType.ComponentInstance,
        title: "L6 Desktop",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 6 || !props.mid6Advanced?.responsiveSource,
    },
    mid6Tablet: {
        type: ControlType.ComponentInstance,
        title: "L6 Tablet",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 6 || !props.mid6Advanced?.responsiveSource,
    },
    mid6Mobile: {
        type: ControlType.ComponentInstance,
        title: "L6 Mobile",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 6 || !props.mid6Advanced?.responsiveSource,
    },

    mid7: {
        type: ControlType.ComponentInstance,
        title: "Layer 7",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 7,
    },
    mid7Blend: {
        type: ControlType.Enum,
        title: "Layer 7 Blend",
        options: BLEND_OPTIONS,
        optionTitles: BLEND_TITLES,
        defaultValue: "normal",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 7,
    },
    mid7Advanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 7,
    },
    mid7Desktop: {
        type: ControlType.ComponentInstance,
        title: "L7 Desktop",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 7 || !props.mid7Advanced?.responsiveSource,
    },
    mid7Tablet: {
        type: ControlType.ComponentInstance,
        title: "L7 Tablet",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 7 || !props.mid7Advanced?.responsiveSource,
    },
    mid7Mobile: {
        type: ControlType.ComponentInstance,
        title: "L7 Mobile",
        hidden: (props: any) => !props.parallax || (props.layers ?? 0) < 7 || !props.mid7Advanced?.responsiveSource,
    },

    // Background — deepest layer
    background: {
        type: ControlType.ComponentInstance,
        title: "Background",
        hidden: (props: any) => !props.parallax,
    },
    bgAdvanced: {
        type: ControlType.Object,
        title: "Advanced",
        controls: {
            opacityIdle: { type: ControlType.Number, title: "Idle Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            opacityActive: { type: ControlType.Number, title: "Active Opacity", defaultValue: 100, min: 0, max: 100, step: 1, unit: "%" },
            scale: { type: ControlType.Number, title: "Scale", defaultValue: 100, min: 50, max: 300, step: 1, unit: "%" },
            direction: { type: ControlType.Enum, title: "Layer Direction", options: ["default", "inverted"], optionTitles: ["Default", "Inverted"], defaultValue: "default" },
            responsiveSource: { type: ControlType.Boolean, title: "Responsive Source", defaultValue: false, enabledTitle: "On", disabledTitle: "Off" },
        },
        hidden: (props: any) => !props.parallax,
    },
    bgDesktop: {
        type: ControlType.ComponentInstance,
        title: "BG Desktop",
        hidden: (props: any) => !props.parallax || !props.bgAdvanced?.responsiveSource,
    },
    bgTablet: {
        type: ControlType.ComponentInstance,
        title: "BG Tablet",
        hidden: (props: any) => !props.parallax || !props.bgAdvanced?.responsiveSource,
    },
    bgMobile: {
        type: ControlType.ComponentInstance,
        title: "BG Mobile",
        hidden: (props: any) => !props.parallax || !props.bgAdvanced?.responsiveSource,
    },

    hoverStagger: {
        type: ControlType.Number,
        title: "Activation Stagger",
        defaultValue: 0,
        min: 0,
        max: 500,
        step: 10,
        unit: "ms",
        description:
            "Delay each layer's activation for a cascading reveal.",
        hidden: (props: any) => !props.parallax,
    },

    reverseStagger: {
        type: ControlType.Boolean,
        title: "Reverse Stagger",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        description:
            "Background reveals first, foreground last.",
        hidden: (props: any) => !props.parallax || !props.hoverStagger,
    },

    // ── Activation Events ─────────────────────────────────
    // These appear in the Interactions panel in Framer.
    // Designers can wire them to transitions, overlays, text
    // variant swaps, or any parent-level behavior.
    // Events fire once per state transition, not continuously.

    onActivate: {
        type: ControlType.EventHandler,
    },

    onDeactivate: {
        type: ControlType.EventHandler,
    },

    // ── Clip to Foreground ────────────────────────────────

    clipToForeground: {
        type: ControlType.Boolean,
        title: "Clip to Foreground",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        description:
            "Clips all layers to the foreground shape.",
        hidden: (props: any) => !props.parallax,
    },

    clipRadius: {
        type: ControlType.Number,
        title: "Clip Radius",
        defaultValue: 0,
        min: 0,
        max: 500,
        step: 1,
        description:
            "Corner radius for the clip shape. Set to 0 to match the foreground layer.",
        hidden: (props: any) => !props.parallax || !props.clipToForeground,
    },

    alphaMask: {
        type: ControlType.Image,
        title: "Alpha Mask",
        description:
            "Optional mask for custom clipping. White areas stay visible. Black or transparent areas are hidden.",
        hidden: (props: any) => !props.parallax || !props.clipToForeground,
    },

    invertMask: {
        type: ControlType.Boolean,
        title: "Invert Mask",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        hidden: (props: any) => !props.parallax || !props.clipToForeground,
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
        title: "Layer Direction",
        options: ["toward", "away"],
        optionTitles: ["Toward", "Away"],
        displaySegmentedControl: true,
        defaultValue: "toward",
        description:
            "Controls whether layers move toward or away from the cursor.",
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
        description:
            "Higher values feel smoother and slower.",
        hidden: (props: any) => !props.parallax,
    },
})
