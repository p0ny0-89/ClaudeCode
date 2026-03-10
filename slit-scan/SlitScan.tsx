import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef } from "react"

/**
 * Slit Scan Effect
 *
 * Drop this component into any Frame to apply an animated slit-scan
 * displacement effect to the parent. The component is invisible and
 * occupies no space in layout.
 *
 * Architecture (v2 — fully self-contained SVG filter):
 *
 *   feTurbulence  →  feComponentTransfer  →  feGaussianBlur  →  feDisplacementMap
 *   (noise bands)    (posterise to N        (soften edges      (displace parent
 *                     discrete levels)       for lens look)      pixels)
 *
 * No feImage / data-URI / canvas — everything lives inside SVG filter
 * primitives, which avoids Chrome's CORS restrictions entirely.
 *
 * The filter is applied via a <style> sheet with !important so that
 * Framer's React reconciliation cannot strip it.
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
 * Walk up the DOM from `el` to find the nearest ancestor that looks
 * like a real Framer Frame rather than an internal wrapper div.
 *
 * Strategy: skip zero-size wrappers, then prefer an element with a
 * `data-framer-name` attribute, otherwise take the first ancestor
 * whose both width and height exceed 1 px.
 */
function findParentFrame(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement

    // First pass: look for an explicit Framer Frame (user-named layer)
    let cursor: HTMLElement | null = node
    while (cursor && cursor !== document.body) {
        if (cursor.hasAttribute("data-framer-name")) return cursor
        cursor = cursor.parentElement
    }

    // Second pass: first ancestor with meaningful visual size
    cursor = node
    while (cursor && cursor !== document.body) {
        const { width, height } = cursor.getBoundingClientRect()
        if (width > 1 && height > 1) return cursor
        cursor = cursor.parentElement
    }

    // Last resort
    return node
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

        // Unique token for this instance
        const uid = `slit-${Math.random().toString(36).slice(2, 8)}`
        const filterId = uid
        const attrName = `data-${uid}`

        // Stable random phases per slice
        const phases: number[] = Array.from(
            { length: sliceCount },
            () => Math.random() * Math.PI * 2
        )

        // -- Compute feTurbulence baseFrequency --
        // We want roughly `sliceCount` visible bands.  With numOctaves=1
        // the noise completes ~(freq * size) full cycles over the element,
        // each cycle yielding two half-bands, so freq ≈ sliceCount / (2 * size).
        const size = direction === "horizontal" ? pH : pW
        const freq = sliceCount / (size * 2)
        // Tiny non-zero cross-axis frequency to avoid degenerate edge cases
        const baseFreq =
            direction === "horizontal"
                ? `0.00001 ${freq.toFixed(6)}`
                : `${freq.toFixed(6)} 0.00001`

        // Edge blur radius (pixels)
        const bandPx = size / sliceCount
        const blurPx = edgeDistortion * bandPx * 0.25
        const blurStd =
            direction === "horizontal"
                ? `0 ${blurPx.toFixed(2)}`
                : `${blurPx.toFixed(2)} 0`

        // ==================================================================
        // Build SVG filter entirely from primitives (no feImage needed)
        // ==================================================================
        const svg = document.createElementNS(SVG_NS, "svg")
        svg.setAttribute("width", "0")
        svg.setAttribute("height", "0")
        svg.style.position = "absolute"
        svg.style.pointerEvents = "none"

        const defs = document.createElementNS(SVG_NS, "defs")

        const filter = document.createElementNS(SVG_NS, "filter")
        filter.setAttribute("id", filterId)
        filter.setAttribute("color-interpolation-filters", "sRGB")

        // Generous filter region so displaced pixels are visible
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

        // 1️⃣ feTurbulence — horizontal (or vertical) noise bands
        const feTurb = document.createElementNS(SVG_NS, "feTurbulence")
        feTurb.setAttribute("type", "fractalNoise")
        feTurb.setAttribute("baseFrequency", baseFreq)
        feTurb.setAttribute("numOctaves", "1")
        feTurb.setAttribute(
            "seed",
            String(Math.floor(Math.random() * 9999))
        )
        feTurb.setAttribute("result", "noise")

        // 2️⃣ feComponentTransfer — posterise noise into discrete levels
        //    Each discrete level will map to one displacement magnitude.
        //    Animated every frame by updating feFuncR.tableValues.
        const feCT = document.createElementNS(SVG_NS, "feComponentTransfer")
        feCT.setAttribute("in", "noise")
        feCT.setAttribute("result", "stepped")

        const feFuncR = document.createElementNS(SVG_NS, "feFuncR")
        feFuncR.setAttribute("type", "discrete")
        feFuncR.setAttribute(
            "tableValues",
            Array(sliceCount).fill("0.5").join(" ")
        )

        // G, B, A channels: neutral / opaque
        const feFuncG = document.createElementNS(SVG_NS, "feFuncG")
        feFuncG.setAttribute("type", "linear")
        feFuncG.setAttribute("slope", "0")
        feFuncG.setAttribute("intercept", "0.5")

        const feFuncB = document.createElementNS(SVG_NS, "feFuncB")
        feFuncB.setAttribute("type", "linear")
        feFuncB.setAttribute("slope", "0")
        feFuncB.setAttribute("intercept", "0.5")

        const feFuncA = document.createElementNS(SVG_NS, "feFuncA")
        feFuncA.setAttribute("type", "linear")
        feFuncA.setAttribute("slope", "0")
        feFuncA.setAttribute("intercept", "1")

        feCT.appendChild(feFuncR)
        feCT.appendChild(feFuncG)
        feCT.appendChild(feFuncB)
        feCT.appendChild(feFuncA)

        // 3️⃣ feGaussianBlur — soften band edges (lens-like distortion)
        const feBlur = document.createElementNS(SVG_NS, "feGaussianBlur")
        feBlur.setAttribute("in", "stepped")
        feBlur.setAttribute("stdDeviation", blurStd)
        feBlur.setAttribute("result", "blurred")

        // 4️⃣ feDisplacementMap — apply displacement to parent pixels
        const feDisp = document.createElementNS(SVG_NS, "feDisplacementMap")
        feDisp.setAttribute("in", "SourceGraphic")
        feDisp.setAttribute(
            "in2",
            edgeDistortion > 0 ? "blurred" : "stepped"
        )
        // scale = intensity * 2 because feDisplacementMap offsets by
        // scale * (channelValue − 0.5), giving ±(intensity) px at extremes.
        feDisp.setAttribute("scale", String(intensity * 2))

        if (direction === "horizontal") {
            feDisp.setAttribute("xChannelSelector", "R")
            feDisp.setAttribute("yChannelSelector", "G")
        } else {
            feDisp.setAttribute("xChannelSelector", "G")
            feDisp.setAttribute("yChannelSelector", "R")
        }

        // Assemble filter chain
        filter.appendChild(feTurb)
        filter.appendChild(feCT)
        if (edgeDistortion > 0) filter.appendChild(feBlur)
        filter.appendChild(feDisp)
        defs.appendChild(filter)
        svg.appendChild(defs)

        // Append SVG to <body> so the url(#id) reference is always reachable
        document.body.appendChild(svg)

        // ==================================================================
        // Apply filter via injected <style> + data-attribute
        // This survives Framer's React reconciliation (inline styles don't).
        // ==================================================================
        parent.setAttribute(attrName, "")
        const styleEl = document.createElement("style")
        styleEl.textContent = `[${attrName}] { filter: url(#${filterId}) !important; }`
        document.head.appendChild(styleEl)

        // ==================================================================
        // Animation state
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

            // ---- Hover ramp (exponential ease) ---
            if (trigger === "hover") {
                const target = isHovered ? 1 : 0
                const decay = Math.exp((-dt * 6) / Math.max(0.1, duration))
                hoverProgress =
                    hoverProgress * decay + target * (1 - decay)
                if (hoverProgress < 0.001 && !isHovered) hoverProgress = 0
                if (hoverProgress > 0.999 && isHovered) hoverProgress = 1
            }

            const effectMult = trigger === "loop" ? 1 : hoverProgress

            // Skip work when effect is invisible
            if (effectMult < 0.001) {
                feDisp.setAttribute("scale", "0")
                animId = requestAnimationFrame(animate)
                return
            }

            // ---- Per-slice displacement values ---
            // Each discrete level gets a sine-wave offset with unique
            // phase and slight frequency variation for organic movement.
            const values: string[] = []
            for (let i = 0; i < sliceCount; i++) {
                const fVar = 0.7 + Math.abs(Math.sin(i * 2.73)) * 0.6
                const f = (1 / Math.max(0.1, duration)) * fVar
                const amp =
                    0.4 + Math.abs(Math.cos(i * 1.37 + 0.5)) * 0.6

                const v =
                    0.5 +
                    Math.sin(time * f * Math.PI * 2 + phases[i]) *
                        0.5 *
                        amp *
                        effectMult

                values.push(v.toFixed(4))
            }

            feFuncR.setAttribute("tableValues", values.join(" "))
            feDisp.setAttribute("scale", String(intensity * 2))

            animId = requestAnimationFrame(animate)
        }

        // ---- Hover listeners on the real Frame ---
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

        // ---- ResizeObserver: keep band frequency correct on resize ---
        const resizeObs = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            const sz = direction === "horizontal" ? height : width
            if (sz > 0) {
                const newFreq = sliceCount / (sz * 2)
                feTurb.setAttribute(
                    "baseFrequency",
                    direction === "horizontal"
                        ? `0.00001 ${newFreq.toFixed(6)}`
                        : `${newFreq.toFixed(6)} 0.00001`
                )
                if (edgeDistortion > 0) {
                    const newBand = sz / sliceCount
                    const newBlur = edgeDistortion * newBand * 0.25
                    feBlur.setAttribute(
                        "stdDeviation",
                        direction === "horizontal"
                            ? `0 ${newBlur.toFixed(2)}`
                            : `${newBlur.toFixed(2)} 0`
                    )
                }
            }
        })
        resizeObs.observe(parent)

        // Start loop
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

    // Invisible anchor — zero-size, no layout impact
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
