import { AudioClip, Layer } from '../../types'
import LayerTrack from './LayerTrack'

export const PIXELS_PER_SECOND = 50

interface Props {
  tracks:         Layer[]
  currentTime:    number
  duration:       number
  selectedClipId: string | null
  onClipSelect:   (clipId: string) => void
  onClipUpdate:   (clip: AudioClip) => void
  onSeek:         (time: number) => void
}

export default function EditorTimeline({
  tracks,
  currentTime,
  duration,
  selectedClipId,
  onClipSelect,
  onClipUpdate,
  onSeek,
}: Props) {
  const timelineWidth = Math.max(duration * PIXELS_PER_SECOND, 600)

  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const scrollLeft = (e.currentTarget.parentElement?.scrollLeft ?? 0)
    const x = e.clientX - rect.left + scrollLeft
    const time = Math.max(0, Math.min(x / PIXELS_PER_SECOND, duration))
    onSeek(time)
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <div style={{ width: timelineWidth, position: 'relative' }}>
          {/* Time ruler */}
          <div
            onClick={handleRulerClick}
            style={{ height: 24, position: 'relative', background: '#222', cursor: 'pointer' }}
          >
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
              <div
                key={i}
                style={{
                  position:   'absolute',
                  left:       i * PIXELS_PER_SECOND,
                  top:        0,
                  height:     '100%',
                  borderLeft: '1px solid #555',
                  fontSize:   10,
                  color:      '#888',
                  paddingLeft: 2,
                }}
              >
                {i}s
              </div>
            ))}

            {/* Playhead */}
            <div
              style={{
                position:     'absolute',
                left:         currentTime * PIXELS_PER_SECOND,
                top:          0,
                width:        2,
                height:       10000, // extends through all tracks
                background:   '#e55',
                pointerEvents:'none',
                zIndex:       20,
              }}
            />
          </div>

          {/* Layer tracks */}
          {tracks.map(layer => (
            <LayerTrack
              key={layer.type}
              layer={layer}
              pixelsPerSecond={PIXELS_PER_SECOND}
              currentTime={currentTime}
              selectedClipId={selectedClipId}
              onClipSelect={onClipSelect}
              onClipUpdate={onClipUpdate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
