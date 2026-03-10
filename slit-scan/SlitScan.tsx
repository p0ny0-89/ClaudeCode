import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef } from "react"

/**
 * Slit Scan Effect
 *
 * Drop this component into any Frame to apply an animated slit-scan
 * displacement effect to the parent. The component itself is invisible
 * and occupies no space in layout.
 *
 * How it works:
 *   1. On mount, an SVG <filter> with feDisplacementMap is created
 *      and applied to the parent element via CSS `filter`.
 *   2. A small canvas generates a striped displacement map where each
 *      band encodes a per-slice horizontal (or vertical) offset in the
 *      R channel, and an edge-lens warp in the G channel.
 *   3. Each animation frame, sine-wave offsets are computed per slice
 *      (each with its own phase and frequency variation) and the
 *      displacement map is regenerated and pushed into the SVG filter.
 *
 * Note: Applying a CSS filter creates a new stacking context on the
 * parent, which may affect fixed-position descendants or z-index.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg"
const XLINK_NS = "http://www.w3.org/1999/xlink"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
    sliceCount: number
    direction: "horizontal" | "vertical"
    trigger: "loop" | "hover"
    edgeDistortion: number
    duration: number
    intensity: number
}

// ---------------------------------------------------------------------------
// Displacement-map generator
// ---------------------------------------------------------------------------

/**
 * Paints a striped displacement map onto `canvas` using `ctx`.
 *
 * For horizontal slicing the canvas is 2 × resolution (tall strip).
 * For vertical slicing the canvas is resolution × 2 (wide strip).
 *
 * R channel → primary displacement (X for horizontal, Y for vertical)
 * G channel → cross-axis lens warp at slice edges
 *
 * `offsets` is an array of normalised values in [−1, 1] per slice.
 * `edgeSoftness` (0–1) controls how many pixels at each slice boundary
 * are blended with a smooth-step gradient and how strong the lens bulge is.
 */
function paintDisplacementMap(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    sliceCount: number,
    offsets: number[],
    direction: "horizontal" | "vertical",
    edgeSoftness: number,
    resolution: number
) {
    const isH = direction === "horizontal"
    canvas.width = isH ? 2 : resolution
    canvas.height = isH ? resolution : 2

    const len = resolution
    const sliceSize = len / sliceCount
    const softPx = Math.max(0, Math.round(edgeSoftness * sliceSize * 0.45))

    // Neutral grey = zero displacement
    ctx.fillStyle = "rgb(128,128,128)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < sliceCount; i++) {
        const offset = offsets[i] || 0
        const r = Math.round(128 + offset * 127)
        const start = Math.round(i * sliceSize)
        const end = Math.round((i + 1) * sliceSize)

        // ---- Slice body (uniform displacement) --------------------------
        const bodyStart = start + softPx
        const bodyEnd = end - softPx

        if (bodyEnd > bodyStart) {
            ctx.fillStyle = `rgb(${r},128,128)`
            if (isH) {
                ctx.fillRect(0, bodyStart, canvas.width, bodyEnd - bodyStart)
            } else {
                ctx.fillRect(bodyStart, 0, bodyEnd - bodyStart, canvas.height)
            }
        }

        // ---- Edge transitions with lens distortion ----------------------
        if (softPx > 0) {
            const prevR =
                i > 0 ? Math.round(128 + (offsets[i - 1] || 0) * 127) : 128
            const nextR =
                i < sliceCount - 1
                    ? Math.round(128 + (offsets[i + 1] || 0) * 127)
                    : 128

            // Leading edge (transition from previous slice into this one)
            for (let p = 0; p < softPx; p++) {
                const t = p / softPx
                const smooth = t * t * (3 - 2 * t) // smoothstep
                const rv = Math.round(prevR + (r - prevR) * smooth)
                // Lens: sin curve peaks mid-edge, pushes cross-axis pixels
                const lens = Math.sin(t * Math.PI) * edgeSoftness * 30
                const gv = clamp(Math.round(128 + lens), 0, 255)

                ctx.fillStyle = `rgb(${rv},${gv},128)`
                if (isH) {
                    ctx.fillRect(0, start + p, canvas.width, 1)
                } else {
                    ctx.fillRect(start + p, 0, 1, canvas.height)
                }
            }

            // Trailing edge (transition from this slice into the next one)
            for (let p = 0; p < softPx; p++) {
                const t = p / softPx
                const smooth = t * t * (3 - 2 * t)
                const rv = Math.round(r + (nextR - r) * smooth)
                const lens = -Math.sin(t * Math.PI) * edgeSoftness * 30
                const gv = clamp(Math.round(128 + lens), 0, 255)

                ctx.fillStyle = `rgb(${rv},${gv},128)`
                if (isH) {
                    ctx.fillRect(0, end - softPx + p, canvas.width, 1)
                } else {
                    ctx.fillRect(end - softPx + p, 0, 1, canvas.height)
                }
            }
        }
    }

    return canvas.toDataURL()
}

