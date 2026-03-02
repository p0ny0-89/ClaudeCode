# Component Map — Falling Tree

Hierarchical breakdown of all React components, their responsibilities, props, and key interactions.

---

## Tree Overview

```
<App>
  <VideoUpload />
  <ModeRouter>
    <StagingView>
      <VideoPlayer />
      <StagingTimeline>
        <CueMarker />
        <CueModal />
      </StagingTimeline>
      <GenerateButton />
    </StagingView>

    <EditorView>
      <VideoPlayer />
      <EditorTimeline>
        <LayerTrack>
          <AudioClip />
        </LayerTrack>
      </EditorTimeline>
      <ClipPropertiesPanel />
      <TransportControls />
      <ExportPanel />
    </EditorView>
  </ModeRouter>
</App>
```

---

## Component Definitions

### `<App>`

**Purpose:** Root component. Owns the top-level `Project` state and determines whether to show `VideoUpload` or route to a mode.

**Props:** None (root)

**Key interactions:**
- Initialises a blank `Project` on mount
- Passes `project` and `dispatch` / store actions down via context
- Renders `<VideoUpload>` when no video is loaded; renders `<ModeRouter>` once a video URL exists

---

### `<VideoUpload>`

**Purpose:** Entry screen for uploading a video file.

**Props:**
```typescript
{
  onUpload: (file: File) => void;
}
```

**Key interactions:**
- Accepts drag-and-drop or file picker input
- Reads file duration using a temporary `HTMLVideoElement`
- Calls `onUpload` with the `File`; parent stores the object URL and duration on `Project`

---

### `<ModeRouter>`

**Purpose:** Switches between `StagingView` and `EditorView` based on the current mode.

**Props:**
```typescript
{
  mode: 'staging' | 'editor';
}
```

**Key interactions:**
- Reads `mode` from global state
- Renders `<StagingView>` or `<EditorView>` accordingly
- Mode transitions to `editor` when generation completes

---

## Staging Mode

### `<StagingView>`

**Purpose:** Layout shell for the staging (spotting) workflow.

**Props:** None (reads from context)

**Key interactions:**
- Composes `<VideoPlayer>`, `<StagingTimeline>`, and `<GenerateButton>`
- Passes current playhead position from the video player to the timeline

---

### `<VideoPlayer>`

**Purpose:** Renders the uploaded video and exposes playback controls. Used in both modes.

**Props:**
```typescript
{
  videoUrl:    string;
  onTimeUpdate: (currentTime: number) => void;
  externalTime?: number;   // allows parent to seek the player (e.g. clicking timeline)
}
```

**Key interactions:**
- Syncs `currentTime` with the parent via `onTimeUpdate` on each `timeupdate` event
- Responds to `externalTime` prop changes to seek the video element

---

### `<StagingTimeline>`

**Purpose:** Scrollable horizontal timeline showing the video duration with cue markers overlaid.

**Props:**
```typescript
{
  duration:    number;       // total video duration in seconds
  currentTime: number;       // playhead position in seconds
  cues:        Cue[];
  onCueAdd:    (startTime: number) => void;
  onCueUpdate: (cue: Cue) => void;
  onCueDelete: (cueId: string) => void;
  onSeek:      (time: number) => void;
}
```

**Key interactions:**
- Clicking an empty area of the timeline calls `onCueAdd` with the calculated timestamp
- Clicking the timeline background calls `onSeek` to reposition the playhead
- Renders a `<CueMarker>` for each cue in `cues`
- Opens `<CueModal>` on cue click or creation

---

### `<CueMarker>`

**Purpose:** Visual representation of a single cue on the staging timeline. Draggable, with resizable bracket handles.

**Props:**
```typescript
{
  cue:          Cue;
  pixelsPerSecond: number;
  onUpdate:     (updated: Cue) => void;
  onDelete:     (cueId: string) => void;
  onClick:      (cueId: string) => void;
}
```

**Key interactions:**
- Drag the body to update `cue.startTime`
- Drag left/right bracket handles to update `cue.duration`
- Click to open `<CueModal>` for editing
- Displays the cue type tag as a colour-coded label
- Displays an "Outdated" badge if `cue.state` implies a mismatch with its clip

---

### `<CueModal>`

**Purpose:** Inline or overlay form for editing a cue's tag and prompt.

**Props:**
```typescript
{
  cue:      Cue;
  onSave:   (updated: Cue) => void;
  onDelete: (cueId: string) => void;
  onClose:  () => void;
}
```

