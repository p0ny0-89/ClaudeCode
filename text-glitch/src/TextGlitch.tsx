import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react"

// ── Types ────────────────────────────────────────────────────────────────────

export type GlitchScope = "line" | "word" | "character"
export type GlitchEffect = "random" | "directional"

export interface TextGlitchProps {
  /** The text to display. Use \n for line breaks. */
  text?: string
  /** Font size in pixels */
  fontSize?: number
  /** CSS font-family */
  fontFamily?: string
  /** Font weight (100–900) */
  fontWeight?: number
  /** CSS text-transform */
  textTransform?: CSSProperties["textTransform"]
  /** Letter spacing in em */
  letterSpacing?: number
  /** Line height multiplier */
  lineHeight?: number
  /** Text color (any CSS color) */
  color?: string
  /** Text alignment */
  textAlign?: "left" | "center" | "right" | "justify"
  /** Height of each glitch slice in px. Smaller = finer grain. */
  blockSize?: number
  /** How the glitch effect is scoped: full line, word region, or character region */
  scope?: GlitchScope
  /** Effect style: "random" = chaotic per-slice hash, "directional" = push/pull following cursor velocity */
  effect?: GlitchEffect
  /** Displacement angle in degrees. 0 = horizontal, 90 = vertical. */
  angle?: number
  /** When true, uses whiteSpace: "pre" to preserve exact spacing (for ASCII art). */
  preserveSpacing?: boolean
  /** Radius (px) of the cursor's influence zone */
  influenceRadius?: number
  /** Maximum horizontal displacement in px */
  intensity?: number
  /** How long the mouse trail persists (ms) */
  trailDuration?: number
  /** Interpolation speed (0–1). Lower = smoother, higher = snappier */
  smoothing?: number
  /** Optional width override */
  width?: number | string
  /** Optional height override */
  height?: number | string
  /** Container style overrides */
  style?: CSSProperties
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic float in [0,1] from an integer seed */
function hash01(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Per-cell displacement direction.
 * Groups of ~2-4 adjacent cells share direction (simulating "block" glitch).
 */
function cellDirection(i: number): number {
  const groupSize = 2 + Math.floor(hash01(Math.floor(i / 3), 77.7) * 3)
  const groupId = Math.floor(i / groupSize)
  const base = hash01(groupId, 311.7) * 2 - 1
  const jitter = (hash01(i, 529.3) - 0.5) * 0.3
  const v = base + jitter
  return Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 0.6)
}

/**
 * Per-cell magnitude: bimodal distribution.
 * ~25% barely move, ~15% spike dramatically, rest moderate.
 */
function cellMagnitude(i: number): number {
  const v = hash01(i, 183.3)
  if (v < 0.25) return v * 0.15
  if (v > 0.85) return 1.2 + (v - 0.85) * 4
  return 0.3 + (v - 0.25) * 1.1
}

/** Gaussian falloff with a sharper knee */
function falloff(dist: number, radius: number): number {
  if (radius <= 0) return 0
  const sigma = radius / 2.5
  return Math.exp(-(dist * dist) / (2 * sigma * sigma))
}

interface TrailPoint {
  x: number
  y: number
  time: number
  /** Horizontal velocity at this point (px/ms). Used by directional mode. */
  vx: number
  /** Vertical velocity at this point (px/ms). Used by directional mode at non-zero angles. */
  vy: number
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TextGlitch({
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
  scope = "line",
  effect = "random",
  angle = 0,
  preserveSpacing = false,
  influenceRadius = 140,
  intensity = 60,
  trailDuration = 300,
  smoothing = 0.12,
  width,
  height,
  style,
}: TextGlitchProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  // Mutable refs for the animation loop (no re-renders)
  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const cellDisplacements = useRef<Float64Array>(new Float64Array(0))
  const cellTargets = useRef<Float64Array>(new Float64Array(0))
  const cellEls = useRef<HTMLDivElement[]>([])
  const rafId = useRef(0)

  const clampedBlockSize = Math.max(2, blockSize)
  const { w: containerWidth, h: containerHeight } = containerSize

  // ── Grid dimensions ────────────────────────────────────────────────────
  // sinA blends between horizontal (0) and vertical (1) cell layouts
  const sinA = Math.abs(Math.sin((angle * Math.PI) / 180))

  let rowCount: number
  let rowHeight: number
  let colCount: number
  let colWidth: number

  if (containerWidth <= 0 || containerHeight <= 0) {
    rowCount = 0
    rowHeight = clampedBlockSize
    colCount = 1
    colWidth = containerWidth
  } else if (scope === "line") {
    // Line scope: at 0° many rows + 1 col, at 90° 1 row + many cols
    const rowH = clampedBlockSize + sinA * (containerHeight - clampedBlockSize)
    rowCount = Math.max(1, Math.ceil(containerHeight / rowH))
    rowHeight = containerHeight / rowCount

    const colW = containerWidth - sinA * (containerWidth - clampedBlockSize)
    colCount = Math.max(1, Math.ceil(containerWidth / colW))
    colWidth = containerWidth / colCount
  } else {
    // Word/character scope: blend scope-based width with angle
    const baseColW =
      scope === "word"
        ? Math.max(clampedBlockSize * 4, fontSize * 2.5)
        : Math.max(clampedBlockSize * 2, fontSize * 0.3)

    // Row height: blockSize at 0°, blend toward baseColW at 90°
    const rowH = clampedBlockSize + sinA * (baseColW - clampedBlockSize)
    rowCount = Math.max(1, Math.ceil(containerHeight / rowH))
    rowHeight = containerHeight / rowCount

    // Col width: baseColW at 0°, blend toward blockSize at 90°
    const colW = baseColW - sinA * (baseColW - clampedBlockSize)
    colCount = Math.max(1, Math.ceil(containerWidth / colW))
    colWidth = containerWidth / colCount
  }

  const cellCount = rowCount * colCount

  // ── Measure container ──────────────────────────────────────────────────
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

  // ── Resize displacement arrays ─────────────────────────────────────────
  useEffect(() => {
    if (cellCount > 0) {
      cellDisplacements.current = new Float64Array(cellCount)
      cellTargets.current = new Float64Array(cellCount)
    }
  }, [cellCount])

  // Smoothed velocity for directional mode
  const smoothVx = useRef(0)
  const smoothVy = useRef(0)

  // ── Mouse handlers ─────────────────────────────────────────────────────
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      mouseActive.current = true
      const now = performance.now()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top

      // Compute instantaneous velocity from previous trail point
      const trail = mouseTrail.current
      let vx = 0
      let vy = 0
      if (trail.length > 0) {
        const prev = trail[trail.length - 1]
        const dt = now - prev.time
        if (dt > 0 && dt < 100) {
          vx = (localX - prev.x) / dt
          vy = (localY - prev.y) / dt
        }
      }
      // Smooth the velocity
      smoothVx.current += (vx - smoothVx.current) * 0.4
      smoothVy.current += (vy - smoothVy.current) * 0.4

      trail.push({ x: localX, y: localY, time: now, vx: smoothVx.current, vy: smoothVy.current })

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

  // ── Animation loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (cellCount === 0) return

    const isLine = scope === "line"
    const isDirectional = effect === "directional"
    const angleRad = (angle * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinADisp = Math.sin(angleRad)
    const sinABlend = Math.abs(sinADisp) // 0 at 0°, 1 at 90°, 0 at 180°
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
        const cellCenterY = r * rowHeight + rowHeight / 2

        for (let c = 0; c < colCount; c++) {
          const idx = r * colCount + c
          const cellCenterX = c * colWidth + colWidth / 2

          if (active && trail.length > 0) {
            if (isDirectional) {
              let peakInfluence = 0
              let peakV = 0
              for (let p = 0; p < trail.length; p++) {
                const pt = trail[p]
                const age = (now - pt.time) / trailDuration
                const timeFade = Math.max(0, 1 - age)

                let dist: number
                if (isLine) {
                  const dy = Math.abs(pt.y - cellCenterY)
                  const dx = Math.abs(pt.x - cellCenterX)
                  dist = dy * (1 - sinABlend) + dx * sinABlend
                } else {
                  const dx = pt.x - cellCenterX
                  const dy = pt.y - cellCenterY
                  dist = Math.sqrt(dx * dx + dy * dy)
                }

                const spatial = falloff(dist, influenceRadius)
                const combined = spatial * timeFade
                if (combined > peakInfluence) {
                  peakInfluence = combined
                  peakV = pt.vx * cosA + pt.vy * sinADisp
                }
              }

              targets[idx] =
                peakV * velocitySensitivity * intensity * peakInfluence
            } else {
              let peakInfluence = 0
              for (let p = 0; p < trail.length; p++) {
                const pt = trail[p]
                const age = (now - pt.time) / trailDuration
                const timeFade = Math.max(0, 1 - age)

                let dist: number
                if (isLine) {
                  const dy = Math.abs(pt.y - cellCenterY)
                  const dx = Math.abs(pt.x - cellCenterX)
                  dist = dy * (1 - sinABlend) + dx * sinABlend
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
              el.style.transform = `translate(${d * cosA}px,${d * sinADisp}px)`
            }
          }
        }
      }

      rafId.current = requestAnimationFrame(animate)
    }

    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [cellCount, rowCount, colCount, colWidth, rowHeight, scope, effect, angle, influenceRadius, intensity, trailDuration, smoothing])

  // ── Shared text styles ─────────────────────────────────────────────────
  const textStyle: CSSProperties = {
    fontSize,
    fontFamily,
    fontWeight,
    textTransform,
    letterSpacing: `${letterSpacing}em`,
    lineHeight,
    color,
    textAlign,
    whiteSpace: preserveSpacing ? "pre" : "pre-wrap",
    ...(preserveSpacing ? {} : { wordBreak: "break-word" as const }),
    margin: 0,
    padding: 0,
    userSelect: "none",
    WebkitUserSelect: "none",
  }

  // ── Build cell elements ────────────────────────────────────────────────
  const cells: React.ReactNode[] = []
  cellEls.current = []

  for (let r = 0; r < rowCount; r++) {
    const top = r * rowHeight
    const bottom = Math.max(0, containerHeight - top - rowHeight)

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
          <div style={textStyle}>{text}</div>
        </div>
      )
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        position: "relative",
        overflow: "hidden",
        cursor: "default",
        width: width ?? "100%",
        height: height ?? "auto",
        ...style,
      }}
    >
      {/* Invisible sizing element */}
      <div
        style={{
          ...textStyle,
          visibility: "hidden",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        {text}
      </div>

      {/* Cell grid overlay */}
      {containerHeight > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          {cells}
        </div>
      )}
    </div>
  )
}
