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
type FillType = "solid"
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
type DisplaceDirection = "horizontal" | "vertical"
type TextAlign = "left" | "center" | "right"
type FontSizingMode = "fixed" | "auto"
type ContentMode = "single" | "sequence"
type PlaybackMode = "autoPlay" | "hover" | "viewport"
// FrameTransition type removed — appearEffect now drives frame transitions directly

interface AsciiFormatterProProps {
  // Content
  text: string
  font: Font
  textAlign: TextAlign
  // Sequence
  contentMode: ContentMode
  frames: string[]
  playbackMode: PlaybackMode
  autoPlaySpeed: number
  pauseOnHover: boolean
  // Typography
  fontSizingMode: FontSizingMode
  fontSize: number
  lineHeight: number
  letterSpacing: number
  // Appearance
  fillType: FillType
  color: string
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
  displaceDirection: DisplaceDirection
  hoverRadius: number
  hoverFalloff: number
  hoverIntensity: number
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
      if (!started) {
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
  }, [enabled, trigger, started])

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
  lineHeight: number,
  enabled: boolean
): number {
  const [computedSize, setComputedSize] = useState(maxFontSize)
  const fontFamilyRef = useRef(fontFamily)
  fontFamilyRef.current = fontFamily

  const { longestLineLen, lineCount } = useMemo(() => {
    const lines = text.split("\n")
    return {
      longestLineLen: Math.max(...lines.map((l) => l.length), 1),
      lineCount: Math.max(lines.length, 1),
    }
  }, [text])

  const calculate = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const containerWidth = el.clientWidth
    const containerHeight = el.clientHeight
    if (containerWidth <= 0 || containerHeight <= 0) return

    const charWidthAtRef = getCharWidth(fontFamilyRef.current)
    if (charWidthAtRef <= 0) return

    // Width-based: font size that fits the longest line horizontally
    const widthBased =
      (containerWidth / longestLineLen - letterSpacing) *
      (REF_SIZE / charWidthAtRef)

    // Height-based: font size that fits all lines vertically
    const heightBased = containerHeight / (lineCount * lineHeight)

    // Use the smaller to fit both dimensions
    const raw = Math.min(widthBased, heightBased)
    const clamped = Math.max(1, Math.min(raw, 500))
    setComputedSize((prev) => prev === clamped ? prev : clamped)
  }, [containerRef, longestLineLen, lineCount, letterSpacing, lineHeight])

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

// ─── Frame Normalization ─────────────────────────────────────────────
// Pads all frames to the same width/height so transitions don't cause layout shifts.

function normalizeFrames(frames: string[]): string[] {
  let maxWidth = 0
  let maxHeight = 0

  const parsed = frames.map((f) => {
    const lines = f.split("\n")
    maxHeight = Math.max(maxHeight, lines.length)
    for (const line of lines) maxWidth = Math.max(maxWidth, line.length)
    return lines
  })

  return parsed.map((lines) => {
    const padded: string[] = []
    for (let i = 0; i < maxHeight; i++) {
      const line = lines[i] || ""
      padded.push(line + " ".repeat(maxWidth - line.length))
    }
    return padded.join("\n")
  })
}

// ─── Sequence Playback ──────────────────────────────────────────────

