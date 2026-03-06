/**
 * GlitchFrame — Framer Code Component (Effect Applicator)
 *
 * Copy this entire file into Framer's Code Editor (Assets → Code → New File).
 * The component will appear in your Insert menu as "Glitch Frame".
 *
 * USAGE: Drop this component inside any frame or stack.
 * It will apply the glitch effect to all sibling content in the parent frame.
 * Click the component in the layers panel to access the effect settings.
 *
 * On mobile, the effect responds to phone tilting via the DeviceOrientation API.
 */

import { useRef, useState, useEffect } from "react"
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

const GLITCH_ATTR = "data-glitch-overlay"

/**
 * Walk up from self until we find an ancestor that has other visible children
 * (i.e. the user's frame, not a Framer component wrapper).
 */
function findTargetParent(self: HTMLElement): HTMLElement | null {
  let el = self.parentElement
  while (el) {
    const hasOtherContent = Array.from(el.children).some((child) => {
      if (child.contains(self)) return false
      if ((child as HTMLElement).hasAttribute?.(GLITCH_ATTR)) return false
      return true
    })
    if (hasOtherContent) return el
    el = el.parentElement
  }
  return null
}

/**
 * Collapse all wrapper elements between `self` and `targetParent` so they
 * take zero space in auto-layout / stacks.
 */
function collapseWrappers(self: HTMLElement, targetParent: HTMLElement): (() => void) {
  const origStyles: { el: HTMLElement; pos: string; w: string; h: string; ov: string; min: string }[] = []
  let wrapper = self.parentElement
  while (wrapper && wrapper !== targetParent) {
    origStyles.push({
      el: wrapper,
      pos: wrapper.style.position,
      w: wrapper.style.width,
      h: wrapper.style.height,
      ov: wrapper.style.overflow,
      min: wrapper.style.minHeight,
    })
    wrapper.style.position = "absolute"
    wrapper.style.width = "0"
    wrapper.style.height = "0"
    wrapper.style.overflow = "visible"
    wrapper.style.minHeight = "0"
    wrapper = wrapper.parentElement
  }
  // Return a restore function
  return () => {
    for (const s of origStyles) {
      s.el.style.position = s.pos
      s.el.style.width = s.w
      s.el.style.height = s.h
      s.el.style.overflow = s.ov
      s.el.style.minHeight = s.min
    }
  }
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
}

