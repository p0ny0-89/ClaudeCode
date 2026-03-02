import { AudioClip, Layer } from '../../types'
import AudioClipBlock from './AudioClipBlock'

interface Props {
  layer:           Layer
  pixelsPerSecond: number
  currentTime:     number
  selectedClipId:  string | null
  onClipSelect:    (clipId: string) => void
  onClipUpdate:    (clip: AudioClip) => void
}

export default function LayerTrack({
  layer,
  pixelsPerSecond,
  selectedClipId,
  onClipSelect,
  onClipUpdate,
}: Props) {
  return (
    <div style={{ display: 'flex', height: 56, borderBottom: '1px solid #333' }}>
      {/* Track label */}
      <div
        style={{
          width:          72,
          flexShrink:     0,
          display:        'flex',
          alignItems:     'center',
          paddingLeft:    8,
          fontSize:       12,
          fontWeight:     600,
          color:          '#aaa',
          background:     '#1a1a1a',
          borderRight:    '1px solid #333',
        }}
      >
        {layer.type}
      </div>

      {/* Clip area */}
      <div style={{ flex: 1, position: 'relative', background: '#111' }}>
        {layer.clips.map(clip => (
          <AudioClipBlock
            key={clip.id}
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            isSelected={clip.id === selectedClipId}
            onSelect={() => onClipSelect(clip.id)}
            onUpdate={onClipUpdate}
          />
        ))}
      </div>
    </div>
  )
}
