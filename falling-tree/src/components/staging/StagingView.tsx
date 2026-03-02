import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import { MockGenerationService } from '../../services/MockGenerationService'
import { MockCueAutoGenerateService } from '../../services/MockCueAutoGenerateService'
import { AutoGenerateConfig, Cue, CueState } from '../../types'
import VideoPlayer from '../shared/VideoPlayer'
import StagingTimeline from './StagingTimeline'
import GenerateButton from './GenerateButton'
import AutoGenerateModal from './AutoGenerateModal'

export default function StagingView() {
  const { state, dispatch } = useProject()
  const project = state.project!

  const [seekTo,         setSeekTo]         = useState<number | undefined>(undefined)
  const [showAutoModal,  setShowAutoModal]   = useState(false)

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

  // ── Audio generation ────────────────────────────────────────────────────────

  async function handleGenerate() {
    const pendingCues = project.cues.filter(c => c.state === CueState.Pending)
    if (pendingCues.length === 0) return

    dispatch({ type: 'SET_MODE', mode: 'editor' })

    await Promise.all(
      pendingCues.map(async cue => {
        const clipId = crypto.randomUUID()
        dispatch({ type: 'START_CUE_GENERATION', cueId: cue.id, clipId })
        const version = await MockGenerationService.generate(cue)
        dispatch({ type: 'COMPLETE_GENERATION', cueId: cue.id, clipId, version })
      })
    )
  }

  // ── Auto-generate cues ──────────────────────────────────────────────────────

  async function handleAutoGenerate(
    configFields: Omit<AutoGenerateConfig, 'id' | 'createdAt'>
  ) {
    const config: AutoGenerateConfig = {
      ...configFields,
      id:        crypto.randomUUID(),
      createdAt: Date.now(),
    }

    dispatch({ type: 'START_AUTO_GENERATE' })
    try {
      const suggestions = await MockCueAutoGenerateService.generate(config, project.videoDuration)
      dispatch({ type: 'COMPLETE_AUTO_GENERATE', config, suggestions })
    } catch {
      dispatch({ type: 'CANCEL_AUTO_GENERATE' })
    } finally {
      setShowAutoModal(false)
    }
  }

  const isGenerating    = project.cues.some(c => c.state === CueState.Generating)
  const isAutoGenerating = state.autoGenerating

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

      {/* Toolbar row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: '1px solid #333' }}>
        <button
          onClick={() => setShowAutoModal(true)}
          disabled={isAutoGenerating}
          style={{
            padding:      '10px 20px',
            fontSize:     14,
            fontWeight:   600,
            background:   isAutoGenerating ? '#333' : '#2a2a2a',
            color:        isAutoGenerating ? '#666' : '#9b59b6',
            border:       '1px solid ' + (isAutoGenerating ? '#444' : '#9b59b6'),
            borderRadius: 6,
            cursor:       isAutoGenerating ? 'not-allowed' : 'pointer',
          }}
        >
          {isAutoGenerating ? '✦ Generating Cues…' : '✦ Auto-Generate Cues'}
        </button>

        <span style={{ fontSize: 12, color: '#555' }}>
          {project.cues.length > 0
            ? `${project.cues.length} cue${project.cues.length !== 1 ? 's' : ''} on timeline`
            : 'Click the timeline to add cues, or use Auto-Generate'}
        </span>

        <div style={{ marginLeft: 'auto' }}>
          <GenerateButton
            cues={project.cues}
            onGenerate={handleGenerate}
            isLoading={isGenerating}
          />
        </div>
      </div>

      {showAutoModal && (
        <AutoGenerateModal
          onGenerate={handleAutoGenerate}
          onCancel={() => setShowAutoModal(false)}
          isLoading={isAutoGenerating}
        />
      )}
    </div>
  )
}
