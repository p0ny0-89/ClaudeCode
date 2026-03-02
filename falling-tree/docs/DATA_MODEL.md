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

// ClipState reflects the current lifecycle state of a generated audio clip.
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
```

---

## Core Entities

### `Project`

Top-level container for a user's work session.

```typescript
interface Project {
  id:         string;      // UUID
  name:       string;      // user-facing project name
  videoUrl:   string;      // object URL or remote URL of the uploaded video
  videoDuration: number;   // total video duration in seconds
  cues:       Cue[];       // all staging cues (ordered by startTime)
  tracks:     Layer[];     // editor tracks, one per LayerType
  createdAt:  number;      // Unix timestamp (ms)
  updatedAt:  number;      // Unix timestamp (ms)
}
```

---

### `Cue`

A staging marker representing the user's intent for a section of audio. Cues exist independently of generated clips.

```typescript
interface Cue {
  id:         string;      // UUID
  type:       CueType;     // SFX | Music | Voice | Ambience
  prompt:     string;      // natural-language generation prompt
  startTime:  number;      // start position in seconds (relative to video)
  duration:   number;      // cue length in seconds
  state:      CueState;    // current cue lifecycle state
  clipId:     string | null; // ID of the AudioClip generated from this cue, or null
}

// CueState tracks whether generation has occurred for this cue.
enum CueState {
  Pending    = 'pending',     // not yet generated
  Generating = 'generating',  // generation in-flight
  Generated  = 'generated',   // at least one clip version exists
}
```

---

### `AudioClip`

A generated audio clip tied to a source cue and placed on a layer track in the editor.

```typescript
interface AudioClip {
  id:           string;        // UUID
  cueId:        string;        // ID of the source Cue
  layerType:    LayerType;     // which track this clip lives on
  startTime:    number;        // position in seconds on the editor timeline
  duration:     number;        // playback length in seconds (may differ from cue duration after trimming)
  volume:       number;        // 0.0 – 1.0
  fadeIn:       number;        // fade-in duration in seconds
  fadeOut:      number;        // fade-out duration in seconds
  state:        ClipState;     // idle | generating | ready | outdated | muted
  activeVersionId: string;     // ID of the currently selected AudioVersion
  versions:     AudioVersion[]; // all generated versions, newest first
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

## Relationships

```
Project
 ├── Cue[]          (staging intent, ordered by startTime)
 └── Layer[]        (editor tracks, one per LayerType)
      └── AudioClip[]   (generated clips, ordered by startTime)
           └── AudioVersion[]  (generation history, newest first)

Cue ──cueId──▶ AudioClip  (one-to-one; null until generated)
AudioClip ──activeVersionId──▶ AudioVersion  (points to active version)
```

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