function useSequencePlayback(config: {
  enabled: boolean
  frameCount: number
  playbackMode: PlaybackMode
  autoPlaySpeed: number
  appearEffect: AppearEffect
  repeatMode: RepeatMode
  initialAppearDone: boolean
  pauseOnHover: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const {
    enabled,
    frameCount,
    playbackMode,
    autoPlaySpeed,
    appearEffect,
    repeatMode,
    initialAppearDone,
    pauseOnHover,
    containerRef,
  } = config

  // When "Play Once" and initial appear is done, simplify frame transitions:
  //   none → none (instant), fade → fade, everything else → scramble
  const effectiveEffect: AppearEffect =
    repeatMode === "once" && initialAppearDone
      ? (appearEffect === "none" ? "none"
        : appearEffect === "fade" ? "fade"
        : "scramble")
      : appearEffect

  // Transition duration varies by effect type
  const transitionDuration =
    effectiveEffect === "none" ? 0
    : effectiveEffect === "fade" ? 0.3
    : effectiveEffect === "typing" || effectiveEffect === "boot" ? 0.6
    : 0.4 // reveal, glitch, scramble, scan, interference

  const [activeFrame, setActiveFrame] = useState(0)
  // Transition progress: 0 = showing current frame, 1 = fully transitioned to next
  const [transProgress, setTransProgress] = useState(1)
  const [prevFrame, setPrevFrame] = useState(0)
  const transStartRef = useRef(0)
  const viewportTriggered = useRef(false)
  const hoverActiveRef = useRef(false)
  const autoTimerRef = useRef(0)
  const [paused, setPaused] = useState(false)

  const maxFrame = Math.max(frameCount - 1, 0)

  // Shared advance: for "none" (instant), skip the transProgress=0 intermediate
  // render to avoid a 1-frame flash/lag
  const advanceFrame = useCallback(() => {
    setActiveFrame((prev) => {
      const next = (prev + 1) % (maxFrame + 1)
      setPrevFrame(prev)
      if (effectiveEffect === "none") {
        setTransProgress(1)
      } else {
        setTransProgress(0)
        transStartRef.current = performance.now()
      }
      return next
    })
  }, [maxFrame, effectiveEffect])

  // Pause on hover (for autoPlay mode)
  useEffect(() => {
    if (!enabled || playbackMode !== "autoPlay" || !pauseOnHover) return
    const el = containerRef.current
    if (!el) return

    const enter = () => setPaused(true)
    const leave = () => setPaused(false)

    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
      setPaused(false)
    }
  }, [enabled, playbackMode, pauseOnHover, containerRef])

  // Auto play
  useEffect(() => {
    if (!enabled || playbackMode !== "autoPlay" || paused) return

    const intervalMs = autoPlaySpeed * 1000
    autoTimerRef.current = window.setInterval(advanceFrame, intervalMs)
    return () => window.clearInterval(autoTimerRef.current)
  }, [enabled, playbackMode, autoPlaySpeed, maxFrame, paused, advanceFrame])

  // Hover mode
  useEffect(() => {
    if (!enabled || playbackMode !== "hover") return
    const el = containerRef.current
    if (!el) return

    const enter = () => {
      hoverActiveRef.current = true
      advanceFrame()
    }
    const leave = () => {
      hoverActiveRef.current = false
    }

    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
    }
  }, [enabled, playbackMode, maxFrame, containerRef, advanceFrame])

  // Viewport mode
  useEffect(() => {
    if (!enabled || playbackMode !== "viewport") return
    const el = containerRef.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !viewportTriggered.current) {
          viewportTriggered.current = true
          // Start auto-advancing through all frames
          let frame = 0
          const advanceInterval = window.setInterval(() => {
            frame++
            if (frame > maxFrame) {
              window.clearInterval(advanceInterval)
              return
            }
            advanceFrame()
          }, autoPlaySpeed * 1000)
        }
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [enabled, playbackMode, maxFrame, autoPlaySpeed, containerRef])

  // Transition animation
  useEffect(() => {
    if (transProgress >= 1) return
    if (effectiveEffect === "none") {
      setTransProgress(1)
      return
    }

    let running = true
    const durMs = transitionDuration * 1000
    const tick = (now: number) => {
      if (!running) return
      const elapsed = now - transStartRef.current
      const p = Math.min(elapsed / durMs, 1)
      setTransProgress(p)
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => { running = false }
  }, [transProgress, effectiveEffect, transitionDuration])

  return { activeFrame, prevFrame, transProgress, appearEffect: effectiveEffect }
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

/**
 * Renders text with per-column vertical displacement.
 * Each character is wrapped in an inline-block span with translateY
 * based on its column's offset. Creates a column-wave effect.
 */
function renderDisplacedColumns(
  text: string,
  columnOffsets: number[]
): React.ReactNode {
  const lines = text.split("\n")
  return lines.map((line, row) => (
    <div key={row}>
      {line.length === 0
        ? "\u00A0" // preserve empty line height
        : Array.from(line).map((ch, col) => {
            const offset = columnOffsets[col] || 0
            if (offset !== 0) {
              return (
                <span
                  key={col}
                  style={{
                    display: "inline-block",
                    transform: `translateY(${offset}px)`,
                    willChange: "transform",
                  }}
                >
                  {ch}
                </span>
              )
            }
            // No offset — render plain char (but still inline-block to keep grid alignment)
            return (
              <span key={col} style={{ display: "inline-block" }}>
                {ch}
              </span>
            )
          })}
    </div>
  ))
}

/**
 * Renders text with per-character horizontal displacement.
 * Characters with non-zero offsets get inline-block spans with translateX.
 * Consecutive zero-offset characters are batched into single text nodes
 * to minimize React element count.
 */
function renderLocalDisplacedChars(
  text: string,
  offsets: Float32Array
): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let idx = 0
  let batch = "" // accumulates consecutive zero-offset chars

  const flushBatch = () => {
    if (batch) {
      nodes.push(batch)
      batch = ""
    }
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\n") {
      flushBatch()
      nodes.push("\n")
      idx++
      continue
    }
    const offset = offsets[idx] || 0
    if (offset !== 0) {
      flushBatch()
      nodes.push(
        <span
          key={i}
          style={{
            display: "inline-block",
            transform: `translateX(${offset}px)`,
            willChange: "transform",
          }}
        >
          {ch}
        </span>
      )
    } else {
      batch += ch
    }
    idx++
  }
  flushBatch()
  return nodes
}