function clamp(v: number, min: number, max: number) {
    return v < min ? min : v > max ? max : v
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SlitScanEffect({
    sliceCount = 8,
    direction = "horizontal",
    trigger = "loop",
    edgeDistortion = 0.3,
    duration = 2,
    intensity = 30,
}: Props) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const parent = el.parentElement
        if (!parent) return

        // ---- Unique filter ID -------------------------------------------
        const filterId = `slit-${Math.random().toString(36).slice(2, 8)}`
        const resolution = Math.max(256, sliceCount * 64)

        // ---- Stable per-slice random phases -----------------------------
        const phases: number[] = []
        for (let i = 0; i < sliceCount; i++) {
            phases.push(Math.random() * Math.PI * 2)
        }

        // ---- Reusable canvas for displacement map -----------------------
        const mapCanvas = document.createElement("canvas")
        const mapCtx = mapCanvas.getContext("2d")!

        // ---- Build SVG filter -------------------------------------------
        const svg = document.createElementNS(SVG_NS, "svg")
        svg.setAttribute("width", "0")
        svg.setAttribute("height", "0")
        svg.style.position = "absolute"
        svg.style.pointerEvents = "none"

        const defs = document.createElementNS(SVG_NS, "defs")
        const filter = document.createElementNS(SVG_NS, "filter")
        filter.setAttribute("id", filterId)
        filter.setAttribute("color-interpolation-filters", "sRGB")

        // Filter region must be large enough to show displaced pixels
        if (direction === "horizontal") {
            filter.setAttribute("x", "-30%")
            filter.setAttribute("y", "-5%")
            filter.setAttribute("width", "160%")
            filter.setAttribute("height", "110%")
        } else {
            filter.setAttribute("x", "-5%")
            filter.setAttribute("y", "-30%")
            filter.setAttribute("width", "110%")
            filter.setAttribute("height", "160%")
        }

        // feImage: holds the displacement map
        const feImage = document.createElementNS(SVG_NS, "feImage")
        feImage.setAttribute("result", "dispMap")
        feImage.setAttribute("preserveAspectRatio", "none")

        // feDisplacementMap: applies the displacement
        const feDisp = document.createElementNS(SVG_NS, "feDisplacementMap")
        feDisp.setAttribute("in", "SourceGraphic")
        feDisp.setAttribute("in2", "dispMap")
        feDisp.setAttribute("scale", String(intensity))

        // Channel mapping depends on slice direction:
        //   Horizontal slicing → displace in X (R), lens in Y (G)
        //   Vertical slicing   → displace in Y (R), lens in X (G)
        if (direction === "horizontal") {
            feDisp.setAttribute("xChannelSelector", "R")
            feDisp.setAttribute("yChannelSelector", "G")
        } else {
            feDisp.setAttribute("xChannelSelector", "G")
            feDisp.setAttribute("yChannelSelector", "R")
        }

        filter.appendChild(feImage)
        filter.appendChild(feDisp)
        defs.appendChild(filter)
        svg.appendChild(defs)
        parent.appendChild(svg)

        // Apply CSS filter to parent
        const prevFilter = parent.style.filter
        parent.style.filter = `url(#${filterId})`

        // ---- Animation state --------------------------------------------
        let animId = 0
        let hoverProgress = trigger === "loop" ? 1 : 0
        let isHovered = false
        let lastTime = performance.now()
        const startTime = performance.now()

        // ---- Frame loop -------------------------------------------------
        function animate() {
            const now = performance.now()
            const dt = Math.min(0.05, (now - lastTime) / 1000)
            lastTime = now
            const time = (now - startTime) / 1000

            // Smooth hover ramp
            if (trigger === "hover") {
                const target = isHovered ? 1 : 0
                const decay = Math.exp((-dt * 6) / Math.max(0.1, duration))
                hoverProgress = hoverProgress * decay + target * (1 - decay)
                if (hoverProgress < 0.001 && !isHovered) hoverProgress = 0
                if (hoverProgress > 0.999 && isHovered) hoverProgress = 1
            }

            const effectMult = trigger === "loop" ? 1 : hoverProgress

            // Skip map regeneration when effect is invisible
            if (effectMult < 0.001) {
                feDisp.setAttribute("scale", "0")
                animId = requestAnimationFrame(animate)
                return
            }

            // Per-slice offsets driven by sine waves with variation
            const offsets: number[] = []
            for (let i = 0; i < sliceCount; i++) {
                const freqVariation =
                    0.7 + Math.abs(Math.sin(i * 2.73)) * 0.6
                const freq =
                    (1 / Math.max(0.1, duration)) * freqVariation
                const amp =
                    0.4 + Math.abs(Math.cos(i * 1.37 + 0.5)) * 0.6
                offsets.push(
                    Math.sin(time * freq * Math.PI * 2 + phases[i]) *
                        amp *
                        effectMult
                )
            }

            // Regenerate displacement map
            const mapUri = paintDisplacementMap(
                mapCanvas,
                mapCtx,
                sliceCount,
                offsets,
                direction,
                edgeDistortion,
                resolution
            )

            // Push into SVG filter
            feImage.setAttributeNS(XLINK_NS, "xlink:href", mapUri)
            feImage.setAttribute("href", mapUri)
            feDisp.setAttribute(
                "scale",
                String(intensity * effectMult)
            )

            animId = requestAnimationFrame(animate)
        }

        // ---- Hover listeners --------------------------------------------
        const onEnter = () => {
            isHovered = true
        }
        const onLeave = () => {
            isHovered = false
        }

        if (trigger === "hover") {
            parent.addEventListener("mouseenter", onEnter)
            parent.addEventListener("mouseleave", onLeave)
        }

        animId = requestAnimationFrame(animate)

        // ---- Cleanup ----------------------------------------------------
        return () => {
            cancelAnimationFrame(animId)
            parent.style.filter = prevFilter
            svg.remove()
            parent.removeEventListener("mouseenter", onEnter)
            parent.removeEventListener("mouseleave", onLeave)
        }
    }, [sliceCount, direction, trigger, edgeDistortion, duration, intensity])

    // Invisible anchor — takes no space, doesn't interfere with layout
    return (
        <div
            ref={ref}
            style={{
                position: "absolute",
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
            }}
        />
    )
}

// ---------------------------------------------------------------------------
// Property controls (Framer UI)
// ---------------------------------------------------------------------------

addPropertyControls(SlitScanEffect, {
    sliceCount: {
        type: ControlType.Number,
        title: "Slices",
        defaultValue: 8,
        min: 2,
        max: 40,
        step: 1,
    },
    direction: {
        type: ControlType.Enum,
        title: "Direction",
        options: ["horizontal", "vertical"],
        optionTitles: ["Horizontal", "Vertical"],
        defaultValue: "horizontal",
    },
    trigger: {
        type: ControlType.Enum,
        title: "Trigger",
        options: ["loop", "hover"],
        optionTitles: ["Loop", "Hover"],
        defaultValue: "loop",
    },
    edgeDistortion: {
        type: ControlType.Number,
        title: "Edge Distortion",
        defaultValue: 0.3,
        min: 0,
        max: 1,
        step: 0.01,
    },
    intensity: {
        type: ControlType.Number,
        title: "Intensity",
        defaultValue: 30,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
    },
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        unit: "s",
    },
})
