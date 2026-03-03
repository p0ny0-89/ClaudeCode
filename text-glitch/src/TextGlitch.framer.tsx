/**
 * TextGlitch — Framer Code Component
 *
 * Copy this entire file into Framer's Code Editor (Assets → Code → New File).
 * The component will appear in your Insert menu as "Text Glitch".
 *
 * Hover over the text to trigger the interactive glitch effect.
 */

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react"
import { addPropertyControls, ControlType } from "framer"

// ── Helpers ──────────────────────────────────────────────────────────────────

function hash01(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed) * 43758.5453
  return x - Math.floor(x)
}

function sliceDirection(i: number): number {
  const groupSize = 2 + Math.floor(hash01(Math.floor(i / 3), 77.7) * 3)
  const groupId = Math.floor(i / groupSize)
  const base = hash01(groupId, 311.7) * 2 - 1
  const jitter = (hash01(i, 529.3) - 0.5) * 0.3
  const v = base + jitter
  return Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 0.6)
}

function sliceMagnitude(i: number): number {
  const v = hash01(i, 183.3)
  if (v < 0.25) return v * 0.15
  if (v > 0.85) return 1.2 + (v - 0.85) * 4
  return 0.3 + (v - 0.25) * 1.1
}

function falloff(dist: number, radius: number): number {
  if (radius <= 0) return 0
  const sigma = radius / 2.5
  return Math.exp(-(dist * dist) / (2 * sigma * sigma))
}

interface TrailPoint {
  x: number
  y: number
  time: number
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  textTransform?: CSSProperties["textTransform"]
  letterSpacing?: number
  lineHeight?: number
  color?: string
  textAlign?: "left" | "center" | "right"
  blockSize?: number
  influenceRadius?: number
  intensity?: number
  trailDuration?: number
  smoothing?: number
  width?: number | string
  height?: number | string
  style?: CSSProperties
}

function TextGlitch({
  text = "LIKE A\nMACHINE",
  fontSize = 120,
  fontFamily = "Inter, system-ui, -apple-system, sans-serif",
  fontWeight = 900,
  textTransform = "uppercase",
  letterSpacing = -0.02,
  lineHeight = 0.95,
  color = "#FF0000",
  textAlign = "center",
  blockSize = 8,
  influenceRadius = 140,
  intensity = 60,
  trailDuration = 300,
  smoothing = 0.12,
  width,
  height,
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(0)

  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const sliceDisplacements = useRef<Float64Array>(new Float64Array(0))
  const sliceTargets = useRef<Float64Array>(new Float64Array(0))
  const sliceEls = useRef<HTMLDivElement[]>([])
  const rafId = useRef(0)

  const clampedBlockSize = Math.max(2, blockSize)
  const sliceCount =
    containerHeight > 0 ? Math.ceil(containerHeight / clampedBlockSize) : 0

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height
      if (h !== containerHeight) setContainerHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerHeight])

  useEffect(() => {
    if (sliceCount > 0) {
      sliceDisplacements.current = new Float64Array(sliceCount)
      sliceTargets.current = new Float64Array(sliceCount)
    }
  }, [sliceCount])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      mouseActive.current = true
      const now = performance.now()
      mouseTrail.current.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        time: now,
      })
      const cutoff = now - trailDuration
      while (
        mouseTrail.current.length > 0 &&
        mouseTrail.current[0].time < cutoff
      ) {
        mouseTrail.current.shift()
      }
    },
    [trailDuration]
  )

  const handlePointerLeave = useCallback(() => {
    mouseActive.current = false
  }, [])

  useEffect(() => {
    if (sliceCount === 0) return

    const animate = () => {
      const disps = sliceDisplacements.current
      const targets = sliceTargets.current
      const els = sliceEls.current
      const trail = mouseTrail.current
      const now = performance.now()
      const active = mouseActive.current

      if (active) {
        const cutoff = now - trailDuration
        while (trail.length > 0 && trail[0].time < cutoff) {
          trail.shift()
        }
      }

      for (let i = 0; i < sliceCount; i++) {
        const sliceCenterY = i * clampedBlockSize + clampedBlockSize / 2

        if (active && trail.length > 0) {
          let peakInfluence = 0
          for (let p = 0; p < trail.length; p++) {
            const pt = trail[p]
            const age = (now - pt.time) / trailDuration
            const timeFade = Math.max(0, 1 - age)
            const dy = pt.y - sliceCenterY
            const dist = Math.abs(dy)
            const spatial = falloff(dist, influenceRadius)
            const combined = spatial * timeFade
            if (combined > peakInfluence) peakInfluence = combined
          }

          const dir = sliceDirection(i)
          const mag = sliceMagnitude(i)
          targets[i] = dir * mag * intensity * peakInfluence
        } else {
          targets[i] = 0
        }

        const diff = targets[i] - disps[i]
        if (Math.abs(diff) > 0.05) {
          disps[i] += diff * smoothing
        } else {
          disps[i] = targets[i]
        }

        const el = els[i]
        if (el) {
          if (Math.abs(disps[i]) < 0.05) {
            el.style.transform = "translateX(0)"
          } else {
            el.style.transform = `translateX(${disps[i]}px)`
          }
        }
      }

      rafId.current = requestAnimationFrame(animate)
    }

    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [
    sliceCount,
    clampedBlockSize,
    influenceRadius,
    intensity,
    trailDuration,
    smoothing,
  ])

  const textStyle: CSSProperties = {
    fontSize,
    fontFamily,
    fontWeight,
    textTransform,
    letterSpacing: `${letterSpacing}em`,
    lineHeight,
    color,
    textAlign,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
    padding: 0,
    userSelect: "none",
    WebkitUserSelect: "none",
  }

  const slices: React.ReactNode[] = []
  sliceEls.current = []

  for (let i = 0; i < sliceCount; i++) {
    const top = i * clampedBlockSize
    const bottom = Math.max(0, containerHeight - top - clampedBlockSize)
    slices.push(
      <div
        key={i}
        ref={(el) => {
          if (el) sliceEls.current[i] = el
        }}
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `inset(${top}px 0px ${bottom}px 0px)`,
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      >
        <div style={textStyle}>{text}</div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        position: "relative",
        overflow: "visible",
        cursor: "default",
        width: width ?? "100%",
        height: height ?? "auto",
        ...style,
      }}
    >
      <div
        style={{ ...textStyle, visibility: "hidden", pointerEvents: "none" }}
        aria-hidden="true"
      >
        {text}
      </div>

      {containerHeight > 0 && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {slices}
        </div>
      )}
    </div>
  )
}

