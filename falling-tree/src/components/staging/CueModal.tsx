import { useState } from 'react'
import { Cue, CueType } from '../../types'

const CUE_TYPES: CueType[] = [CueType.SFX, CueType.Music, CueType.Voice, CueType.Ambience]

interface Props {
  cue:      Cue
  onSave:   (updated: Cue) => void
  onDelete: (cueId: string) => void
  onClose:  () => void
}

export default function CueModal({ cue, onSave, onDelete, onClose }: Props) {
  const [type,   setType]   = useState<CueType>(cue.type)
  const [prompt, setPrompt] = useState(cue.prompt)

  function handleSave() {
    onSave({ ...cue, type, prompt })
  }

  function handleDelete() {
    if (window.confirm('Delete this cue?')) {
      onDelete(cue.id)
    }
  }

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.5)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         100,
      }}
    >
      {/* Panel — stop click propagation so backdrop click doesn't close it */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   '#2a2a2a',
          borderRadius: 8,
          padding:      24,
          width:        360,
          display:      'flex',
          flexDirection:'column',
          gap:          16,
          color:        '#eee',
        }}
      >
        <h3 style={{ margin: 0 }}>Edit Cue</h3>

        {/* Type selector */}
        <div style={{ display: 'flex', gap: 8 }}>
          {CUE_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                flex:        1,
                padding:     '6px 0',
                background:  type === t ? '#4a9eff' : '#444',
                color:       '#fff',
                border:      'none',
                borderRadius:4,
                cursor:      'pointer',
                fontWeight:  type === t ? 700 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe the sound…"
          rows={4}
          style={{
            width:       '100%',
            background:  '#1a1a1a',
            color:       '#eee',
            border:      '1px solid #555',
            borderRadius:4,
            padding:     8,
            resize:      'vertical',
            boxSizing:   'border-box',
          }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={handleDelete} style={{ padding: '6px 14px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Delete
          </button>
          <button onClick={onClose} style={{ padding: '6px 14px', background: '#444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{ padding: '6px 14px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
