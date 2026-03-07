// ASCII Formatter — Framer Code Component
// Paste this entire file into Framer's code editor (Assets > Code > +)

import React, { useState, useEffect } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// ─── Types ──────────────────────────────────────────────────────────

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
  textAlign: "left" | "center" | "right"
  style?: React.CSSProperties
}

// ─── Constants ──────────────────────────────────────────────────────

const FONT_MAP: Record<string, string> = {
  courier: "'Courier New', Courier, monospace",
  consolas: "'Consolas', monospace",
  firacode: "'Fira Code', monospace",
  jetbrains: "'JetBrains Mono', monospace",
}

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

  const p = progress * 100
  let clipPath: string
  switch (direction) {
    case "right":
      clipPath = `inset(0 0 0 ${100 - p}%)`
      break
    case "top":
      clipPath = `inset(0 0 ${100 - p}% 0)`
      break
    case "bottom":
      clipPath = `inset(${100 - p}% 0 0 0)`
      break
    default:
      clipPath = `inset(0 ${100 - p}% 0 0)`
      break
  }

  return { clipPath }
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

// ─── Style Helper ───────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────

export default function AsciiFormatter(props: AsciiFormatterProps) {
  const { text, effect, effectSpeed, effectDirection, style } = props

  const isCanvas = RenderTarget.current() === RenderTarget.canvas
  const activeEffect = isCanvas ? "none" : effect

  const fade = useFadeEffect(activeEffect === "fade", effectSpeed)
  const typing = useTypingEffect(text, activeEffect === "typing", effectSpeed)
  const reveal = useRevealEffect(
    activeEffect === "reveal",
    effectSpeed,
    effectDirection
  )
  const glitch = useGlitchEffect(text, activeEffect === "glitch", effectSpeed)

  const displayText =
    activeEffect === "glitch"
      ? glitch.displayText
      : activeEffect === "typing"
        ? typing.visibleText
        : text

  const textStyle = getTextStyle(props)

  const outerEffectStyle: React.CSSProperties = {}
  const innerEffectStyle: React.CSSProperties = {}

  if (activeEffect === "reveal") {
    outerEffectStyle.clipPath = reveal.clipPath
  }
  if (activeEffect === "fade") {
    innerEffectStyle.opacity = fade.opacity
  }

  return (
    <div
      style={{
        ...style,
        overflow: "hidden",
        width: "100%",
        height: "100%",
        ...outerEffectStyle,
      }}
    >
      <pre style={{ ...textStyle, ...innerEffectStyle }}>
        {displayText}
        {activeEffect === "typing" && typing.hiddenText && (
          <span style={{ visibility: "hidden" }}>{typing.hiddenText}</span>
        )}
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
  textAlign: {
    type: ControlType.Enum,
    title: "Text Align",
    defaultValue: "left",
    options: ["left", "center", "right"],
    optionTitles: ["Left", "Center", "Right"],
    displaySegmentedControl: true,
  },
})
