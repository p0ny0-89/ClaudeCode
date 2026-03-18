import React, { useState } from "react"
import AsciiFormatterPro from "./AsciiFormatterPro"

const DEFAULT_ASCII = `  /\\_/\\
 ( o.o )
  > ^ <`

const SKULL_ASCII = `    ______
   /      \\
  |  x  x  |
  |   __   |
  |  \\__/  |
   \\______/`

const CIRCUIT_ASCII = `┌──────────────────┐
│  ╔══╗  ┌──┐     │
│  ║01║──┤><├──●  │
│  ╚══╝  └──┘  │  │
│     │   ┌────┘  │
│  ┌──┴──┐│       │
│  │ MUX ├┘  ╔══╗ │
│  └─────┘   ║FF║ │
│             ╚══╝ │
└──────────────────┘`

const ROBOT_ASCII = `    ┌─────┐
    │ ◉ ◉ │
    │  ▽  │
    └──┬──┘
   ┌───┴───┐
   │ ROBOT │
   │ 3000  │
   └┬─────┬┘
    │     │
   ═╧═   ═╧═`

type Font = Record<string, any>
type FillType = "solid" | "linear" | "radial"
type AppearEffect = "none" | "fade" | "reveal" | "typing" | "glitch" | "scramble" | "scan" | "boot" | "interference"
type Trigger = "mount" | "hover" | "viewport"
type RepeatMode = "once" | "loop" | "pingPong"
type StaggerMode = "none" | "byChar" | "byLine"
type RevealDirection = "left" | "right" | "top" | "bottom" | "centerOut" | "random"
type GlitchDirection = "horizontal" | "vertical" | "both"
type HoverEffect = "none" | "glitch" | "scramble" | "displace" | "flicker"
type HoverScope = "global" | "local"
type TextAlign = "left" | "center" | "right"
type FontSizingMode = "fixed" | "auto"

