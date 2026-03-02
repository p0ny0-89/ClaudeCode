import { useState } from 'react'
import { Project } from '../../types'

interface ExportOptions {
  format: 'mixed_audio' | 'stems' | 'video_with_audio'
}

interface Props {
  project:  Project
  onExport?: (options: ExportOptions) => void
}

export default function ExportPanel({ onExport }: Props) {
  const [format, setFormat]       = useState<ExportOptions['format']>('mixed_audio')
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    // TODO: implement real export via Web Audio API
    await new Promise(resolve => setTimeout(resolve, 1500))
    onExport?.({ format })
    setExporting(false)
    alert(`Export complete: ${format} (placeholder — real export not yet implemented)`)
  }

  const formats: { value: ExportOptions['format']; label: string }[] = [
    { value: 'mixed_audio',     label: 'Mixed Audio' },
    { value: 'stems',           label: 'Stems (per layer)' },
    { value: 'video_with_audio',label: 'Video + Audio' },
  ]

  return (
    <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #333', color: '#eee', fontSize: 13 }}>
      <strong>Export:</strong>
      {formats.map(f => (
        <label key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="radio"
            name="export-format"
            value={f.value}
            checked={format === f.value}
            onChange={() => setFormat(f.value)}
          />
          {f.label}
        </label>
      ))}
      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          marginLeft:   'auto',
          padding:      '6px 20px',
          background:   exporting ? '#444' : '#27ae60',
          color:        '#fff',
          border:       'none',
          borderRadius: 4,
          cursor:       exporting ? 'wait' : 'pointer',
          fontWeight:   700,
        }}
      >
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    </div>
  )
}
