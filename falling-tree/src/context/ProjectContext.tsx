import { createContext, useContext, useReducer, ReactNode } from 'react'
import {
  Project,
  Cue,
  AudioClip,
  AudioVersion,
  Layer,
  CueType,
  CueState,
  ClipState,
  LayerType,
} from '../types'

// ─── State ────────────────────────────────────────────────────────────────────

export interface AppState {
  project:       Project | null
  mode:          'staging' | 'editor'
  selectedClipId: string | null
  currentTime:   number
  isPlaying:     boolean
}

const initialState: AppState = {
  project:        null,
  mode:           'staging',
  selectedClipId: null,
  currentTime:    0,
  isPlaying:      false,
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'INIT_PROJECT';            name: string; videoUrl: string; videoDuration: number }
  | { type: 'ADD_CUE';                 startTime: number }
  | { type: 'UPDATE_CUE';              cue: Cue }
  | { type: 'DELETE_CUE';              cueId: string }
  // Generation: fresh cue → new clip on track
  | { type: 'START_CUE_GENERATION';   cueId: string; clipId: string }
  // Regeneration: clip already exists, just flip to Generating state
  | { type: 'START_CLIP_REGENERATION'; clipId: string }
  // Shared completion: adds AudioVersion, marks clip Ready + cue Generated
  | { type: 'COMPLETE_GENERATION';    cueId: string; clipId: string; version: AudioVersion }
  // Generic clip update (volume, fade, position, trim, etc.)
  | { type: 'UPDATE_CLIP';             clip: AudioClip }
  | { type: 'DUPLICATE_CLIP';          clipId: string }
  | { type: 'SET_MODE';                mode: 'staging' | 'editor' }
  | { type: 'SELECT_CLIP';             clipId: string | null }
  | { type: 'SET_CURRENT_TIME';        time: number }
  | { type: 'SET_PLAYING';             isPlaying: boolean }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID()
}

function now(): number {
  return Date.now()
}

/** CueType and LayerType share identical string values. */
function toLayerType(cueType: CueType): LayerType {
  return cueType as unknown as LayerType
}

function emptyTracks(): Layer[] {
  return [
    { type: LayerType.SFX,      clips: [] },
    { type: LayerType.Music,    clips: [] },
    { type: LayerType.Voice,    clips: [] },
    { type: LayerType.Ambience, clips: [] },
  ]
}

function updateClipInTracks(tracks: Layer[], updated: AudioClip): Layer[] {
  return tracks.map(layer => ({
    ...layer,
    clips: layer.clips.map(c => (c.id === updated.id ? updated : c)),
  }))
}

