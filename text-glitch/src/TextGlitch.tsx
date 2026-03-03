import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react"

// ── Types ────────────────────────────────────────────────────────────────────

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
  textAlign?: CSSProperties["textAlign"]
  /** Height of each glitch slice in px. Smaller = finer grain. */
  blockSize?: number
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
 * Per-slice displacement profile.
 * Groups of ~2-4 adjacent slices share direction (simulating "block" glitch),
 * with per-slice magnitude variation including "spikes" and "dead" zones.
 */
function sliceDirection(i: number): number {
  // Group slices into bands of 2-4 that share a base direction
  const groupSize = 2 + Math.floor(hash01(Math.floor(i / 3), 77.7) * 3) // 2–4
  const groupId = Math.floor(i / groupSize)
  const base = hash01(groupId, 311.7) * 2 - 1 // -1..1
  // Add per-slice jitter so they're not perfectly aligned
  const jitter = (hash01(i, 529.3) - 0.5) * 0.3
  const v = base + jitter
  // Sharpen toward -1 or 1
  return Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 0.6)
}

/**
 * Per-slice magnitude: bimodal distribution.
 * ~25% of slices barely move (gaps), ~15% spike dramatically, rest moderate.
 */
function sliceMagnitude(i: number): number {
  const v = hash01(i, 183.3)
  if (v < 0.25) return v * 0.15 // near-zero: creates "intact" text bands
  if (v > 0.85) return 1.2 + (v - 0.85) * 4 // spike: dramatic shift (1.2–1.8x)
  // moderate range, with slight bias toward higher values
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
  influenceRadius = 140,
  intensity = 60,
  trailDuration = 300,
  smoothing = 0.12,
  width,
  height,
  style,
}: TextGlitchProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sliceContainerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(0)

  // Mutable refs for the animation loop (no re-renders)
  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const sliceDisplacements = useRef<Float64Array>(new Float64Array(0))
  const sliceTargets = useRef<Float64Array>(new Float64Array(0))
  const sliceEls = useRef<HTMLDivElement[]>([])
  const rafId = useRef(0)

  const clampedBlockSize = Math.max(2, blockSize)
  const sliceCount = containerHeight > 0 ? Math.ceil(containerHeight / clampedBlockSize) : 0

  // ── Measure container height ───────────────────────────────────────────
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

  // ── Resize displacement arrays when slice count changes ────────────────
  useEffect(() => {
    if (sliceCount > 0) {
      sliceDisplacements.current = new Float64Array(sliceCount)
      sliceTargets.current = new Float64Array(sliceCount)
    }
  }, [sliceCount])

  // ── Mouse handlers (no state, just refs) ───────────────────────────────
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
      // Prune old points
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

  // ── Animation loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (sliceCount === 0) return

    const animate = () => {
      const disps = sliceDisplacements.current
      const targets = sliceTargets.current
      const els = sliceEls.current
      const trail = mouseTrail.current
      const now = performance.now()
      const active = mouseActive.current

      // Prune old trail points
      if (active) {
        const cutoff = now - trailDuration
        while (trail.length > 0 && trail[0].time < cutoff) {
          trail.shift()
        }
      }

      // Calculate targets for each slice
      for (let i = 0; i < sliceCount; i++) {
        const sliceCenterY = i * clampedBlockSize + clampedBlockSize / 2

        if (active && trail.length > 0) {
          // Find the maximum influence from any single trail point (no accumulation)
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

        // Lerp current toward target
        const diff = targets[i] - disps[i]
        if (Math.abs(diff) > 0.05) {
          disps[i] += diff * smoothing
        } else {
          disps[i] = targets[i]
        }

        // Apply to DOM (direct manipulation, bypassing React)
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
  }, [sliceCount, clampedBlockSize, influenceRadius, intensity, trailDuration, smoothing])

  // ── Shared text styles ─────────────────────────────────────────────────
  const textStyle: CSSProperties = {
    fontSize,
    fontFamily,
    fontWeight,
    textTransform,
    letterSpacing: `${letterSpacing}em`,
    lineHeight,
    color,
    textAlign: textAlign as CSSProperties["textAlign"],
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
    padding: 0,
    userSelect: "none",
    WebkitUserSelect: "none",
  }

  // ── Build slice elements ───────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────
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
      {/* Invisible sizing element — determines container height */}
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

      {/* Sliced text overlay */}
      {containerHeight > 0 && (
        <div
          ref={sliceContainerRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          {slices}
        </div>
      )}
    </div>
  )
}
