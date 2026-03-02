import { useState } from 'react'
import { AutoGenerateConfig, CueType, IntensityLevel, PresetType } from '../../types'

const PRESETS: { value: PresetType; label: string }[] = [
  { value: PresetType.CleanUIDemo,      label: 'Clean UI Demo' },
  { value: PresetType.CinematicTrailer, label: 'Cinematic Trailer' },
  { value: PresetType.VlogLifestyle,    label: 'Vlog / Lifestyle' },
  { value: PresetType.GamingFastCuts,   label: 'Gaming / Fast Cuts' },
  { value: PresetType.MinimalAmbience,  label: 'Minimal Ambience' },
  { value: PresetType.Custom,           label: 'Custom' },
]

const ALL_TYPES: CueType[] = [CueType.SFX, CueType.Music, CueType.Ambience, CueType.Voice]

const INTENSITIES: { value: IntensityLevel; label: string }[] = [
  { value: IntensityLevel.Subtle,   label: 'Subtle' },
  { value: IntensityLevel.Balanced, label: 'Balanced' },
  { value: IntensityLevel.Bold,     label: 'Bold' },
]

interface Props {
  onGenerate: (config: Omit<AutoGenerateConfig, 'id' | 'createdAt'>) => void
  onCancel:   () => void
  isLoading:  boolean
}

export default function AutoGenerateModal({ onGenerate, onCancel, isLoading }: Props) {
  const [preset,       setPreset]       = useState<PresetType>(PresetType.CinematicTrailer)
  const [prompt,       setPrompt]       = useState('')
  const [includeTypes, setIncludeTypes] = useState<CueType[]>([...ALL_TYPES])
  const [intensity,    setIntensity]    = useState<IntensityLevel>(IntensityLevel.Balanced)

  function toggleType(type: CueType) {
    setIncludeTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  function handleSubmit() {
    if (includeTypes.length === 0) return
    onGenerate({ preset, prompt: prompt.trim() || undefined, includeTypes, intensity })
  }

  return (
    // Backdrop
    <div
      onClick={onCancel}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.6)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          200,
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:    '#2a2a2a',
          borderRadius:  10,
          padding:       28,
          width:         460,
          display:       'flex',
          flexDirection: 'column',
          gap:           20,
          color:         '#eee',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 17 }}>Auto-Generate Cues</h3>

        {/* Style Preset */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Style Preset <span style={{ color: '#e55' }}>*</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                style={{
                  padding:      '8px 10px',
                  background:   preset === p.value ? '#4a9eff' : '#3a3a3a',
                  color:        '#fff',
                  border:       preset === p.value ? '2px solid #7bb8ff' : '2px solid transparent',
                  borderRadius: 5,
                  cursor:       'pointer',
                  fontSize:     13,
                  fontWeight:   preset === p.value ? 700 : 400,
                  textAlign:    'left',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Optional Prompt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Prompt <span style={{ color: '#666' }}>(optional)</span>
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. 'add mouse clicks when UI buttons are pressed' or 'add bass hits on scene transitions'"
            rows={3}
            style={{
              background:   '#1a1a1a',
              color:        '#eee',
              border:       '1px solid #444',
              borderRadius: 5,
              padding:      '8px 10px',
              fontSize:     13,
              resize:       'vertical',
              boxSizing:    'border-box',
              width:        '100%',
            }}
          />
        </div>

        {/* Include Types */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Include Types
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {ALL_TYPES.map(type => {
              const active = includeTypes.includes(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  style={{
                    flex:         1,
                    padding:      '7px 0',
                    background:   active ? '#3a5a3a' : '#3a3a3a',
                    color:        active ? '#7ddf7d' : '#888',
                    border:       active ? '1px solid #5a9a5a' : '1px solid #444',
                    borderRadius: 5,
                    cursor:       'pointer',
                    fontSize:     12,
                    fontWeight:   active ? 700 : 400,
                  }}
                >
                  {type}
                </button>
              )
            })}
          </div>
          {includeTypes.length === 0 && (
            <span style={{ fontSize: 11, color: '#e55' }}>Select at least one type.</span>
          )}
        </div>

        {/* Intensity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Intensity
          </label>
          <div style={{ display: 'flex', gap: 0, border: '1px solid #444', borderRadius: 5, overflow: 'hidden' }}>
            {INTENSITIES.map((item, i) => (
              <button
                key={item.value}
                onClick={() => setIntensity(item.value)}
                style={{
                  flex:       1,
                  padding:    '8px 0',
                  background: intensity === item.value ? '#4a9eff' : '#3a3a3a',
                  color:      '#fff',
                  border:     'none',
                  borderLeft: i > 0 ? '1px solid #444' : 'none',
                  cursor:     'pointer',
                  fontSize:   13,
                  fontWeight: intensity === item.value ? 700 : 400,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{
              padding:      '8px 20px',
              background:   '#444',
              color:        '#ccc',
              border:       'none',
              borderRadius: 5,
              cursor:       'pointer',
              fontSize:     14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || includeTypes.length === 0}
            style={{
              padding:      '8px 24px',
              background:   isLoading || includeTypes.length === 0 ? '#444' : '#4a9eff',
              color:        isLoading || includeTypes.length === 0 ? '#888' : '#fff',
              border:       'none',
              borderRadius: 5,
              cursor:       isLoading || includeTypes.length === 0 ? 'not-allowed' : 'pointer',
              fontSize:     14,
              fontWeight:   700,
            }}
          >
            {isLoading ? 'Generating…' : 'Generate Cues'}
          </button>
        </div>
      </div>
    </div>
  )
}
