/**
 * GlitchFrame — Standalone React Component
 *
 * Wraps arbitrary children and applies an interactive glitch effect.
 * On desktop: responds to pointer hover.
 * On mobile: responds to touch press and drag.
 */

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react"

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

// ── Types ────────────────────────────────────────────────────────────────────

export type GlitchScope = "line" | "word" | "character"
export type GlitchEffect = "random" | "directional" | "parallax"
export type GlitchDirectionMode = "cursor" | "manual"
interface TrailPoint {
  x: number
  y: number
  time: number
  vx: number
  vy: number
}

export interface GlitchFrameProps {
  children?: ReactNode
  blockSize?: number
  scope?: GlitchScope
  effect?: GlitchEffect
  directionMode?: GlitchDirectionMode
  angle?: number
  clipOverflow?: boolean
  influenceRadius?: number
  intensity?: number
  trailDuration?: number
  smoothing?: number
  style?: CSSProperties
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GlitchFrame({
  children,
  blockSize = 8,
  scope = "line",
  effect = "random",
  directionMode = "cursor",
  angle = 0,
  clipOverflow = true,
  influenceRadius = 140,
  intensity = 60,
  trailDuration = 300,
  smoothing = 0.12,
  style,
}: GlitchFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const cellDisplacements = useRef<Float64Array>(new Float64Array(0))
  const cellTargets = useRef<Float64Array>(new Float64Array(0))
  const cellDispsX = useRef<Float64Array>(new Float64Array(0))
  const cellDispsY = useRef<Float64Array>(new Float64Array(0))
  const cellMagsRef = useRef<Float64Array>(new Float64Array(0))
  const cellDirsRef = useRef<Float64Array>(new Float64Array(0))
  const cellEls = useRef<HTMLDivElement[]>([])
  const rafId = useRef(0)
  const trailFadesBuf = useRef<Float64Array>(new Float64Array(64))

  const smoothVx = useRef(0)
  const smoothVy = useRef(0)

  const clampedBlockSize = Math.max(2, blockSize)
  const { w: containerWidth, h: containerHeight } = containerSize

  const sinA = Math.abs(Math.sin((angle * Math.PI) / 180))

  const WORD_PX = 80
  const CHAR_PX = 20

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
    const rowH = clampedBlockSize + sinA * (containerHeight - clampedBlockSize)
    rowCount = Math.max(1, Math.ceil(containerHeight / rowH))
    rowHeight = containerHeight / rowCount

    const colW = containerWidth - sinA * (containerWidth - clampedBlockSize)
    colCount = Math.max(1, Math.ceil(containerWidth / colW))
    colWidth = containerWidth / colCount
  } else {
    const baseColW =
      scope === "word"
        ? Math.max(clampedBlockSize * 4, WORD_PX)
        : Math.max(clampedBlockSize * 2, CHAR_PX)

    const rowH = clampedBlockSize + sinA * (baseColW - clampedBlockSize)
    rowCount = Math.max(1, Math.ceil(containerHeight / rowH))
    rowHeight = containerHeight / rowCount

    const colW = baseColW - sinA * (baseColW - clampedBlockSize)
    colCount = Math.max(1, Math.ceil(containerWidth / colW))
    colWidth = containerWidth / colCount
  }

  const cellCount = rowCount * colCount

