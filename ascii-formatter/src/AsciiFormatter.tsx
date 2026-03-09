import React, { useRef, useState, useEffect, useMemo } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useFadeEffect } from "./hooks/useFadeEffect"
import { useTypingEffect } from "./hooks/useTypingEffect"
import { useRevealEffect } from "./hooks/useRevealEffect"
import { useGlitchEffect } from "./hooks/useGlitchEffect"
import { useHoverGlitch } from "./hooks/useHoverGlitch"

interface AsciiFormatterProps {
  text: string
  font: "courier" | "consolas" | "firacode" | "jetbrains"
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
  hoverGlitch: boolean
  textAlign: "left" | "center" | "right"
  style?: React.CSSProperties
}

const FONT_MAP: Record<string, string> = {
  courier: "'Courier New', Courier, monospace",
  consolas: "'Consolas', monospace",
  firacode: "'Fira Code', monospace",
  jetbrains: "'JetBrains Mono', monospace",
}

const DEFAULT_TEXT = `  /\\_/\\
 ( o.o )
  > ^ <`

function getTextStyle(props: AsciiFormatterProps): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: FONT_MAP[props.font],
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
  }

  if (props.fillType === "solid") {
    return { ...base, color: props.textColor }
  }

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
    // Line-level reveal
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

  // left / right — character-column reveal
  const maxLen = Math.max(...lines.map((l) => l.length), 1)
  const revealedCols = Math.ceil(progress * maxLen)

  return lines.map((line, i) => {
    if (revealedCols >= line.length) {
      // Entire line visible
      return (
        <React.Fragment key={i}>
          {line}
          {i < lines.length - 1 ? "\n" : ""}
        </React.Fragment>
      )
    }
    if (revealedCols <= 0) {
      // Entire line hidden
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

/**
 * Wraps every character in a <span data-ci={flatIndex}> so the hover
 * glitch hook can target individual characters via event delegation.
 * Newlines are emitted as raw "\n" (no span wrapping) to preserve
 * whitespace layout.
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

export default function AsciiFormatter(props: AsciiFormatterProps) {
  const {
    text,
    effect,
    effectSpeed,
    effectDirection,
    trigger,
    hoverGlitch,
    style,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  // Disable animations on Framer canvas for performance
  let isCanvas = false
  try {
    isCanvas = RenderTarget.current() === RenderTarget.canvas
  } catch {
    // Outside Framer — allow animations (dev harness)
  }

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

  // All hooks run unconditionally (React rules)
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

  // Hover glitch: active only after the entry effect finishes, and not on canvas
  const hoverGlitchActive = hoverGlitch && triggered && effectCompleted && !isCanvas
  const hoverGlitchHook = useHoverGlitch(text, hoverGlitchActive)

  // Pick display content
  const displayText =
    activeEffect === "glitch"
      ? glitch.displayText
      : activeEffect === "typing"
        ? typing.visibleText
        : text

  const textStyle = getTextStyle(props)

  const innerEffectStyle: React.CSSProperties = {}
  if (activeEffect === "fade") {
    innerEffectStyle.opacity = fade.opacity
  }

  // Build content — reveal uses span-level visibility, others use plain text
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
    // After entry effect completes, wrap chars in spans for hover targeting
    content = renderHoverGlitchContent(displayText, hoverGlitchHook.overrides)
  } else {
    content = displayText
  }

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
        {content}
      </pre>
    </div>
  )
}

AsciiFormatter.defaultProps = {
  text: DEFAULT_TEXT,
  font: "courier",
  fontSize: 14,
  lineHeight: 1.2,
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
  hoverGlitch: false,
  textAlign: "left",
}

addPropertyControls(AsciiFormatter, {
  // --- Content ---
  text: {
    type: ControlType.String,
    title: "ASCII Art",
    defaultValue: DEFAULT_TEXT,
    displayTextArea: true,
    placeholder: "Paste your ASCII art here...",
  },

  // --- Typography ---
  font: {
    type: ControlType.Enum,
    title: "Font",
    defaultValue: "courier",
    options: ["courier", "consolas", "firacode", "jetbrains"],
    optionTitles: ["Courier New", "Consolas", "Fira Code", "JetBrains Mono"],
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
    defaultValue: 1.2,
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

  // --- Fill ---
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

  // --- Effects ---
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
    optionTitles: ["Left to Right", "Right to Left", "Top to Bottom", "Bottom to Top"],
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

  // --- Layout ---
  textAlign: {
    type: ControlType.Enum,
    title: "Text Align",
    defaultValue: "left",
    options: ["left", "center", "right"],
    optionTitles: ["Left", "Center", "Right"],
    displaySegmentedControl: true,
  },
})
