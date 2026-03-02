import { useState } from 'react'
import { Cue } from '../../types'
import CueMarker from './CueMarker'
import CueModal from './CueModal'

export const PIXELS_PER_SECOND = 50

interface Props {
  duration:    number
  currentTime: number
  cues:        Cue[]
  onCueAdd:    (startTime: number) => void
  onCueUpdate: (cue: Cue) => void
  onCueDelete: (cueId: string) => void
  onSeek:      (time: number) => void
}

export default function StagingTimeline({
  duration,
  currentTime,
  cues,
  onCueAdd,
  onCueUpdate,
  onCueDelete,
  onSeek,
}: Props) {
  const [openCueId, setOpenCueId] = useState<string | null>(null)
  const openCue = cues.find(c => c.id === openCueId) ?? null

  const timelineWidth = Math.max(duration * PIXELS_PER_SECOND, 600)

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    // Only act on direct clicks on the track background, not on child elements.
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const scrollLeft = (e.currentTarget.parentElement?.scrollLeft ?? 0)
    const x = e.clientX - rect.left + scrollLeft
    const time = Math.max(0, Math.min(x / PIXELS_PER_SECOND, duration))
    onCueAdd(time)
  }

  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const scrollLeft = (e.currentTarget.parentElement?.scrollLeft ?? 0)
    const x = e.clientX - rect.left + scrollLeft
    const time = Math.max(0, Math.min(x / PIXELS_PER_SECOND, duration))
    onSeek(time)
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Scrollable track area */}
      <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ width: timelineWidth, position: 'relative' }}>
          {/* Time ruler */}
          <div
            onClick={handleRulerClick}
            style={{ height: 24, position: 'relative', background: '#222', cursor: 'pointer' }}
          >
            {/* Tick marks every second */}
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
              <div
                key={i}
                style={{
                  position:  'absolute',
                  left:      i * PIXELS_PER_SECOND,
                  top:       0,
                  height:    '100%',
                  borderLeft:'1px solid #555',
                  fontSize:  10,
                  color:     '#888',
                  paddingLeft: 2,
                }}
              >
                {i}s
              </div>
            ))}
          </div>

          {/* Cue track */}
          <div
            onClick={handleTrackClick}
            style={{
              height:   64,
              position: 'relative',
              background:'#1a1a1a',
              cursor:   'crosshair',
            }}
          >
            {/* Playhead */}
            <div
              style={{
                position:     'absolute',
                left:         currentTime * PIXELS_PER_SECOND,
                top:          0,
                width:        2,
                height:       '100%',
                background:   '#e55',
                pointerEvents:'none',
                zIndex:       10,
              }}
            />

            {cues.map(cue => (
              <CueMarker
                key={cue.id}
                cue={cue}
                pixelsPerSecond={PIXELS_PER_SECOND}
                onUpdate={onCueUpdate}
                onDelete={onCueDelete}
                onClick={id => setOpenCueId(id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Cue modal — rendered outside the scrollable area */}
      {openCue && (
        <CueModal
          cue={openCue}
          onSave={updated => { onCueUpdate(updated); setOpenCueId(null) }}
          onDelete={id => { onCueDelete(id); setOpenCueId(null) }}
          onClose={() => setOpenCueId(null)}
        />
      )}
    </div>
  )
}
