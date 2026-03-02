import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { AudioClip, ClipState } from '../../types'
import { MockGenerationService } from '../../services/MockGenerationService'
import VideoPlayer from '../shared/VideoPlayer'
import EditorTimeline from './EditorTimeline'
import ClipPropertiesPanel from './ClipPropertiesPanel'
import TransportControls from './TransportControls'
import ExportPanel from './ExportPanel'

export default function EditorView() {
  const { state, dispatch } = useProject()
  const project = state.project!

  const [seekTo,         setSeekTo]         = useState<number | undefined>(undefined)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const selectedClip: AudioClip | null =
    state.selectedClipId
      ? project.tracks.flatMap(l => l.clips).find(c => c.id === state.selectedClipId) ?? null
      : null

  const sourceCue = selectedClip
    ? project.cues.find(c => c.id === selectedClip.cueId) ?? null
    : null

  function handleTimeUpdate(time: number) {
    dispatch({ type: 'SET_CURRENT_TIME', time })
  }

  function handleSeek(time: number) {
    setSeekTo(time)
    dispatch({ type: 'SET_CURRENT_TIME', time })
  }

  function handleClipSelect(clipId: string) {
    dispatch({ type: 'SELECT_CLIP', clipId })
  }

  function handleClipUpdate(clip: AudioClip) {
    dispatch({ type: 'UPDATE_CLIP', clip })
  }

  function handlePlay() {
    dispatch({ type: 'SET_PLAYING', isPlaying: true })
  }

  function handlePause() {
    dispatch({ type: 'SET_PLAYING', isPlaying: false })
  }

  async function handleRegenerate(newPrompt: string) {
    if (!selectedClip || !sourceCue) return
    setIsRegenerating(true)
    try {
      // Update the cue's prompt (also marks the clip Outdated via UPDATE_CUE reducer)
      const updatedCue = { ...sourceCue, prompt: newPrompt }
      dispatch({ type: 'UPDATE_CUE', cue: updatedCue })
      // Immediately begin regeneration so the clip moves to Generating
      dispatch({ type: 'START_CLIP_REGENERATION', clipId: selectedClip.id })
      const version = await MockGenerationService.generate(updatedCue)
      dispatch({ type: 'COMPLETE_GENERATION', cueId: sourceCue.id, clipId: selectedClip.id, version })
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <VideoPlayer
        videoUrl={project.videoUrl}
        onTimeUpdate={handleTimeUpdate}
        seekTo={seekTo}
      />

      <EditorTimeline
        tracks={project.tracks}
        currentTime={state.currentTime}
        duration={project.videoDuration}
        selectedClipId={state.selectedClipId}
        onClipSelect={handleClipSelect}
        onClipUpdate={handleClipUpdate}
        onSeek={handleSeek}
      />

      <div style={{ display: 'flex', flex: '0 0 auto' }}>
        {/* key resets ClipPropertiesPanel local state when selection changes */}
        <ClipPropertiesPanel
          key={selectedClip?.id ?? 'none'}
          clip={selectedClip}
          onUpdate={handleClipUpdate}
          sourcePrompt={sourceCue?.prompt ?? ''}
          onRegenerate={handleRegenerate}
          isRegenerating={isRegenerating}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TransportControls
            currentTime={state.currentTime}
            duration={project.videoDuration}
            isPlaying={state.isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
          />
          <ExportPanel project={project} />
        </div>
      </div>
    </div>
  )
}
