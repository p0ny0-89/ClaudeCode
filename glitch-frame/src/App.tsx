import { useState, type CSSProperties } from "react"
import GlitchFrame, { type GlitchScope, type GlitchEffect, type GlitchDirectionMode } from "./GlitchFrame"

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

const dividerStyle: CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(255,255,255,0.1)",
  margin: "8px 0 16px",
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [scope, setScope] = useState<GlitchScope>("line")
  const [effect, setEffect] = useState<GlitchEffect>("random")
  const [directionMode, setDirectionMode] = useState<GlitchDirectionMode>("cursor")
  const [angle, setAngle] = useState(0)
  const [blockSize, setBlockSize] = useState(8)
  const [clipOverflow, setClipOverflow] = useState(true)
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
      {/* Demo content wrapped in GlitchFrame */}
      <GlitchFrame
        scope={scope}
        effect={effect}
        directionMode={directionMode}
        angle={angle}
        blockSize={blockSize}
        clipOverflow={clipOverflow}
        influenceRadius={influenceRadius}
        intensity={intensity}
        trailDuration={trailDuration}
        smoothing={smoothing}
        style={{ width: 600 }}
      >
        {/* Sample children — mixed content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 72,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: "#FF3333",
              margin: 0,
              textAlign: "center",
            }}
          >
            GLITCH
            <br />
            FRAME
          </h1>

          <p
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 16,
              color: "#333",
              textAlign: "center",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Drop any content inside this component.
            <br />
            The glitch effect applies to everything nested within.
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 120,
                height: 80,
                borderRadius: 8,
                background: "linear-gradient(135deg, #FF6B6B, #FF3333)",
              }}
            />
            <div
              style={{
                width: 120,
                height: 80,
                borderRadius: 8,
                background: "linear-gradient(135deg, #4ECDC4, #2ECC71)",
              }}
            />
            <div
              style={{
                width: 120,
                height: 80,
                borderRadius: 8,
                background: "linear-gradient(135deg, #45B7D1, #2980B9)",
              }}
            />
          </div>
        </div>
      </GlitchFrame>

      {/* Control Panel */}
      <div style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, color: "#fff" }}>
          Glitch Frame Controls
        </div>

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

        <div style={labelStyle}><span>Target</span></div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as GlitchScope)}
          style={selectStyle}
        >
          <option value="line">Line</option>
          <option value="word">Segment</option>
          <option value="character">Block</option>
        </select>

        <div style={labelStyle}><span>Direction</span></div>
        <select
          value={directionMode}
          onChange={(e) => setDirectionMode(e.target.value as GlitchDirectionMode)}
          style={selectStyle}
        >
          <option value="cursor">Cursor</option>
          <option value="manual">Manual</option>
        </select>

        {directionMode === "manual" && (
          <>
            <div style={labelStyle}>
              <span>Angle</span>
              <span style={{ color: "#fff" }}>{angle}°</span>
            </div>
            <input
              type="range" min={0} max={180} value={angle}
              onChange={(e) => setAngle(+e.target.value)}
              style={sliderStyle}
            />
          </>
        )}

        <hr style={dividerStyle} />

        {/* ── Geometry ── */}
        <div style={labelStyle}>
          <span>Clip Overflow</span>
          <span style={{ color: "#fff" }}>{clipOverflow ? "On" : "Off"}</span>
        </div>
        <input
          type="checkbox"
          checked={clipOverflow}
          onChange={(e) => setClipOverflow(e.target.checked)}
          style={{ marginBottom: 12 }}
        />

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
          <span>Spread</span>
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
          <span>Trail</span>
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
