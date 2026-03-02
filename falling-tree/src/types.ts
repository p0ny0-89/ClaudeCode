// ─── Enums ────────────────────────────────────────────────────────────────────

/** Classifies what kind of audio a cue represents. */
export enum CueType {
  SFX      = 'SFX',
  Music    = 'Music',
  Voice    = 'Voice',
  Ambience = 'Ambience',
}

/** Tracks whether a cue has been sent to the generation pipeline. */
export enum CueState {
  Pending    = 'pending',    // not yet generated
  Generating = 'generating', // generation in-flight
  Generated  = 'generated',  // at least one clip version exists
}

/**
 * Reflects the current lifecycle state of a generated audio clip.
 * Muted is an overlay state — a muted clip retains its underlying state
 * (Ready or Outdated) and is restored when unmuted.
 */
export enum ClipState {
  Idle       = 'idle',       // cue exists but generation has not been triggered
  Generating = 'generating', // generation request is in-flight
  Ready      = 'ready',      // generation complete and clip is usable
  Outdated   = 'outdated',   // source cue was edited after this clip was generated
  Muted      = 'muted',      // clip exists but is silenced during playback
}

/** Maps 1-to-1 with CueType — each cue type has its own timeline track. */
export enum LayerType {
  SFX      = 'SFX',
  Music    = 'Music',
  Voice    = 'Voice',
  Ambience = 'Ambience',
}

// ─── Core Entities ────────────────────────────────────────────────────────────

/** Top-level container for a user's work session. */
export interface Project {
  id:            string;  // UUID
  name:          string;  // user-facing project name
  videoUrl:      string;  // object URL or remote URL of the uploaded video
  videoDuration: number;  // total video duration in seconds
  cues:          Cue[];   // all staging cues, ordered by startTime
  tracks:        Layer[]; // editor tracks, one per LayerType
  createdAt:     number;  // Unix timestamp (ms)
  updatedAt:     number;  // Unix timestamp (ms)
}

/**
 * A staging marker representing the user's intent for a section of audio.
 * Cues exist independently of generated clips — they are never deleted when
 * clips are regenerated or removed.
 */
export interface Cue {
  id:        string;        // UUID
  type:      CueType;       // SFX | Music | Voice | Ambience
  prompt:    string;        // natural-language generation prompt
  startTime: number;        // start position in seconds (relative to video)
  duration:  number;        // cue length in seconds
  state:     CueState;      // pending | generating | generated
  clipId:    string | null; // ID of the AudioClip produced from this cue, or null
}

/**
 * A generated audio clip tied to a source cue and placed on a layer track.
 * Duration may differ from the source cue after trimming.
 */
export interface AudioClip {
  id:              string;         // UUID
  cueId:           string;         // ID of the source Cue
  layerType:       LayerType;      // which track this clip lives on
  startTime:       number;         // position in seconds on the editor timeline
  duration:        number;         // playback length in seconds
  volume:          number;         // 0.0 – 1.0
  fadeIn:          number;         // fade-in duration in seconds
  fadeOut:         number;         // fade-out duration in seconds
  state:           ClipState;      // idle | generating | ready | outdated | muted
  activeVersionId: string;         // ID of the currently selected AudioVersion
  versions:        AudioVersion[]; // all generated versions, newest first
}

/**
 * A single AI-generated result for a clip.
 * Multiple versions accumulate as the user regenerates.
 */
export interface AudioVersion {
  id:          string; // UUID
  url:         string; // object URL or remote URL of the audio file
  generatedAt: number; // Unix timestamp (ms)
}

/** One track row in the editor timeline, corresponding to a single layer type. */
export interface Layer {
  type:  LayerType;   // SFX | Music | Voice | Ambience
  clips: AudioClip[]; // all clips on this track, ordered by startTime
}

// ─── Service Interface ────────────────────────────────────────────────────────

/**
 * Abstraction layer for AI audio generation.
 * The MVP ships a MockGenerationService; a real implementation can be
 * injected at the app root without touching any UI component.
 */
export interface GenerationService {
  generate(cue: Cue): Promise<AudioVersion>;
}