**Key interactions:**
- Shows a type selector (SFX / Music / Voice / Ambience)
- Shows a textarea for the prompt
- Save writes changes back via `onSave`
- Delete calls `onDelete` and closes the modal
- If the cue has an associated generated clip, saving marks the clip as `Outdated`

---

### `<GenerateButton>`

**Purpose:** Triggers AI generation for all pending (ungenerated) cues.

**Props:**
```typescript
{
  cues:       Cue[];
  onGenerate: () => void;
  isLoading:  boolean;
}
```

**Key interactions:**
- Disabled when no cues exist or when `isLoading` is true
- On click, calls `onGenerate` which kicks off the generation pipeline and transitions mode to `editor`

---

## Editor Mode

### `<EditorView>`

**Purpose:** Layout shell for the mix/edit workflow.

**Props:** None (reads from context)

**Key interactions:**
- Composes `<VideoPlayer>`, `<EditorTimeline>`, `<ClipPropertiesPanel>`, `<TransportControls>`, and `<ExportPanel>`
- Maintains `selectedClipId` state and passes it to `<ClipPropertiesPanel>`

---

### `<EditorTimeline>`

**Purpose:** Scrollable multi-track timeline showing all `Layer` tracks and their `AudioClip` children.

**Props:**
```typescript
{
  tracks:       Layer[];
  currentTime:  number;
  duration:     number;
  selectedClipId: string | null;
  onClipSelect: (clipId: string) => void;
  onClipUpdate: (clip: AudioClip) => void;
  onSeek:       (time: number) => void;
}
```

**Key interactions:**
- Renders one `<LayerTrack>` per entry in `tracks`
- Clicking the timeline ruler calls `onSeek`
- Passes selection and update callbacks down to each track

---

### `<LayerTrack>`

**Purpose:** One horizontal track row in the editor timeline, representing a single layer type (SFX, Music, Voice, or Ambience).

**Props:**
```typescript
{
  layer:          Layer;
  pixelsPerSecond: number;
  currentTime:    number;
  selectedClipId: string | null;
  onClipSelect:   (clipId: string) => void;
  onClipUpdate:   (clip: AudioClip) => void;
}
```

**Key interactions:**
- Labels the track by `layer.type`
- Renders an `<AudioClip>` for each clip in `layer.clips`
- Passes through selection and update handlers

---

### `<AudioClip>`

**Purpose:** Draggable, trimmable, stateful clip block on a layer track.

**Props:**
```typescript
{
  clip:            AudioClip;
  pixelsPerSecond: number;
  isSelected:      boolean;
  onSelect:        () => void;
  onUpdate:        (updated: AudioClip) => void;
}
```

**Key interactions:**
- Drag horizontally to update `clip.startTime`
- Drag left/right edges to trim `clip.duration`
- Keyboard shortcuts when selected:
  - `M` — toggle mute (toggles `ClipState.Muted`)
  - `D` — duplicate the clip
  - `R` — regenerate (triggers generation service, adds new `AudioVersion`)
- Displays state visually: dimmed for muted, striped for generating, badged for outdated
- Click to select; calls `onSelect`

---

### `<ClipPropertiesPanel>`

**Purpose:** Sidebar panel for inspecting and editing the selected clip's properties.

**Props:**
```typescript
{
  clip:     AudioClip | null;
  onUpdate: (updated: AudioClip) => void;
}
```

**Key interactions:**
- Shows volume slider (0–100%)
- Shows fade in / fade out duration inputs (in seconds)
- Shows version navigator: "Version 2 of 3" with previous/next arrows
  - Changing version updates `clip.activeVersionId`
- Shows source prompt (read-only, with a link to re-open the cue modal)
- Hidden / empty state when no clip is selected

---

### `<TransportControls>`

**Purpose:** Playback controls bar synced to the video player and editor timeline.

**Props:**
```typescript
{
  currentTime: number;
  duration:    number;
  isPlaying:   boolean;
  onPlay:      () => void;
  onPause:     () => void;
  onSeek:      (time: number) => void;
}
```

**Key interactions:**
- Play/pause button toggles `isPlaying`
- Scrub bar allows seeking by dragging or clicking
- Displays `currentTime` and `duration` in `MM:SS.mm` format

---

### `<ExportPanel>`

**Purpose:** Controls for exporting the final mix.

**Props:**
```typescript
{
  project:  Project;
  onExport: (options: ExportOptions) => void;
}
```

```typescript
interface ExportOptions {
  format: 'mixed_audio' | 'stems' | 'video_with_audio';
}
```

**Key interactions:**
- Radio/tab selection for export format
- "Export" button triggers `onExport`
- During export, shows a progress indicator
- On completion, triggers a file download
