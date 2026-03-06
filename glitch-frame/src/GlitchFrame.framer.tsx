/**
 * GlitchFrame — Framer Code Component
 *
 * Copy this entire file into Framer's Code Editor (Assets → Code → New File).
 * The component will appear in your Insert menu as "Glitch Frame".
 *
 * Drop any content (text, images, stacks, video) INSIDE this component
 * on the canvas, and the glitch effect applies to whatever is nested.
 *
 * On mobile, the effect responds to phone tilting via the DeviceOrientation API.
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

interface TrailPoint {
  x: number
  y: number
  time: number
  vx: number
  vy: number
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  children?: React.ReactNode
  blockSize?: number
  scope?: "line" | "word" | "character"
  effect?: "random" | "directional"
  angle?: number
  clipOverflow?: boolean
  influenceRadius?: number
  intensity?: number
  trailDuration?: number
  smoothing?: number
  interaction?: "pointer" | "tilt" | "auto"
  tiltSensitivity?: number
  width?: number | string
  height?: number | string
  style?: CSSProperties
}

function GlitchFrame({
  children,
  blockSize = 8,
  scope = "line",
  effect = "random",
  angle = 0,
  clipOverflow = true,
  influenceRadius = 140,
  intensity = 60,
  trailDuration = 300,
  smoothing = 0.12,
  interaction = "auto",
  tiltSensitivity = 1.0,
  width,
  height,
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const tiltActive = useRef(false)
  const cellDisplacements = useRef<Float64Array>(new Float64Array(0))
  const cellTargets = useRef<Float64Array>(new Float64Array(0))
  const cellEls = useRef<HTMLDivElement[]>([])
  const rafId = useRef(0)

  const smoothVx = useRef(0)
  const smoothVy = useRef(0)

  // Previous tilt values for velocity estimation
  const prevBeta = useRef<number | null>(null)
  const prevGamma = useRef<number | null>(null)
  const prevTiltTime = useRef(0)

  const clampedBlockSize = Math.max(2, blockSize)
  const { w: containerWidth, h: containerHeight } = containerSize

  // sinA blends between horizontal (0) and vertical (1) cell layouts
  const sinA = Math.abs(Math.sin((angle * Math.PI) / 180))

  // Fixed pixel heuristics for word/character scope (no fontSize available)
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

  // ── ResizeObserver ────────────────────────────────────────────────────────

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

  // ── Allocate displacement arrays ──────────────────────────────────────────

  useEffect(() => {
    if (cellCount > 0) {
      cellDisplacements.current = new Float64Array(cellCount)
      cellTargets.current = new Float64Array(cellCount)
    }
  }, [cellCount])

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const shouldUsePointer = interaction === "pointer" || interaction === "auto"

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (interaction === "tilt") return
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
      while (trail.length > 0 && trail[0].time < cutoff) {
        trail.shift()
      }
    },
    [trailDuration, interaction]
  )

  const handlePointerLeave = useCallback(() => {
    if (interaction === "tilt") return
    mouseActive.current = false
  }, [interaction])

  // ── DeviceOrientation (tilt) handler ──────────────────────────────────────

  useEffect(() => {
    if (interaction === "pointer") return

    const isMobile =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0

    // In "auto" mode, only use tilt on mobile devices
    if (interaction === "auto" && !isMobile) return

    let orientationSupported = false
    let permissionGranted = false
    let cleanedUp = false

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (cleanedUp) return
      if (e.beta === null || e.gamma === null) return

      orientationSupported = true
      tiltActive.current = true

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const now = performance.now()
      const cw = rect.width
      const ch = rect.height

      // Map gamma (-90..90) to X. ±45° = full range
      const normalizedGamma = clamp(e.gamma / 45, -1, 1)
      // Map beta. 45° = neutral hold angle. ±45° from there = full range
      const normalizedBeta = clamp((e.beta - 45) / 45, -1, 1)

      const virtualX = ((normalizedGamma + 1) / 2) * cw * tiltSensitivity
      const virtualY = ((normalizedBeta + 1) / 2) * ch * tiltSensitivity

      // Estimate velocity from orientation change rate
      let vx = 0
      let vy = 0
      if (prevBeta.current !== null && prevGamma.current !== null) {
        const dt = now - prevTiltTime.current
        if (dt > 0 && dt < 200) {
          // Scale angular velocity to pixel velocity
          const gammaRate = (e.gamma - prevGamma.current) / dt
          const betaRate = (e.beta - prevBeta.current) / dt
          vx = gammaRate * cw * 0.02 * tiltSensitivity
          vy = betaRate * ch * 0.02 * tiltSensitivity
        }
      }
      prevBeta.current = e.beta
      prevGamma.current = e.gamma
      prevTiltTime.current = now

      smoothVx.current += (vx - smoothVx.current) * 0.3
      smoothVy.current += (vy - smoothVy.current) * 0.3

      const trail = mouseTrail.current
      trail.push({
        x: clamp(virtualX, 0, cw),
        y: clamp(virtualY, 0, ch),
        time: now,
        vx: smoothVx.current,
        vy: smoothVy.current,
      })

      const cutoff = now - trailDuration
      while (trail.length > 0 && trail[0].time < cutoff) {
        trail.shift()
      }
    }

    const startListening = () => {
      if (cleanedUp || permissionGranted) return
      permissionGranted = true
      window.addEventListener("deviceorientation", handleOrientation)
    }

    // iOS 13+ requires permission via user gesture
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === "function") {
      const requestOnTouch = () => {
        DOE.requestPermission()
          .then((state: string) => {
            if (state === "granted") {
              startListening()
            }
          })
          .catch(() => {
            // Permission denied — fall back to touch/pointer
          })
        // Only request once
        window.removeEventListener("touchstart", requestOnTouch)
      }
      window.addEventListener("touchstart", requestOnTouch, { once: true })

      return () => {
        cleanedUp = true
        window.removeEventListener("touchstart", requestOnTouch)
        window.removeEventListener("deviceorientation", handleOrientation)
        tiltActive.current = false
      }
    } else {
      // Android / desktop — try directly
      startListening()

      // Fallback: if no orientation events fire after 1s, mark as unsupported
      const fallbackTimer = setTimeout(() => {
        if (!orientationSupported) {
          tiltActive.current = false
        }
      }, 1000)

      return () => {
        cleanedUp = true
        clearTimeout(fallbackTimer)
        window.removeEventListener("deviceorientation", handleOrientation)
        tiltActive.current = false
      }
    }
  }, [interaction, trailDuration, tiltSensitivity])

  // ── Animation loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (cellCount === 0) return

    const isLine = scope === "line"
    const isDirectional = effect === "directional"
    const angleRad = (angle * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinADisp = Math.sin(angleRad)
    const sinABlend = Math.abs(sinADisp)
    const velocitySensitivity = 12

    const animate = () => {
      const disps = cellDisplacements.current
      const targets = cellTargets.current
      const els = cellEls.current
      const trail = mouseTrail.current
      const now = performance.now()
      // Active when pointer is hovering OR tilt is providing data
      const active = mouseActive.current || tiltActive.current

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
  }, [
    cellCount,
    rowCount,
    colCount,
    colWidth,
    rowHeight,
    scope,
    effect,
    angle,
    influenceRadius,
    intensity,
    trailDuration,
    smoothing,
  ])

  // ── Build cell grid ───────────────────────────────────────────────────────

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
          {children}
        </div>
      )
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={shouldUsePointer ? handlePointerMove : undefined}
      onPointerLeave={shouldUsePointer ? handlePointerLeave : undefined}
      style={{
        position: "relative",
        overflow: clipOverflow ? "hidden" : "visible",
        cursor: "default",
        width: width ?? "100%",
        height: height ?? "100%",
        ...style,
      }}
    >
      {/* Children define the size — render them visually hidden for layout */}
      <div style={{ visibility: "hidden", pointerEvents: "none" }}>
        {children}
      </div>

      {/* Glitch cell overlay */}
      {containerHeight > 0 && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {cells}
        </div>
      )}
    </div>
  )
}