export default function App() {
  // Content
  const [text, setText] = useState(DEFAULT_ASCII)
  const [font, setFont] = useState<Font>({ fontFamily: "'Courier New', Courier, monospace", fontWeight: 400 })
  const [textAlign, setTextAlign] = useState<TextAlign>("left")

  // Typography
  const [fontSizingMode, setFontSizingMode] = useState<FontSizingMode>("fixed")
  const [fontSize, setFontSize] = useState(16)
  const [lineHeight, setLineHeight] = useState(1)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [preserveFormatting, setPreserveFormatting] = useState(true)

  // Appearance
  const [fillType, setFillType] = useState<FillType>("solid")
  const [color, setColor] = useState("#00FF41")
  const [gradientStart, setGradientStart] = useState("#00FF41")
  const [gradientEnd, setGradientEnd] = useState("#0080FF")
  const [gradientAngle, setGradientAngle] = useState(90)

  // Animation
  const [appearEffect, setAppearEffect] = useState<AppearEffect>("none")
  const [trigger, setTrigger] = useState<Trigger>("mount")
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("once")
  const [duration, setDuration] = useState(1)
  const [delay, setDelay] = useState(0)
  const [stagger, setStagger] = useState<StaggerMode>("none")
  const [staggerAmount] = useState(0.05)
  const [direction, setDirection] = useState<RevealDirection>("left")
  const [repeatDelay, setRepeatDelay] = useState(0.5)
  const [loopCount, setLoopCount] = useState(0)

  // Effect Controls
  const [intensity, setIntensity] = useState(0.8)
  const [frequency, setFrequency] = useState(30)
  const [seed, setSeed] = useState(42)
  const [jitter, setJitter] = useState(2)
  const [rgbSplit, setRgbSplit] = useState(0)
  const [glitchDirection, setGlitchDirection] = useState<GlitchDirection>("horizontal")
  const [cursorBlink, setCursorBlink] = useState(true)

  // Interaction
  const [hoverEffect, setHoverEffect] = useState<HoverEffect>("none")
  const [hoverScope, setHoverScope] = useState<HoverScope>("global")
  const [hoverRadius, setHoverRadius] = useState(3)
  const [hoverIntensity, setHoverIntensity] = useState(0.5)
  const [retriggerOnHover, setRetriggerOnHover] = useState(false)

  // Replay key
  const [replayKey, setReplayKey] = useState(0)

  const allProps = {
    text, font, textAlign,
    fontSizingMode, fontSize, lineHeight, letterSpacing, preserveFormatting,
    fillType, color, gradientStart, gradientEnd, gradientAngle,
    appearEffect, trigger, repeatMode, duration, delay, stagger, staggerAmount,
    direction, repeatDelay, loopCount,
    intensity, frequency, seed, jitter, rgbSplit, glitchDirection, cursorBlink,
    hoverEffect, hoverScope, hoverRadius, hoverIntensity, retriggerOnHover,
  }

  const S: Record<string, React.CSSProperties> = {
    label: { color: "#999", fontSize: 11, marginBottom: 4, display: "block" },
    input: { width: "100%", background: "#1a1a1a", color: "#eee", border: "1px solid #444", borderRadius: 4, padding: "6px 8px", fontSize: 12, boxSizing: "border-box" },
    section: { color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8, borderTop: "1px solid #333", paddingTop: 12 },
    segWrap: { display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #444" },
  }

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "5px 6px", fontSize: 10, background: active ? "#3b82f6" : "#1a1a1a",
    color: active ? "#fff" : "#999", border: "none", cursor: "pointer", whiteSpace: "nowrap",
  })

  const isGlitchLike = appearEffect === "glitch" || appearEffect === "interference"
  const isTextBased = appearEffect === "typing" || appearEffect === "scramble" || appearEffect === "boot"
  const hasDir = appearEffect === "reveal" || appearEffect === "scan"

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Preview */}
      <div style={{ flex: 1, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ width: 700, height: 500, background: "#0a0a0a", borderRadius: 8, overflow: "hidden", padding: 20, border: "1px solid #222" }}>
          <AsciiFormatterPro key={`${replayKey}-${appearEffect}-${trigger}`} {...allProps} />
        </div>
      </div>

      {/* Panel */}
      <div style={{ width: 290, background: "#222", padding: 16, overflowY: "auto", borderLeft: "1px solid #333" }}>
        <h3 style={{ color: "#fff", fontSize: 14, margin: "0 0 16px" }}>AsciiFormatterPro</h3>

        {/* Presets */}
        <label style={S.label}>Presets</label>
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          {[
            { label: "Cat", value: DEFAULT_ASCII },
            { label: "Skull", value: SKULL_ASCII },
            { label: "Circuit", value: CIRCUIT_ASCII },
            { label: "Robot", value: ROBOT_ASCII },
          ].map((p) => (
            <button key={p.label} onClick={() => setText(p.value)} style={{ ...S.input, cursor: "pointer", flex: "1 1 60px", textAlign: "center" }}>{p.label}</button>
          ))}
        </div>

        {/* Content */}
        <label style={S.label}>ASCII Art</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} style={{ ...S.input, fontFamily: "'Courier New', monospace", resize: "vertical", whiteSpace: "pre" }} />

        <label style={{ ...S.label, marginTop: 8 }}>Font</label>
        <select value={font.fontFamily} onChange={(e) => setFont({ fontFamily: e.target.value, fontWeight: 400 })} style={S.input}>
          <optgroup label="Monospace">
            <option value="'Courier New', Courier, monospace">Courier New</option>
            <option value="'Consolas', monospace">Consolas</option>
            <option value="'Fira Code', monospace">Fira Code</option>
            <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
            <option value="'Space Mono', monospace">Space Mono</option>
          </optgroup>
          <optgroup label="Sans-Serif">
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value="Helvetica, Arial, sans-serif">Helvetica</option>
            <option value="Verdana, Geneva, sans-serif">Verdana</option>
          </optgroup>
          <optgroup label="Serif">
            <option value="Georgia, 'Times New Roman', serif">Georgia</option>
            <option value="'Times New Roman', Times, serif">Times New Roman</option>
          </optgroup>
        </select>

        <label style={{ ...S.label, marginTop: 8 }}>Align</label>
        <div style={S.segWrap}>
          {(["left", "center", "right"] as TextAlign[]).map((a) => (
            <button key={a} style={seg(textAlign === a)} onClick={() => setTextAlign(a)}>{a}</button>
          ))}
        </div>

        {/* Typography */}
        <div style={S.section}>Typography</div>

        <label style={S.label}>Sizing Mode</label>
        <div style={S.segWrap}>
          <button style={seg(fontSizingMode === "fixed")} onClick={() => setFontSizingMode("fixed")}>Fixed</button>
          <button style={seg(fontSizingMode === "auto")} onClick={() => setFontSizingMode("auto")}>Auto Fit</button>
        </div>

        <label style={{ ...S.label, marginTop: 8 }}>Font Size: {fontSize}px</label>
        <input type="range" min={4} max={120} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ width: "100%" }} />

        <label style={{ ...S.label, marginTop: 8 }}>Line Height: {lineHeight}</label>
        <input type="range" min={0.5} max={4} step={0.05} value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} style={{ width: "100%" }} />

        <label style={{ ...S.label, marginTop: 8 }}>Letter Spacing: {letterSpacing}px</label>
        <input type="range" min={-5} max={20} step={0.5} value={letterSpacing} onChange={(e) => setLetterSpacing(Number(e.target.value))} style={{ width: "100%" }} />

        <label style={{ ...S.label, marginTop: 8 }}>Preserve Formatting</label>
        <div style={S.segWrap}>
          <button style={seg(preserveFormatting)} onClick={() => setPreserveFormatting(true)}>On</button>
          <button style={seg(!preserveFormatting)} onClick={() => setPreserveFormatting(false)}>Off</button>
        </div>

        {/* Appearance */}
        <div style={S.section}>Appearance</div>

        <label style={S.label}>Fill Type</label>
        <div style={S.segWrap}>
          {(["solid", "linear", "radial"] as FillType[]).map((f) => (
            <button key={f} style={seg(fillType === f)} onClick={() => setFillType(f)}>{f}</button>
          ))}
        </div>

        {fillType === "solid" ? (
          <>
            <label style={{ ...S.label, marginTop: 8 }}>Color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...S.input, height: 32, padding: 2 }} />
          </>
        ) : (
          <>
            <label style={{ ...S.label, marginTop: 8 }}>Start Color</label>
            <input type="color" value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} style={{ ...S.input, height: 32, padding: 2 }} />
            <label style={{ ...S.label, marginTop: 8 }}>End Color</label>
            <input type="color" value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} style={{ ...S.input, height: 32, padding: 2 }} />
            {fillType === "linear" && (
              <>
                <label style={{ ...S.label, marginTop: 8 }}>Angle: {gradientAngle}°</label>
                <input type="range" min={0} max={360} value={gradientAngle} onChange={(e) => setGradientAngle(Number(e.target.value))} style={{ width: "100%" }} />
              </>
            )}
          </>
        )}

        {/* Animation */}
        <div style={S.section}>Animation</div>

        <label style={S.label}>Appear Effect</label>
        <select value={appearEffect} onChange={(e) => setAppearEffect(e.target.value as AppearEffect)} style={S.input}>
          <option value="none">None</option>
          <option value="fade">Fade In</option>
          <option value="reveal">Directional Reveal</option>
          <option value="typing">Typing</option>
          <option value="glitch">Glitch</option>
          <option value="scramble">Scramble In</option>
          <option value="scan">Scan Reveal</option>
          <option value="boot">Boot Sequence</option>
          <option value="interference">Interference</option>
        </select>

        {appearEffect !== "none" && (
          <>
            <label style={{ ...S.label, marginTop: 8 }}>Trigger</label>
            <div style={S.segWrap}>
              {(["mount", "hover", "viewport"] as Trigger[]).map((t) => (
                <button key={t} style={seg(trigger === t)} onClick={() => setTrigger(t)}>
                  {t === "mount" ? "Mount" : t === "hover" ? "Hover" : "Viewport"}
                </button>
              ))}
            </div>

            <label style={{ ...S.label, marginTop: 8 }}>Duration: {duration}s</label>
            <input type="range" min={0.1} max={10} step={0.1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ width: "100%" }} />

            <label style={{ ...S.label, marginTop: 8 }}>Delay: {delay}s</label>
            <input type="range" min={0} max={5} step={0.1} value={delay} onChange={(e) => setDelay(Number(e.target.value))} style={{ width: "100%" }} />

            {hasDir && (
              <>
                <label style={{ ...S.label, marginTop: 8 }}>Direction</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as RevealDirection)} style={S.input}>
                  <option value="left">Left → Right</option>
                  <option value="right">Right → Left</option>
                  <option value="top">Top → Bottom</option>
                  <option value="bottom">Bottom → Top</option>
                  <option value="centerOut">Center Out</option>
                  <option value="random">Random</option>
                </select>
              </>
            )}

            {isTextBased && (
              <>
                <label style={{ ...S.label, marginTop: 8 }}>Stagger</label>
                <div style={S.segWrap}>
                  {(["none", "byChar", "byLine"] as StaggerMode[]).map((s) => (
                    <button key={s} style={seg(stagger === s)} onClick={() => setStagger(s)}>
                      {s === "none" ? "None" : s === "byChar" ? "Char" : "Line"}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label style={{ ...S.label, marginTop: 8 }}>Repeat</label>
            <div style={S.segWrap}>
              {(["once", "loop", "pingPong"] as RepeatMode[]).map((r) => (
                <button key={r} style={seg(repeatMode === r)} onClick={() => setRepeatMode(r)}>
                  {r === "once" ? "Once" : r === "loop" ? "Loop" : "Ping-Pong"}
                </button>
              ))}
            </div>

            {repeatMode !== "once" && (
              <>
                <label style={{ ...S.label, marginTop: 8 }}>Repeat Delay: {repeatDelay}s</label>
                <input type="range" min={0} max={5} step={0.1} value={repeatDelay} onChange={(e) => setRepeatDelay(Number(e.target.value))} style={{ width: "100%" }} />
                <label style={{ ...S.label, marginTop: 8 }}>Loop Count (0 = infinite): {loopCount}</label>
                <input type="range" min={0} max={100} value={loopCount} onChange={(e) => setLoopCount(Number(e.target.value))} style={{ width: "100%" }} />
              </>
            )}
          </>
        )}

        {/* Effect Controls */}
        {(isGlitchLike || isTextBased || appearEffect === "scan") && (
          <>
            <div style={S.section}>Effect Controls</div>

            {isGlitchLike && (
              <>
                <label style={S.label}>Intensity: {intensity}</label>
                <input type="range" min={0} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} style={{ width: "100%" }} />

                <label style={{ ...S.label, marginTop: 8 }}>Jitter: {jitter}px</label>
                <input type="range" min={0} max={20} step={0.5} value={jitter} onChange={(e) => setJitter(Number(e.target.value))} style={{ width: "100%" }} />

                <label style={{ ...S.label, marginTop: 8 }}>RGB Split: {rgbSplit}px</label>
                <input type="range" min={0} max={10} step={0.5} value={rgbSplit} onChange={(e) => setRgbSplit(Number(e.target.value))} style={{ width: "100%" }} />

                <label style={{ ...S.label, marginTop: 8 }}>Glitch Direction</label>
                <div style={S.segWrap}>
                  {(["horizontal", "vertical", "both"] as GlitchDirection[]).map((d) => (
                    <button key={d} style={seg(glitchDirection === d)} onClick={() => setGlitchDirection(d)}>{d}</button>
                  ))}
                </div>
              </>
            )}

            <label style={{ ...S.label, marginTop: 8 }}>Frequency: {frequency} fps</label>
            <input type="range" min={5} max={60} value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} style={{ width: "100%" }} />

            <label style={{ ...S.label, marginTop: 8 }}>Seed: {seed}</label>
            <input type="range" min={1} max={9999} value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: "100%" }} />

            {appearEffect === "boot" && (
              <>
                <label style={{ ...S.label, marginTop: 8 }}>Cursor Blink</label>
                <div style={S.segWrap}>
                  <button style={seg(cursorBlink)} onClick={() => setCursorBlink(true)}>On</button>
                  <button style={seg(!cursorBlink)} onClick={() => setCursorBlink(false)}>Off</button>
                </div>
              </>
            )}
          </>
        )}

        {/* Interaction */}
        <div style={S.section}>Interaction</div>

        <label style={S.label}>Hover Effect</label>
        <select value={hoverEffect} onChange={(e) => setHoverEffect(e.target.value as HoverEffect)} style={S.input}>
          <option value="none">None</option>
          <option value="glitch">Glitch</option>
          <option value="scramble">Scramble</option>
          <option value="displace">Displace</option>
          <option value="flicker">Flicker</option>
        </select>

        {hoverEffect !== "none" && (
          <>
            {(hoverEffect === "glitch" || hoverEffect === "scramble") && (
              <>
                <label style={{ ...S.label, marginTop: 8 }}>Hover Scope</label>
                <div style={S.segWrap}>
                  <button style={seg(hoverScope === "global")} onClick={() => setHoverScope("global")}>Global</button>
                  <button style={seg(hoverScope === "local")} onClick={() => setHoverScope("local")}>Characters</button>
                </div>

                {hoverScope === "local" && (
                  <>
                    <label style={{ ...S.label, marginTop: 8 }}>Hover Radius: {hoverRadius}</label>
                    <input type="range" min={1} max={10} step={1} value={hoverRadius} onChange={(e) => setHoverRadius(Number(e.target.value))} style={{ width: "100%" }} />
                  </>
                )}
              </>
            )}

            <label style={{ ...S.label, marginTop: 8 }}>Hover Intensity: {hoverIntensity}</label>
            <input type="range" min={0} max={1} step={0.05} value={hoverIntensity} onChange={(e) => setHoverIntensity(Number(e.target.value))} style={{ width: "100%" }} />
          </>
        )}

        <label style={{ ...S.label, marginTop: 8 }}>Retrigger On Hover</label>
        <div style={S.segWrap}>
          <button style={seg(retriggerOnHover)} onClick={() => setRetriggerOnHover(true)}>On</button>
          <button style={seg(!retriggerOnHover)} onClick={() => setRetriggerOnHover(false)}>Off</button>
        </div>

        {/* Replay */}
        {appearEffect !== "none" && (
          <button
            onClick={() => setReplayKey((k) => k + 1)}
            style={{ ...S.input, marginTop: 16, cursor: "pointer", textAlign: "center", background: "#3b82f6", color: "#fff", border: "none", fontWeight: 600 }}
          >
            Replay Effect
          </button>
        )}
      </div>
    </div>
  )
}
