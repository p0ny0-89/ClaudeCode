# Data Model — Falling Tree

All core entities are defined as TypeScript interfaces. The model is designed to be non-destructive: source cues and all generated versions are always preserved.

---

## Enums

```typescript
enum CueType {
  SFX      = 'SFX',
  Music    = 'Music',
  Voice    = 'Voice',
  Ambience = 'Ambience',
}

// CueState tracks whether generation has occurred for this cue.
enum CueState {
  Pending    = 'pending',     // not yet generated
  Generating = 'generating',  // generation in-flight
  Generated  = 'generated',   // at least one clip version exists
}

// ClipState reflects the current lifecycle state of a generated audio clip.
// Muted is an overlay state — a muted clip retains its underlying state
// (Ready or Outdated) and is restored when unmuted.
enum ClipState {
  Idle        = 'idle',        // cue exists but generation has not been triggered
  Generating  = 'generating',  // generation request is in-flight
  Ready       = 'ready',       // generation complete and clip is usable
  Outdated    = 'outdated',    // source cue was edited after this clip was generated
  Muted       = 'muted',       // clip exists but is silenced during playback
}

// LayerType mirrors CueType — each cue type maps to its own timeline track.
enum LayerType {
  SFX      = 'SFX',
  Music    = 'Music',
  Voice    = 'Voice',
  Ambience = 'Ambience',
}

// Records how a cue was created. Set at creation and never mutated.
// An auto-generated cue that the user edits remains source:'auto' —
// source is provenance, not a mode gate.
enum CueSource {
  Manual = 'manual', // placed by the user on the staging timeline
  Auto   = 'auto',   // produced by the Auto-Generate Cues AI service
}

// Style presets for the Auto-Generate Cues configuration modal.
enum PresetType {
  CleanUIDemo      = 'clean_ui_demo',
  CinematicTrailer = 'cinematic_trailer',
  VlogLifestyle    = 'vlog_lifestyle',
  GamingFastCuts   = 'gaming_fast_cuts',
  MinimalAmbience  = 'minimal_ambience',
  Custom           = 'custom',
}

// Controls the density and impact of auto-generated cue suggestions.
enum IntensityLevel {
  Subtle   = 'subtle',
  Balanced = 'balanced',
  Bold     = 'bold',
}
```

---

## Core Entities

### `Project`

Top-level container for a user's work session.

```typescript
interface Project {
  id:                   string;              // UUID
  name:                 string;              // user-facing project name
  videoUrl:             string;              // object URL or remote URL of the uploaded video
  videoDuration:        number;              // total video duration in seconds
  cues:                 Cue[];              // all staging cues (ordered by startTime)
  tracks:               Layer[];            // editor tracks, one per LayerType
  autoGenerateConfigs:  AutoGenerateConfig[]; // history of auto-generate runs, newest last
  createdAt:            number;              // Unix timestamp (ms)
  updatedAt:            number;              // Unix timestamp (ms)
}
```

---

### `Cue`

A staging marker representing the user's intent for a section of audio. Cues exist independently of generated clips.

```typescript
interface Cue {
  id:                   string;        // UUID
  type:                 CueType;       // SFX | Music | Voice | Ambience
  prompt:               string;        // natural-language generation prompt
  startTime:            number;        // start position in seconds (relative to video)
  duration:             number;        // cue length in seconds
  state:                CueState;      // pending | generating | generated
  clipId:               string | null; // ID of the AudioClip generated from this cue, or null
  source:               CueSource;     // manual | auto — set at creation, immutable
  autoGenerateConfigId?: string;       // links to the AutoGenerateConfig that created this cue
                                       // only present when source === 'auto'
}
```

---

### `AutoGenerateConfig`

Records the user's configuration for a single Auto-Generate Cues run. Stored on `Project.autoGenerateConfigs` so generated cues can trace back to the settings that produced them, and to support future "regenerate suggestions" flows.

```typescript
interface AutoGenerateConfig {
  id:           string;         // UUID
  preset:       PresetType;     // style preset selected in the modal
  prompt?:      string;         // optional user guidance (biases AI cue detection)
  includeTypes: CueType[];      // which CueTypes to generate (subset of all four)
  intensity:    IntensityLevel; // cue density and impact level
  createdAt:    number;         // Unix timestamp (ms)
}
```

---

### `SuggestedCue`

A transient type returned by `CueAutoGenerateService.generate()`. The reducer promotes each `SuggestedCue` into a full `Cue` entity by adding the system-managed fields (`id`, `state`, `clipId`, `source`, `autoGenerateConfigId`).

This separation keeps the service interface decoupled from domain-managed state.

