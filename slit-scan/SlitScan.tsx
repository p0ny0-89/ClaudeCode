import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef } from "react"

/**
 * Slit Scan Effect  (v4 — zero external resources)
 *
 * Drop into any Frame to apply animated slit-scan displacement.
 * Invisible — takes no space in layout.
 *
 * Architecture
 * ────────────
 * Chrome blocks ALL external resources in feImage (data URIs, blob
 * URLs, SVGs — everything).  So v4 builds the displacement map
 * entirely from SVG filter primitives:
 *
 *   feFlood ×N  →  feMerge  →  feGaussianBlur  →  feDisplacementMap
 *   (one per       (stack        (soften edges      (displace parent
 *    slice band)    into map)     for lens look)      pixels)
 *
 * Each feFlood has explicit x/y/width/height covering its slice band
 * and flood-color encoding the displacement for that band.  Animation
 * updates flood-color on each feFlood element every frame.
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
// DOM helpers
// ---------------------------------------------------------------------------

function svgEl(tag: string): SVGElement {
    return document.createElementNS(SVG_NS, tag)
}

/**
 * Walk the DOM upward to locate the real Framer Frame.
 */
function findParentFrame(el: HTMLElement): HTMLElement | null {
    // Pass 1 — named Framer layer
    let cur: HTMLElement | null = el.parentElement
    while (cur && cur !== document.body) {
        if (cur.hasAttribute("data-framer-name")) return cur
        cur = cur.parentElement
    }
    // Pass 2 — first ancestor with visual size
    cur = el.parentElement
    while (cur && cur !== document.body) {
        if (cur.offsetWidth > 1 && cur.offsetHeight > 1) return cur
        cur = cur.parentElement
    }
    return el.parentElement
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

        let pW = parent.offsetWidth
        let pH = parent.offsetHeight
        if (pW < 1 || pH < 1) return

        const uid = `slit-${Math.random().toString(36).slice(2, 8)}`
        const attrName = `data-${uid}`
        const isH = direction === "horizontal"

        // Stable random phases per slice
        const phases = Array.from(
            { length: sliceCount },
            () => Math.random() * Math.PI * 2
        )

        // ==================================================================
        // Build SVG filter from primitives only (no feImage)
        // ==================================================================
        const svg = svgEl("svg") as SVGSVGElement
        svg.setAttribute("width", "0")
        svg.setAttribute("height", "0")
        svg.style.position = "absolute"
        svg.style.pointerEvents = "none"

        const defs = svgEl("defs")
        const filter = svgEl("filter")
        filter.setAttribute("id", uid)
        filter.setAttribute("color-interpolation-filters", "sRGB")
        // primitiveUnits defaults to userSpaceOnUse (pixel coords)

        // Generous filter region so displaced pixels remain visible
        if (isH) {
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

        // 1️⃣  Background flood — neutral gray covering the full filter region.
        //     (Without this, un-painted areas would be transparent = R:0 G:0
        //      → large negative displacement on both axes.)
        const bgFlood = svgEl("feFlood")
        bgFlood.setAttribute("flood-color", "rgb(128,128,128)")
        bgFlood.setAttribute("flood-opacity", "1")
        bgFlood.setAttribute("result", "bg")
        // No x/y/w/h → fills the entire filter region by default.

        // 2️⃣  One feFlood per slice band.
        //     Each flood has explicit x/y/width/height in pixels and a
        //     flood-color whose R channel encodes the displacement.
        const sliceFloods: SVGElement[] = []
        for (let i = 0; i < sliceCount; i++) {
            const fl = svgEl("feFlood")
            fl.setAttribute("flood-color", "rgb(128,128,128)")
            fl.setAttribute("flood-opacity", "1")
            fl.setAttribute("result", `s${i}`)
            sliceFloods.push(fl)
        }
        // Set initial positions (will also be called on resize)
        function layoutSlices() {
            const bandW = isH ? pW : pW / sliceCount
            const bandH = isH ? pH / sliceCount : pH
            for (let i = 0; i < sliceCount; i++) {
                const fl = sliceFloods[i]
                if (isH) {
                    fl.setAttribute("x", "0")
                    fl.setAttribute("y", String(Math.round(i * bandH)))
                    fl.setAttribute("width", String(pW))
                    fl.setAttribute("height", String(Math.round(bandH) + 1)) // +1 avoids sub-pixel gaps
                } else {
                    fl.setAttribute("x", String(Math.round(i * bandW)))
                    fl.setAttribute("y", "0")
                    fl.setAttribute("width", String(Math.round(bandW) + 1))
                    fl.setAttribute("height", String(pH))
                }
            }
        }
        layoutSlices()

        // 3️⃣  feMerge — composite background + all slices into one image.
        const merge = svgEl("feMerge")
        merge.setAttribute("result", "dispMap")
        const bgNode = svgEl("feMergeNode")
        bgNode.setAttribute("in", "bg")
        merge.appendChild(bgNode)
        for (let i = 0; i < sliceCount; i++) {
            const mn = svgEl("feMergeNode")
            mn.setAttribute("in", `s${i}`)
            merge.appendChild(mn)
        }

        // 4️⃣  feGaussianBlur — soften band edges for lens-like distortion.
        const blurEl = svgEl("feGaussianBlur")
        blurEl.setAttribute("in", "dispMap")
        blurEl.setAttribute("result", "blurMap")
        function updateBlur() {
            const bandPx = isH ? pH / sliceCount : pW / sliceCount
            const blurPx = edgeDistortion * bandPx * 0.25
            blurEl.setAttribute(
                "stdDeviation",
                isH ? `0 ${blurPx.toFixed(1)}` : `${blurPx.toFixed(1)} 0`
            )
        }
        updateBlur()

        // 5️⃣  feDisplacementMap — apply to parent pixels.
        //     scale = intensity × 2  because offset = scale × (channel − 0.5)
        //     so max displacement = ± intensity px.
        const feDisp = svgEl("feDisplacementMap")
        feDisp.setAttribute("in", "SourceGraphic")
        feDisp.setAttribute(
            "in2",
            edgeDistortion > 0 ? "blurMap" : "dispMap"
        )
        feDisp.setAttribute("scale", String(intensity * 2))
        feDisp.setAttribute(
            "xChannelSelector",
            isH ? "R" : "G"
        )
        feDisp.setAttribute(
            "yChannelSelector",
            isH ? "G" : "R"
        )

        // Assemble filter chain
        filter.appendChild(bgFlood)
        sliceFloods.forEach((fl) => filter.appendChild(fl))
        filter.appendChild(merge)
        if (edgeDistortion > 0) filter.appendChild(blurEl)
        filter.appendChild(feDisp)
        defs.appendChild(filter)
        svg.appendChild(defs)

        // Append to <body> so url(#id) is always reachable
        document.body.appendChild(svg)

        // ==================================================================
        // Apply filter via <style> + data-attribute (Framer-proof)
        // ==================================================================
        parent.setAttribute(attrName, "")
        const styleEl = document.createElement("style")
        styleEl.textContent = `[${attrName}] { filter: url(#${uid}) !important; }`
        document.head.appendChild(styleEl)

        // ==================================================================
        // Animation
        // ==================================================================
        let animId = 0
        let hoverProgress = trigger === "loop" ? 1 : 0
        let isHovered = false
        let lastTime = performance.now()
        const startTime = performance.now()

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

            // Nothing visible — skip
            if (mult < 0.001) {
                feDisp.setAttribute("scale", "0")
                animId = requestAnimationFrame(animate)
                return
            }

            feDisp.setAttribute("scale", String(intensity * 2))

            // Update each slice's flood colour
            for (let i = 0; i < sliceCount; i++) {
                const fVar = 0.7 + Math.abs(Math.sin(i * 2.73)) * 0.6
                const f = (1 / Math.max(0.1, duration)) * fVar
                const amp =
                    0.4 + Math.abs(Math.cos(i * 1.37 + 0.5)) * 0.6
                const offset =
                    Math.sin(time * f * Math.PI * 2 + phases[i]) *
                    amp *
                    mult
                const r = Math.round(128 + offset * 127)
                sliceFloods[i].setAttribute(
                    "flood-color",
                    `rgb(${r},128,128)`
                )
            }

            animId = requestAnimationFrame(animate)
        }

        // Hover listeners
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

        // ResizeObserver — keep slice geometry and blur correct
        const resizeObs = new ResizeObserver(([entry]) => {
            pW = entry.contentRect.width
            pH = entry.contentRect.height
            if (pW > 0 && pH > 0) {
                layoutSlices()
                updateBlur()
            }
        })
        resizeObs.observe(parent)

        // Start
        animId = requestAnimationFrame(animate)

        // ==================================================================
        // Cleanup
        // ==================================================================
        return () => {
            cancelAnimationFrame(animId)
            resizeObs.disconnect()
            parent.removeAttribute(attrName)
            styleEl.remove()
            svg.remove()
            parent.removeEventListener("mouseenter", onEnter)
            parent.removeEventListener("mouseleave", onLeave)
        }
    }, [sliceCount, direction, trigger, edgeDistortion, duration, intensity])

    // Invisible anchor
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
// Property controls
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
