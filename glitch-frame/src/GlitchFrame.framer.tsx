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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ── Easing functions ─────────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) {
    return n1 * t * t
  } else if (t < 2 / d1) {
    t -= 1.5 / d1
    return n1 * t * t + 0.75
  } else if (t < 2.5 / d1) {
    t -= 2.25 / d1
    return n1 * t * t + 0.9375
  } else {
    t -= 2.625 / d1
    return n1 * t * t + 0.984375
  }
}

const EASING_FNS: Record<string, (t: number) => number> = {
  smooth: easeInOutCubic,
  gentle: easeOutQuad,
  snap: easeOutExpo,
  bounce: easeOutBounce,
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

/**
 * Replace <canvas> elements in a template clone with static <img> snapshots.
 * cloneNode(true) doesn't preserve canvas pixel data, so without this the
 * cloned cells would show blank rectangles where canvases were.
 */
function neutralizeCanvases(template: HTMLElement, parent: HTMLElement) {
  const origCanvases = Array.from(parent.querySelectorAll("canvas"))
  const templateCanvases = Array.from(template.querySelectorAll("canvas"))
  templateCanvases.forEach((tCanvas, i) => {
    const orig = origCanvases[i]
    if (!orig) return
    try {
      const img = document.createElement("img")
      img.src = orig.toDataURL()
      img.style.cssText = (tCanvas as HTMLElement).style.cssText
      img.setAttribute("draggable", "false")
      tCanvas.parentElement?.replaceChild(img, tCanvas)
    } catch { /* tainted canvas — leave as-is */ }
  })
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
  effect?: "random" | "directional" | "parallax"
  directionMode?: "cursor" | "manual"
  angle?: number
  clipOverflow?: boolean
  influenceRadius?: number
  intensity?: number
  trailDuration?: number
  smoothing?: number
  invert?: boolean
  pauseOnHover?: boolean
  returnDuration?: number
  returnEasing?: "smooth" | "gentle" | "snap" | "bounce"
  parallaxDirection?: "toward" | "away"
  interaction?: "pointer" | "tilt" | "auto"
  tiltSensitivity?: number
}

function GlitchFrame({
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
  invert = false,
  pauseOnHover = false,
  returnDuration = 600,
  returnEasing = "smooth",
  parallaxDirection = "away",
  interaction = "auto",
  tiltSensitivity = 1.0,
}: Props) {
  const selfRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const parentRef = useRef<HTMLElement | null>(null)
  const cellEls = useRef<HTMLDivElement[]>([])
  const templateRef = useRef<HTMLDivElement | null>(null)
  const cellPopulatedRef = useRef<boolean[]>([])
  const baseRef = useRef<HTMLDivElement | null>(null)
  const [parentSize, setParentSize] = useState({ w: 0, h: 0 })

  const mouseTrail = useRef<TrailPoint[]>([])
  const mouseActive = useRef(false)
  const tiltActive = useRef(false)
  const lastPointerPos = useRef({ x: 0, y: 0 })
  const lastMoveTime = useRef(0)
  const cellDisplacements = useRef<Float64Array>(new Float64Array(0))
  const cellTargets = useRef<Float64Array>(new Float64Array(0))
  const cellReturnStart = useRef<Float64Array>(new Float64Array(0))
  const cellReturnTime = useRef<Float64Array>(new Float64Array(0))
  const parallaxDispsX = useRef<Float64Array>(new Float64Array(0))
  const parallaxDispsY = useRef<Float64Array>(new Float64Array(0))
  const cellMagsRef = useRef<Float64Array>(new Float64Array(0))
  const cellDirsRef = useRef<Float64Array>(new Float64Array(0))
  const rafId = useRef(0)

  const smoothVx = useRef(0)
  const smoothVy = useRef(0)
  const prevBeta = useRef<number | null>(null)
  const prevGamma = useRef<number | null>(null)
  const prevTiltTime = useRef(0)
  const suppressObserverRef = useRef(false)
  const trailFadesBuf = useRef<Float64Array>(new Float64Array(64))

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

  // Cap cell count — prevents extreme DOM bloat at small block sizes
  const MAX_CELLS = 400
  if (rowCount * colCount > MAX_CELLS && pw > 0 && ph > 0) {
    const scale = Math.sqrt((rowCount * colCount) / MAX_CELLS)
    rowCount = Math.max(1, Math.round(rowCount / scale))
    colCount = Math.max(1, Math.round(colCount / scale))
    rowHeight = ph / rowCount
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
      cellReturnStart.current = new Float64Array(cellCount)
      cellReturnTime.current = new Float64Array(cellCount)
      parallaxDispsX.current = new Float64Array(cellCount)
      parallaxDispsY.current = new Float64Array(cellCount)
      // Precompute deterministic cell properties once
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
      if (el.contains(self)) continue
      if (el.hasAttribute(GLITCH_ATTR)) continue
      siblings.push(el)
    }

    if (siblings.length === 0) return

    // ── Build a single cleaned template (cloned once, reused for all cells) ──
    const template = (() => {
      const pc = parent.cloneNode(true) as HTMLDivElement
      pc.querySelectorAll(`[${GLITCH_ATTR}]`).forEach((n) => n.remove())
      pc.querySelectorAll("[data-glitch-frame]").forEach((gf) => {
        let el: HTMLElement | null = gf as HTMLElement
        while (el && el.parentElement !== pc) el = el.parentElement
        if (el) el.remove()
      })
      // Only restore visibility on direct children of the cloned parent.
      // These correspond to the siblings that GlitchFrame itself hides
      // (via siblings.forEach(s => s.style.visibility = "hidden")).
      // Deep descendants may intentionally use visibility:hidden for
      // animations (e.g. AsciiFormatter reveal effect) — preserve those.
      for (const child of Array.from(pc.children)) {
        const h = child as HTMLElement
        if (h.style?.visibility === "hidden") h.style.visibility = "visible"
      }
      pc.style.position = "absolute"
      pc.style.inset = "0"
      pc.style.margin = "0"
      pc.style.pointerEvents = "none"
      pc.style.background = "none"
      pc.style.backgroundColor = "transparent"
      pc.style.border = "none"
      pc.style.boxShadow = "none"
      pc.style.outline = "none"
      pc.style.overflow = "visible"
      return pc
    })()

    // Replace cloned canvases with static snapshots (cloneNode loses pixel data)
    neutralizeCanvases(template, parent)
    templateRef.current = template

    // Create overlay
    const overlay = document.createElement("div")
    overlay.setAttribute(GLITCH_ATTR, "true")
    overlay.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:999;${clipOverflow ? "overflow:hidden;" : ""}`

    // Base layer — single undisplaced content clone. Holes are cut via
    // clip-path (evenodd) where displaced cells are active.  To hide
    // anti-aliased seams on hole edges, the base layer inherits the
    // parent's background-color so semi-transparent edge pixels blend
    // with the same color on both sides → seams become invisible.
    const base = template.cloneNode(true) as HTMLDivElement
    base.style.zIndex = "0"
    base.style.willChange = "clip-path"
    const parentBg = getComputedStyle(parent).backgroundColor
    if (parentBg && parentBg !== "transparent" && parentBg !== "rgba(0, 0, 0, 0)") {
      base.style.backgroundColor = parentBg
    }
    overlay.appendChild(base)
    baseRef.current = base

    // Build lightweight empty cell divs (content added lazily by animation loop)
    // Uses overflow:hidden + explicit positioning instead of clip-path:inset()
    // to avoid anti-aliased edges that create visible grid seams between cells.
    const frag = document.createDocumentFragment()
    const cells: HTMLDivElement[] = []
    const populated: boolean[] = []
    for (let r = 0; r < rowCount; r++) {
      const cellTop = r * rowHeight
      for (let c = 0; c < colCount; c++) {
        const cellLeft = c * colWidth
        const cell = document.createElement("div")
        cell.style.cssText = `position:absolute;left:${cellLeft}px;top:${cellTop}px;width:${colWidth}px;height:${rowHeight}px;overflow:hidden;will-change:transform;backface-visibility:hidden;contain:strict;z-index:1;`
        frag.appendChild(cell)
        cells.push(cell)
        populated.push(false)
      }
    }
    overlay.appendChild(frag)

    // Append overlay BEFORE hiding originals (so content is never invisible)
    parent.appendChild(overlay)
    overlayRef.current = overlay
    cellEls.current = cells
    cellPopulatedRef.current = populated

    // Suppress observer while we change sibling visibility (prevents rebuild loop)
    suppressObserverRef.current = true
    const origVisibility: string[] = siblings.map((s) => s.style.visibility)
    siblings.forEach((s) => { s.style.visibility = "hidden" })
    setTimeout(() => { suppressObserverRef.current = false }, 0)

    return () => {
      suppressObserverRef.current = true
      overlay.remove()
      overlayRef.current = null
      cellEls.current = []
      cellPopulatedRef.current = []
      templateRef.current = null
      baseRef.current = null
      siblings.forEach((s, i) => { s.style.visibility = origVisibility[i] })
      setTimeout(() => { suppressObserverRef.current = false }, 0)
    }
  }, [cellCount, rowCount, colCount, colWidth, rowHeight, pw, ph, clipOverflow, rebuildKey])

  // ── MutationObserver: re-clone when parent content changes ──────────────

  useEffect(() => {
    const parent = parentRef.current
    const self = selfRef.current
    if (!parent || !self) return

    // Throttle (not debounce) so rebuilds happen periodically during
    // continuous mutations — e.g. child component animations that update
    // the DOM every frame.  Debounce would defer all rebuilds until the
    // mutations stop, causing animated content to stay invisible until
    // the animation finishes.
    const THROTTLE_MS = 100
    let pending = false
    let trailingTimeout: ReturnType<typeof setTimeout>

    const mo = new MutationObserver((mutations) => {
      // Skip mutations caused by our own sibling visibility changes
      if (suppressObserverRef.current) return
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
      if (!pending) {
        pending = true
        trailingTimeout = setTimeout(() => {
          pending = false
          setRebuildKey((k) => k + 1)
        }, THROTTLE_MS)
      }
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
      clearTimeout(trailingTimeout)
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
      lastPointerPos.current.x = localX
      lastPointerPos.current.y = localY
      lastMoveTime.current = now
      trail.push({ x: localX, y: localY, time: now, vx: smoothVx.current, vy: smoothVy.current })

      const cutoff = now - trailDuration
      let trimIdx = 0
      while (trimIdx < trail.length && trail[trimIdx].time < cutoff) trimIdx++
      if (trimIdx > 0) trail.splice(0, trimIdx)
      if (trail.length > 50) trail.splice(0, trail.length - 50)
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

      const clampedX = clamp(virtualX, 0, cw)
      const clampedY = clamp(virtualY, 0, ch)
      lastPointerPos.current.x = clampedX
      lastPointerPos.current.y = clampedY
      lastMoveTime.current = now

      const trail = mouseTrail.current
      trail.push({
        x: clampedX, y: clampedY,
        time: now, vx: smoothVx.current, vy: smoothVy.current,
      })
      const cutoff = now - trailDuration
      let trimIdx = 0
      while (trimIdx < trail.length && trail[trimIdx].time < cutoff) trimIdx++
      if (trimIdx > 0) trail.splice(0, trimIdx)
      if (trail.length > 50) trail.splice(0, trail.length - 50)
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

  // ── Phase 5: Animation loop (lazy population + base mask) ───────────────

  useEffect(() => {
    if (cellCount === 0) return

    const isLine = scope === "line"
    const isDirectional = effect === "directional"
    const isParallax = effect === "parallax"
    const isCursorDir = directionMode === "cursor" && !isParallax
    const angleRad = (angle * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinADisp = Math.sin(angleRad)
    const sinABlend = Math.abs(sinADisp)
    const velocitySensitivity = 12
    const POPULATE_THRESHOLD = 0.3
    const DEPOPULATE_THRESHOLD = 0.05
    const easeFn = EASING_FNS[returnEasing] || EASING_FNS.smooth
    const returnDur = returnDuration
    const sigma = influenceRadius / 2.5
    const invTwoSigmaSq = sigma > 0 ? 1 / (2 * sigma * sigma) : 0
    const oneMinusSinA = 1 - sinABlend

    const animate = () => {
      const disps = cellDisplacements.current
      const targets = cellTargets.current
      const els = cellEls.current
      const trail = mouseTrail.current
      const now = performance.now()
      const active = mouseActive.current || tiltActive.current
      const populated = cellPopulatedRef.current
      const template = templateRef.current
      const base = baseRef.current
      const returnStarts = cellReturnStart.current
      const returnTimes = cellReturnTime.current
      const pdx = parallaxDispsX.current
      const pdy = parallaxDispsY.current
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

      // Pause-on-hover: detect stationary cursor (80ms threshold)
      const PAUSE_THRESHOLD = 80
      const isStationary = pauseOnHover && active && (now - lastMoveTime.current > PAUSE_THRESHOLD)

      let maskDirty = false

      for (let r = 0; r < rowCount; r++) {
        const cellCenterY = r * rowHeight + rowHeight / 2
        for (let c = 0; c < colCount; c++) {
          const idx = r * colCount + c
          const cellCenterX = c * colWidth + colWidth / 2

          // ── Parallax: 2D global shift based on cursor offset from center ──
          if (isParallax) {
            if (active && !isStationary) {
              const mx = lastPointerPos.current.x
              const my = lastPointerPos.current.y
              const normX = pw > 0 ? (mx - pw / 2) / (pw / 2) : 0
              const normY = ph > 0 ? (my - ph / 2) / (ph / 2) : 0
              const sign = parallaxDirection === "toward" ? -1 : 1
              const depth = 0.2 + hash01(idx, 999.9) * 0.8
              const targetX = sign * normX * depth * intensity
              const targetY = sign * normY * depth * intensity
              pdx[idx] += (targetX - pdx[idx]) * smoothing
              pdy[idx] += (targetY - pdy[idx]) * smoothing
            } else if (!active) {
              pdx[idx] += (0 - pdx[idx]) * smoothing
              pdy[idx] += (0 - pdy[idx]) * smoothing
              if (Math.abs(pdx[idx]) < 0.01) pdx[idx] = 0
              if (Math.abs(pdy[idx]) < 0.01) pdy[idx] = 0
            }
            // isStationary + active: freeze in place (skip lerp)
          } else if (isCursorDir) {
            // ── Cursor-driven direction: 2D velocity-based displacement ──
            if (isStationary) {
              // Freeze: pdx/pdy stay at current values
            } else if (invert && active) {
              // Inverted + cursor: calm zone at pointer, velocity-driven outside
              const mx = lastPointerPos.current.x
              const my = lastPointerPos.current.y
              let rawInfluence: number
              if (isLine) {
                const ld = Math.abs(my - cellCenterY) * oneMinusSinA + Math.abs(mx - cellCenterX) * sinABlend
                rawInfluence = Math.exp(-ld * ld * invTwoSigmaSq)
              } else {
                const dx2 = mx - cellCenterX, dy2 = my - cellCenterY
                rawInfluence = Math.exp(-(dx2 * dx2 + dy2 * dy2) * invTwoSigmaSq)
              }
              const invertedInfluence = Math.pow(Math.max(0, 1 - rawInfluence * 22.76), 2)
              let peakVx = 0, peakVy = 0
              if (trailLen > 0) {
                const latest = trail[trailLen - 1]
                peakVx = latest.vx; peakVy = latest.vy
              }
              const mag = isDirectional ? 1 : cellMags[idx]
              const targetX = peakVx * velocitySensitivity * intensity * invertedInfluence * mag
              const targetY = peakVy * velocitySensitivity * intensity * invertedInfluence * mag
              pdx[idx] += (targetX - pdx[idx]) * smoothing
              pdy[idx] += (targetY - pdy[idx]) * smoothing
            } else if (active && trailLen > 0) {
              // Normal cursor mode: find peak-influence trail point, use its velocity
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
              // Return to rest
              pdx[idx] += (0 - pdx[idx]) * smoothing
              pdy[idx] += (0 - pdy[idx]) * smoothing
              if (Math.abs(pdx[idx]) < 0.01) pdx[idx] = 0
              if (Math.abs(pdy[idx]) < 0.01) pdy[idx] = 0
            }
          } else if (isStationary) {
            // Manual mode freeze: targets stay at last values
          } else if (invert && active) {
            // ── Manual inverted: use lastPointerPos directly (1D) ──
            const mx = lastPointerPos.current.x
            const my = lastPointerPos.current.y
            let rawInfluence: number
            if (isLine) {
              const ld = Math.abs(my - cellCenterY) * oneMinusSinA + Math.abs(mx - cellCenterX) * sinABlend
              rawInfluence = Math.exp(-ld * ld * invTwoSigmaSq)
            } else {
              const dx2 = mx - cellCenterX, dy2 = my - cellCenterY
              rawInfluence = Math.exp(-(dx2 * dx2 + dy2 * dy2) * invTwoSigmaSq)
            }
            const invertedInfluence = Math.pow(Math.max(0, 1 - rawInfluence * 22.76), 2)

            if (isDirectional) {
              let peakV = 0
              if (trailLen > 0) {
                const latest = trail[trailLen - 1]
                peakV = latest.vx * cosA + latest.vy * sinADisp
              }
              targets[idx] = peakV * velocitySensitivity * intensity * invertedInfluence
            } else {
              targets[idx] = cellDirs[idx] * cellMags[idx] * intensity * invertedInfluence
            }
          } else if (active && trailLen > 0) {
            // ── Manual normal mode: trail-based influence (1D) ──
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
                if (combined > peakInfluence) { peakInfluence = combined; peakV = pt.vx * cosA + pt.vy * sinADisp }
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

          const el = els[idx]
          if (!el) continue

          // ── 2D displacement (parallax OR cursor direction) ──
          if (isParallax || isCursorDir) {
            const absPX = Math.abs(pdx[idx]) + Math.abs(pdy[idx])

            if (template && populated) {
              if (absPX > POPULATE_THRESHOLD && !populated[idx]) {
                const clone = template.cloneNode(true) as HTMLDivElement
                clone.style.inset = "auto"
                clone.style.left = `-${c * colWidth}px`
                clone.style.top = `-${r * rowHeight}px`
                clone.style.width = `${pw}px`
                clone.style.height = `${ph}px`
                el.appendChild(clone)
                populated[idx] = true
                maskDirty = true
              } else if (absPX < DEPOPULATE_THRESHOLD && populated[idx]) {
                while (el.firstChild) el.removeChild(el.firstChild)
                populated[idx] = false
                maskDirty = true
              }
            }

            if (populated && populated[idx]) {
              el.style.transform = absPX < 0.05
                ? "none"
                : `translate(${pdx[idx]}px,${pdy[idx]}px)`
            } else if (el.style.transform !== "none") {
              el.style.transform = "none"
            }
            continue
          }

          // ── Manual direction: 1D displacement with attack/return ──
          const absTarget = Math.abs(targets[idx])
          const prevAbsDisp = Math.abs(disps[idx])

          // "Released" = trail influence has dropped well below current
          // displacement, meaning the cell should start easing back to rest.
          const isReleased = absTarget < Math.max(0.5, prevAbsDisp * 0.3)

          if (!isReleased) {
            // Attack: actively influenced by pointer — responsive lerp
            returnTimes[idx] = 0
            const diff = targets[idx] - disps[idx]
            disps[idx] += Math.abs(diff) > 0.05 ? diff * smoothing : diff
          } else if (prevAbsDisp > DEPOPULATE_THRESHOLD || returnTimes[idx] > 0) {
            // Return: ease back to rest with configurable curve
            if (returnTimes[idx] === 0) {
              returnStarts[idx] = disps[idx]
              returnTimes[idx] = now
            }
            const elapsed = now - returnTimes[idx]
            const t = Math.min(1, elapsed / returnDur)
            disps[idx] = returnStarts[idx] * (1 - easeFn(t))
            if (t >= 1) {
              disps[idx] = 0
              returnTimes[idx] = 0
            }
          } else {
            disps[idx] = 0
            returnTimes[idx] = 0
          }

          const absDisp = Math.abs(disps[idx])
          const isReturning = returnTimes[idx] > 0

          // ── Lazy population: add/remove content clones on demand ──
          if (template && populated) {
            const needsContent = absDisp > POPULATE_THRESHOLD || absTarget > POPULATE_THRESHOLD || isReturning
            const isSettled = !isReturning && absDisp < DEPOPULATE_THRESHOLD && absTarget < DEPOPULATE_THRESHOLD

            if (needsContent && !populated[idx]) {
              const clone = template.cloneNode(true) as HTMLDivElement
              clone.style.inset = "auto"
              clone.style.left = `-${c * colWidth}px`
              clone.style.top = `-${r * rowHeight}px`
              clone.style.width = `${pw}px`
              clone.style.height = `${ph}px`
              el.appendChild(clone)
              populated[idx] = true
              maskDirty = true
            } else if (isSettled && populated[idx]) {
              while (el.firstChild) el.removeChild(el.firstChild)
              populated[idx] = false
              maskDirty = true
            }
          }

          // Only write transform on populated cells
          if (populated && populated[idx]) {
            el.style.transform = absDisp < 0.05
              ? "none"
              : `translate(${disps[idx] * cosA}px,${disps[idx] * sinADisp}px)`
          } else if (el.style.transform !== "none") {
            el.style.transform = "none"
          }
        }
      }

      // ── Update base layer mask: cut holes where cells are displaced ──
      // Uses clip-path with evenodd fill rule — the outer rect is the
      // visible area, inner rects are holes that hide base content at
      // displaced cell positions (preventing bleed-through).
      // Anti-aliased hole edges are hidden by the base layer's background-color
      // matching the parent (set during overlay construction).
      if (maskDirty && base && populated) {
        let hasHoles = false
        let pathD = `M 0 0 L ${pw} 0 L ${pw} ${ph} L 0 ${ph} Z`
        for (let idx = 0; idx < cellCount; idx++) {
          if (populated[idx]) {
            hasHoles = true
            const r = Math.floor(idx / colCount)
            const c = idx % colCount
            const t = Math.round(r * rowHeight)
            const b = Math.round(t + rowHeight)
            const l = Math.round(c * colWidth)
            const ri = Math.round(l + colWidth)
            pathD += ` M ${l} ${t} L ${ri} ${t} L ${ri} ${b} L ${l} ${b} Z`
          }
        }
        base.style.clipPath = hasHoles
          ? `path(evenodd,"${pathD}")`
          : "none"
      }

      rafId.current = requestAnimationFrame(animate)
    }

    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [cellCount, rowCount, colCount, colWidth, rowHeight, pw, ph, scope, effect, directionMode, angle, influenceRadius, intensity, trailDuration, smoothing, invert, pauseOnHover, parallaxDirection, returnDuration, returnEasing])

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
    options: ["random", "directional", "parallax"],
    optionTitles: ["Random", "Directional", "Parallax"],
  },
  scope: {
    type: ControlType.Enum,
    title: "Target",
    defaultValue: "line",
    options: ["line", "word", "character"],
    optionTitles: ["Line", "Segment", "Block"],
  },
  directionMode: {
    type: ControlType.Enum,
    title: "Direction",
    defaultValue: "cursor",
    options: ["cursor", "manual"],
    optionTitles: ["Cursor", "Manual"],
    hidden: (props: any) => props.effect === "parallax",
  },
  angle: {
    type: ControlType.Number,
    title: "Angle",
    defaultValue: 0,
    min: 0,
    max: 180,
    step: 1,
    unit: "°",
    hidden: (props: any) => props.directionMode === "cursor" || props.effect === "parallax",
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
  parallaxDirection: {
    type: ControlType.Enum,
    title: "Parallax Direction",
    defaultValue: "away",
    options: ["toward", "away"],
    optionTitles: ["Toward", "Away"],
    hidden: (props: any) => props.effect !== "parallax",
  },
  invert: {
    type: ControlType.Boolean,
    title: "Invert",
    defaultValue: false,
    hidden: (props: any) => props.effect === "parallax",
  },
  pauseOnHover: {
    type: ControlType.Boolean,
    title: "Pause on Hover",
    defaultValue: false,
    hidden: (props: any) => props.effect === "parallax",
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
    hidden: (props: any) => props.effect === "parallax",
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
    hidden: (props: any) => props.effect === "parallax",
  },
  smoothing: {
    type: ControlType.Number,
    title: "Smoothing",
    defaultValue: 0.12,
    min: 0.02,
    max: 0.5,
    step: 0.01,
  },
  returnDuration: {
    type: ControlType.Number,
    title: "Return Duration",
    defaultValue: 600,
    min: 100,
    max: 2000,
    step: 50,
    unit: "ms",
    hidden: (props: any) => props.effect === "parallax" || props.directionMode === "cursor",
  },
  returnEasing: {
    type: ControlType.Enum,
    title: "Return Easing",
    defaultValue: "smooth",
    options: ["smooth", "gentle", "snap", "bounce"],
    optionTitles: ["Smooth", "Gentle", "Snap", "Bounce"],
    hidden: (props: any) => props.effect === "parallax" || props.directionMode === "cursor",
  },
})

export default GlitchFrame
