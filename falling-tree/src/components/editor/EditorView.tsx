import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { AudioClip } from '../../types'
import VideoPlayer from '../shared/VideoPlayer'
import EditorTimeline from './EditorTimeline'
import ClipPropertiesPanel from './ClipPropertiesPanel'
import TransportControls from './TransportControls'
import ExportPanel from './ExportPanel'

export default function EditorView() {
  const { state, dispatch } = useProject()
  const project = state.project!

  const [seekTo, setSeekTo] = useState<number | undefined>(undefined)

  const selectedClip: AudioClip | null =
    state.selectedClipId
      ? project.tracks.flatMap(l => l.clips).find(c => c.id === state.selectedClipId) ?? null
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
        <ClipPropertiesPanel
          clip={selectedClip}
          onUpdate={handleClipUpdate}
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
