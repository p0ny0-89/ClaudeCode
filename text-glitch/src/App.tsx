import { useState, type CSSProperties } from "react"
import TextGlitch, { type GlitchScope, type GlitchEffect } from "./TextGlitch"

// ── Font presets ─────────────────────────────────────────────────────────────

const FONT_PRESETS: { label: string; value: string }[] = [
  { label: "Inter", value: "Inter, system-ui, -apple-system, sans-serif" },
  { label: "Arial Black", value: "'Arial Black', 'Arial Bold', Gadget, sans-serif" },
  { label: "Impact", value: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, Tahoma, sans-serif" },
]

// ── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  width: 280,
  background: "rgba(0,0,0,0.88)",
  backdropFilter: "blur(12px)",
  color: "#fff",
  padding: 20,
  borderRadius: 12,
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 13,
  zIndex: 100,
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
}

const labelStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 4,
  color: "#999",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
}

const sliderStyle: CSSProperties = {
  width: "100%",
  marginBottom: 16,
  accentColor: "#FF3333",
}

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  marginBottom: 16,
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  marginBottom: 16,
  outline: "none",
}

const dividerStyle: CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(255,255,255,0.1)",
  margin: "8px 0 16px",
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [text, setText] = useState("LIKE A\nMACHINE")
  const [fontSize, setFontSize] = useState(140)
  const [fontWeight, setFontWeight] = useState(900)
  const [fontPreset, setFontPreset] = useState(FONT_PRESETS[0].value)
  const [customFont, setCustomFont] = useState("")
  const [useCustomFont, setUseCustomFont] = useState(false)
  const [color, setColor] = useState("#FF0000")
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right" | "justify">("center")
  const [scope, setScope] = useState<GlitchScope>("line")
  const [effect, setEffect] = useState<GlitchEffect>("random")
  const [blockSize, setBlockSize] = useState(8)
  const [influenceRadius, setInfluenceRadius] = useState(140)
  const [intensity, setIntensity] = useState(60)
  const [trailDuration, setTrailDuration] = useState(300)
  const [smoothing, setSmoothing] = useState(0.12)

  const fontFamily = useCustomFont ? customFont : fontPreset

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        background: "#e8e4df",
      }}
    >
      <TextGlitch
        text={text}
        fontSize={fontSize}
        fontWeight={fontWeight}
        fontFamily={fontFamily}
        color={color}
        textAlign={textAlign}
        scope={scope}
        effect={effect}
        blockSize={blockSize}
        influenceRadius={influenceRadius}
        intensity={intensity}
        trailDuration={trailDuration}
        smoothing={smoothing}
      />

      {/* Control Panel */}
      <div style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, color: "#fff" }}>
          Text Glitch Controls
        </div>

        {/* ── Text ── */}
        <div style={labelStyle}><span>Text</span></div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        {/* ── Typography ── */}
        <div style={labelStyle}>
          <span>Font Size</span>
          <span style={{ color: "#fff" }}>{fontSize}px</span>
        </div>
        <input
          type="range" min={24} max={300} value={fontSize}
          onChange={(e) => setFontSize(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Font Weight</span>
          <span style={{ color: "#fff" }}>{fontWeight}</span>
        </div>
        <input
          type="range" min={100} max={900} step={100} value={fontWeight}
          onChange={(e) => setFontWeight(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}><span>Font Family</span></div>
        <select
          value={useCustomFont ? "__custom__" : fontPreset}
          onChange={(e) => {
            if (e.target.value === "__custom__") {
              setUseCustomFont(true)
            } else {
              setUseCustomFont(false)
              setFontPreset(e.target.value)
            }
          }}
          style={selectStyle}
        >
          {FONT_PRESETS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
          <option value="__custom__">Custom...</option>
        </select>
        {useCustomFont && (
          <input
            type="text"
            placeholder="e.g. 'Oswald', sans-serif"
            value={customFont}
            onChange={(e) => setCustomFont(e.target.value)}
            style={inputStyle}
          />
        )}

        <div style={labelStyle}><span>Alignment</span></div>
        <select
          value={textAlign}
          onChange={(e) => setTextAlign(e.target.value as typeof textAlign)}
          style={selectStyle}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>

        <div style={labelStyle}><span>Color</span><span style={{ color: "#fff" }}>{color}</span></div>
        <input
          type="color" value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ ...inputStyle, height: 36, padding: 2, cursor: "pointer" }}
        />

        <hr style={dividerStyle} />

        {/* ── Effect ── */}
        <div style={labelStyle}><span>Effect</span></div>
        <select
          value={effect}
          onChange={(e) => setEffect(e.target.value as GlitchEffect)}
          style={selectStyle}
        >
          <option value="random">Random</option>
          <option value="directional">Directional</option>
        </select>

        <div style={labelStyle}><span>Scope</span></div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as GlitchScope)}
          style={selectStyle}
        >
          <option value="line">Line</option>
          <option value="word">Word</option>
          <option value="character">Character</option>
        </select>

        <div style={labelStyle}>
          <span>Block Size</span>
          <span style={{ color: "#fff" }}>{blockSize}px</span>
        </div>
        <input
          type="range" min={2} max={40} value={blockSize}
          onChange={(e) => setBlockSize(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Influence Radius</span>
          <span style={{ color: "#fff" }}>{influenceRadius}px</span>
        </div>
        <input
          type="range" min={20} max={400} value={influenceRadius}
          onChange={(e) => setInfluenceRadius(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Intensity</span>
          <span style={{ color: "#fff" }}>{intensity}px</span>
        </div>
        <input
          type="range" min={0} max={200} value={intensity}
          onChange={(e) => setIntensity(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Trail Duration</span>
          <span style={{ color: "#fff" }}>{trailDuration}ms</span>
        </div>
        <input
          type="range" min={0} max={800} value={trailDuration}
          onChange={(e) => setTrailDuration(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Smoothing</span>
          <span style={{ color: "#fff" }}>{smoothing.toFixed(2)}</span>
        </div>
        <input
          type="range" min={0.02} max={0.5} step={0.01} value={smoothing}
          onChange={(e) => setSmoothing(+e.target.value)}
          style={sliderStyle}
        />
      </div>
    </div>
  )
}
