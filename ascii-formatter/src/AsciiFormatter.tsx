import React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useFadeEffect } from "./hooks/useFadeEffect"
import { useTypingEffect } from "./hooks/useTypingEffect"
import { useRevealEffect } from "./hooks/useRevealEffect"
import { useGlitchEffect } from "./hooks/useGlitchEffect"

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

export default function AsciiFormatter(props: AsciiFormatterProps) {
  const {
    text,
    effect,
    effectSpeed,
    effectDirection,
    style,
  } = props

  // Disable animations on Framer canvas for performance
  let isCanvas = false
  try {
    isCanvas = RenderTarget.current() === RenderTarget.canvas
  } catch {
    // Outside Framer — allow animations (dev harness)
  }
  const activeEffect = isCanvas ? "none" : effect

  // All hooks run unconditionally (React rules)
  const fade = useFadeEffect(activeEffect === "fade", effectSpeed)
  const typing = useTypingEffect(text, activeEffect === "typing", effectSpeed)
  const reveal = useRevealEffect(
    activeEffect === "reveal",
    effectSpeed,
    effectDirection
  )
  const glitch = useGlitchEffect(text, activeEffect === "glitch", effectSpeed)

  // Pick display text
  const displayText =
    activeEffect === "glitch"
      ? glitch.displayText
      : activeEffect === "typing"
        ? typing.visibleText
        : text

  const textStyle = getTextStyle(props)

  // Effect styles — mask goes on the pre, fade on the pre
  const innerEffectStyle: React.CSSProperties = {}

  if (activeEffect === "reveal") {
    innerEffectStyle.WebkitMaskImage = reveal.WebkitMaskImage
    innerEffectStyle.maskImage = reveal.maskImage
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
