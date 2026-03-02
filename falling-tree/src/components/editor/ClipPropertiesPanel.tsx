import { AudioClip } from '../../types'

interface Props {
  clip:     AudioClip | null
  onUpdate: (clip: AudioClip) => void
}

export default function ClipPropertiesPanel({ clip, onUpdate }: Props) {
  if (!clip) {
    return (
      <div style={{ width: 220, padding: 16, color: '#666', fontSize: 13 }}>
        Select a clip to edit its properties.
      </div>
    )
  }

  const activeIndex   = clip.versions.findIndex(v => v.id === clip.activeVersionId)
  const versionCount  = clip.versions.length
  const versionDisplay = versionCount > 0
    ? `Version ${activeIndex + 1} of ${versionCount}`
    : 'No versions'

  function setVolume(value: number) {
    onUpdate({ ...clip, volume: value / 100 })
  }

  function setFadeIn(value: number) {
    onUpdate({ ...clip, fadeIn: value })
  }

  function setFadeOut(value: number) {
    onUpdate({ ...clip, fadeOut: value })
  }

  function stepVersion(delta: number) {
    const next = activeIndex + delta
    if (next < 0 || next >= versionCount) return
    onUpdate({ ...clip, activeVersionId: clip.versions[next].id })
  }

  return (
    <div style={{ width: 220, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, color: '#eee', fontSize: 13, borderRight: '1px solid #333' }}>
      <strong>Clip Properties</strong>

      {/* Volume */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        Volume: {Math.round(clip.volume * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(clip.volume * 100)}
          onChange={e => setVolume(Number(e.target.value))}
        />
      </label>

      {/* Fade In */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        Fade In: {clip.fadeIn.toFixed(1)}s
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={clip.fadeIn}
          onChange={e => setFadeIn(Number(e.target.value))}
        />
      </label>

      {/* Fade Out */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        Fade Out: {clip.fadeOut.toFixed(1)}s
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={clip.fadeOut}
          onChange={e => setFadeOut(Number(e.target.value))}
        />
      </label>

      {/* Version navigator */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>{versionDisplay}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => stepVersion(1)}  disabled={activeIndex >= versionCount - 1} style={btnStyle}>‹ Older</button>
          <button onClick={() => stepVersion(-1)} disabled={activeIndex <= 0}                style={btnStyle}>Newer ›</button>
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  flex:         1,
  padding:      '4px 0',
  background:   '#333',
  color:        '#eee',
  border:       'none',
  borderRadius: 4,
  cursor:       'pointer',
  fontSize:     12,
}
