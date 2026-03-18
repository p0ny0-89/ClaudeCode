// AsciiFormatterPro — Framer Code Component (V2)
// Paste this entire file into Framer's code editor (Assets > Code > +)

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// ─── Types ──────────────────────────────────────────────────────────

// Font is a Framer font object from ControlType.Font (native picker).
// In dev harness it's a plain object with { fontFamily, fontWeight? }.
type Font = Record<string, any>
type FillType = "solid" | "linear" | "radial"
type AppearEffect =
  | "none"
  | "fade"
  | "reveal"
  | "typing"
  | "glitch"
  | "scramble"
  | "scan"
  | "boot"
  | "interference"
type Trigger = "mount" | "hover" | "viewport"
type RepeatMode = "once" | "loop" | "pingPong"
type StaggerMode = "none" | "byChar" | "byLine"
type RevealDirection = "left" | "right" | "top" | "bottom" | "centerOut" | "random"
type GlitchDirection = "horizontal" | "vertical" | "both"
type HoverEffect = "none" | "glitch" | "scramble" | "displace" | "flicker"
type HoverScope = "global" | "local"
type TextAlign = "left" | "center" | "right"
type FontSizingMode = "fixed" | "auto"

interface AsciiFormatterProProps {
  // Content
  text: string
  font: Font
  textAlign: TextAlign
  // Typography
  fontSizingMode: FontSizingMode
  fontSize: number
  lineHeight: number
  letterSpacing: number
  preserveFormatting: boolean
  // Appearance
  fillType: FillType
  color: string
  gradientStart: string
  gradientEnd: string
  gradientAngle: number
  // Animation
  appearEffect: AppearEffect
  trigger: Trigger
  repeatMode: RepeatMode
  duration: number
  delay: number
  stagger: StaggerMode
  staggerAmount: number
  direction: RevealDirection
  repeatDelay: number
  loopCount: number
  // Effect Controls
  intensity: number
  frequency: number
  seed: number
  jitter: number
  rgbSplit: number
  glitchDirection: GlitchDirection
  cursorBlink: boolean
  // Interaction
  hoverEffect: HoverEffect
  hoverScope: HoverScope
  hoverRadius: number
  hoverIntensity: number
  retriggerOnHover: boolean
  // Framer
  style?: React.CSSProperties
}

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_FONT: Font = { fontFamily: "'Courier New', Courier, monospace", fontWeight: 400 }