function GlitchFrame({
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
}: Props) {
  const selfRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const parentRef = useRef<HTMLElement | null>(null)
  const cellEls = useRef<HTMLDivElement[]>([])
  const [parentSize, setParentSize] = useState({ w: 0, h: 0 })

  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const tiltActive = useRef(false)
  const cellDisplacements = useRef<Float64Array>(new Float64Array(0))
  const cellTargets = useRef<Float64Array>(new Float64Array(0))
  const rafId = useRef(0)

  const smoothVx = useRef(0)
  const smoothVy = useRef(0)
  const prevBeta = useRef<number | null>(null)
  const prevGamma = useRef<number | null>(null)
  const prevTiltTime = useRef(0)

  const clampedBlockSize = Math.max(2, blockSize)
  const { w: pw, h: ph } = parentSize

  // sinA blends between horizontal (0) and vertical (1) cell layouts
  const sinA = Math.abs(Math.sin((angle * Math.PI) / 180))
  const WORD_PX = 80
  const CHAR_PX = 20

  let rowCount: number, rowHeight: number, colCount: number, colWidth: number

  if (pw <= 0 || ph <= 0) {
    rowCount = 0; rowHeight = clampedBlockSize; colCount = 1; colWidth = pw
  } else if (scope === "line") {
    const rowH = clampedBlockSize + sinA * (ph - clampedBlockSize)
    rowCount = Math.max(1, Math.ceil(ph / rowH))
    rowHeight = ph / rowCount
    const colW = pw - sinA * (pw - clampedBlockSize)
    colCount = Math.max(1, Math.ceil(pw / colW))
    colWidth = pw / colCount
  } else {
    const baseColW = scope === "word"
      ? Math.max(clampedBlockSize * 4, WORD_PX)
      : Math.max(clampedBlockSize * 2, CHAR_PX)
    const rowH = clampedBlockSize + sinA * (baseColW - clampedBlockSize)
    rowCount = Math.max(1, Math.ceil(ph / rowH))
    rowHeight = ph / rowCount
    const colW = baseColW - sinA * (baseColW - clampedBlockSize)
    colCount = Math.max(1, Math.ceil(pw / colW))
    colWidth = pw / colCount
  }

  const cellCount = rowCount * colCount

  // ── Phase 1: Find parent, collapse wrappers, observe size ────────────────

  useEffect(() => {
    const self = selfRef.current
    if (!self) return

    // Skip past Framer wrapper(s) to the actual user frame
    const parent = findTargetParent(self)
    if (!parent) return
    parentRef.current = parent

    // Collapse any intermediate Framer wrapper elements so they don't
    // interfere with auto-layout / stacks
    const restoreWrappers = collapseWrappers(self, parent)

    // Ensure parent is positioned for absolute overlay
    const cs = getComputedStyle(parent)
    const origPosition = parent.style.position
    if (cs.position === "static") {
      parent.style.position = "relative"
    }

    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect
      setParentSize((prev) =>
        prev.w !== w || prev.h !== h ? { w, h } : prev
      )
    })
    ro.observe(parent)
    return () => {
      ro.disconnect()
      restoreWrappers()
      parent.style.position = origPosition
      parentRef.current = null
    }
  }, [])

  // ── Phase 2: Build cell overlay by cloning parent siblings ──────────────

  useEffect(() => {
    if (cellCount > 0) {
      cellDisplacements.current = new Float64Array(cellCount)
      cellTargets.current = new Float64Array(cellCount)
    }
  }, [cellCount])

  // Rebuild counter — incremented by MutationObserver to trigger re-clone
  const [rebuildKey, setRebuildKey] = useState(0)

  useEffect(() => {
    const parent = parentRef.current
    const self = selfRef.current
    if (!parent || !self || cellCount === 0 || pw <= 0 || ph <= 0) return

    // Remove previous overlay
    if (overlayRef.current) {
      overlayRef.current.remove()
      overlayRef.current = null
    }

    // Gather siblings (skip our wrapper chain and any previous overlay)
    const siblings: HTMLElement[] = []
    for (const child of Array.from(parent.children)) {
      const el = child as HTMLElement
      if (el.contains(self)) continue // skip wrapper chain containing our component
      if (el.hasAttribute(GLITCH_ATTR)) continue
      siblings.push(el)
    }

    if (siblings.length === 0) return

    // Hide originals
    const origDisplay: string[] = siblings.map((s) => s.style.visibility)
    siblings.forEach((s) => { s.style.visibility = "hidden" })

    // Clone all siblings into a wrapper
    const cloneSiblings = (): HTMLDivElement => {
      const wrapper = document.createElement("div")
      wrapper.style.cssText = "position:absolute;inset:0;pointer-events:none;"
      for (const sib of siblings) {
        const clone = sib.cloneNode(true) as HTMLElement
        clone.style.visibility = "visible"
        clone.removeAttribute(SELF_ATTR)
        wrapper.appendChild(clone)
      }
      return wrapper
    }

    // Create overlay
    const overlay = document.createElement("div")
    overlay.setAttribute(GLITCH_ATTR, "true")
    overlay.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:999;${clipOverflow ? "overflow:hidden;" : ""}`

    // Build cells
    const cells: HTMLDivElement[] = []
    for (let r = 0; r < rowCount; r++) {
      const top = r * rowHeight
      const bottom = Math.max(0, ph - top - rowHeight)
      for (let c = 0; c < colCount; c++) {
        const left = c * colWidth
        const right = Math.max(0, pw - left - colWidth)
        const cell = document.createElement("div")
        cell.style.cssText = `position:absolute;inset:0;clip-path:inset(${top}px ${right}px ${bottom}px ${left}px);will-change:transform;backface-visibility:hidden;`
        cell.appendChild(cloneSiblings())
        overlay.appendChild(cell)
        cells.push(cell)
      }
    }

    parent.appendChild(overlay)
    overlayRef.current = overlay
    cellEls.current = cells

    return () => {
      overlay.remove()
      overlayRef.current = null
      cellEls.current = []
      // Restore original visibility
      siblings.forEach((s, i) => { s.style.visibility = origDisplay[i] })
    }
  }, [cellCount, rowCount, colCount, colWidth, rowHeight, pw, ph, clipOverflow, rebuildKey])

  // ── MutationObserver: re-clone when parent content changes ──────────────

  useEffect(() => {
    const parent = parentRef.current
    const self = selfRef.current
    if (!parent || !self) return

    let timeout: ReturnType<typeof setTimeout>
    const mo = new MutationObserver((mutations) => {
      // Ignore mutations inside our overlay or our wrapper chain
      const relevant = mutations.some((m) => {
        const target = m.target as HTMLElement
        if (!target) return false
        if (target.contains?.(self)) return false // wrapper chain
        if (self.contains?.(target)) return false // inside self
        if (target.hasAttribute?.(GLITCH_ATTR)) return false
        if (target.closest?.(`[${GLITCH_ATTR}]`)) return false
        return true
      })
      if (!relevant) return
      clearTimeout(timeout)
      timeout = setTimeout(() => setRebuildKey((k) => k + 1), 150)
    })

    mo.observe(parent, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class", "src"],
    })

    return () => {
      mo.disconnect()
      clearTimeout(timeout)
    }
  }, [])

  // ── Phase 3: Pointer handlers on parent ─────────────────────────────────

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    if (interaction === "tilt") return

    const handlePointerMove = (e: PointerEvent) => {
      mouseActive.current = true
      const rect = parent.getBoundingClientRect()
      const now = performance.now()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top

      const trail = mouseTrail.current
      let vx = 0, vy = 0
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
      while (trail.length > 0 && trail[0].time < cutoff) trail.shift()
    }

    const handlePointerLeave = () => { mouseActive.current = false }

    parent.addEventListener("pointermove", handlePointerMove)
    parent.addEventListener("pointerleave", handlePointerLeave)
    return () => {
      parent.removeEventListener("pointermove", handlePointerMove)
      parent.removeEventListener("pointerleave", handlePointerLeave)
    }
  }, [trailDuration, interaction])

  // ── Phase 4: DeviceOrientation (tilt) ───────────────────────────────────

  useEffect(() => {
    if (interaction === "pointer") return
    const parent = parentRef.current
    if (!parent) return

    const isMobile = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0
    if (interaction === "auto" && !isMobile) return

    let orientationSupported = false
    let permissionGranted = false
    let cleanedUp = false

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (cleanedUp || e.beta === null || e.gamma === null) return
      orientationSupported = true
      tiltActive.current = true

      const rect = parent.getBoundingClientRect()
      const now = performance.now()
      const cw = rect.width, ch = rect.height

      const normalizedGamma = clamp(e.gamma / 45, -1, 1)
      const normalizedBeta = clamp((e.beta - 45) / 45, -1, 1)
      const virtualX = ((normalizedGamma + 1) / 2) * cw * tiltSensitivity
      const virtualY = ((normalizedBeta + 1) / 2) * ch * tiltSensitivity

      let vx = 0, vy = 0
      if (prevBeta.current !== null && prevGamma.current !== null) {
        const dt = now - prevTiltTime.current
        if (dt > 0 && dt < 200) {
          vx = ((e.gamma - prevGamma.current) / dt) * cw * 0.02 * tiltSensitivity
          vy = ((e.beta - prevBeta.current) / dt) * ch * 0.02 * tiltSensitivity
        }
      }
      prevBeta.current = e.beta
      prevGamma.current = e.gamma
      prevTiltTime.current = now

      smoothVx.current += (vx - smoothVx.current) * 0.3
      smoothVy.current += (vy - smoothVy.current) * 0.3

      const trail = mouseTrail.current
      trail.push({
        x: clamp(virtualX, 0, cw), y: clamp(virtualY, 0, ch),
        time: now, vx: smoothVx.current, vy: smoothVy.current,
      })
      const cutoff = now - trailDuration
      while (trail.length > 0 && trail[0].time < cutoff) trail.shift()
    }

    const startListening = () => {
      if (cleanedUp || permissionGranted) return
      permissionGranted = true
      window.addEventListener("deviceorientation", handleOrientation)
    }

    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === "function") {
      const req = () => {
        DOE.requestPermission().then((s: string) => { if (s === "granted") startListening() }).catch(() => {})
        window.removeEventListener("touchstart", req)
      }
      window.addEventListener("touchstart", req, { once: true })
      return () => { cleanedUp = true; window.removeEventListener("touchstart", req); window.removeEventListener("deviceorientation", handleOrientation); tiltActive.current = false }
    } else {
      startListening()
      const fb = setTimeout(() => { if (!orientationSupported) tiltActive.current = false }, 1000)
      return () => { cleanedUp = true; clearTimeout(fb); window.removeEventListener("deviceorientation", handleOrientation); tiltActive.current = false }
    }
  }, [interaction, trailDuration, tiltSensitivity])

  // ── Phase 5: Animation loop ─────────────────────────────────────────────

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
      const active = mouseActive.current || tiltActive.current

      if (active) {
        const cutoff = now - trailDuration
        while (trail.length > 0 && trail[0].time < cutoff) trail.shift()
      }

      for (let r = 0; r < rowCount; r++) {
        const cellCenterY = r * rowHeight + rowHeight / 2
        for (let c = 0; c < colCount; c++) {
          const idx = r * colCount + c
          const cellCenterX = c * colWidth + colWidth / 2

          if (active && trail.length > 0) {
            if (isDirectional) {
              let peakInfluence = 0, peakV = 0
              for (let p = 0; p < trail.length; p++) {
                const pt = trail[p]
                const age = (now - pt.time) / trailDuration
                const timeFade = Math.max(0, 1 - age)
                let dist: number
                if (isLine) {
                  dist = Math.abs(pt.y - cellCenterY) * (1 - sinABlend) + Math.abs(pt.x - cellCenterX) * sinABlend
                } else {
                  const dx = pt.x - cellCenterX, dy = pt.y - cellCenterY
                  dist = Math.sqrt(dx * dx + dy * dy)
                }
                const combined = falloff(dist, influenceRadius) * timeFade
                if (combined > peakInfluence) { peakInfluence = combined; peakV = pt.vx * cosA + pt.vy * sinADisp }
              }
              targets[idx] = peakV * velocitySensitivity * intensity * peakInfluence
            } else {
              let peakInfluence = 0
              for (let p = 0; p < trail.length; p++) {
                const pt = trail[p]
                const age = (now - pt.time) / trailDuration
                const timeFade = Math.max(0, 1 - age)
                let dist: number
                if (isLine) {
                  dist = Math.abs(pt.y - cellCenterY) * (1 - sinABlend) + Math.abs(pt.x - cellCenterX) * sinABlend
                } else {
                  const dx = pt.x - cellCenterX, dy = pt.y - cellCenterY
                  dist = Math.sqrt(dx * dx + dy * dy)
                }
                const combined = falloff(dist, influenceRadius) * timeFade
                if (combined > peakInfluence) peakInfluence = combined
              }
              targets[idx] = cellDirection(idx) * cellMagnitude(idx) * intensity * peakInfluence
            }
          } else {
            targets[idx] = 0
          }

          const diff = targets[idx] - disps[idx]
          disps[idx] += Math.abs(diff) > 0.05 ? diff * smoothing : diff

          const el = els[idx]
          if (el) {
            const d = disps[idx]
            el.style.transform = Math.abs(d) < 0.05 ? "translate(0,0)" : `translate(${d * cosA}px,${d * sinADisp}px)`
          }
        }
      }
      rafId.current = requestAnimationFrame(animate)
    }

    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [cellCount, rowCount, colCount, colWidth, rowHeight, scope, effect, angle, influenceRadius, intensity, trailDuration, smoothing])

  // ── Render: invisible self-marker ───────────────────────────────────────

  return (
    <div
      ref={selfRef}
      data-glitch-frame="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
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

export default GlitchFrame