```typescript
interface SuggestedCue {
  type:      CueType; // AI-assigned type
  prompt:    string;  // AI-suggested prompt
  startTime: number;  // suggested start in seconds
  duration:  number;  // suggested duration in seconds
}
```

---

### `AudioClip`

A generated audio clip tied to a source cue and placed on a layer track in the editor.

```typescript
interface AudioClip {
  id:              string;         // UUID
  cueId:           string;         // ID of the source Cue
  layerType:       LayerType;      // which track this clip lives on
  startTime:       number;         // position in seconds on the editor timeline
  duration:        number;         // playback length in seconds (may differ from cue duration after trimming)
  volume:          number;         // 0.0 – 1.0
  fadeIn:          number;         // fade-in duration in seconds
  fadeOut:         number;         // fade-out duration in seconds
  state:           ClipState;      // idle | generating | ready | outdated | muted
  activeVersionId: string;         // ID of the currently selected AudioVersion
  versions:        AudioVersion[]; // all generated versions, newest first
}
```

---

### `AudioVersion`

A single AI-generated result for a clip. Multiple versions accumulate as the user regenerates.

```typescript
interface AudioVersion {
  id:          string;  // UUID
  url:         string;  // object URL or remote URL of the audio file
  generatedAt: number;  // Unix timestamp (ms)
}
```

---

### `Layer`

One track row in the editor timeline, corresponding to a single layer type.

```typescript
interface Layer {
  type:  LayerType;    // SFX | Music | Voice | Ambience
  clips: AudioClip[];  // all clips on this track, ordered by startTime
}
```

---

## Service Interfaces

```typescript
// Audio generation — one AudioVersion per Cue.
interface GenerationService {
  generate(cue: Cue): Promise<AudioVersion>;
}

// Cue auto-generation — analyzes the video and returns a set of SuggestedCue objects.
// The reducer promotes suggestions into Cue entities; the service never touches domain state.
interface CueAutoGenerateService {
  generate(config: AutoGenerateConfig, videoDuration: number): Promise<SuggestedCue[]>;
}
```

---

## Relationships

```
Project
 ├── Cue[]                    (staging intent, ordered by startTime)
 │    └── source: manual | auto
 │         └── auto → autoGenerateConfigId ──▶ AutoGenerateConfig
 ├── Layer[]                  (editor tracks, one per LayerType)
 │    └── AudioClip[]         (generated clips, ordered by startTime)
 │         └── AudioVersion[] (generation history, newest first)
 └── AutoGenerateConfig[]     (history of auto-generate runs)

Cue ──clipId──▶ AudioClip            (one-to-one; null until generated)
AudioClip ──activeVersionId──▶ AudioVersion  (points to active version)
Cue (auto) ──autoGenerateConfigId──▶ AutoGenerateConfig
```

---

## AppState (Reducer)

`AppState` is the UI runtime state — distinct from `Project`, which is the persisted domain model.

```typescript
interface AppState {
  project:        Project | null
  mode:           'staging' | 'editor'
  selectedClipId: string | null
  currentTime:    number
  isPlaying:      boolean
  autoGenerating: boolean  // true while CueAutoGenerateService.generate() is in-flight
}
```

`autoGenerating` lives on `AppState` (not `Project`) because it is transient UI state, not part of the saved work session.

---

## State Transitions

### Cue lifecycle

```
Pending → Generating → Generated
                ↑
       (on regenerate, cue stays Generated but clip's state
        temporarily moves back to Generating for the new version)
```

### Clip lifecycle

```
Idle → Generating → Ready
                       ↑
              Outdated (if source cue is edited after generation)
              Muted    (user action; does not change other state)
```

### Auto-generate cue flow

```
AppState.autoGenerating = false
  → START_AUTO_GENERATE
AppState.autoGenerating = true  (service call in-flight)
  → COMPLETE_AUTO_GENERATE(config, suggestions)
      - AutoGenerateConfig stored in Project.autoGenerateConfigs
      - Each SuggestedCue promoted to Cue (source:'auto', state:Pending)
      - Cues merged into Project.cues (sorted by startTime)
AppState.autoGenerating = false

  → CANCEL_AUTO_GENERATE  (error path / user cancel)
AppState.autoGenerating = false  (no cues added)
```

Auto-generated cues then follow the standard cue lifecycle (Pending → Generating → Generated) once the user triggers "Generate Audio".

---

## Invariants

- `Cue.source` is set at creation and never mutated by any action.
- `Cue.autoGenerateConfigId` is only present when `Cue.source === CueSource.Auto`.
- `Project.autoGenerateConfigs` is append-only; configs are never deleted.
- Manual and auto cues are first-class `Cue` objects — all existing cue operations (update, delete, generate audio) apply equally to both.
- `SuggestedCue` never enters domain state directly; only the reducer creates `Cue` entities from it.
