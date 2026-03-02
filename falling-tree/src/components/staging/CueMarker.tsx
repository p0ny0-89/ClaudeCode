import { useRef } from 'react'
import { Cue, CueType } from '../../types'

const CUE_COLORS: Record<CueType, string> = {
  [CueType.SFX]:      '#4a9eff',
  [CueType.Music]:    '#9b59b6',
  [CueType.Voice]:    '#2ecc71',
  [CueType.Ambience]: '#e67e22',
}

interface Props {
  cue:             Cue
  pixelsPerSecond: number
  onUpdate:        (cue: Cue) => void
  onDelete:        (cueId: string) => void
  onClick:         (cueId: string) => void
}

export default function CueMarker({ cue, pixelsPerSecond, onUpdate, onClick }: Props) {
  const dragStartX   = useRef<number>(0)
  const dragStartVal = useRef<number>(0)
  const isDragging   = useRef(false)

  const left  = cue.startTime * pixelsPerSecond
  const width = Math.max(cue.duration * pixelsPerSecond, 20)
  const color = CUE_COLORS[cue.type]

  // ── Body drag (reposition) ────────────────────────────────────────────────

  function onBodyMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    isDragging.current   = false
    dragStartX.current   = e.clientX
    dragStartVal.current = cue.startTime

    function onMouseMove(ev: MouseEvent) {
      const delta = (ev.clientX - dragStartX.current) / pixelsPerSecond
      if (Math.abs(delta) > 0.05) isDragging.current = true
      const newStart = Math.max(0, dragStartVal.current + delta)
      onUpdate({ ...cue, startTime: newStart })
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onBodyClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isDragging.current) onClick(cue.id)
  }

  // ── Right-edge drag (resize) ──────────────────────────────────────────────

  function onRightHandleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    dragStartX.current   = e.clientX
    dragStartVal.current = cue.duration

    function onMouseMove(ev: MouseEvent) {
      const delta = (ev.clientX - dragStartX.current) / pixelsPerSecond
      const newDuration = Math.max(0.5, dragStartVal.current + delta)
      onUpdate({ ...cue, duration: newDuration })
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── Left-edge drag (move start, keep end fixed) ───────────────────────────

  function onLeftHandleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    dragStartX.current   = e.clientX
    const startAtDrag    = cue.startTime
    const endAtDrag      = cue.startTime + cue.duration

    function onMouseMove(ev: MouseEvent) {
      const delta    = (ev.clientX - dragStartX.current) / pixelsPerSecond
      const newStart = Math.max(0, Math.min(startAtDrag + delta, endAtDrag - 0.5))
      const newDur   = endAtDrag - newStart
      onUpdate({ ...cue, startTime: newStart, duration: newDur })
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      onMouseDown={onBodyMouseDown}
      onClick={onBodyClick}
      style={{
        position:     'absolute',
        left,
        width,
        top:          8,
        height:       48,
        background:   color,
        opacity:      0.85,
        borderRadius: 4,
        cursor:       'grab',
        userSelect:   'none',
        display:      'flex',
        alignItems:   'center',
        overflow:     'hidden',
      }}
    >
      {/* Left resize handle */}
      <div
        onMouseDown={onLeftHandleMouseDown}
        style={{
          width:  8,
          height: '100%',
          cursor: 'ew-resize',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.25)',
        }}
      />

      {/* Label */}
      <span style={{ flex: 1, fontSize: 11, color: '#fff', padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {cue.type}{cue.prompt ? ` — ${cue.prompt}` : ''}
      </span>

      {/* Right resize handle */}
      <div
        onMouseDown={onRightHandleMouseDown}
        style={{
          width:  8,
          height: '100%',
          cursor: 'ew-resize',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.25)',
        }}
      />
    </div>
  )
}
