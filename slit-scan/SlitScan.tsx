import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef } from "react"

/**
 * Slit Scan Effect  (v3)
 *
 * Drop into any Frame to apply an animated slit-scan displacement.
 * Invisible — takes no space in layout.
 *
 * How it works
 * ────────────
 * An SVG filter with feDisplacementMap is applied to the parent Frame.
 * The displacement map is a tiny SVG image (a stack of coloured <rect>
 * elements), generated as an SVG string → Blob → blob URL and fed to
 * <feImage>.  Using blob URLs instead of data-URIs sidesteps Chrome's
 * CORS restriction on feImage resources.
 *
 * R channel → primary displacement  (X for horiz, Y for vert slicing)
 * G channel → cross-axis lens warp  (smooth bump at slice edges)
 *
 * The blob URL is regenerated every animation frame with updated rect
 * fills driven by per-slice sine waves, giving each band independent
 * organic motion.
 *
 * The CSS filter is injected via a <style> sheet with !important so
 * that Framer's React reconciliation cannot strip it.
 */

const SVG_NS = "http://www.w3.org/2000/svg"

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk up the DOM from `el` to locate the real Framer Frame
 * (skipping internal wrapper divs).
 */
function findParentFrame(el: HTMLElement): HTMLElement | null {
    // Pass 1 — look for a named Framer layer
    let cur: HTMLElement | null = el.parentElement
    while (cur && cur !== document.body) {
        if (cur.hasAttribute("data-framer-name")) return cur
        cur = cur.parentElement
    }
    // Pass 2 — first ancestor with meaningful size
    cur = el.parentElement
    while (cur && cur !== document.body) {
        const { width, height } = cur.getBoundingClientRect()
        if (width > 1 && height > 1) return cur
        cur = cur.parentElement
    }
    return el.parentElement
}

/**
 * Build an SVG displacement-map image as a plain string.
 *
 * The SVG contains one <rect> per slice body plus <linearGradient>
 * transitions at each slice boundary.  Because it is vector, the
 * browser can rasterise it at whatever resolution feImage needs.
 *
 * @param offsets  Normalised displacement per slice, in [−1, 1].
 */
