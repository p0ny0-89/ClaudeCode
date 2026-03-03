import { useState, type CSSProperties } from "react"
import TextGlitch from "./TextGlitch"

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

export default function App() {
  const [text, setText] = useState("LIKE A\nMACHINE")
  const [fontSize, setFontSize] = useState(140)
  const [fontWeight, setFontWeight] = useState(900)
  const [color, setColor] = useState("#FF0000")
  const [blockSize, setBlockSize] = useState(8)
  const [influenceRadius, setInfluenceRadius] = useState(140)
  const [intensity, setIntensity] = useState(60)
  const [trailDuration, setTrailDuration] = useState(300)
  const [smoothing, setSmoothing] = useState(0.12)

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
        color={color}
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

        <div style={labelStyle}>
          <span>Text</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        <div style={labelStyle}>
          <span>Font Size</span>
          <span style={{ color: "#fff" }}>{fontSize}px</span>
        </div>
        <input
          type="range"
          min={24}
          max={300}
          value={fontSize}
          onChange={(e) => setFontSize(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Font Weight</span>
          <span style={{ color: "#fff" }}>{fontWeight}</span>
        </div>
        <input
          type="range"
          min={100}
          max={900}
          step={100}
          value={fontWeight}
          onChange={(e) => setFontWeight(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Color</span>
          <span style={{ color: "#fff" }}>{color}</span>
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ ...inputStyle, height: 36, padding: 2, cursor: "pointer" }}
        />

        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", margin: "8px 0 16px" }} />

        <div style={labelStyle}>
          <span>Block Size</span>
          <span style={{ color: "#fff" }}>{blockSize}px</span>
        </div>
        <input
          type="range"
          min={2}
          max={40}
          value={blockSize}
          onChange={(e) => setBlockSize(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Influence Radius</span>
          <span style={{ color: "#fff" }}>{influenceRadius}px</span>
        </div>
        <input
          type="range"
          min={20}
          max={400}
          value={influenceRadius}
          onChange={(e) => setInfluenceRadius(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Intensity</span>
          <span style={{ color: "#fff" }}>{intensity}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={200}
          value={intensity}
          onChange={(e) => setIntensity(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Trail Duration</span>
          <span style={{ color: "#fff" }}>{trailDuration}ms</span>
        </div>
        <input
          type="range"
          min={0}
          max={800}
          value={trailDuration}
          onChange={(e) => setTrailDuration(+e.target.value)}
          style={sliderStyle}
        />

        <div style={labelStyle}>
          <span>Smoothing</span>
          <span style={{ color: "#fff" }}>{smoothing.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0.02}
          max={0.5}
          step={0.01}
          value={smoothing}
          onChange={(e) => setSmoothing(+e.target.value)}
          style={sliderStyle}
        />
      </div>
    </div>
  )
}
