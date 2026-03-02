import { useRef, useEffect } from 'react'
import { AudioClip, ClipState } from '../../types'
import { useProject } from '../../context/ProjectContext'
import { MockGenerationService } from '../../services/MockGenerationService'

interface Props {
  clip:            AudioClip
  pixelsPerSecond: number
  isSelected:      boolean
  onSelect:        () => void
  onUpdate:        (clip: AudioClip) => void
}

export default function AudioClipBlock({
  clip,
  pixelsPerSecond,
  isSelected,
  onSelect,
  onUpdate,
}: Props) {
  const { state, dispatch } = useProject()
  const isDragging = useRef(false)

  const left  = clip.startTime * pixelsPerSecond
  const width = Math.max(clip.duration * pixelsPerSecond, 16)

  const isMuted      = clip.state === ClipState.Muted
  const isGenerating = clip.state === ClipState.Generating
  const isOutdated   = clip.state === ClipState.Outdated

  // ── Keyboard shortcuts (only when this clip is selected) ─────────────────

  useEffect(() => {
    if (!isSelected) return

    function handleKey(e: KeyboardEvent) {
      // Don't fire if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

      if (e.key === 'm' || e.key === 'M') {
        // Toggle mute: Ready ↔ Muted (Outdated stays Outdated when unmuting)
        const next = isMuted ? ClipState.Ready : ClipState.Muted
        onUpdate({ ...clip, state: next })
      }

      if (e.key === 'd' || e.key === 'D') {
        dispatch({ type: 'DUPLICATE_CLIP', clipId: clip.id })
      }

      if (e.key === 'r' || e.key === 'R') {
        handleRegenerate()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  async function handleRegenerate() {
    // Find the source cue so we can pass it to the generation service.
    const cue = state.project?.cues.find(c => c.id === clip.cueId)
    if (!cue) return
    dispatch({ type: 'START_CLIP_REGENERATION', clipId: clip.id })
    const version = await MockGenerationService.generate(cue)
    dispatch({ type: 'COMPLETE_GENERATION', cueId: cue.id, clipId: clip.id, version })
  }

  // ── Body drag (reposition) ────────────────────────────────────────────────

  function onBodyMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    isDragging.current = false
    const startX   = e.clientX
    const startVal = clip.startTime

    function onMouseMove(ev: MouseEvent) {
      const delta = (ev.clientX - startX) / pixelsPerSecond
      if (Math.abs(delta) > 0.05) isDragging.current = true
      const newStart = Math.max(0, startVal + delta)
      onUpdate({ ...clip, startTime: newStart })
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
    if (!isDragging.current) onSelect()
  }

  // ── Right-edge trim ───────────────────────────────────────────────────────

  function onRightHandleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    const startX   = e.clientX
    const startDur = clip.duration

    function onMouseMove(ev: MouseEvent) {
      const delta = (ev.clientX - startX) / pixelsPerSecond
      const newDuration = Math.max(0.25, startDur + delta)
      onUpdate({ ...clip, duration: newDuration })
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── Left-edge trim ────────────────────────────────────────────────────────

  function onLeftHandleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    const startX   = e.clientX
    const end      = clip.startTime + clip.duration

    function onMouseMove(ev: MouseEvent) {
      const delta    = (ev.clientX - startX) / pixelsPerSecond
      const newStart = Math.max(0, Math.min(clip.startTime + delta, end - 0.25))
      const newDur   = end - newStart
      onUpdate({ ...clip, startTime: newStart, duration: newDur })
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
        top:          6,
        height:       44,
        background:   isGenerating ? '#555' : '#4a9eff',
        opacity:      isMuted ? 0.35 : 1,
        borderRadius: 4,
        cursor:       'grab',
        userSelect:   'none',
        display:      'flex',
        alignItems:   'center',
        overflow:     'hidden',
        outline:      isSelected ? '2px solid #fff' : 'none',
        // Striped pattern for generating state
        backgroundImage: isGenerating
          ? 'repeating-linear-gradient(45deg, #555 0, #555 6px, #444 6px, #444 12px)'
          : undefined,
      }}
    >
      {/* Left trim handle */}
      <div
        onMouseDown={onLeftHandleMouseDown}
        style={{ width: 6, height: '100%', cursor: 'ew-resize', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}
      />

      {/* State badges */}
      <span style={{ flex: 1, fontSize: 10, color: '#fff', padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {isGenerating && '⏳ Generating'}
        {isOutdated   && '⚠ Outdated'}
        {isMuted      && '🔇'}
      </span>

      {/* Right trim handle */}
      <div
        onMouseDown={onRightHandleMouseDown}
        style={{ width: 6, height: '100%', cursor: 'ew-resize', flexShrink: 0, background: 'rgba(0,0,0,0.3)' }}
      />
    </div>
  )
}