// ── Framer Property Controls ─────────────────────────────────────────────────

addPropertyControls(GlitchFrame, {
  effect: {
    type: ControlType.Enum,
    title: "Effect",
    defaultValue: "random",
    options: ["random", "directional"],
    optionTitles: ["Random", "Directional"],
  },
  scope: {
    type: ControlType.Enum,
    title: "Target",
    defaultValue: "line",
    options: ["line", "word", "character"],
    optionTitles: ["Line", "Segment", "Block"],
  },
  angle: {
    type: ControlType.Number,
    title: "Direction",
    defaultValue: 0,
    min: 0,
    max: 180,
    step: 1,
    unit: "°",
  },
  interaction: {
    type: ControlType.Enum,
    title: "Interaction",
    defaultValue: "auto",
    options: ["pointer", "tilt", "auto"],
    optionTitles: ["Pointer", "Tilt", "Auto"],
  },
  tiltSensitivity: {
    type: ControlType.Number,
    title: "Tilt Sensitivity",
    defaultValue: 1.0,
    min: 0.5,
    max: 3.0,
    step: 0.1,
    hidden: (props: any) => props.interaction === "pointer",
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
    title: "Spread",
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
    title: "Trail",
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

// Default canvas size when the component is first placed in Framer
// @ts-ignore — Framer reads these to set the initial frame dimensions
GlitchFrame.defaultProps = {
  ...GlitchFrame.defaultProps,
  width: 400,
  height: 400,
}

export default GlitchFrame