// ─── Global Hover Effects (CSS-based) ───────────────────────────────

function useGlobalHoverEffect(
  containerRef: React.RefObject<HTMLDivElement | null>,
  preRef: React.RefObject<HTMLPreElement | null>,
  hoverEffect: HoverEffect,
  hoverScope: HoverScope,
  displaceDirection: DisplaceDirection,
  hoverRadius: number,
  hoverFalloff: number,
  hoverIntensity: number,
  text: string,
  seed: number,
  enabled: boolean
) {
  const [isHovering, setIsHovering] = useState(false)
  const [hoverFrame, setHoverFrame] = useState(0)
  const pointerX = useRef(-1)
  const pointerY = useRef(-1)

  // Cache computed style measurements to avoid getComputedStyle every frame
  const measuredRef = useRef({ fSize: 14, lh: 14, charW: 8.4 })
  useEffect(() => {
    const pre = preRef.current
    if (!pre) return
    const cs = getComputedStyle(pre)
    const fSize = parseFloat(cs.fontSize) || 14
    const lh = parseFloat(cs.lineHeight) || fSize
    measuredRef.current = { fSize, lh, charW: fSize * 0.6 }
  }) // runs after every render — cheap read from ref, getComputedStyle only once per render cycle

  useEffect(() => {
    if (!enabled || hoverEffect === "none") return
    const el = containerRef.current
    if (!el) return

    const enter = () => setIsHovering(true)
    const leave = () => { setIsHovering(false); pointerX.current = -1; pointerY.current = -1 }
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      pointerX.current = e.clientX - rect.left
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

  // Per-line horizontal displacement offsets (global displace, horizontal mode).
  // Creates a sine-wave ripple centered on cursor Y, gaussian falloff.
  const displaceOffsets = useMemo((): number[] | null => {
    if (!isHovering || hoverEffect !== "displace" || hoverScope === "local") return null
    if (displaceDirection === "vertical") return null // handled by column offsets

    const { lh } = measuredRef.current
    const lines = text.split("\n")
    const py = pointerY.current

    const time = hoverFrame * 0.15
    const maxPx = hoverIntensity * 150
    const waveFreq = 0.8
    const falloffRadius = lh * 6
    // sigma: hoverFalloff 0 = sharp edge (0.15), 1 = very soft (0.9)
    const sigma = falloffRadius * (0.15 + hoverFalloff * 0.75)

    return lines.map((_, i) => {
      const lineCenterY = i * lh + lh / 2
      const dist = Math.abs(lineCenterY - py)
      const falloff = Math.exp(-(dist * dist) / (2 * sigma * sigma))
      const wave = Math.sin(time + (dist / lh) * waveFreq * Math.PI)
      return Math.round(wave * falloff * maxPx)
    })
  }, [isHovering, hoverEffect, hoverScope, displaceDirection, hoverIntensity, hoverFalloff, text, hoverFrame])

  // Per-column vertical displacement offsets (global displace, vertical mode).
  // Creates a sine-wave ripple centered on cursor X, gaussian falloff.
  // Each column of characters shifts up/down independently.
  const displaceColumnOffsets = useMemo((): number[] | null => {
    if (!isHovering || hoverEffect !== "displace" || hoverScope === "local") return null
    if (displaceDirection !== "vertical") return null

    const { charW } = measuredRef.current
    const lines = text.split("\n")
    const maxCols = Math.max(...lines.map((l) => l.length))
    const px = pointerX.current

    const time = hoverFrame * 0.15
    const maxPx = hoverIntensity * 150
    const waveFreq = 0.8
    const falloffRadius = charW * 15
    // sigma: hoverFalloff 0 = sharp edge (0.15), 1 = very soft (0.9)
    const sigma = falloffRadius * (0.15 + hoverFalloff * 0.75)

    const offsets: number[] = []
    for (let col = 0; col < maxCols; col++) {
      const colCenterX = col * charW + charW / 2
      const dist = Math.abs(colCenterX - px)
      const falloff = Math.exp(-(dist * dist) / (2 * sigma * sigma))
      const wave = Math.sin(time + (dist / charW) * waveFreq * Math.PI)
      offsets.push(Math.round(wave * falloff * maxPx))
    }
    return offsets
  }, [isHovering, hoverEffect, hoverScope, displaceDirection, hoverIntensity, hoverFalloff, text, hoverFrame])

  // Per-character displacement offsets (local displace mode).
  // Each character near the cursor gets an individual horizontal shift.
  // Optimized: skips entire rows outside the effect radius, uses cached measurements.
  const localDisplaceData = useMemo((): { offsets: Float32Array; charW: number; lineH: number } | null => {
    if (!isHovering || hoverEffect !== "displace" || hoverScope !== "local") return null
    if (pointerX.current < 0) return null

    const { lh, charW } = measuredRef.current

    const px = pointerX.current
    const py = pointerY.current
    const time = hoverFrame * 0.15
    const maxPx = hoverIntensity * 150
    const radiusPx = hoverRadius * charW // convert char-units to px
    const waveFreq = 0.6
    // sigma: hoverFalloff 0 = sharp edge (0.15), 1 = very soft (0.9)
    const sigma = radiusPx * (0.15 + hoverFalloff * 0.75)
    // Pre-compute for gaussian: -1 / (2 * sigma^2)
    const invTwoSigmaSq = -1 / (2 * sigma * sigma)
    const effectRadius = radiusPx * 2 // extend check beyond radius for soft falloff

    const lines = text.split("\n")
    const totalChars = text.length // including newlines
    const offsets = new Float32Array(totalChars)
    let idx = 0

    for (let row = 0; row < lines.length; row++) {
      const line = lines[row]
      const lineCenterY = row * lh + lh / 2
      const dy = lineCenterY - py
      const absDy = Math.abs(dy)

      // Skip entire row if too far from cursor Y — no chars in this row can be affected
      if (absDy > effectRadius) {
        idx += line.length + 1 // skip all chars + newline
        continue
      }

      const dySq = dy * dy

      for (let col = 0; col < line.length; col++) {
        const cx = col * charW + charW / 2
        const dx = cx - px
        const distSq = dx * dx + dySq
        const dist = Math.sqrt(distSq)

        if (dist < effectRadius) {
          const falloff = Math.exp(distSq * invTwoSigmaSq)
          const wave = Math.sin(time + (dist / charW) * waveFreq * Math.PI)
          offsets[idx] = Math.round(wave * falloff * maxPx)
        }
        idx++
      }
      idx++ // newline
    }

    return { offsets, charW, lineH: lh }
  }, [isHovering, hoverEffect, hoverScope, hoverIntensity, hoverFalloff, hoverRadius, text, hoverFrame])

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

  return { hoverText, hoverStyle, displaceOffsets, displaceColumnOffsets, localDisplaceData, isHovering }
}

// ─── Scramble Transition ─────────────────────────────────────────────
// Blends two text frames via character-level scramble: chars from prevText
// scramble through random glitch chars and resolve to nextText.
function computeScrambleTransition(
  prevText: string,
  nextText: string,
  progress: number,
  seed: number,
  frameCount: number
): string {
  // Pad to same length
  const maxLen = Math.max(prevText.length, nextText.length)
  const prev = prevText.padEnd(maxLen)
  const next = nextText.padEnd(maxLen)

  const rng = createRng(seed + 9973)
  // Build resolve order
  const indices: number[] = []
  for (let i = 0; i < maxLen; i++) {
    if (next[i] !== " " || prev[i] !== " ") indices.push(i)
  }
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  const resolveCount = Math.floor(progress * indices.length)
  const resolved = new Set(indices.slice(0, resolveCount))

  const frameRng = createRng(seed + frameCount * 4517)
  const chars: string[] = []

  for (let i = 0; i < maxLen; i++) {
    if (prev[i] === "\n" || next[i] === "\n") {
      chars.push("\n")
      continue
    }
    if (resolved.has(i)) {
      chars.push(next[i])
    } else if (prev[i] === " " && next[i] === " ") {
      chars.push(" ")
    } else {
      chars.push(GLITCH_CHARS[Math.floor(frameRng() * GLITCH_CHARS.length)])
    }
  }

  return chars.join("")
}

// ─── Style Helper ───────────────────────────────────────────────────

function getTextStyle(props: AsciiFormatterProProps, effectiveFontSize: number): React.CSSProperties {
  const base: React.CSSProperties = {
    ...(props.font || DEFAULT_FONT),
    fontSize: effectiveFontSize,
    lineHeight: props.lineHeight,
    letterSpacing: props.letterSpacing,
    whiteSpace: "pre",
    textAlign: props.textAlign,
    margin: 0,
    padding: 0,
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    color: props.color,
  }

  return base
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
    contentMode,
    frames: framesProp,
    playbackMode,
    autoPlaySpeed,
    pauseOnHover,
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
    hoverFalloff,
    hoverIntensity,
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

  // ── Sequence mode: build frames array ──
  const isSequence = contentMode === "sequence"
  const rawFrames = useMemo(() => {
    if (!isSequence) return [text]
    if (!framesProp || framesProp.length === 0) return [text]
    return framesProp.map((f) => f || "")
  }, [isSequence, text, framesProp])

  const frames = useMemo(() => {
    if (!isSequence) return rawFrames
    return normalizeFrames(rawFrames)
  }, [isSequence, rawFrames])

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

  // Playback engine (appear effect progress) — must come before useSequencePlayback
  // so we can derive initialAppearDone for simplified frame transitions
  const { progress } = usePlayback({
    enabled: active,
    duration,
    delay,
    repeatMode,
    repeatDelay,
    loopCount,
    trigger,
    containerRef,
  })

  const initialAppearDone = appearEffect === "none" || progress >= 1

  // Sequence playback
  const seq = useSequencePlayback({
    enabled: isSequence && !isCanvas,
    frameCount: frames.length,
    playbackMode,
    autoPlaySpeed,
    appearEffect,
    repeatMode,
    initialAppearDone,
    pauseOnHover,
    containerRef,
  })

  // Resolve the active text from sequence or single mode
  const seqText = useMemo(() => {
    if (!isSequence) return text
    return frames[seq.activeFrame] || frames[0] || ""
  }, [isSequence, text, frames, seq.activeFrame])

  // During a transition, compute blended/transitioning text using the appear effect
  const seqTransitioning = isSequence && seq.transProgress < 1
  const seqDisplayText = useMemo(() => {
    if (!seqTransitioning) return seqText
    const prevText = frames[seq.prevFrame] || ""
    const nextText = frames[seq.activeFrame] || ""
    const p = seq.transProgress

    switch (seq.appearEffect) {
      case "none":
        // Instant: show next text immediately
        return nextText

      case "fade":
      case "reveal":
      case "scan":
        // CSS-based effects: text switches to next, styles handle the visual transition
        return nextText

      case "typing": {
        const typed = computeTyping(nextText, p, stagger, staggerAmount)
        return typed.visible
      }

      case "glitch":
        return computeGlitch(nextText, p, intensity, seed, frameCount)

      case "scramble":
        return computeScrambleTransition(prevText, nextText, p, seed, frameCount)

      case "boot":
        return computeBoot(nextText, p, cursorBlink, stagger, frameCount)

      case "interference":
        return computeInterference(nextText, p, intensity, jitter, seed, frameCount).text

      default:
        return nextText
    }
  }, [seqTransitioning, seqText, frames, seq.prevFrame, seq.activeFrame, seq.appearEffect, seq.transProgress, seed, frameCount, stagger, staggerAmount, intensity, jitter, cursorBlink])

  // For auto-fit, use the longest frame text for stable sizing
  const autoFitText = useMemo(() => {
    if (!isSequence) return seqDisplayText
    // Use longest frame for consistent sizing across transitions
    let longest = ""
    for (const f of frames) {
      if (f.length > longest.length) longest = f
    }
    return longest || seqDisplayText
  }, [isSequence, frames, seqDisplayText])

  // Auto-fit font sizing (original approach: compute a font size, not a scale transform)
  const fontFamily = props.font?.fontFamily || "'Courier New', Courier, monospace"
  const autoFontSize = useAutoFitFontSize(
    containerRef,
    autoFitText,
    fontFamily,
    fontSize,
    props.letterSpacing,
    props.lineHeight,
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
  const hoverGlitchHook = useHoverGlitch(seqDisplayText, localHoverActive, hoverRadius, 350, 60)

  // ── Hover: global (CSS + text replacement) ──
  // flicker and displace are always global (no per-char variant)
  const isCssOnlyHover = hoverEffect === "flicker" || hoverEffect === "displace"
  const globalHoverActive = hoverEffect !== "none" && (hoverScope === "global" || isCssOnlyHover) && !isCanvas
  const { hoverText: globalHoverText, hoverStyle, displaceOffsets, displaceColumnOffsets, localDisplaceData, isHovering: globalHovering } = useGlobalHoverEffect(
    containerRef,
    preRef,
    globalHoverActive ? hoverEffect : "none",
    hoverScope,
    props.displaceDirection || "horizontal",
    hoverRadius,
    hoverFalloff,
    hoverIntensity,
    seqDisplayText,
    seed,
    globalHoverActive
  )

  // ── Compute display text and styles ──

  const textEffects = useMemo(() => {
    if (!active) return { displayText: seqDisplayText, outerStyle: {} as React.CSSProperties, innerStyle: {} as React.CSSProperties, scanLine: null as React.CSSProperties | null }

    let displayText = seqDisplayText
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
        const typed = computeTyping(seqDisplayText, progress, stagger, staggerAmount)
        displayText = typed.visible
        break
      }

      case "glitch":
        displayText = computeGlitch(seqDisplayText, progress, intensity, seed, frameCount)
        break

      case "scramble":
        displayText = computeScramble(seqDisplayText, progress, seed, frameCount)
        break

      case "scan": {
        const { clip, scanLineStyle } = computeScan(progress, direction)
        Object.assign(outerStyle, clip)
        scanLine = scanLineStyle
        break
      }

      case "boot":
        displayText = computeBoot(seqDisplayText, progress, cursorBlink, stagger, frameCount)
        break

      case "interference": {
        const result = computeInterference(seqDisplayText, progress, intensity, jitter, seed, frameCount)
        displayText = result.text
        break
      }
    }

    return { displayText, outerStyle, innerStyle, scanLine }
  }, [active, appearEffect, seqDisplayText, progress, direction, seed, frameCount, intensity, jitter, stagger, staggerAmount, cursorBlink])

  // Apply global hover text override when hovering (and appear effect is complete)
  const displayText = globalHovering && globalHoverText !== null && effectCompleted
    ? globalHoverText
    : textEffects.displayText

  // Hidden text for layout stability (typing + boot)
  // Keeps the pre's dimensions stable as content progressively reveals
  let layoutHidden = ""
  if (active && progress < 1) {
    if (appearEffect === "typing") {
      layoutHidden = computeTyping(seqDisplayText, progress, stagger, staggerAmount).hidden
    } else if (appearEffect === "boot") {
      const visible = textEffects.displayText.replace(/▌$/, "") // strip cursor
      const remaining = seqDisplayText.slice(visible.length)
      if (remaining) layoutHidden = remaining
    }
  }
  // Also stabilize layout during sequence transitions with typing/boot
  if (seqTransitioning && !layoutHidden) {
    const nextText = frames[seq.activeFrame] || ""
    if (seq.appearEffect === "typing") {
      layoutHidden = computeTyping(nextText, seq.transProgress, stagger, staggerAmount).hidden
    } else if (seq.appearEffect === "boot") {
      const visible = seqDisplayText.replace(/▌$/, "")
      const remaining = nextText.slice(visible.length)
      if (remaining) layoutHidden = remaining
    }
  }

  // RGB split + jitter (active during glitch/interference effects or hover glitch)
  const isGlitchActive = (active && (appearEffect === "glitch" || appearEffect === "interference") && progress < 1)
    || (seqTransitioning && (seq.appearEffect === "glitch" || seq.appearEffect === "interference"))
    || (globalHovering && (hoverEffect === "glitch" || hoverEffect === "scramble"))
  const rgbStyle = getRgbSplitStyle(rgbSplit, glitchDirection, isGlitchActive)
  const jitterStyle = getJitterStyle(jitter, glitchDirection, frameCount, isGlitchActive)

  const textStyle = getTextStyle(props, effectiveFontSize)

  // Sequence transition styles (CSS-based effects: fade, reveal, scan)
  const seqTransOuter: React.CSSProperties = useMemo(() => {
    if (!seqTransitioning) return {}
    const p = seq.transProgress
    switch (seq.appearEffect) {
      case "reveal":
        return computeReveal(p, direction, seed)
      case "scan":
        return computeScan(p, direction).clip
      default:
        return {}
    }
  }, [seqTransitioning, seq.transProgress, seq.appearEffect, direction, seed])

  const seqTransInner: React.CSSProperties = useMemo(() => {
    if (!seqTransitioning) return {}
    if (seq.appearEffect === "fade") return { opacity: seq.transProgress, transition: "none" }
    return {}
  }, [seqTransitioning, seq.transProgress, seq.appearEffect])

  // Scan line during sequence transition
  const seqScanLine: React.CSSProperties | null = useMemo(() => {
    if (!seqTransitioning || seq.appearEffect !== "scan") return null
    return computeScan(seq.transProgress, direction).scanLineStyle
  }, [seqTransitioning, seq.transProgress, seq.appearEffect, direction])

  // Build content: local hover uses span-wrapped chars, displace uses per-line/per-char
  let content: React.ReactNode
  if (localHoverActive) {
    content = renderHoverGlitchContent(displayText, hoverGlitchHook.overrides)
  } else if (displaceOffsets && globalHovering && effectCompleted) {
    content = renderDisplacedLines(displayText, displaceOffsets)
  } else if (displaceColumnOffsets && globalHovering && effectCompleted) {
    content = renderDisplacedColumns(displayText, displaceColumnOffsets)
  } else if (localDisplaceData && globalHovering && effectCompleted) {
    content = renderLocalDisplacedChars(displayText, localDisplaceData.offsets)
  } else {
    content = displayText
  }

  // Merge clip-path styles (from reveal/scan effects) into a separate inner wrapper
  // so the outer container always receives pointer events for hover/viewport triggers.
  // clip-path clips both visuals AND hit areas, so applying it to the container
  // would prevent hover events from firing when the element starts fully clipped.
  const clipStyle: React.CSSProperties = {
    ...textEffects.outerStyle,
    ...seqTransOuter,
  }
  const hasClip = clipStyle.clipPath != null

  return (
    <div
      ref={containerRef}
      style={{
        overflow: "hidden",
        width: "100%",
        height: "100%",
        position: "relative",
        // Framer's style LAST so it can override width/height for FIT parents
        ...style,
        // Only apply non-clip outer styles directly (e.g. hover style)
        ...(hasClip ? {} : clipStyle),
        ...(globalHoverActive ? hoverStyle : {}),
      }}
    >
      {hasClip ? (
        <div style={{ ...clipStyle, width: "100%", height: "100%", position: "relative" }}>
          <pre
            ref={preRef}
            style={{
              ...textStyle,
              ...textEffects.innerStyle,
              ...rgbStyle,
              ...jitterStyle,
              ...seqTransInner,
            }}
            onMouseMove={localHoverActive ? hoverGlitchHook.handleMouseMove : undefined}
            onMouseLeave={localHoverActive ? hoverGlitchHook.handleMouseLeave : undefined}
          >
            {content}
            {layoutHidden && (
              <span style={{ visibility: "hidden" }}>{layoutHidden}</span>
            )}
          </pre>
          {(textEffects.scanLine || seqScanLine) && (
            <div style={textEffects.scanLine || seqScanLine!} />
          )}
        </div>
      ) : (
        <>
          <pre
            ref={preRef}
            style={{
              ...textStyle,
              ...textEffects.innerStyle,
              ...rgbStyle,
              ...jitterStyle,
              ...seqTransInner,
            }}
            onMouseMove={localHoverActive ? hoverGlitchHook.handleMouseMove : undefined}
            onMouseLeave={localHoverActive ? hoverGlitchHook.handleMouseLeave : undefined}
          >
            {content}
            {layoutHidden && (
              <span style={{ visibility: "hidden" }}>{layoutHidden}</span>
            )}
          </pre>
          {(textEffects.scanLine || seqScanLine) && (
            <div style={textEffects.scanLine || seqScanLine!} />
          )}
        </>
      )}
    </div>
  )
}

AsciiFormatterPro.defaultProps = {
  // Content
  text: DEFAULT_TEXT,
  font: DEFAULT_FONT,
  textAlign: "left" as TextAlign,
  // Sequence
  contentMode: "single" as ContentMode,
  frames: [DEFAULT_TEXT, ""],
  playbackMode: "autoPlay" as PlaybackMode,
  autoPlaySpeed: 1,
  pauseOnHover: false,
  // Typography
  fontSizingMode: "fixed" as FontSizingMode,
  fontSize: 14,
  lineHeight: 1,
  letterSpacing: 0,
  // Appearance
  fillType: "solid" as const,
  color: "#00FF41",
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
  displaceDirection: "horizontal" as DisplaceDirection,
  hoverRadius: 3,
  hoverFalloff: 0.3,
  hoverIntensity: 0.5,
}

// ─── Property Controls ──────────────────────────────────────────────

// Helper types for conditional visibility
type P = AsciiFormatterProProps

const isSingle = (p: P) => p.contentMode !== "sequence"
const isSeq = (p: P) => p.contentMode === "sequence"
const isEffectNone = (p: P) => p.appearEffect === "none"
const isGlitchLike = (p: P) =>
  p.appearEffect === "glitch" || p.appearEffect === "interference"
const isTextBased = (p: P) =>
  p.appearEffect === "typing" ||
  p.appearEffect === "scramble" ||
  p.appearEffect === "boot"
const hasDirection = (p: P) =>
  p.appearEffect === "reveal" || p.appearEffect === "scan"
const hasStagger = (p: P) =>
  p.appearEffect === "typing" || p.appearEffect === "boot"

addPropertyControls(AsciiFormatterPro, {
  // ━━━ Content ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  contentMode: {
    type: ControlType.Enum,
    title: "Mode",
    defaultValue: "single",
    options: ["single", "sequence"],
    optionTitles: ["Single Frame", "Sequence"],
    displaySegmentedControl: true,
  },
  text: {
    type: ControlType.String,
    title: "ASCII Art",
    defaultValue: DEFAULT_TEXT,
    displayTextArea: true,
    placeholder: "Paste your ASCII art here...",
    hidden: isSeq,
  },
  // Sequence frames (array with per-item add/remove/reorder)
  frames: {
    type: ControlType.Array,
    title: "Frames",
    defaultValue: [DEFAULT_TEXT, ""],
    maxCount: 15,
    hidden: isSingle,
    control: {
      type: ControlType.String,
      defaultValue: "",
      displayTextArea: true,
      placeholder: "ASCII art...",
    },
  },

  // ━━━ Typography ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  font: {
    //@ts-ignore — ControlType.Font is undocumented but functional in Framer
    type: ControlType.Font,
    controls: "basic",
    defaultFontType: "monospace",
    description: "Monospaced fonts are recommended for accurate ASCII layout.",
  },
  textAlign: {
    type: ControlType.Enum,
    title: "Align",
    defaultValue: "left",
    options: ["left", "center", "right"],
    optionTitles: ["Left", "Center", "Right"],
    displaySegmentedControl: true,
  },
  fontSizingMode: {
    type: ControlType.Enum,
    title: "Sizing Mode",
    description: "Auto Fit scales text to fill the container. Requires Fixed or Fill dimensions on the frame — won't work with Fit sizing.",
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

  // ━━━ Appearance ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  color: {
    type: ControlType.Color,
    title: "Color",
    defaultValue: "#00FF41",
  },

  // ━━━ Sequence ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  playbackMode: {
    type: ControlType.Enum,
    title: "Playback",
    defaultValue: "autoPlay",
    options: ["autoPlay", "hover", "viewport"],
    optionTitles: ["Auto Play", "Hover", "Viewport Enter"],
    hidden: isSingle,
  },
  autoPlaySpeed: {
    type: ControlType.Number,
    title: "Speed",
    defaultValue: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: "s",
    hidden: isSingle,
  },
  pauseOnHover: {
    type: ControlType.Boolean,
    title: "Pause on Hover",
    defaultValue: false,
    enabledTitle: "On",
    disabledTitle: "Off",
    hidden: (p: P) => isSingle(p) || p.playbackMode !== "autoPlay",
  },

  // ━━━ Animation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  appearEffect: {
    type: ControlType.Enum,
    title: "Appear Effect",
    defaultValue: "none",
    options: ["none", "fade", "reveal", "typing", "glitch", "scramble", "scan", "boot", "interference"],
    optionTitles: ["Instant", "Fade", "Directional Reveal", "Typing", "Glitch", "Scramble In", "Scan Reveal", "Boot Sequence", "Interference"],
  },
  trigger: {
    type: ControlType.Enum,
    title: "Appear Trigger",
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
    optionTitles: ["Play Once", "Constant", "Ping-Pong"],
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
    description: "Character mode is more performance-intensive, especially with dense ASCII art.",
    defaultValue: "global",
    options: ["global", "local"],
    optionTitles: ["Global", "Characters"],
    displaySegmentedControl: true,
    hidden: (p: P) => p.hoverEffect === "none" || p.hoverEffect === "flicker",
  },
  displaceDirection: {
    type: ControlType.Enum,
    title: "Direction",
    defaultValue: "horizontal",
    options: ["horizontal", "vertical"],
    optionTitles: ["Horizontal", "Vertical"],
    displaySegmentedControl: true,
    hidden: (p: P) => p.hoverEffect !== "displace" || p.hoverScope === "local",
  },
  hoverRadius: {
    type: ControlType.Number,
    title: "Hover Radius",
    defaultValue: 3,
    min: 1,
    max: 20,
    step: 1,
    hidden: (p: P) => p.hoverEffect === "none" || p.hoverScope !== "local" || p.hoverEffect === "flicker",
  },
  hoverFalloff: {
    type: ControlType.Number,
    title: "Falloff",
    defaultValue: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
    hidden: (p: P) => p.hoverEffect !== "displace",
  },
  hoverIntensity: {
    type: ControlType.Number,
    title: "Hover Intensity",
    defaultValue: 0.5,
    min: 0,
    max: 3,
    step: 0.05,
    hidden: (p: P) => p.hoverEffect === "none",
  },
})
