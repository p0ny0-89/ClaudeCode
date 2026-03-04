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

function cellDirection(i: number): number {
  const groupSize = 2 + Math.floor(hash01(Math.floor(i / 3), 77.7) * 3)
  const groupId = Math.floor(i / groupSize)
  const base = hash01(groupId, 311.7) * 2 - 1
  const jitter = (hash01(i, 529.3) - 0.5) * 0.3
  const v = base + jitter
  return Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 0.6)
}

function cellMagnitude(i: number): number {
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
  vx: number
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  mode?: "text" | "svg"
  text?: string
  font?: Record<string, any>
  textTransform?: CSSProperties["textTransform"]
  color?: string
  svgImage?: string
  recolorSvg?: boolean
  svgColor?: string
  blockSize?: number
  scope?: "line" | "word" | "character"
  effect?: "random" | "directional"
  angle?: number
  clipOverflow?: boolean
  influenceRadius?: number
  intensity?: number
  trailDuration?: number
  smoothing?: number
  width?: number | string
  height?: number | string
  style?: CSSProperties
}

function TextGlitch({
  mode = "text",
  text = "SLOWLY\nMALFUNCTIONING",
  font,
  textTransform = "uppercase",
  color = "#FFFFFF",
  svgImage,
  recolorSvg = false,
  svgColor = "#FFFFFF",
  blockSize = 8,
  scope = "line",
  effect = "random",
  angle = 0,
  clipOverflow = true,
  influenceRadius = 140,
  intensity = 60,
  trailDuration = 300,
  smoothing = 0.12,
  width,
  height,
  style,
}: Props) {
  // Extract fontSize as a number for column-width calculations
  const rawFontSize = font?.fontSize
  const fontSize: number =
    typeof rawFontSize === "number"
      ? rawFontSize
      : typeof rawFontSize === "string"
        ? parseFloat(rawFontSize) || 120
        : 120

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const cellDisplacements = useRef<Float64Array>(new Float64Array(0))
  const cellTargets = useRef<Float64Array>(new Float64Array(0))
  const cellEls = useRef<HTMLDivElement[]>([])
  const rafId = useRef(0)

  const clampedBlockSize = Math.max(2, blockSize)
  const { w: containerWidth, h: containerHeight } = containerSize

  const rowCount =
    containerHeight > 0 ? Math.ceil(containerHeight / clampedBlockSize) : 0

  let colCount: number
  let colWidth: number
  if (scope === "line" || containerWidth <= 0) {
    colCount = 1
    colWidth = containerWidth
  } else {
    const targetColW =
      scope === "word"
        ? Math.max(clampedBlockSize * 4, fontSize * 2.5)
        : Math.max(clampedBlockSize * 2, fontSize * 0.3)
    colCount = Math.max(1, Math.ceil(containerWidth / targetColW))
    colWidth = containerWidth / colCount
  }

  const cellCount = rowCount * colCount

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect
      setContainerSize((prev) =>
        prev.w !== w || prev.h !== h ? { w, h } : prev
      )
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (cellCount > 0) {
      cellDisplacements.current = new Float64Array(cellCount)
      cellTargets.current = new Float64Array(cellCount)
    }
  }, [cellCount])

  const smoothVx = useRef(0)

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      mouseActive.current = true
      const now = performance.now()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top

      const trail = mouseTrail.current
      let vx = 0
      if (trail.length > 0) {
        const prev = trail[trail.length - 1]
        const dt = now - prev.time
        if (dt > 0 && dt < 100) {
          vx = (localX - prev.x) / dt
        }
      }
      smoothVx.current += (vx - smoothVx.current) * 0.4

      trail.push({ x: localX, y: localY, time: now, vx: smoothVx.current })

      const cutoff = now - trailDuration
      while (trail.length > 0 && trail[0].time < cutoff) {
        trail.shift()
      }
    },
    [trailDuration]
  )

  const handlePointerLeave = useCallback(() => {
    mouseActive.current = false
  }, [])

  useEffect(() => {
    if (cellCount === 0) return

    const isLine = scope === "line"
    const isDirectional = effect === "directional"
    const angleRad = (angle * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    const velocitySensitivity = 12

    const animate = () => {
      const disps = cellDisplacements.current
      const targets = cellTargets.current
      const els = cellEls.current
      const trail = mouseTrail.current
      const now = performance.now()
      const active = mouseActive.current

      if (active) {
        const cutoff = now - trailDuration
        while (trail.length > 0 && trail[0].time < cutoff) {
          trail.shift()
        }
      }

      for (let r = 0; r < rowCount; r++) {
        const cellCenterY = r * clampedBlockSize + clampedBlockSize / 2

        for (let c = 0; c < colCount; c++) {
          const idx = r * colCount + c
          const cellCenterX = c * colWidth + colWidth / 2

          if (active && trail.length > 0) {
            if (isDirectional) {
              let peakInfluence = 0
              let peakVx = 0
              for (let p = 0; p < trail.length; p++) {
                const pt = trail[p]
                const age = (now - pt.time) / trailDuration
                const timeFade = Math.max(0, 1 - age)

                let dist: number
                if (isLine) {
                  dist = Math.abs(pt.y - cellCenterY)
                } else {
                  const dx = pt.x - cellCenterX
                  const dy = pt.y - cellCenterY
                  dist = Math.sqrt(dx * dx + dy * dy)
                }

                const spatial = falloff(dist, influenceRadius)
                const combined = spatial * timeFade
                if (combined > peakInfluence) {
                  peakInfluence = combined
                  peakVx = pt.vx
                }
              }

              targets[idx] =
                peakVx * velocitySensitivity * intensity * peakInfluence
            } else {
              let peakInfluence = 0
              for (let p = 0; p < trail.length; p++) {
                const pt = trail[p]
                const age = (now - pt.time) / trailDuration
                const timeFade = Math.max(0, 1 - age)

                let dist: number
                if (isLine) {
                  dist = Math.abs(pt.y - cellCenterY)
                } else {
                  const dx = pt.x - cellCenterX
                  const dy = pt.y - cellCenterY
                  dist = Math.sqrt(dx * dx + dy * dy)
                }

                const spatial = falloff(dist, influenceRadius)
                const combined = spatial * timeFade
                if (combined > peakInfluence) peakInfluence = combined
              }

              const dir = cellDirection(idx)
              const mag = cellMagnitude(idx)
              targets[idx] = dir * mag * intensity * peakInfluence
            }
          } else {
            targets[idx] = 0
          }

          const diff = targets[idx] - disps[idx]
          if (Math.abs(diff) > 0.05) {
            disps[idx] += diff * smoothing
          } else {
            disps[idx] = targets[idx]
          }

          const el = els[idx]
          if (el) {
            if (Math.abs(disps[idx]) < 0.05) {
              el.style.transform = "translate(0,0)"
            } else {
              const d = disps[idx]
              el.style.transform = `translate(${d * cosA}px,${d * sinA}px)`
            }
          }
        }
      }

      rafId.current = requestAnimationFrame(animate)
    }

    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [
    cellCount,
    rowCount,
    colCount,
    colWidth,
    clampedBlockSize,
    scope,
    effect,
    angle,
    influenceRadius,
    intensity,
    trailDuration,
    smoothing,
  ])

  const isSvg = mode === "svg"

  // Shared image style for SVG mode
  const imgStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    userSelect: "none",
    WebkitUserSelect: "none",
    pointerEvents: "none",
  }

  // Mask-based recolor style: SVG becomes a mask, backgroundColor fills it
  const maskStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    backgroundColor: svgColor,
    WebkitMaskImage: svgImage ? `url(${svgImage})` : undefined,
    maskImage: svgImage ? `url(${svgImage})` : undefined,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    pointerEvents: "none",
  }

  // Spread the native font props, then layer on our overrides
  const textStyle: CSSProperties = {
    ...(font as CSSProperties),
    textTransform,
    color,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
    padding: 0,
    userSelect: "none",
    WebkitUserSelect: "none",
  }

  // Content rendered inside each cell
  const cellContent = isSvg
    ? svgImage
      ? recolorSvg
        ? <div style={maskStyle} />
        : <img src={svgImage} style={imgStyle} draggable={false} />
      : null
    : <div style={textStyle}>{text}</div>

  const cells: React.ReactNode[] = []
  cellEls.current = []

  for (let r = 0; r < rowCount; r++) {
    const top = r * clampedBlockSize
    const bottom = Math.max(0, containerHeight - top - clampedBlockSize)

    for (let c = 0; c < colCount; c++) {
      const idx = r * colCount + c
      const left = c * colWidth
      const right = Math.max(0, containerWidth - left - colWidth)

      cells.push(
        <div
          key={idx}
          ref={(el) => {
            if (el) cellEls.current[idx] = el
          }}
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)`,
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          {cellContent}
        </div>
      )
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        position: "relative",
        overflow: clipOverflow ? "hidden" : "visible",
        cursor: "default",
        width: width ?? "100%",
        height: height ?? "auto",
        ...style,
      }}
    >
      {/* Hidden sizing element */}
      {isSvg ? (
        svgImage ? (
          recolorSvg ? (
            <div style={{ ...maskStyle, visibility: "hidden" }} aria-hidden="true" />
          ) : (
            <img
              src={svgImage}
              style={{ ...imgStyle, visibility: "hidden" }}
              aria-hidden="true"
              draggable={false}
            />
          )
        ) : (
          <div style={{ width: "100%", height: "100%", visibility: "hidden" }} />
        )
      ) : (
        <div
          style={{ ...textStyle, visibility: "hidden", pointerEvents: "none" }}
          aria-hidden="true"
        >
          {text}
        </div>
      )}

      {containerHeight > 0 && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {cells}
        </div>
      )}
    </div>
  )
}

// ── Framer Property Controls ─────────────────────────────────────────────────

addPropertyControls(TextGlitch, {
  mode: {
    type: ControlType.Enum,
    title: "Mode",
    defaultValue: "text",
    options: ["text", "svg"],
    optionTitles: ["Text", "SVG"],
    displaySegmentedControl: true,
  },
  text: {
    type: ControlType.String,
    title: "Text",
    defaultValue: "SLOWLY\nMALFUNCTIONING",
    displayTextArea: true,
    hidden: (props: any) => props.mode === "svg",
  },
  font: {
    // @ts-ignore — undocumented Framer native font picker
    type: ControlType.Font,
    controls: "extended",
    displayFontSize: true,
    displayTextAlignment: true,
    defaultValue: {
      fontFamily: "Inter",
      fontWeight: 900,
      fontSize: 120,
      lineHeight: "0.95em",
      letterSpacing: "-0.02em",
      textAlign: "center",
    },
    hidden: (props: any) => props.mode === "svg",
  },
  textTransform: {
    type: ControlType.Enum,
    title: "Transform",
    defaultValue: "uppercase",
    options: ["none", "uppercase", "lowercase", "capitalize"],
    optionTitles: ["None", "Uppercase", "Lowercase", "Capitalize"],
    hidden: (props: any) => props.mode === "svg",
  },
  color: {
    type: ControlType.Color,
    title: "Color",
    defaultValue: "#FFFFFF",
    hidden: (props: any) => props.mode === "svg",
  },
  svgImage: {
    type: ControlType.Image,
    title: "SVG File",
    hidden: (props: any) => props.mode !== "svg",
  },
  recolorSvg: {
    type: ControlType.Boolean,
    title: "Recolor",
    defaultValue: false,
    hidden: (props: any) => props.mode !== "svg",
  },
  svgColor: {
    type: ControlType.Color,
    title: "SVG Color",
    defaultValue: "#FFFFFF",
    hidden: (props: any) => props.mode !== "svg" || !props.recolorSvg,
  },
  effect: {
    type: ControlType.Enum,
    title: "Effect",
    defaultValue: "random",
    options: ["random", "directional"],
    optionTitles: ["Random", "Directional"],
  },
  scope: {
    type: ControlType.Enum,
    title: "Scope",
    defaultValue: "line",
    options: ["line", "word", "character"],
    optionTitles: ["Line", "Word", "Character"],
  },
  angle: {
    type: ControlType.Number,
    title: "Angle",
    defaultValue: 0,
    min: 0,
    max: 180,
    step: 1,
    unit: "°",
  },
  clipOverflow: {
    type: ControlType.Boolean,
    title: "Clip Overflow",
    defaultValue: true,
  },
  blockSize: {
    type: ControlType.Number,
    title: "Block Size",
    defaultValue: 8,
    min: 2,
    max: 40,
    step: 1,
    unit: "px",
  },
  influenceRadius: {
    type: ControlType.Number,
    title: "Influence Radius",
    defaultValue: 140,
    min: 20,
    max: 400,
    step: 5,
    unit: "px",
  },
  intensity: {
    type: ControlType.Number,
    title: "Intensity",
    defaultValue: 60,
    min: 0,
    max: 200,
    step: 1,
    unit: "px",
  },
  trailDuration: {
    type: ControlType.Number,
    title: "Trail Duration",
    defaultValue: 300,
    min: 0,
    max: 800,
    step: 10,
    unit: "ms",
  },
  smoothing: {
    type: ControlType.Number,
    title: "Smoothing",
    defaultValue: 0.12,
    min: 0.02,
    max: 0.5,
    step: 0.01,
  },
})

export default TextGlitch