  // ── ResizeObserver ──────────────────────────────────────────────────────

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
      cellDispsX.current = new Float64Array(cellCount)
      cellDispsY.current = new Float64Array(cellCount)
      const mags = new Float64Array(cellCount)
      const dirs = new Float64Array(cellCount)
      for (let i = 0; i < cellCount; i++) {
        mags[i] = cellMagnitude(i)
        dirs[i] = cellDirection(i)
      }
      cellMagsRef.current = mags
      cellDirsRef.current = dirs
    }
  }, [cellCount])

  // ── Pointer handlers (works for mouse + touch) ──────────────────────────

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
      let vy = 0
      if (trail.length > 0) {
        const prev = trail[trail.length - 1]
        const dt = now - prev.time
        if (dt > 0 && dt < 100) {
          vx = (localX - prev.x) / dt
          vy = (localY - prev.y) / dt
        }
      }
      smoothVx.current += (vx - smoothVx.current) * 0.4
      smoothVy.current += (vy - smoothVy.current) * 0.4

      trail.push({ x: localX, y: localY, time: now, vx: smoothVx.current, vy: smoothVy.current })

      const cutoff = now - trailDuration
      let trimIdx = 0
      while (trimIdx < trail.length && trail[trimIdx].time < cutoff) trimIdx++
      if (trimIdx > 0) trail.splice(0, trimIdx)
      if (trail.length > 50) trail.splice(0, trail.length - 50)
    },
    [trailDuration]
  )

  const handlePointerDown = useCallback(
    (_e: React.PointerEvent) => {
      mouseActive.current = true
    },
    []
  )

  const deactivatePointer = useCallback(() => {
    mouseActive.current = false
  }, [])

  // ── Animation loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (cellCount === 0) return

    const isLine = scope === "line"
    const isDirectional = effect === "directional"
    const isCursorDir = directionMode === "cursor"
    const angleRad = (angle * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinADisp = Math.sin(angleRad)
    const sinABlend = Math.abs(sinADisp)
    const velocitySensitivity = 12
    const sigma = influenceRadius / 2.5
    const invTwoSigmaSq = sigma > 0 ? 1 / (2 * sigma * sigma) : 0
    const oneMinusSinA = 1 - sinABlend

    const animate = () => {
      const disps = cellDisplacements.current
      const targets = cellTargets.current
      const pdx = cellDispsX.current
      const pdy = cellDispsY.current
      const els = cellEls.current
      const trail = mouseTrail.current
      const now = performance.now()
      const active = mouseActive.current
      const cellMags = cellMagsRef.current
      const cellDirs = cellDirsRef.current

      if (active) {
        const cutoff = now - trailDuration
        let trimIdx = 0
        while (trimIdx < trail.length && trail[trimIdx].time < cutoff) trimIdx++
        if (trimIdx > 0) trail.splice(0, trimIdx)
      }

      // Precompute trail fades once per frame (reuse buffer to avoid allocation)
      const trailLen = trail.length
      let trailFades = trailFadesBuf.current
      if (trailFades.length < trailLen) {
        trailFades = new Float64Array(Math.max(trailLen, 64))
        trailFadesBuf.current = trailFades
      }
      for (let p = 0; p < trailLen; p++) {
        trailFades[p] = Math.max(0, 1 - (now - trail[p].time) / trailDuration)
      }

      for (let r = 0; r < rowCount; r++) {
        const cellCenterY = r * rowHeight + rowHeight / 2

        for (let c = 0; c < colCount; c++) {
          const idx = r * colCount + c
          const cellCenterX = c * colWidth + colWidth / 2

          if (isCursorDir) {
            // ── Cursor-driven direction: 2D velocity-based ──
            if (active && trailLen > 0) {
              let peakInfluence = 0, peakVx = 0, peakVy = 0
              for (let p = 0; p < trailLen; p++) {
                const fade = trailFades[p]
                if (fade <= 0) continue
                const pt = trail[p]
                let spatial: number
                if (isLine) {
                  const ld = Math.abs(pt.y - cellCenterY) * oneMinusSinA + Math.abs(pt.x - cellCenterX) * sinABlend
                  const ex = ld * ld * invTwoSigmaSq
                  if (ex > 18) continue
                  spatial = Math.exp(-ex)
                } else {
                  const dx2 = pt.x - cellCenterX, dy2 = pt.y - cellCenterY
                  const ex = (dx2 * dx2 + dy2 * dy2) * invTwoSigmaSq
                  if (ex > 18) continue
                  spatial = Math.exp(-ex)
                }
                const combined = spatial * fade
                if (combined > peakInfluence) {
                  peakInfluence = combined
                  peakVx = pt.vx; peakVy = pt.vy
                }
              }
              const mag = isDirectional ? 1 : cellMags[idx]
              const targetX = peakVx * velocitySensitivity * intensity * peakInfluence * mag
              const targetY = peakVy * velocitySensitivity * intensity * peakInfluence * mag
              pdx[idx] += (targetX - pdx[idx]) * smoothing
              pdy[idx] += (targetY - pdy[idx]) * smoothing
            } else {
              pdx[idx] += (0 - pdx[idx]) * smoothing
              pdy[idx] += (0 - pdy[idx]) * smoothing
              if (Math.abs(pdx[idx]) < 0.01) pdx[idx] = 0
              if (Math.abs(pdy[idx]) < 0.01) pdy[idx] = 0
            }
            const el = els[idx]
            if (el) {
              const absPX = Math.abs(pdx[idx]) + Math.abs(pdy[idx])
              el.style.transform = absPX < 0.05
                ? "translate(0,0)"
                : `translate(${pdx[idx]}px,${pdy[idx]}px)`
            }
          } else {
            // ── Manual direction: 1D projection ──
            if (active && trailLen > 0) {
              if (isDirectional) {
                let peakInfluence = 0, peakV = 0
                for (let p = 0; p < trailLen; p++) {
                  const fade = trailFades[p]
                  if (fade <= 0) continue
                  const pt = trail[p]
                  let spatial: number
                  if (isLine) {
                    const ld = Math.abs(pt.y - cellCenterY) * oneMinusSinA + Math.abs(pt.x - cellCenterX) * sinABlend
                    const ex = ld * ld * invTwoSigmaSq
                    if (ex > 18) continue
                    spatial = Math.exp(-ex)
                  } else {
                    const dx2 = pt.x - cellCenterX, dy2 = pt.y - cellCenterY
                    const ex = (dx2 * dx2 + dy2 * dy2) * invTwoSigmaSq
                    if (ex > 18) continue
                    spatial = Math.exp(-ex)
                  }
                  const combined = spatial * fade
                  if (combined > peakInfluence) {
                    peakInfluence = combined
                    peakV = pt.vx * cosA + pt.vy * sinADisp
                  }
                }
                targets[idx] = peakV * velocitySensitivity * intensity * peakInfluence
              } else {
                let peakInfluence = 0
                for (let p = 0; p < trailLen; p++) {
                  const fade = trailFades[p]
                  if (fade <= 0) continue
                  const pt = trail[p]
                  let spatial: number
                  if (isLine) {
                    const ld = Math.abs(pt.y - cellCenterY) * oneMinusSinA + Math.abs(pt.x - cellCenterX) * sinABlend
                    const ex = ld * ld * invTwoSigmaSq
                    if (ex > 18) continue
                    spatial = Math.exp(-ex)
                  } else {
                    const dx2 = pt.x - cellCenterX, dy2 = pt.y - cellCenterY
                    const ex = (dx2 * dx2 + dy2 * dy2) * invTwoSigmaSq
                    if (ex > 18) continue
                    spatial = Math.exp(-ex)
                  }
                  const combined = spatial * fade
                  if (combined > peakInfluence) peakInfluence = combined
                }
                targets[idx] = cellDirs[idx] * cellMags[idx] * intensity * peakInfluence
              }
            } else {
              targets[idx] = 0
            }

            const diff = targets[idx] - disps[idx]
            disps[idx] += Math.abs(diff) > 0.05 ? diff * smoothing : diff

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
    rowHeight,
    scope,
    effect,
    directionMode,
    angle,
    influenceRadius,
    intensity,
    trailDuration,
    smoothing,
  ])

  // ── Build cell grid ───────────────────────────────────────────────────────

  const cells: ReactNode[] = []
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
          {children}
        </div>
      )
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={deactivatePointer}
      onPointerUp={deactivatePointer}
      onPointerCancel={deactivatePointer}
      style={{
        position: "relative",
        overflow: clipOverflow ? "hidden" : "visible",
        cursor: "default",
        ...style,
      }}
    >
      <div style={{ visibility: "hidden", pointerEvents: "none" }}>
        {children}
      </div>

      {containerHeight > 0 && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {cells}
        </div>
      )}
    </div>
  )
}