function findClip(tracks: Layer[], clipId: string): AudioClip | undefined {
  for (const layer of tracks) {
    const clip = layer.clips.find(c => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

function removeClipFromTracks(tracks: Layer[], clipId: string): Layer[] {
  return tracks.map(layer => ({
    ...layer,
    clips: layer.clips.filter(c => c.id !== clipId),
  }))
}

function sortedByStartTime<T extends { startTime: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.startTime - b.startTime)
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {

    case 'INIT_PROJECT': {
      const project: Project = {
        id:            uuid(),
        name:          action.name,
        videoUrl:      action.videoUrl,
        videoDuration: action.videoDuration,
        cues:          [],
        tracks:        emptyTracks(),
        createdAt:     now(),
        updatedAt:     now(),
      }
      return { ...state, project, mode: 'staging', currentTime: 0 }
    }

    case 'ADD_CUE': {
      if (!state.project) return state
      const cue: Cue = {
        id:        uuid(),
        type:      CueType.SFX,
        prompt:    '',
        startTime: action.startTime,
        duration:  3,
        state:     CueState.Pending,
        clipId:    null,
      }
      return {
        ...state,
        project: {
          ...state.project,
          cues:      sortedByStartTime([...state.project.cues, cue]),
          updatedAt: now(),
        },
      }
    }

    case 'UPDATE_CUE': {
      if (!state.project) return state
      const updated = action.cue
      // If this cue already has a ready clip, mark it Outdated
      let tracks = state.project.tracks
      if (updated.clipId) {
        const clip = findClip(tracks, updated.clipId)
        if (clip && clip.state === ClipState.Ready) {
          tracks = updateClipInTracks(tracks, { ...clip, state: ClipState.Outdated })
        }
      }
      return {
        ...state,
        project: {
          ...state.project,
          cues:      state.project.cues.map(c => (c.id === updated.id ? updated : c)),
          tracks,
          updatedAt: now(),
        },
      }
    }

    case 'DELETE_CUE': {
      if (!state.project) return state
      const cue = state.project.cues.find(c => c.id === action.cueId)
      let tracks = state.project.tracks
      if (cue?.clipId) {
        tracks = removeClipFromTracks(tracks, cue.clipId)
      }
      return {
        ...state,
        project: {
          ...state.project,
          cues:      state.project.cues.filter(c => c.id !== action.cueId),
          tracks,
          updatedAt: now(),
        },
      }
    }

    case 'START_CUE_GENERATION': {
      if (!state.project) return state
      const { cueId, clipId } = action
      const cue = state.project.cues.find(c => c.id === cueId)
      if (!cue) return state

      const newClip: AudioClip = {
        id:              clipId,
        cueId,
        layerType:       toLayerType(cue.type),
        startTime:       cue.startTime,
        duration:        cue.duration,
        volume:          1,
        fadeIn:          0,
        fadeOut:         0,
        state:           ClipState.Generating,
        activeVersionId: '',
        versions:        [],
      }

      const updatedTracks = state.project.tracks.map(layer => {
        if (layer.type !== toLayerType(cue.type)) return layer
        // Remove any prior clip for this cue (e.g. stale from a previous session)
        const without = layer.clips.filter(c => c.cueId !== cueId)
        return { ...layer, clips: sortedByStartTime([...without, newClip]) }
      })

      return {
        ...state,
        project: {
          ...state.project,
          cues:      state.project.cues.map(c =>
            c.id === cueId ? { ...c, state: CueState.Generating, clipId } : c
          ),
          tracks:    updatedTracks,
          updatedAt: now(),
        },
      }
    }

    case 'START_CLIP_REGENERATION': {
      if (!state.project) return state
      const clip = findClip(state.project.tracks, action.clipId)
      if (!clip) return state
      return {
        ...state,
        project: {
          ...state.project,
          tracks:    updateClipInTracks(state.project.tracks, { ...clip, state: ClipState.Generating }),
          updatedAt: now(),
        },
      }
    }

    case 'COMPLETE_GENERATION': {
      if (!state.project) return state
      const { cueId, clipId, version } = action
      const updatedTracks = state.project.tracks.map(layer => ({
        ...layer,
        clips: layer.clips.map(clip => {
          if (clip.id !== clipId) return clip
          return {
            ...clip,
            state:           ClipState.Ready,
            activeVersionId: version.id,
            versions:        [version, ...clip.versions],
          }
        }),
      }))
      return {
        ...state,
        project: {
          ...state.project,
          cues:      state.project.cues.map(c =>
            c.id === cueId ? { ...c, state: CueState.Generated, clipId } : c
          ),
          tracks:    updatedTracks,
          updatedAt: now(),
        },
      }
    }

    case 'UPDATE_CLIP': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          tracks:    updateClipInTracks(state.project.tracks, action.clip),
          updatedAt: now(),
        },
      }
    }

    case 'DUPLICATE_CLIP': {
      if (!state.project) return state
      const clip = findClip(state.project.tracks, action.clipId)
      if (!clip) return state
      const duplicate: AudioClip = {
        ...clip,
        id:        uuid(),
        startTime: clip.startTime + clip.duration,
      }
      const updatedTracks = state.project.tracks.map(layer => {
        if (layer.type !== clip.layerType) return layer
        return { ...layer, clips: sortedByStartTime([...layer.clips, duplicate]) }
      })
      return {
        ...state,
        project: { ...state.project, tracks: updatedTracks, updatedAt: now() },
      }
    }

    case 'SET_MODE':
      return { ...state, mode: action.mode }

    case 'SELECT_CLIP':
      return { ...state, selectedClipId: action.clipId }

    case 'SET_CURRENT_TIME':
      return { ...state, currentTime: action.time }

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ProjectContextValue {
  state:    AppState
  dispatch: React.Dispatch<Action>
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within a ProjectProvider')
  return ctx
}
