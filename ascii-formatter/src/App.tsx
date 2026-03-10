import React, { useState } from "react"
import AsciiFormatter from "./AsciiFormatter"

const DEFAULT_ASCII = `  /\\_/\\
 ( o.o )
  > ^ <`

const SAMPLE_SKULLS = ` .     .       .  .   . .   .   . .    +  .
  .     .  :     .    .. :. .___---------___.
       .  .   .    .  :.:. _".^ .^ ^.  '.. :"-_. .
    .  :       .  .  .:../:            . .^  :.:\\.
        .   . :: +. :.:/: .   .    .        . . .:\\
 .  :    .     . _ gy__        .,googol...googol.,
  .. . .      . -./ ) a]        d]              .Y
  .      .  . _(googol)        d]  oOo          [b
 .   .:. . . "/ | ]           d]           d ]  Yb`

type FontOption = string
type FillOption = "solid" | "linear" | "radial"
type EffectOption = "none" | "reveal" | "typing" | "fade" | "glitch"
type DirectionOption = "left" | "right" | "top" | "bottom"
type TriggerOption = "load" | "inView"
type AlignOption = "left" | "center" | "right"

export default function App() {
  const [text, setText] = useState(DEFAULT_ASCII)
  const [font, setFont] = useState<FontOption>("courier")
  const [fontSize, setFontSize] = useState(14)
  const [lineHeight, setLineHeight] = useState(1.2)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [preserveWhitespace, setPreserveWhitespace] = useState(true)
  const [fillType, setFillType] = useState<FillOption>("solid")
  const [textColor, setTextColor] = useState("#00FF41")
  const [gradientStart, setGradientStart] = useState("#00FF41")
  const [gradientEnd, setGradientEnd] = useState("#0080FF")
  const [gradientAngle, setGradientAngle] = useState(90)
  const [effect, setEffect] = useState<EffectOption>("none")
  const [effectSpeed, setEffectSpeed] = useState(1)
  const [effectDirection, setEffectDirection] = useState<DirectionOption>("left")
  const [trigger, setTrigger] = useState<TriggerOption>("load")
  const [hoverGlitch, setHoverGlitch] = useState(false)
  const [textAlign, setTextAlign] = useState<AlignOption>("left")

  const props = {
    text,
    font,
    fontSize,
    lineHeight,
    letterSpacing,
    preserveWhitespace,
    fillType,
    textColor,
    gradientStart,
    gradientEnd,
    gradientAngle,
    effect,
    effectSpeed,
    effectDirection,
    trigger,
    hoverGlitch,
    textAlign,
  }

  const labelStyle: React.CSSProperties = {
    color: "#999",
    fontSize: 11,
    marginBottom: 4,
    display: "block",
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#1a1a1a",
    color: "#eee",
    border: "1px solid #444",
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 12,
    boxSizing: "border-box",
  }

  const segmentedContainer: React.CSSProperties = {
    display: "flex",
    gap: 0,
    borderRadius: 6,
    overflow: "hidden",
    border: "1px solid #444",
  }

  const segmentBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "5px 8px",
    fontSize: 11,
    background: active ? "#3b82f6" : "#1a1a1a",
    color: active ? "#fff" : "#999",
    border: "none",
    cursor: "pointer",
  })

  const sectionTitle: React.CSSProperties = {
    color: "#666",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
    borderTop: "1px solid #333",
    paddingTop: 12,
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Preview area */}
      <div style={{ flex: 1, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ width: 700, height: 500, background: "#000", borderRadius: 8, overflow: "hidden", padding: 20 }}>
          <AsciiFormatter {...props} />
        </div>
      </div>

      {/* Property panel */}
      <div style={{ width: 280, background: "#222", padding: 16, overflowY: "auto", borderLeft: "1px solid #333" }}>
        <h3 style={{ color: "#fff", fontSize: 14, margin: "0 0 16px" }}>ASCII Formatter</h3>

        {/* Text input */}
        <label style={labelStyle}>ASCII Art</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your ASCII art here..."
          rows={8}
          style={{ ...inputStyle, fontFamily: "'Courier New', monospace", resize: "vertical", whiteSpace: "pre" }}
        />
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <button
            onClick={() => setText(DEFAULT_ASCII)}
            style={{ ...inputStyle, cursor: "pointer", flex: 1, textAlign: "center" }}
          >
            Cat
          </button>
          <button
            onClick={() => setText(SAMPLE_SKULLS)}
            style={{ ...inputStyle, cursor: "pointer", flex: 1, textAlign: "center" }}
          >
            Sample 2
          </button>
        </div>

        {/* Typography */}
        <div style={sectionTitle}>Typography</div>

        <label style={labelStyle}>Font</label>
        <select value={font} onChange={(e) => setFont(e.target.value)} style={inputStyle}>
          <optgroup label="Monospace">
            <option value="courier">Courier New</option>
            <option value="consolas">Consolas</option>
            <option value="firacode">Fira Code</option>
            <option value="jetbrains">JetBrains Mono</option>
            <option value="sourcecodepro">Source Code Pro</option>
            <option value="ubuntumono">Ubuntu Mono</option>
            <option value="robotomono">Roboto Mono</option>
            <option value="ibmplexmono">IBM Plex Mono</option>
            <option value="spacemono">Space Mono</option>
            <option value="inconsolata">Inconsolata</option>
          </optgroup>
          <optgroup label="Sans-Serif">
            <option value="inter">Inter</option>
            <option value="roboto">Roboto</option>
            <option value="opensans">Open Sans</option>
            <option value="lato">Lato</option>
            <option value="montserrat">Montserrat</option>
            <option value="poppins">Poppins</option>
            <option value="nunito">Nunito</option>
            <option value="raleway">Raleway</option>
            <option value="arial">Arial</option>
            <option value="helvetica">Helvetica</option>
            <option value="verdana">Verdana</option>
          </optgroup>
          <optgroup label="Serif">
            <option value="georgia">Georgia</option>
            <option value="timesnewroman">Times New Roman</option>
            <option value="playfair">Playfair Display</option>
            <option value="merriweather">Merriweather</option>
            <option value="lora">Lora</option>
            <option value="ptserif">PT Serif</option>
          </optgroup>
          <optgroup label="Display">
            <option value="orbitron">Orbitron</option>
            <option value="pressstart">Press Start 2P</option>
            <option value="vt323">VT323</option>
            <option value="silkscreen">Silkscreen</option>
          </optgroup>
        </select>

        <label style={{ ...labelStyle, marginTop: 8 }}>Font Size: {fontSize}px</label>
        <input type="range" min={8} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ width: "100%" }} />

        <label style={{ ...labelStyle, marginTop: 8 }}>Line Height: {lineHeight}</label>
        <input type="range" min={0.8} max={3} step={0.1} value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} style={{ width: "100%" }} />

        <label style={{ ...labelStyle, marginTop: 8 }}>Letter Spacing: {letterSpacing}px</label>
        <input type="range" min={-2} max={10} step={0.5} value={letterSpacing} onChange={(e) => setLetterSpacing(Number(e.target.value))} style={{ width: "100%" }} />

        <label style={{ ...labelStyle, marginTop: 8 }}>Preserve Whitespace</label>
        <div style={segmentedContainer}>
          <button style={segmentBtn(preserveWhitespace)} onClick={() => setPreserveWhitespace(true)}>On</button>
          <button style={segmentBtn(!preserveWhitespace)} onClick={() => setPreserveWhitespace(false)}>Off</button>
        </div>

        {/* Fill */}
        <div style={sectionTitle}>Fill</div>

        <label style={labelStyle}>Fill Type</label>
        <div style={segmentedContainer}>
          {(["solid", "linear", "radial"] as FillOption[]).map((f) => (
            <button key={f} style={segmentBtn(fillType === f)} onClick={() => setFillType(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {fillType === "solid" ? (
          <>
            <label style={{ ...labelStyle, marginTop: 8 }}>Color</label>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} />
          </>
        ) : (
          <>
            <label style={{ ...labelStyle, marginTop: 8 }}>Start Color</label>
            <input type="color" value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} />
            <label style={{ ...labelStyle, marginTop: 8 }}>End Color</label>
            <input type="color" value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} style={{ ...inputStyle, height: 32, padding: 2 }} />
            {fillType === "linear" && (
              <>
                <label style={{ ...labelStyle, marginTop: 8 }}>Angle: {gradientAngle}deg</label>
                <input type="range" min={0} max={360} value={gradientAngle} onChange={(e) => setGradientAngle(Number(e.target.value))} style={{ width: "100%" }} />
              </>
            )}
          </>
        )}

        {/* Effects */}
        <div style={sectionTitle}>Effects</div>

        <label style={labelStyle}>Effect</label>
        <select value={effect} onChange={(e) => setEffect(e.target.value as EffectOption)} style={inputStyle}>
          <option value="none">None</option>
          <option value="reveal">Directional Reveal</option>
          <option value="typing">Typing</option>
          <option value="fade">Fade In</option>
          <option value="glitch">Glitch</option>
        </select>

        {effect !== "none" && (
          <>
            <label style={{ ...labelStyle, marginTop: 8 }}>Speed: {effectSpeed}s</label>
            <input type="range" min={0.1} max={5} step={0.1} value={effectSpeed} onChange={(e) => setEffectSpeed(Number(e.target.value))} style={{ width: "100%" }} />
          </>
        )}

        {effect === "reveal" && (
          <>
            <label style={{ ...labelStyle, marginTop: 8 }}>Direction</label>
            <select value={effectDirection} onChange={(e) => setEffectDirection(e.target.value as DirectionOption)} style={inputStyle}>
              <option value="left">Left to Right</option>
              <option value="right">Right to Left</option>
              <option value="top">Top to Bottom</option>
              <option value="bottom">Bottom to Top</option>
            </select>
          </>
        )}

        {effect !== "none" && (
          <>
            <label style={{ ...labelStyle, marginTop: 8 }}>Trigger</label>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerOption)} style={inputStyle}>
              <option value="load">On Load</option>
              <option value="inView">In View</option>
            </select>
          </>
        )}

        <label style={{ ...labelStyle, marginTop: 8 }}>Hover Glitch</label>
        <div style={segmentedContainer}>
          <button style={segmentBtn(hoverGlitch)} onClick={() => setHoverGlitch(true)}>On</button>
          <button style={segmentBtn(!hoverGlitch)} onClick={() => setHoverGlitch(false)}>Off</button>
        </div>

        {/* Layout */}
        <div style={sectionTitle}>Layout</div>

        <label style={labelStyle}>Text Align</label>
        <div style={segmentedContainer}>
          {(["left", "center", "right"] as AlignOption[]).map((a) => (
            <button key={a} style={segmentBtn(textAlign === a)} onClick={() => setTextAlign(a)}>
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>

        {/* Replay button */}
        {effect !== "none" && (
          <button
            onClick={() => {
              const prev = effect
              setEffect("none")
              setTimeout(() => setEffect(prev), 50)
            }}
            style={{ ...inputStyle, marginTop: 16, cursor: "pointer", textAlign: "center", background: "#3b82f6", color: "#fff", border: "none" }}
          >
            Replay Effect
          </button>
        )}
      </div>
    </div>
  )
}