// ── Framer Property Controls ─────────────────────────────────────────────────

addPropertyControls(TextGlitch, {
  text: {
    type: ControlType.String,
    title: "Text",
    defaultValue: "LIKE A\nMACHINE",
    displayTextArea: true,
  },
  fontSize: {
    type: ControlType.Number,
    title: "Font Size",
    defaultValue: 120,
    min: 12,
    max: 500,
    step: 1,
    unit: "px",
  },
  fontFamily: {
    type: ControlType.String,
    title: "Font Family",
    defaultValue: "Inter, system-ui, -apple-system, sans-serif",
  },
  fontWeight: {
    type: ControlType.Enum,
    title: "Font Weight",
    defaultValue: 900,
    options: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    optionTitles: [
      "Thin",
      "Extra Light",
      "Light",
      "Regular",
      "Medium",
      "Semi Bold",
      "Bold",
      "Extra Bold",
      "Black",
    ],
  },
  textTransform: {
    type: ControlType.Enum,
    title: "Transform",
    defaultValue: "uppercase",
    options: ["none", "uppercase", "lowercase", "capitalize"],
    optionTitles: ["None", "Uppercase", "Lowercase", "Capitalize"],
  },
  letterSpacing: {
    type: ControlType.Number,
    title: "Letter Spacing",
    defaultValue: -0.02,
    min: -0.2,
    max: 0.5,
    step: 0.005,
    unit: "em",
  },
  lineHeight: {
    type: ControlType.Number,
    title: "Line Height",
    defaultValue: 0.95,
    min: 0.5,
    max: 3,
    step: 0.05,
  },
  color: {
    type: ControlType.Color,
    title: "Color",
    defaultValue: "#FF0000",
  },
  textAlign: {
    type: ControlType.Enum,
    title: "Alignment",
    defaultValue: "center",
    options: ["left", "center", "right"],
    optionTitles: ["Left", "Center", "Right"],
  },
  blockSize: {
    type: ControlType.Number,
    title: "Block Size",
    defaultValue: 8,
    min: 2,
    max: 40,
    step: 1,
    unit: "px",
    description: "Height of each glitch slice. Smaller = finer grain.",
  },
  influenceRadius: {
    type: ControlType.Number,
    title: "Influence Radius",
    defaultValue: 140,
    min: 20,
    max: 400,
    step: 5,
    unit: "px",
    description: "How far the cursor's glitch effect reaches.",
  },
  intensity: {
    type: ControlType.Number,
    title: "Intensity",
    defaultValue: 60,
    min: 0,
    max: 200,
    step: 1,
    unit: "px",
    description: "Maximum horizontal displacement of slices.",
  },
  trailDuration: {
    type: ControlType.Number,
    title: "Trail Duration",
    defaultValue: 300,
    min: 0,
    max: 800,
    step: 10,
    unit: "ms",
    description: "How long the mouse trail persists.",
  },
  smoothing: {
    type: ControlType.Number,
    title: "Smoothing",
    defaultValue: 0.12,
    min: 0.02,
    max: 0.5,
    step: 0.01,
    description: "Animation interpolation speed. Lower = smoother.",
  },
})

export default TextGlitch
