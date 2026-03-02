import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { MockGenerationService } from '../../services/MockGenerationService'
import { Cue, CueState } from '../../types'
import VideoPlayer from '../shared/VideoPlayer'
import StagingTimeline from './StagingTimeline'
import GenerateButton from './GenerateButton'

export default function StagingView() {
  const { state, dispatch } = useProject()
  const project = state.project!

  // Explicit seek requests — NOT fed back from currentTime to avoid seek loop.
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined)

  function handleTimeUpdate(time: number) {
    dispatch({ type: 'SET_CURRENT_TIME', time })
  }

  function handleSeek(time: number) {
    setSeekTo(time)
    dispatch({ type: 'SET_CURRENT_TIME', time })
  }

  function handleCueAdd(startTime: number) {
    dispatch({ type: 'ADD_CUE', startTime })
  }

  function handleCueUpdate(cue: Cue) {
    dispatch({ type: 'UPDATE_CUE', cue })
  }

  function handleCueDelete(cueId: string) {
    dispatch({ type: 'DELETE_CUE', cueId })
  }

  async function handleGenerate() {
    const pendingCues = project.cues.filter(c => c.state === CueState.Pending)
    if (pendingCues.length === 0) return

    // Transition to editor immediately so the user can watch clips appear.
    dispatch({ type: 'SET_MODE', mode: 'editor' })

    // Kick off all pending cues in parallel.
    await Promise.all(
      pendingCues.map(async cue => {
        const clipId = crypto.randomUUID()
        dispatch({ type: 'START_CUE_GENERATION', cueId: cue.id, clipId })
        const version = await MockGenerationService.generate(cue)
        dispatch({ type: 'COMPLETE_GENERATION', cueId: cue.id, clipId, version })
      })
    )
  }

  const isGenerating = project.cues.some(c => c.state === CueState.Generating)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <VideoPlayer
        videoUrl={project.videoUrl}
        onTimeUpdate={handleTimeUpdate}
        seekTo={seekTo}
      />
      <StagingTimeline
        duration={project.videoDuration}
        currentTime={state.currentTime}
        cues={project.cues}
        onCueAdd={handleCueAdd}
        onCueUpdate={handleCueUpdate}
        onCueDelete={handleCueDelete}
        onSeek={handleSeek}
      />
      <GenerateButton
        cues={project.cues}
        onGenerate={handleGenerate}
        isLoading={isGenerating}
      />
    </div>
  )
}
