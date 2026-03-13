// ASCII Formatter — Framer Code Component
// Paste this entire file into Framer's code editor (Assets > Code > +)

import React, { useRef, useState, useEffect, useCallback } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// ─── Types ──────────────────────────────────────────────────────────

interface AsciiFormatterProps {
  text: string
  font: Record<string, any>
  fontSize: number
  lineHeight: number
  letterSpacing: number
  preserveWhitespace: boolean
  fillType: "solid" | "linear" | "radial"
  textColor: string
  gradientStart: string
  gradientEnd: string
  gradientAngle: number
  effect: "none" | "reveal" | "typing" | "fade" | "glitch"
  effectSpeed: number
  effectDirection: "left" | "right" | "top" | "bottom"
  trigger: "load" | "inView"
  fontSizing: "fixed" | "auto"
  hoverGlitch: boolean
  textAlign: "left" | "center" | "right"
  style?: React.CSSProperties
}

// ─── Constants ──────────────────────────────────────────────────────

const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`0123456789"

const DEFAULT_TEXT = `  /\\_/\\
 ( o.o )
  > ^ <`

// ─── Hooks ──────────────────────────────────────────────────────────

function useFadeEffect(enabled: boolean, speed: number) {
  const [opacity, setOpacity] = useState(enabled ? 0 : 1)

  useEffect(() => {
    if (!enabled) {
      setOpacity(1)
      return
    }
    setOpacity(0)
    const start = performance.now()
    const duration = speed * 1000
    let raf: number

    function animate(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      setOpacity(progress)
      if (progress < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [enabled, speed])

  return { opacity }
}

function useTypingEffect(text: string, enabled: boolean, speed: number) {
  const [visibleLength, setVisibleLength] = useState(
    enabled ? 0 : text.length
  )

  useEffect(() => {
    if (!enabled) {
      setVisibleLength(text.length)
      return
    }
    setVisibleLength(0)
    const totalChars = text.length
    if (totalChars === 0) return

    const interval = (speed * 1000) / totalChars
    let current = 0

    const timer = setInterval(() => {
      current++
      setVisibleLength(current)
      if (current >= totalChars) clearInterval(timer)
    }, interval)

    return () => clearInterval(timer)
  }, [text, enabled, speed])

  return {
    visibleText: text.slice(0, visibleLength),
    hiddenText: text.slice(visibleLength),
  }
}

/**
 * Returns a raw progress value (0–1) for the reveal animation.
 * Actual rendering uses span-level visibility: hidden — immune to
 * parent contain: strict, clip-path, and mask-image overrides.
 */
function useRevealEffect(
  enabled: boolean,
  speed: number,
  direction: string
) {
  const [progress, setProgress] = useState(enabled ? 0 : 1)

  useEffect(() => {
    if (!enabled) {
      setProgress(1)
      return
    }
    setProgress(0)
    const start = performance.now()
    const duration = speed * 1000
    let raf: number

    function animate(now: number) {
      const elapsed = now - start
      const p = Math.min(elapsed / duration, 1)
      setProgress(p)
      if (p < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [enabled, speed, direction])

  return { progress }
}

function useGlitchEffect(text: string, enabled: boolean, speed: number) {
  const [displayText, setDisplayText] = useState(text)

  useEffect(() => {
    if (!enabled) {
      setDisplayText(text)
      return
    }

    const chars = text.split("")
    const resolved = new Array(chars.length).fill(false)
    const duration = speed * 1000
    const start = performance.now()
    let raf: number

    function animate() {
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / duration, 1)

      const resolveCount = Math.floor(progress * chars.length)
      for (let i = 0; i < resolveCount; i++) {
        resolved[i] = true
      }

      const result = chars
        .map((ch, i) => {
          if (resolved[i] || ch === " " || ch === "\n" || ch === "\r")
            return ch
          return GLITCH_CHARS[
            Math.floor(Math.random() * GLITCH_CHARS.length)
          ]
        })
        .join("")

      setDisplayText(result)

      if (progress < 1) {
        raf = requestAnimationFrame(animate)
      } else {
        setDisplayText(text)
      }
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [text, enabled, speed])

  return { displayText }
}

// ─── Hover Glitch Hook ──────────────────────────────────────────────

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
  const textRef = useRef(text)
  textRef.current = text

  const flatChars = useRef<string[]>([])
  const rowColOf = useRef<{ row: number; col: number }[]>([])

  useEffect(() => {
    const chars = text.split("")
    flatChars.current = chars
    const rc: { row: number; col: number }[] = []
    let row = 0
    let col = 0
    for (let i = 0; i < chars.length; i++) {
      rc.push({ row, col })
      if (chars[i] === "\n") {
        row++
        col = 0
      } else {
        col++
      }
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
        next.set(
          idx,
          GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        )
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

  const handleMouseLeave = useCallback(() => {}, [])

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

// ─── Auto-Fit Font Size Hook ────────────────────────────────────────

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
  rootRef: React.RefObject<HTMLDivElement | null>,
  text: string,
  fontFamily: string,
  maxFontSize: number,
  letterSpacing: number,
  enabled: boolean
): number {
  const [computedSize, setComputedSize] = useState(maxFontSize)
  const fontFamilyRef = useRef(fontFamily)
  fontFamilyRef.current = fontFamily

  const longestLineLen = React.useMemo(() => {
    const lines = text.split("\n")
    return Math.max(...lines.map((l) => l.length), 1)
  }, [text])

  const calculate = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const containerWidth = el.clientWidth
    if (containerWidth <= 0) return

    const charWidthAtRef = getCharWidth(fontFamilyRef.current)
    if (charWidthAtRef <= 0) return

    const raw =
      (containerWidth / longestLineLen - letterSpacing) *
      (REF_SIZE / charWidthAtRef)

    setComputedSize(Math.max(1, Math.min(raw, 500)))
  }, [rootRef, longestLineLen, letterSpacing, maxFontSize])

  useEffect(() => {
    if (!enabled) {
      setComputedSize(maxFontSize)
      return
    }

    const el = rootRef.current
    if (!el) return

    calculate()

    const ro = new ResizeObserver(() => calculate())
    ro.observe(el)

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => calculate())
    }

    return () => ro.disconnect()
  }, [enabled, calculate, rootRef, maxFontSize])

  return enabled ? computedSize : maxFontSize
}

// ─── Style Helper ───────────────────────────────────────────────────

function getTextStyle(props: AsciiFormatterProps): React.CSSProperties {
  return {
    ...(props.font || {}),
    fontSize: props.fontSize,
    lineHeight: props.lineHeight,
    letterSpacing: props.letterSpacing,
    whiteSpace: props.preserveWhitespace ? "pre" : "pre-wrap",
    textAlign: props.textAlign,
    margin: 0,
    padding: 0,
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    color: props.fillType === "solid" ? props.textColor : "transparent",
  }
}

/** Gradient styles applied to an inner wrapper so the background only
 *  covers the text, not the full-size <pre> block.  This prevents the
 *  Framer canvas from showing a solid gradient rectangle. */
function getGradientStyle(props: AsciiFormatterProps): React.CSSProperties | null {
  if (props.fillType === "solid") return null

  const gradient =
    props.fillType === "linear"
      ? `linear-gradient(${props.gradientAngle}deg, ${props.gradientStart}, ${props.gradientEnd})`
      : `radial-gradient(circle, ${props.gradientStart}, ${props.gradientEnd})`

  return {
    background: gradient,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  }
}

// ─── Reveal Renderer ────────────────────────────────────────────────

/**
 * Renders the directional reveal using span-level visibility: hidden.
 *
 * This approach is immune to parent CSS containment (contain: strict),
 * clip-path, mask-image, and stacking context isolation — because it
 * controls each character/line's visibility directly in the DOM rather
 * than relying on any CSS visual effect that can be overridden.
 *
 * - top/bottom: reveals whole lines at a time
 * - left/right: reveals characters per line at a column threshold
 */
function renderReveal(
  text: string,
  progress: number,
  direction: string
): React.ReactNode {
  const lines = text.split("\n")

  if (direction === "top" || direction === "bottom") {
    const totalLines = lines.length
    const revealedCount = Math.ceil(progress * totalLines)

    return lines.map((line, i) => {
      const lineIndex = direction === "top" ? i : totalLines - 1 - i
      const visible = lineIndex < revealedCount
      return (
        <React.Fragment key={i}>
          {visible ? line : <span style={{ visibility: "hidden" }}>{line}</span>}
          {i < lines.length - 1 ? "\n" : ""}
        </React.Fragment>
      )
    })
  }

  const maxLen = Math.max(...lines.map((l) => l.length), 1)
  const revealedCols = Math.ceil(progress * maxLen)

  return lines.map((line, i) => {
    if (revealedCols >= line.length) {
      return (
        <React.Fragment key={i}>
          {line}
          {i < lines.length - 1 ? "\n" : ""}
        </React.Fragment>
      )
    }
    if (revealedCols <= 0) {
      return (
        <React.Fragment key={i}>
          <span style={{ visibility: "hidden" }}>{line}</span>
          {i < lines.length - 1 ? "\n" : ""}
        </React.Fragment>
      )
    }

    const splitAt =
      direction === "left" ? revealedCols : line.length - revealedCols
    const visiblePart =
      direction === "left" ? line.slice(0, splitAt) : line.slice(splitAt)
    const hiddenPart =
      direction === "left" ? line.slice(splitAt) : line.slice(0, splitAt)

    return (
      <React.Fragment key={i}>
        {direction === "left" ? (
          <>
            {visiblePart}
            <span style={{ visibility: "hidden" }}>{hiddenPart}</span>
          </>
        ) : (
          <>
            <span style={{ visibility: "hidden" }}>{hiddenPart}</span>
            {visiblePart}
          </>
        )}
        {i < lines.length - 1 ? "\n" : ""}
      </React.Fragment>
    )
  })
}

// ─── Hover Glitch Renderer ──────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────

export default function AsciiFormatter(props: AsciiFormatterProps) {
  const { text, effect, effectSpeed, effectDirection, trigger, hoverGlitch, style } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  const isCanvas = RenderTarget.current() === RenderTarget.canvas

  // Auto-fit font sizing
  const fontFamily = props.font?.fontFamily || "'Courier New', Courier, monospace"
  const autoFontSize = useAutoFitFontSize(
    rootRef,
    text,
    fontFamily,
    props.fontSize,
    props.letterSpacing,
    props.fontSizing === "auto"
  )

  // IntersectionObserver: one-shot trigger when ≥10% visible
  useEffect(() => {
    if (trigger !== "inView" || isCanvas) return
    const el = rootRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [trigger, isCanvas])

  const triggered = trigger === "load" || inView || isCanvas
  const activeEffect = isCanvas ? "none" : effect

  const fade = useFadeEffect(activeEffect === "fade" && triggered, effectSpeed)
  const typing = useTypingEffect(text, activeEffect === "typing" && triggered, effectSpeed)
  const reveal = useRevealEffect(
    activeEffect === "reveal" && triggered,
    effectSpeed,
    effectDirection
  )
  const glitch = useGlitchEffect(text, activeEffect === "glitch" && triggered, effectSpeed)

  // Determine whether the entry effect has finished
  const effectCompleted =
    activeEffect === "none" ||
    (activeEffect === "fade" && fade.opacity >= 1) ||
    (activeEffect === "typing" && typing.visibleText.length >= text.length) ||
    (activeEffect === "reveal" && reveal.progress >= 1) ||
    (activeEffect === "glitch" && glitch.displayText === text)

  // Hover glitch: active only after entry effect finishes, not on canvas
  const hoverGlitchActive = hoverGlitch && triggered && effectCompleted && !isCanvas
  const hoverGlitchHook = useHoverGlitch(text, hoverGlitchActive)

  const displayText =
    activeEffect === "glitch"
      ? glitch.displayText
      : activeEffect === "typing"
        ? typing.visibleText
        : text

  const textStyle = { ...getTextStyle(props), fontSize: autoFontSize }
  const gradientStyle = getGradientStyle(props)

  const innerEffectStyle: React.CSSProperties = {}
  if (activeEffect === "fade") {
    innerEffectStyle.opacity = fade.opacity
  }

  let content: React.ReactNode
  if (activeEffect === "reveal" && !effectCompleted) {
    content = renderReveal(text, reveal.progress, effectDirection)
  } else if (activeEffect === "typing" && !effectCompleted) {
    content = (
      <>
        {typing.visibleText}
        {typing.hiddenText && (
          <span style={{ visibility: "hidden" }}>{typing.hiddenText}</span>
        )}
      </>
    )
  } else if (hoverGlitchActive) {
    content = renderHoverGlitchContent(displayText, hoverGlitchHook.overrides)
  } else {
    content = displayText
  }

  // Wrap content in gradient span so background-clip: text only covers
  // the actual text, not the full-size <pre> block (fixes Framer canvas
  // showing a solid gradient rectangle).
  const wrappedContent = gradientStyle ? (
    <span style={gradientStyle}>{content}</span>
  ) : (
    content
  )

  return (
    <div
      ref={rootRef}
      style={{
        ...style,
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      <pre
        style={{ ...textStyle, ...innerEffectStyle }}
        onMouseMove={hoverGlitchActive ? hoverGlitchHook.handleMouseMove : undefined}
        onMouseLeave={hoverGlitchActive ? hoverGlitchHook.handleMouseLeave : undefined}
      >
        {wrappedContent}
      </pre>
    </div>
  )
}

AsciiFormatter.defaultProps = {
  text: DEFAULT_TEXT,
  font: { fontFamily: "'Courier New', Courier, monospace", fontWeight: 400 },
  fontSize: 14,
  lineHeight: 1,
  letterSpacing: 0,
  preserveWhitespace: true,
  fillType: "solid",
  textColor: "#00FF41",
  gradientStart: "#00FF41",
  gradientEnd: "#0080FF",
  gradientAngle: 90,
  effect: "none",
  effectSpeed: 1,
  effectDirection: "left",
  trigger: "load",
  fontSizing: "fixed",
  hoverGlitch: false,
  textAlign: "left",
}

// ─── Property Controls ──────────────────────────────────────────────

addPropertyControls(AsciiFormatter, {
  text: {
    type: ControlType.String,
    title: "ASCII Art",
    defaultValue: DEFAULT_TEXT,
    displayTextArea: true,
    placeholder: "Paste your ASCII art here...",
  },
  font: {
    //@ts-ignore — ControlType.Font is undocumented but functional
    type: ControlType.Font,
    controls: "basic",
    defaultFontType: "monospace",
  },
  fontSizing: {
    type: ControlType.Enum,
    title: "Font Sizing",
    defaultValue: "fixed",
    options: ["fixed", "auto"],
    optionTitles: ["Fixed", "Auto"],
    displaySegmentedControl: true,
  },
  fontSize: {
    type: ControlType.Number,
    title: "Font Size",
    defaultValue: 14,
    min: 8,
    max: 72,
    step: 1,
    unit: "px",
  },
  lineHeight: {
    type: ControlType.Number,
    title: "Line Height",
    defaultValue: 1,
    min: 0.8,
    max: 3,
    step: 0.1,
  },
  letterSpacing: {
    type: ControlType.Number,
    title: "Letter Spacing",
    defaultValue: 0,
    min: -2,
    max: 10,
    step: 0.5,
    unit: "px",
  },
  preserveWhitespace: {
    type: ControlType.Boolean,
    title: "Preserve Whitespace",
    defaultValue: true,
    enabledTitle: "On",
    disabledTitle: "Off",
  },
  fillType: {
    type: ControlType.Enum,
    title: "Fill Type",
    defaultValue: "solid",
    options: ["solid", "linear", "radial"],
    optionTitles: ["Solid", "Linear", "Radial"],
    displaySegmentedControl: true,
  },
  textColor: {
    type: ControlType.Color,
    title: "Color",
    defaultValue: "#00FF41",
    hidden(props: AsciiFormatterProps) {
      return props.fillType !== "solid"
    },
  },
  gradientStart: {
    type: ControlType.Color,
    title: "Start Color",
    defaultValue: "#00FF41",
    hidden(props: AsciiFormatterProps) {
      return props.fillType === "solid"
    },
  },
  gradientEnd: {
    type: ControlType.Color,
    title: "End Color",
    defaultValue: "#0080FF",
    hidden(props: AsciiFormatterProps) {
      return props.fillType === "solid"
    },
  },
  gradientAngle: {
    type: ControlType.Number,
    title: "Angle",
    defaultValue: 90,
    min: 0,
    max: 360,
    step: 1,
    unit: "deg",
    hidden(props: AsciiFormatterProps) {
      return props.fillType !== "linear"
    },
  },
  effect: {
    type: ControlType.Enum,
    title: "Effect",
    defaultValue: "none",
    options: ["none", "reveal", "typing", "fade", "glitch"],
    optionTitles: ["None", "Directional Reveal", "Typing", "Fade In", "Glitch"],
  },
  effectSpeed: {
    type: ControlType.Number,
    title: "Speed",
    defaultValue: 1,
    min: 0.1,
    max: 5,
    step: 0.1,
    unit: "s",
    hidden(props: AsciiFormatterProps) {
      return props.effect === "none"
    },
  },
  effectDirection: {
    type: ControlType.Enum,
    title: "Direction",
    defaultValue: "left",
    options: ["left", "right", "top", "bottom"],
    optionTitles: [
      "Left to Right",
      "Right to Left",
      "Top to Bottom",
      "Bottom to Top",
    ],
    hidden(props: AsciiFormatterProps) {
      return props.effect !== "reveal"
    },
  },
  trigger: {
    type: ControlType.Enum,
    title: "Trigger",
    defaultValue: "load",
    options: ["load", "inView"],
    optionTitles: ["On Load", "In View"],
    hidden(props: AsciiFormatterProps) {
      return props.effect === "none"
    },
  },
  hoverGlitch: {
    type: ControlType.Boolean,
    title: "Hover Glitch",
    defaultValue: false,
    enabledTitle: "On",
    disabledTitle: "Off",
  },
  textAlign: {
    type: ControlType.Enum,
    title: "Text Align",
    defaultValue: "left",
    options: ["left", "center", "right"],
    optionTitles: ["Left", "Center", "Right"],
    displaySegmentedControl: true,
  },
})