const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`0123456789"
const BLOCK_CHARS = "░▒▓█▄▀■□▪▫"

const DEFAULT_TEXT = `  /\\_/\\
 ( o.o )
  > ^ <`

// ─── Seeded RNG ─────────────────────────────────────────────────────

function createRng(seed: number) {
  let s = seed | 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) | 0
    return ((s >>> 0) / 0x100000000)
  }
}

// ─── Playback Engine ────────────────────────────────────────────────

function usePlayback(config: {
  enabled: boolean
  duration: number
  delay: number
  repeatMode: RepeatMode
  repeatDelay: number
  loopCount: number
  trigger: Trigger
  containerRef: React.RefObject<HTMLDivElement | null>
  retriggerOnHover: boolean
}) {
  const {
    enabled,
    duration,
    delay,
    repeatMode,
    repeatDelay,
    loopCount,
    trigger,
    containerRef,
    retriggerOnHover,
  } = config

  const [progress, setProgress] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [started, setStarted] = useState(false)
  const rafRef = useRef(0)
  const startTime = useRef(0)
  const isHovering = useRef(false)

  // Viewport trigger
  useEffect(() => {
    if (!enabled || trigger !== "viewport") return
    const el = containerRef.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) setStarted(true)
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [enabled, trigger, started, containerRef])

  // Hover trigger
  useEffect(() => {
    if (!enabled || trigger !== "hover") return
    const el = containerRef.current
    if (!el) return

    const enter = () => {
      isHovering.current = true
      if (!started || retriggerOnHover) {
        setStarted(true)
        setCycle(0)
        startTime.current = 0
      }
    }
    const leave = () => {
      isHovering.current = false
    }

    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
    }
  }, [enabled, trigger, started, retriggerOnHover])

  // Mount trigger
  useEffect(() => {
    if (!enabled) return
    if (trigger === "mount") setStarted(true)
  }, [enabled, trigger])

  // Animation loop
  useEffect(() => {
    if (!enabled || !started) {
      setProgress(enabled ? 0 : 1)
      return
    }

    const animate = (now: number) => {
      if (startTime.current === 0) startTime.current = now

      const elapsed = now - startTime.current
      const afterDelay = elapsed - delay * 1000

      if (afterDelay < 0) {
        setProgress(0)
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      let raw = Math.min(afterDelay / (duration * 1000), 1)

      // Ping-pong: reverse on odd cycles
      if (repeatMode === "pingPong" && cycle % 2 === 1) {
        raw = 1 - raw
      }

      setProgress(raw)

      if (raw >= 1 || (repeatMode === "pingPong" && cycle % 2 === 1 && raw <= 0)) {
        // Cycle complete
        const maxCycles = loopCount <= 0 ? Infinity : loopCount
        if (repeatMode === "once" || cycle + 1 >= maxCycles) {
          setProgress(repeatMode === "pingPong" && cycle % 2 === 1 ? 0 : 1)
          return
        }
        // Start next cycle after repeatDelay
        setCycle((c) => c + 1)
        startTime.current = now + repeatDelay * 1000
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, started, duration, delay, repeatMode, repeatDelay, loopCount, cycle])

  const replay = useCallback(() => {
    setCycle(0)
    setProgress(0)
    startTime.current = 0
    setStarted(true)
  }, [])

  return { progress, cycle, replay, isHovering: isHovering.current }
}

// ─── Auto-Fit Font Sizing ────────────────────────────────────────────
// Calculates the font size that makes the longest line fit the container width.
// Uses canvas measurement for accurate character widths per font.

let _measureCanvas: HTMLCanvasElement | null = null
const REF_SIZE = 16

function getCharWidth(fontFamily: string): number {
  if (typeof document === "undefined") return REF_SIZE * 0.6
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas")
  const ctx = _measureCanvas.getContext("2d")!
  ctx.font = `${REF_SIZE}px ${fontFamily}`
  return ctx.measureText("M").width
}

function useAutoFitFontSize(
  containerRef: React.RefObject<HTMLDivElement | null>,
  text: string,
  fontFamily: string,
  maxFontSize: number,
  letterSpacing: number,
  enabled: boolean
): number {
  const [computedSize, setComputedSize] = useState(maxFontSize)
  const fontFamilyRef = useRef(fontFamily)
  fontFamilyRef.current = fontFamily

  const longestLineLen = useMemo(() => {
    const lines = text.split("\n")
    return Math.max(...lines.map((l) => l.length), 1)
  }, [text])

  const calculate = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const containerWidth = el.clientWidth
    if (containerWidth <= 0) return

    const charWidthAtRef = getCharWidth(fontFamilyRef.current)
    if (charWidthAtRef <= 0) return

    // Width-based: font size that fits the longest line horizontally
    const raw =
      (containerWidth / longestLineLen - letterSpacing) *
      (REF_SIZE / charWidthAtRef)

    const clamped = Math.max(1, Math.min(raw, 500))
    setComputedSize((prev) => prev === clamped ? prev : clamped)
  }, [containerRef, longestLineLen, letterSpacing])

  useEffect(() => {
    if (!enabled) {
      setComputedSize(maxFontSize)
      return
    }

    const el = containerRef.current
    if (!el) return

    calculate()

    const ro = new ResizeObserver(() => calculate())
    ro.observe(el)

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => calculate())
    }

    return () => ro.disconnect()
  }, [enabled, calculate, containerRef, maxFontSize])

  return enabled ? computedSize : maxFontSize
}

// ─── Effect Computers ───────────────────────────────────────────────

// -- Fade
function computeFade(progress: number): React.CSSProperties {
  return { opacity: progress }
}

// -- Reveal (clip-path based)
function computeReveal(
  progress: number,
  direction: RevealDirection,
  seed: number
): React.CSSProperties {
  const p = progress * 100
  let clipPath: string

  switch (direction) {
    case "left":
      clipPath = `inset(0 ${100 - p}% 0 0)`
      break
    case "right":
      clipPath = `inset(0 0 0 ${100 - p}%)`
      break
    case "top":
      clipPath = `inset(0 0 ${100 - p}% 0)`
      break
    case "bottom":
      clipPath = `inset(${100 - p}% 0 0 0)`
      break
    case "centerOut": {
      const half = (100 - p) / 2
      clipPath = `inset(${half}% ${half}% ${half}% ${half}%)`
      break
    }
    case "random": {
      // Use seed to pick a consistent random direction for this instance
      const rng = createRng(seed)
      const dirs: RevealDirection[] = ["left", "right", "top", "bottom", "centerOut"]
      const picked = dirs[Math.floor(rng() * dirs.length)]
      return computeReveal(progress, picked, seed)
    }
    default:
      clipPath = `inset(0 ${100 - p}% 0 0)`
  }

  return { clipPath }
}

// -- Scan (clip-path reveal + glow band)
function computeScan(
  progress: number,
  direction: RevealDirection
): { clip: React.CSSProperties; scanLineStyle: React.CSSProperties } {
  const isVertical = direction === "top" || direction === "bottom"
  const pos = progress * 100
  const bandWidth = 3 // % of container

  const clip = computeReveal(progress, direction === "random" ? "left" : direction, 0)

  const scanLineStyle: React.CSSProperties = {
    position: "absolute",
    [isVertical ? "left" : "top"]: 0,
    [isVertical ? "right" : "bottom"]: 0,
    [isVertical ? "top" : "left"]: `${pos - bandWidth / 2}%`,
    [isVertical ? "height" : "width"]: `${bandWidth}%`,
    background: isVertical
      ? `linear-gradient(to bottom, transparent, rgba(0,255,65,0.4), transparent)`
      : `linear-gradient(to right, transparent, rgba(0,255,65,0.4), transparent)`,
    pointerEvents: "none",
    zIndex: 2,
    opacity: progress < 1 ? 1 : 0,
    transition: "opacity 0.2s",
  }

  return { clip, scanLineStyle }
}

// -- Typing
function computeTyping(
  text: string,
  progress: number,
  stagger: StaggerMode,
  _staggerAmount: number
): { visible: string; hidden: string } {
  if (stagger === "byLine") {
    const lines = text.split("\n")
    const visibleLines = Math.ceil(progress * lines.length)
    const visible = lines.slice(0, visibleLines).join("\n")
    const hidden = lines.slice(visibleLines).join("\n")
    return { visible, hidden: hidden ? "\n" + hidden : "" }
  }

  // Default: by character
  const len = Math.floor(progress * text.length)
  return {
    visible: text.slice(0, len),
    hidden: text.slice(len),
  }
}

// -- Glitch (progressive resolve with scramble)
function computeGlitch(
  text: string,
  progress: number,
  intensity: number,
  seed: number,
  frameCount: number
): string {
  const rng = createRng(seed)
  const chars = text.split("")

  // Pre-compute resolve order (seeded, deterministic)
  const indices = chars.map((_, i) => i).filter((i) => {
    const ch = chars[i]
    return ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t"
  })
  // Shuffle with seeded rng
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  const resolveCount = Math.floor(progress * indices.length)
  const resolved = new Set(indices.slice(0, resolveCount))

  // Frame-based randomization for unresolved chars
  const frameRng = createRng(seed + frameCount * 7919)
  const glitchRate = intensity * (1 - progress)

  return chars
    .map((ch, i) => {
      if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") return ch
      if (resolved.has(i)) return ch
      if (frameRng() < glitchRate) {
        return GLITCH_CHARS[Math.floor(frameRng() * GLITCH_CHARS.length)]
      }
      return ch
    })
    .join("")
}

// -- Scramble (all chars randomize then resolve in random order)
function computeScramble(
  text: string,
  progress: number,
  seed: number,
  frameCount: number
): string {
  const rng = createRng(seed + 31)
  const chars = text.split("")

  const indices = chars.map((_, i) => i).filter((i) => {
    const ch = chars[i]
    return ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t"
  })
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  const resolveCount = Math.floor(progress * indices.length)
  const resolved = new Set(indices.slice(0, resolveCount))

  const frameRng = createRng(seed + frameCount * 3571)

  return chars
    .map((ch, i) => {
      if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") return ch
      if (resolved.has(i)) return ch
      return GLITCH_CHARS[Math.floor(frameRng() * GLITCH_CHARS.length)]
    })
    .join("")
}

// -- Boot Sequence (line-by-line terminal reveal)
function computeBoot(
  text: string,
  progress: number,
  cursorBlink: boolean,
  stagger: StaggerMode,
  frameCount: number
): string {
  const lines = text.split("\n")
  const totalLines = lines.length

  if (stagger === "byChar") {
    // Type out all lines char by char
    const totalChars = text.length
    const visibleCount = Math.floor(progress * totalChars)
    const visible = text.slice(0, visibleCount)
    const showCursor = cursorBlink && progress < 1 && Math.floor(frameCount / 15) % 2 === 0
    return visible + (showCursor ? "▌" : "")
  }

  // Default: by line (each line appears fully, one at a time)
  const visibleLines = Math.ceil(progress * totalLines)
  const result = lines.slice(0, visibleLines).join("\n")

  // Cursor on the last visible line
  const showCursor = cursorBlink && progress < 1 && Math.floor(frameCount / 15) % 2 === 0
  return result + (showCursor ? "▌" : "")
}

// -- Interference (noisy signal stabilization)
function computeInterference(
  text: string,
  progress: number,
  intensity: number,
  jitter: number,
  seed: number,
  frameCount: number
): { text: string; lineOffsets: number[] } {
  const distortion = (1 - progress) * intensity
  const rng = createRng(seed + frameCount * 1279)
  const lines = text.split("\n")

  const lineOffsets: number[] = []
  const resultLines: string[] = []

  for (let li = 0; li < lines.length; li++) {
    // Random horizontal shift per line
    const shift = Math.round((rng() - 0.5) * jitter * distortion * 4)
    lineOffsets.push(shift)

    const chars = lines[li].split("")
    const lineResult = chars
      .map((ch) => {
        if (ch === " " || ch === "\t") return ch
        if (rng() < distortion * 0.6) {
          // Replace with block/noise chars
          return rng() < 0.5
            ? BLOCK_CHARS[Math.floor(rng() * BLOCK_CHARS.length)]
            : GLITCH_CHARS[Math.floor(rng() * GLITCH_CHARS.length)]
        }
        return ch
      })
      .join("")

    resultLines.push(lineResult)
  }

  return { text: resultLines.join("\n"), lineOffsets }
}

// ─── Hover Effects ──────────────────────────────────────────────────

// ─── Hover Glitch (ported from original — event delegation + decay) ─

/**
 * Per-character hover glitch using event delegation.
 * Characters are wrapped in `<span data-ci={flatIndex}>`.
 * When cursor moves over a character, it and neighbours within `radius`
 * start cycling through random glitch characters.  Chars decay back
 * after `decayMs`.
 */
function useHoverGlitch(
  text: string,
  enabled: boolean,
  radius: number = 2,
  decayMs: number = 350,
  cycleMs: number = 60
) {
  const activeRef = useRef<Map<number, number>>(new Map())
  const [overrides, setOverrides] = useState<Map<number, string>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flatChars = useRef<string[]>([])
  const rowColOf = useRef<{ row: number; col: number }[]>([])

  useEffect(() => {
    const chars = text.split("")
    flatChars.current = chars
    const rc: { row: number; col: number }[] = []
    let row = 0, col = 0
    for (let i = 0; i < chars.length; i++) {
      rc.push({ row, col })
      if (chars[i] === "\n") { row++; col = 0 } else { col++ }
    }
    rowColOf.current = rc
  }, [text])

  const startCycling = useCallback(() => {
    if (intervalRef.current !== null) return
    intervalRef.current = setInterval(() => {
      const now = performance.now()
      const active = activeRef.current
      const chars = flatChars.current

      for (const [idx, expiry] of active) {
        if (now >= expiry) active.delete(idx)
      }

      if (active.size === 0) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        setOverrides(new Map())
        return
      }

      const next = new Map<number, string>()
      for (const idx of active.keys()) {
        const ch = chars[idx]
        if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") continue
        next.set(idx, GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)])
      }
      setOverrides(next)
    }, cycleMs)
  }, [cycleMs])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return

      const target = (e.target as HTMLElement).closest("[data-ci]") as HTMLElement | null
      if (!target) return

      const ci = parseInt(target.getAttribute("data-ci") || "", 10)
      if (isNaN(ci)) return

      const now = performance.now()
      const expiry = now + decayMs
      const rc = rowColOf.current
      const chars = flatChars.current

      if (!rc[ci]) return

      const { row: hoverRow, col: hoverCol } = rc[ci]

      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === "\n" || chars[i] === "\r") continue
        const { row: r, col: c } = rc[i]
        const dist = Math.abs(r - hoverRow) + Math.abs(c - hoverCol)
        if (dist <= radius) {
          const prob = 1 - dist / (radius + 1)
          if (Math.random() < prob) {
            activeRef.current.set(i, expiry)
          }
        }
      }

      startCycling()
    },
    [enabled, radius, decayMs, startCycling]
  )

  const handleMouseLeave = useCallback(() => {
    // Let existing chars decay naturally via their expiry timestamps
  }, [])

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      activeRef.current.clear()
      setOverrides(new Map())
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled])

  return { overrides, handleMouseMove, handleMouseLeave }
}

/**
 * Wraps every character in a <span data-ci={flatIndex}> for hover targeting.
 * Newlines emitted as raw "\n" to preserve whitespace layout.
 */
function renderHoverGlitchContent(
  text: string,
  overrides: Map<number, string>
): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let flatIndex = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\n") {
      nodes.push("\n")
    } else {
      const display = overrides.get(flatIndex) ?? ch
      nodes.push(
        <span key={flatIndex} data-ci={flatIndex}>
          {display}
        </span>
      )
    }
    flatIndex++
  }
  return nodes
}

/**
 * Renders text with per-line horizontal displacement.
 * Each line is wrapped in a <div> with translateX for the offset.
 */
function renderDisplacedLines(
  text: string,
  offsets: number[]
): React.ReactNode {
  const lines = text.split("\n")
  return lines.map((line, i) => {
    const offset = offsets[i] || 0
    return (
      <div
        key={i}
        style={
          offset !== 0
            ? { transform: `translateX(${offset}px)`, willChange: "transform" }
            : undefined
        }
      >
        {line}
      </div>
    )
  })
}

// ─── Global Hover Effects (CSS-based) ───────────────────────────────

function useGlobalHoverEffect(
  containerRef: React.RefObject<HTMLDivElement | null>,
  preRef: React.RefObject<HTMLPreElement | null>,
  hoverEffect: HoverEffect,
  hoverIntensity: number,
  text: string,
  seed: number,
  enabled: boolean
) {
  const [isHovering, setIsHovering] = useState(false)
  const [hoverFrame, setHoverFrame] = useState(0)
  const pointerY = useRef(-1)

  useEffect(() => {
    if (!enabled || hoverEffect === "none") return
    const el = containerRef.current
    if (!el) return

    const enter = () => setIsHovering(true)
    const leave = () => { setIsHovering(false); pointerY.current = -1 }
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      pointerY.current = e.clientY - rect.top
    }

    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    el.addEventListener("pointermove", move)
    return () => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
      el.removeEventListener("pointermove", move)
    }
  }, [enabled, hoverEffect, containerRef])

  // Animation tick — use RAF for smooth wave motion on displace, interval for text effects
  useEffect(() => {
    if (!isHovering || hoverEffect === "none") {
      setHoverFrame(0)
      return
    }

    if (hoverEffect === "displace") {
      // RAF for smooth wave animation
      let frame = 0
      let running = true
      let lastTick = 0
      const tick = (now: number) => {
        if (!running) return
        // ~30fps for smooth but not excessive updates
        if (now - lastTick >= 33) {
          frame++
          setHoverFrame(frame)
          lastTick = now
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      return () => { running = false }
    }

    // Text effects: ~15fps
    let frame = 0
    const iv = setInterval(() => {
      frame++
      setHoverFrame(frame)
    }, 66)
    return () => clearInterval(iv)
  }, [isHovering, hoverEffect])

  const hoverText = useMemo(() => {
    if (!isHovering || hoverEffect === "none") return null

    switch (hoverEffect) {
      case "glitch": {
        const rng = createRng(seed + hoverFrame * 7919)
        return text
          .split("")
          .map((ch) => {
            if (ch === " " || ch === "\n" || ch === "\r") return ch
            if (rng() < hoverIntensity * 0.3) {
              return GLITCH_CHARS[Math.floor(rng() * GLITCH_CHARS.length)]
            }
            return ch
          })
          .join("")
      }
      case "scramble": {
        const rng = createRng(seed + hoverFrame * 3571)
        return text
          .split("")
          .map((ch) => {
            if (ch === " " || ch === "\n" || ch === "\r") return ch
            if (rng() < hoverIntensity * 0.5) {
              return GLITCH_CHARS[Math.floor(rng() * GLITCH_CHARS.length)]
            }
            return ch
          })
          .join("")
      }
      default:
        return null
    }
  }, [isHovering, hoverEffect, hoverIntensity, text, seed, hoverFrame])

  // Per-line displacement offsets (px) for displace hover effect.
  // Creates a sine-wave ripple centered on the cursor Y position,
  // with smooth gaussian falloff — lines near cursor displace most.
  const displaceOffsets = useMemo((): number[] | null => {
    if (!isHovering || hoverEffect !== "displace") return null

    const pre = preRef.current
    if (!pre) return null

    const cs = getComputedStyle(pre)
    const fSize = parseFloat(cs.fontSize) || 14
    const lh = parseFloat(cs.lineHeight) || fSize
    const lines = text.split("\n")
    const py = pointerY.current

    const time = hoverFrame * 0.15 // wave phase advances with time
    const maxPx = hoverIntensity * 20 // max displacement in px
    const waveFreq = 0.8 // how tight the wave ripples are
    const falloffRadius = lh * 6 // lines within ~6 line-heights are affected

    return lines.map((_, i) => {
      const lineCenterY = i * lh + lh / 2
      const dist = Math.abs(lineCenterY - py)

      // Gaussian-ish falloff: 1 at cursor, ~0 at falloffRadius
      const falloff = Math.exp(-(dist * dist) / (2 * (falloffRadius * 0.45) ** 2))

      // Sine wave: ripples outward from cursor, phase advances with time
      const wave = Math.sin(time + (dist / lh) * waveFreq * Math.PI)

      return Math.round(wave * falloff * maxPx)
    })
  }, [isHovering, hoverEffect, hoverIntensity, text, hoverFrame, preRef])

  const hoverStyle = useMemo((): React.CSSProperties => {
    if (!isHovering) return {}

    switch (hoverEffect) {
      case "flicker": {
        const on = hoverFrame % 2 === 0
        return { opacity: on ? 1 : 1 - hoverIntensity * 0.6 }
      }
      default:
        return {}
    }
  }, [isHovering, hoverEffect, hoverIntensity, hoverFrame])

  return { hoverText, hoverStyle, displaceOffsets, isHovering }
}

// ─── Style Helper ───────────────────────────────────────────────────

function getTextStyle(props: AsciiFormatterProProps, effectiveFontSize: number): React.CSSProperties {
  const base: React.CSSProperties = {
    ...(props.font || DEFAULT_FONT),
    fontSize: effectiveFontSize,
    lineHeight: props.lineHeight,
    letterSpacing: props.letterSpacing,
    whiteSpace: props.preserveFormatting ? "pre" : "pre-wrap",
    textAlign: props.textAlign,
    margin: 0,
    padding: 0,
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    color: props.color,
  }

  if (props.fillType === "solid") return base

  const gradient =
    props.fillType === "linear"
      ? `linear-gradient(${props.gradientAngle}deg, ${props.gradientStart}, ${props.gradientEnd})`
      : `radial-gradient(circle, ${props.gradientStart}, ${props.gradientEnd})`

  return {
    ...base,
    background: gradient,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  }
}

// ─── RGB Split Helper ───────────────────────────────────────────────

function getRgbSplitStyle(
  amount: number,
  direction: GlitchDirection,
  active: boolean
): React.CSSProperties {
  if (!active || amount <= 0) return {}

  const h = direction === "vertical" ? 0 : amount
  const v = direction === "horizontal" ? 0 : amount

  return {
    textShadow: [
      `${h}px ${v}px rgba(255,0,0,0.7)`,
      `${-h}px ${-v}px rgba(0,100,255,0.7)`,
    ].join(", "),
  }
}

// ─── Jitter Transform ───────────────────────────────────────────────

function getJitterStyle(
  jitter: number,
  direction: GlitchDirection,
  frame: number,
  active: boolean
): React.CSSProperties {
  if (!active || jitter <= 0) return {}

  const rng = createRng(frame * 997 + 42)
  const x = direction === "vertical" ? 0 : (rng() - 0.5) * jitter * 2
  const y = direction === "horizontal" ? 0 : (rng() - 0.5) * jitter * 2

  return {
    transform: `translate(${x}px, ${y}px)`,
  }
}

// ─── Component ──────────────────────────────────────────────────────

export default function AsciiFormatterPro(props: AsciiFormatterProProps) {
  const {
    text,
    fontSizingMode,
    fontSize,
    appearEffect,
    trigger,
    repeatMode,
    duration,
    delay,
    stagger,
    staggerAmount,
    direction,
    repeatDelay,
    loopCount,
    intensity,
    frequency,
    seed,
    jitter,
    rgbSplit,
    glitchDirection,
    cursorBlink,
    hoverEffect,
    hoverScope,
    hoverRadius,
    hoverIntensity,
    retriggerOnHover,
    style,
  } = props

  // Detect Framer canvas — disable all animations
  let isCanvas = false
  try {
    isCanvas = RenderTarget.current() === RenderTarget.canvas
  } catch {
    // dev harness — allow animations
  }

  const active = !isCanvas && appearEffect !== "none"
  const containerRef = useRef<HTMLDivElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const [frameCount, setFrameCount] = useState(0)

  // Animation frame counter for text-manipulation effects
  useEffect(() => {
    if (!active && hoverEffect === "none") return

    let running = true
    let frame = 0

    // Throttle to ~30fps for text effects (no need for 60fps string manipulation)
    let lastTick = 0
    const interval = 1000 / (frequency > 0 ? Math.min(frequency, 60) : 30)

    const tick = (now: number) => {
      if (!running) return
      if (now - lastTick >= interval) {
        frame++
        setFrameCount(frame)
        lastTick = now
      }
      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
    return () => { running = false }
  }, [active, hoverEffect, frequency])

  // Playback engine
  const { progress } = usePlayback({
    enabled: active,
    duration,
    delay,
    repeatMode,
    repeatDelay,
    loopCount,
    trigger,
    containerRef,
    retriggerOnHover,
  })

  // Auto-fit font sizing (original approach: compute a font size, not a scale transform)
  const fontFamily = props.font?.fontFamily || "'Courier New', Courier, monospace"
  const autoFontSize = useAutoFitFontSize(
    containerRef,
    text,
    fontFamily,
    fontSize,
    props.letterSpacing,
    fontSizingMode === "auto"
  )
  const effectiveFontSize = autoFontSize

  // Determine whether the appear effect has completed
  const effectCompleted =
    appearEffect === "none" || progress >= 1

  // ── Hover: local (character-level, event-delegation) ──
  const localHoverActive = hoverEffect !== "none"
    && hoverScope === "local"
    && effectCompleted
    && !isCanvas
    && (hoverEffect === "glitch" || hoverEffect === "scramble")
  const hoverGlitchHook = useHoverGlitch(text, localHoverActive, hoverRadius, 350, 60)

  // ── Hover: global (CSS + text replacement) ──
  // flicker and displace are always global (no per-char variant)
  const isCssOnlyHover = hoverEffect === "flicker" || hoverEffect === "displace"
  const globalHoverActive = hoverEffect !== "none" && (hoverScope === "global" || isCssOnlyHover) && !isCanvas
  const { hoverText: globalHoverText, hoverStyle, displaceOffsets, isHovering: globalHovering } = useGlobalHoverEffect(
    containerRef,
    preRef,
    globalHoverActive ? hoverEffect : "none",
    hoverIntensity,
    text,
    seed,
    globalHoverActive
  )

  // ── Compute display text and styles ──

  const textEffects = useMemo(() => {
    if (!active) return { displayText: text, outerStyle: {} as React.CSSProperties, innerStyle: {} as React.CSSProperties, scanLine: null as React.CSSProperties | null }

    let displayText = text
    const outerStyle: React.CSSProperties = {}
    const innerStyle: React.CSSProperties = {}
    let scanLine: React.CSSProperties | null = null

    switch (appearEffect) {
      case "fade":
        Object.assign(innerStyle, computeFade(progress))
        break

      case "reveal":
        Object.assign(outerStyle, computeReveal(progress, direction, seed))
        break

      case "typing": {
        const typed = computeTyping(text, progress, stagger, staggerAmount)
        displayText = typed.visible
        break
      }

      case "glitch":
        displayText = computeGlitch(text, progress, intensity, seed, frameCount)
        break

      case "scramble":
        displayText = computeScramble(text, progress, seed, frameCount)
        break

      case "scan": {
        const { clip, scanLineStyle } = computeScan(progress, direction)
        Object.assign(outerStyle, clip)
        scanLine = scanLineStyle
        break
      }

      case "boot":
        displayText = computeBoot(text, progress, cursorBlink, stagger, frameCount)
        break

      case "interference": {
        const result = computeInterference(text, progress, intensity, jitter, seed, frameCount)
        displayText = result.text
        break
      }
    }

    return { displayText, outerStyle, innerStyle, scanLine }
  }, [active, appearEffect, text, progress, direction, seed, frameCount, intensity, jitter, stagger, staggerAmount, cursorBlink])

  // Apply global hover text override when hovering (and appear effect is complete)
  const displayText = globalHovering && globalHoverText !== null && effectCompleted
    ? globalHoverText
    : textEffects.displayText

  // Hidden text for layout stability (typing + boot)
  // Keeps the pre's dimensions stable as content progressively reveals
  let layoutHidden = ""
  if (active && progress < 1) {
    if (appearEffect === "typing") {
      layoutHidden = computeTyping(text, progress, stagger, staggerAmount).hidden
    } else if (appearEffect === "boot") {
      // Boot reveals lines/chars progressively — hide the remaining text
      const visible = textEffects.displayText.replace(/▌$/, "") // strip cursor
      const remaining = text.slice(visible.length)
      if (remaining) layoutHidden = remaining
    }
  }

  // RGB split + jitter (active during glitch/interference effects or hover glitch)
  const isGlitchActive = (active && (appearEffect === "glitch" || appearEffect === "interference") && progress < 1)
    || (globalHovering && (hoverEffect === "glitch" || hoverEffect === "scramble"))
  const rgbStyle = getRgbSplitStyle(rgbSplit, glitchDirection, isGlitchActive)
  const jitterStyle = getJitterStyle(jitter, glitchDirection, frameCount, isGlitchActive)

  const textStyle = getTextStyle(props, effectiveFontSize)

  // Build content: local hover uses span-wrapped chars, displace uses per-line divs
  let content: React.ReactNode
  if (localHoverActive) {
    content = renderHoverGlitchContent(displayText, hoverGlitchHook.overrides)
  } else if (displaceOffsets && globalHovering && effectCompleted) {
    content = renderDisplacedLines(displayText, displaceOffsets)
  } else {
    content = displayText
  }

  return (
    <div
      ref={containerRef}
      style={{
        ...style,
        overflow: "hidden",
        width: "100%",
        height: "100%",
        position: "relative",
        ...textEffects.outerStyle,
        ...(globalHoverActive ? hoverStyle : {}),
      }}
    >
      <pre
        ref={preRef}
        style={{
          ...textStyle,
          ...textEffects.innerStyle,
          ...rgbStyle,
          ...jitterStyle,
        }}
        onMouseMove={localHoverActive ? hoverGlitchHook.handleMouseMove : undefined}
        onMouseLeave={localHoverActive ? hoverGlitchHook.handleMouseLeave : undefined}
      >
        {content}
        {layoutHidden && (
          <span style={{ visibility: "hidden" }}>{layoutHidden}</span>
        )}
      </pre>
      {textEffects.scanLine && (
        <div style={textEffects.scanLine} />
      )}
    </div>
  )
}

AsciiFormatterPro.defaultProps = {
  // Content
  text: DEFAULT_TEXT,
  font: DEFAULT_FONT,
  textAlign: "left" as TextAlign,
  // Typography
  fontSizingMode: "fixed" as FontSizingMode,
  fontSize: 14,
  lineHeight: 1,
  letterSpacing: 0,
  preserveFormatting: true,
  // Appearance
  fillType: "solid" as FillType,
  color: "#00FF41",
  gradientStart: "#00FF41",
  gradientEnd: "#0080FF",
  gradientAngle: 90,
  // Animation
  appearEffect: "none" as AppearEffect,
  trigger: "mount" as Trigger,
  repeatMode: "once" as RepeatMode,
  duration: 1,
  delay: 0,
  stagger: "none" as StaggerMode,
  staggerAmount: 0.05,
  direction: "left" as RevealDirection,
  repeatDelay: 0.5,
  loopCount: 0,
  // Effect Controls
  intensity: 0.8,
  frequency: 30,
  seed: 42,
  jitter: 2,
  rgbSplit: 0,
  glitchDirection: "horizontal" as GlitchDirection,
  cursorBlink: true,
  // Interaction
  hoverEffect: "none" as HoverEffect,
  hoverScope: "global" as HoverScope,
  hoverRadius: 3,
  hoverIntensity: 0.5,
  retriggerOnHover: false,
}

// ─── Property Controls ──────────────────────────────────────────────

// Helper types for conditional visibility
type P = AsciiFormatterProProps

const isEffectNone = (p: P) => p.appearEffect === "none"
const isGlitchLike = (p: P) =>
  p.appearEffect === "glitch" || p.appearEffect === "interference"
const isTextBased = (p: P) =>
  p.appearEffect === "typing" ||
  p.appearEffect === "scramble" ||
  p.appearEffect === "boot"
const hasDirection = (p: P) =>
  p.appearEffect === "reveal" || p.appearEffect === "scan"
const hasStagger = (p: P) => isTextBased(p)

addPropertyControls(AsciiFormatterPro, {
  // ━━━ Content ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  text: {
    type: ControlType.String,
    title: "ASCII Art",
    defaultValue: DEFAULT_TEXT,
    displayTextArea: true,
    placeholder: "Paste your ASCII art here...",
  },
  font: {
    //@ts-ignore — ControlType.Font is undocumented but functional in Framer
    type: ControlType.Font,
    controls: "basic",
    defaultFontType: "monospace",
  },
  textAlign: {
    type: ControlType.Enum,
    title: "Align",
    defaultValue: "left",
    options: ["left", "center", "right"],
    optionTitles: ["Left", "Center", "Right"],
    displaySegmentedControl: true,
  },

  // ━━━ Typography ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  fontSizingMode: {
    type: ControlType.Enum,
    title: "Sizing Mode",
    defaultValue: "fixed",
    options: ["fixed", "auto"],
    optionTitles: ["Fixed", "Auto Fit"],
    displaySegmentedControl: true,
  },
  fontSize: {
    type: ControlType.Number,
    title: "Font Size",
    defaultValue: 14,
    min: 4,
    max: 120,
    step: 1,
    unit: "px",
  },
  lineHeight: {
    type: ControlType.Number,
    title: "Line Height",
    defaultValue: 1,
    min: 0.5,
    max: 4,
    step: 0.05,
  },
  letterSpacing: {
    type: ControlType.Number,
    title: "Letter Spacing",
    defaultValue: 0,
    min: -5,
    max: 20,
    step: 0.5,
    unit: "px",
  },
  preserveFormatting: {
    type: ControlType.Boolean,
    title: "Preserve Format",
    defaultValue: true,
    enabledTitle: "On",
    disabledTitle: "Off",
  },

  // ━━━ Appearance ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  fillType: {
    type: ControlType.Enum,
    title: "Fill Type",
    defaultValue: "solid",
    options: ["solid", "linear", "radial"],
    optionTitles: ["Solid", "Linear", "Radial"],
    displaySegmentedControl: true,
  },
  color: {
    type: ControlType.Color,
    title: "Color",
    defaultValue: "#00FF41",
    hidden: (p: P) => p.fillType !== "solid",
  },
  gradientStart: {
    type: ControlType.Color,
    title: "Start Color",
    defaultValue: "#00FF41",
    hidden: (p: P) => p.fillType === "solid",
  },
  gradientEnd: {
    type: ControlType.Color,
    title: "End Color",
    defaultValue: "#0080FF",
    hidden: (p: P) => p.fillType === "solid",
  },
  gradientAngle: {
    type: ControlType.Number,
    title: "Angle",
    defaultValue: 90,
    min: 0,
    max: 360,
    step: 1,
    unit: "deg",
    hidden: (p: P) => p.fillType !== "linear",
  },

  // ━━━ Animation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  appearEffect: {
    type: ControlType.Enum,
    title: "Appear Effect",
    defaultValue: "none",
    options: ["none", "fade", "reveal", "typing", "glitch", "scramble", "scan", "boot", "interference"],
    optionTitles: ["None", "Fade In", "Directional Reveal", "Typing", "Glitch", "Scramble In", "Scan Reveal", "Boot Sequence", "Interference"],
  },
  trigger: {
    type: ControlType.Enum,
    title: "Trigger",
    defaultValue: "mount",
    options: ["mount", "hover", "viewport"],
    optionTitles: ["On Mount", "On Hover", "In Viewport"],
    hidden: isEffectNone,
  },
  duration: {
    type: ControlType.Number,
    title: "Duration",
    defaultValue: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: "s",
    hidden: isEffectNone,
  },
  delay: {
    type: ControlType.Number,
    title: "Delay",
    defaultValue: 0,
    min: 0,
    max: 5,
    step: 0.1,
    unit: "s",
    hidden: isEffectNone,
  },
  direction: {
    type: ControlType.Enum,
    title: "Direction",
    defaultValue: "left",
    options: ["left", "right", "top", "bottom", "centerOut", "random"],
    optionTitles: ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top", "Center Out", "Random"],
    hidden: (p: P) => !hasDirection(p),
  },
  stagger: {
    type: ControlType.Enum,
    title: "Stagger",
    defaultValue: "none",
    options: ["none", "byChar", "byLine"],
    optionTitles: ["None", "By Character", "By Line"],
    hidden: (p: P) => !hasStagger(p),
  },
  repeatMode: {
    type: ControlType.Enum,
    title: "Repeat",
    defaultValue: "once",
    options: ["once", "loop", "pingPong"],
    optionTitles: ["Play Once", "Loop", "Ping-Pong"],
    hidden: isEffectNone,
  },
  repeatDelay: {
    type: ControlType.Number,
    title: "Repeat Delay",
    defaultValue: 0.5,
    min: 0,
    max: 5,
    step: 0.1,
    unit: "s",
    hidden: (p: P) => isEffectNone(p) || p.repeatMode === "once",
  },
  loopCount: {
    type: ControlType.Number,
    title: "Loop Count",
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 1,
    displayStepper: true,
    hidden: (p: P) => isEffectNone(p) || p.repeatMode === "once",
  },

  // ━━━ Effect Controls ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  intensity: {
    type: ControlType.Number,
    title: "Intensity",
    defaultValue: 0.8,
    min: 0,
    max: 1,
    step: 0.05,
    hidden: (p: P) => !isGlitchLike(p),
  },
  frequency: {
    type: ControlType.Number,
    title: "Frequency",
    defaultValue: 30,
    min: 5,
    max: 60,
    step: 1,
    unit: "fps",
    hidden: (p: P) => !isGlitchLike(p) && !isTextBased(p),
  },
  seed: {
    type: ControlType.Number,
    title: "Seed",
    defaultValue: 42,
    min: 1,
    max: 9999,
    step: 1,
    hidden: (p: P) => p.appearEffect === "none" || p.appearEffect === "fade" || p.appearEffect === "reveal" || p.appearEffect === "typing",
  },
  jitter: {
    type: ControlType.Number,
    title: "Jitter",
    defaultValue: 2,
    min: 0,
    max: 20,
    step: 0.5,
    unit: "px",
    hidden: (p: P) => !isGlitchLike(p),
  },
  rgbSplit: {
    type: ControlType.Number,
    title: "RGB Split",
    defaultValue: 0,
    min: 0,
    max: 10,
    step: 0.5,
    unit: "px",
    hidden: (p: P) => !isGlitchLike(p),
  },
  glitchDirection: {
    type: ControlType.Enum,
    title: "Glitch Dir",
    defaultValue: "horizontal",
    options: ["horizontal", "vertical", "both"],
    optionTitles: ["Horizontal", "Vertical", "Both"],
    hidden: (p: P) => !isGlitchLike(p),
  },
  cursorBlink: {
    type: ControlType.Boolean,
    title: "Cursor Blink",
    defaultValue: true,
    enabledTitle: "On",
    disabledTitle: "Off",
    hidden: (p: P) => p.appearEffect !== "boot",
  },

  // ━━━ Interaction ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  hoverEffect: {
    type: ControlType.Enum,
    title: "Hover Effect",
    defaultValue: "none",
    options: ["none", "glitch", "scramble", "displace", "flicker"],
    optionTitles: ["None", "Glitch", "Scramble", "Displace", "Flicker"],
  },
  hoverScope: {
    type: ControlType.Enum,
    title: "Hover Scope",
    defaultValue: "global",
    options: ["global", "local"],
    optionTitles: ["Global", "Characters"],
    displaySegmentedControl: true,
    hidden: (p: P) => p.hoverEffect === "none" || p.hoverEffect === "displace" || p.hoverEffect === "flicker",
  },
  hoverRadius: {
    type: ControlType.Number,
    title: "Hover Radius",
    defaultValue: 3,
    min: 1,
    max: 10,
    step: 1,
    hidden: (p: P) => p.hoverEffect === "none" || p.hoverScope !== "local" || p.hoverEffect === "displace" || p.hoverEffect === "flicker",
  },
  hoverIntensity: {
    type: ControlType.Number,
    title: "Hover Intensity",
    defaultValue: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    hidden: (p: P) => p.hoverEffect === "none",
  },
  retriggerOnHover: {
    type: ControlType.Boolean,
    title: "Retrigger",
    defaultValue: false,
    enabledTitle: "On",
    disabledTitle: "Off",
    // Only relevant when the appear effect uses hover as its trigger
    hidden: (p: P) => p.trigger !== "hover" || p.appearEffect === "none",
  },
})