function buildMapSVG(
    sliceCount: number,
    offsets: number[],
    direction: "horizontal" | "vertical",
    edgeDistortion: number
): string {
    const isH = direction === "horizontal"
    // Resolution of the SVG in the slicing axis.
    // Must be high enough so each slice spans many pixels.
    const res = sliceCount * 64
    const w = isH ? 4 : res
    const h = isH ? res : 4
    const band = res / sliceCount
    const edgePx = Math.max(0, Math.round(edgeDistortion * band * 0.4))
    const lens = Math.round(edgeDistortion * 35)

    let defs = ""
    let rects = ""

    // Neutral background (zero displacement)
    rects += `<rect width="${w}" height="${h}" fill="rgb(128,128,128)"/>`

    for (let i = 0; i < sliceCount; i++) {
        const r = Math.round(128 + (offsets[i] ?? 0) * 127)
        const y0 = Math.round(i * band)
        const y1 = Math.round((i + 1) * band)
        const bStart = y0 + edgePx
        const bEnd = y1 - edgePx

        // ---- Slice body (uniform colour = uniform displacement) ---------
        if (bEnd > bStart) {
            if (isH) {
                rects += `<rect x="0" y="${bStart}" width="${w}" height="${bEnd - bStart}" fill="rgb(${r},128,128)"/>`
            } else {
                rects += `<rect x="${bStart}" y="0" width="${bEnd - bStart}" height="${h}" fill="rgb(${r},128,128)"/>`
            }
        }

        // ---- Edge gradient between this slice and the previous one ------
        if (edgePx > 0 && i > 0) {
            const prevR = Math.round(128 + (offsets[i - 1] ?? 0) * 127)
            const midR = Math.round((prevR + r) / 2)
            const gid = `g${i}`

            // Gradient runs from (y0 − edgePx) to (y0 + edgePx).
            // Stops encode R (displacement transition) and G (lens bulge).
            const ey0 = Math.max(0, y0 - edgePx)
            const ey1 = Math.min(res, y0 + edgePx)

            if (isH) {
                defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${ey0}" x2="0" y2="${ey1}">`
            } else {
                defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${ey0}" y1="0" x2="${ey1}" y2="0">`
            }
            // Lens: G deviates from 128 mid-edge, returns to 128 at ends
            defs += `<stop offset="0"   stop-color="rgb(${prevR},128,128)"/>`
            defs += `<stop offset="0.3" stop-color="rgb(${Math.round(prevR + (midR - prevR) * 0.5)},${128 - lens},128)"/>`
            defs += `<stop offset="0.5" stop-color="rgb(${midR},128,128)"/>`
            defs += `<stop offset="0.7" stop-color="rgb(${Math.round(midR + (r - midR) * 0.5)},${128 + lens},128)"/>`
            defs += `<stop offset="1"   stop-color="rgb(${r},128,128)"/>`
            defs += `</linearGradient>`

            if (ey1 > ey0) {
                if (isH) {
                    rects += `<rect x="0" y="${ey0}" width="${w}" height="${ey1 - ey0}" fill="url(#${gid})"/>`
                } else {
                    rects += `<rect x="${ey0}" y="0" width="${ey1 - ey0}" height="${h}" fill="url(#${gid})"/>`
                }
            }
        }
    }

    const defsBlock = defs ? `<defs>${defs}</defs>` : ""
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defsBlock}${rects}</svg>`
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
        const parent = findParentFrame(el)
        if (!parent) return

        const { width: pW, height: pH } = parent.getBoundingClientRect()
        if (pW < 1 || pH < 1) return

        const uid = `slit-${Math.random().toString(36).slice(2, 8)}`
        const filterId = uid
        const attrName = `data-${uid}`

        // Stable random phases per slice
        const phases = Array.from(
            { length: sliceCount },
            () => Math.random() * Math.PI * 2
        )

        // ---- SVG filter skeleton ----------------------------------------
        const svg = document.createElementNS(SVG_NS, "svg")
        svg.setAttribute("width", "0")
        svg.setAttribute("height", "0")
        svg.style.position = "absolute"
        svg.style.pointerEvents = "none"

        const defs = document.createElementNS(SVG_NS, "defs")
        const filter = document.createElementNS(SVG_NS, "filter")
        filter.setAttribute("id", filterId)
        filter.setAttribute("color-interpolation-filters", "sRGB")

        // Filter region — generous so displaced pixels remain visible
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

        // feImage — holds the displacement map (blob URL updated each frame)
        const feImg = document.createElementNS(SVG_NS, "feImage")
        feImg.setAttribute("result", "dispMap")
        feImg.setAttribute("preserveAspectRatio", "none")

        // feDisplacementMap — applies displacement to parent pixels
        //   scale = intensity × 2 because offset = scale × (channel − 0.5)
        const feDisp = document.createElementNS(SVG_NS, "feDisplacementMap")
        feDisp.setAttribute("in", "SourceGraphic")
        feDisp.setAttribute("in2", "dispMap")
        feDisp.setAttribute("scale", String(intensity * 2))

        if (direction === "horizontal") {
            feDisp.setAttribute("xChannelSelector", "R")
            feDisp.setAttribute("yChannelSelector", "G")
        } else {
            feDisp.setAttribute("xChannelSelector", "G")
            feDisp.setAttribute("yChannelSelector", "R")
        }

        filter.appendChild(feImg)
        filter.appendChild(feDisp)
        defs.appendChild(filter)
        svg.appendChild(defs)

        // Append to <body> so the url(#id) reference is always reachable
        document.body.appendChild(svg)

        // ---- Apply filter via <style> + data-attribute ------------------
        // Survives Framer's React reconciliation (inline styles don't).
        parent.setAttribute(attrName, "")
        const styleEl = document.createElement("style")
        styleEl.textContent = `[${attrName}] { filter: url(#${filterId}) !important; }`
        document.head.appendChild(styleEl)

        // ---- Animation state --------------------------------------------
        let animId = 0
        let hoverProgress = trigger === "loop" ? 1 : 0
        let isHovered = false
        let lastTime = performance.now()
        const startTime = performance.now()
        let prevBlobUrl: string | null = null

        // ---- Frame loop -------------------------------------------------
        function animate() {
            const now = performance.now()
            const dt = Math.min(0.05, (now - lastTime) / 1000)
            lastTime = now
            const time = (now - startTime) / 1000

            // Hover ramp (exponential ease)
            if (trigger === "hover") {
                const target = isHovered ? 1 : 0
                const decay = Math.exp((-dt * 6) / Math.max(0.1, duration))
                hoverProgress =
                    hoverProgress * decay + target * (1 - decay)
                if (hoverProgress < 0.001 && !isHovered) hoverProgress = 0
                if (hoverProgress > 0.999 && isHovered) hoverProgress = 1
            }

            const mult = trigger === "loop" ? 1 : hoverProgress

            // Nothing visible — skip expensive work
            if (mult < 0.001) {
                feDisp.setAttribute("scale", "0")
                animId = requestAnimationFrame(animate)
                return
            }

            // Per-slice offsets (sine waves with unique phase & frequency)
            const offsets: number[] = []
            for (let i = 0; i < sliceCount; i++) {
                const fVar = 0.7 + Math.abs(Math.sin(i * 2.73)) * 0.6
                const f = (1 / Math.max(0.1, duration)) * fVar
                const amp =
                    0.4 + Math.abs(Math.cos(i * 1.37 + 0.5)) * 0.6
                offsets.push(
                    Math.sin(time * f * Math.PI * 2 + phases[i]) *
                        amp *
                        mult
                )
            }

            // Build displacement map SVG → Blob → blob URL
            const mapSVG = buildMapSVG(
                sliceCount,
                offsets,
                direction,
                edgeDistortion
            )
            const blob = new Blob([mapSVG], { type: "image/svg+xml" })
            const url = URL.createObjectURL(blob)

            feImg.setAttribute("href", url)
            feDisp.setAttribute("scale", String(intensity * 2))

            // Revoke the *previous* URL (the current one is now in use)
            if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl)
            prevBlobUrl = url

            animId = requestAnimationFrame(animate)
        }

        // ---- Hover listeners on the real parent -------------------------
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

        // Go
        animId = requestAnimationFrame(animate)

        // ---- Cleanup ----------------------------------------------------
        return () => {
            cancelAnimationFrame(animId)
            if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl)
            parent.removeAttribute(attrName)
            styleEl.remove()
            svg.remove()
            parent.removeEventListener("mouseenter", onEnter)
            parent.removeEventListener("mouseleave", onLeave)
        }
    }, [sliceCount, direction, trigger, edgeDistortion, duration, intensity])

    // Invisible anchor — zero size, no layout impact
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
