# MVP Scope — Falling Tree

This document defines what is and is not part of the MVP. Its purpose is to prevent scope creep and keep the first build focused on a working, clean foundation.

---

## MVP Included Features

| Feature | Notes |
|---|---|
| **Video upload** | Accepts mp4/mov/webm via file picker or drag-and-drop. Reads and stores video duration. |
| **Video player** | In-browser playback via `HTMLVideoElement`. Play/pause, scrub. Shared across both modes. |
| **Staging timeline** | Horizontal scrollable timeline scaled to video duration. Click to add cues. |
| **Cue markers** | Draggable position and duration (bracket handles). Colour-coded by type. |
| **Cue modal** | Type selector (SFX / Music / Voice / Ambience) and free-text prompt field. |
| **Cue CRUD** | Create, edit (re-open modal), duplicate, delete. |
| **Generate button** | Triggers the generation pipeline for all pending cues. Transitions to editor on completion. |
| **Mocked AI generation** | Generation service returns pre-recorded audio files. Real AI integration is deferred. The service interface is production-ready so real AI can be swapped in. |
| **Multi-layer editor timeline** | Four fixed tracks (SFX, Music, Voice, Ambience). Clips placed on their matching track. |
| **Clip drag** | Horizontal drag to reposition a clip on its track. |
| **Clip trim** | Drag left/right edge to shorten clip duration. |
| **Mute** | `M` key or button. Clip is silenced during playback and visually dimmed. |
| **Duplicate** | `D` key or button. Creates a copy of the clip on the same track. |
| **Regenerate** | `R` key or button. Re-runs the mock generation for the source cue; result added as a new version. |
| **Clip properties panel** | Volume (0–100%), fade in/out (seconds), version navigator. |
| **Version cycling** | Each generation adds an `AudioVersion`. User can step forward/backward between versions. |
| **Outdated state** | Editing a cue's prompt or type after generation marks the clip as Outdated. |
| **Transport controls** | Play/pause, scrub bar, current time / total duration display. Synced to video. |
| **Export** | Mixed audio (single file), stems (one file per layer), video with audio. Client-side via Web Audio API or a simple server worker. |

---

## MVP Excluded Features

| Feature | Rationale |
|---|---|
| **Real AI backend** | Mocking keeps the MVP focused on UX and architecture. The generation service interface is already abstracted, making swap-in straightforward later. |
| **AI auto-suggestion of cues** | Requires a working AI backend and adds significant UX complexity. Post-MVP. |
| **Marketplace / asset library** | Out of product scope for a prototype. |
| **Real-time collaboration** | Requires a backend, conflict resolution, and auth. Not relevant to a solo prototype. |
| **User accounts / cloud storage** | State is in-memory or local for MVP. Persistence is not required to validate the workflow. |
| **Plugin integrations (VST, DAW bridge)** | Platform-level complexity. Post-MVP. |
| **Advanced audio mixing** | EQ, compression, reverb, sidechain — these require audio DSP work that is out of scope. Volume and fade are sufficient for MVP. |
| **Mobile support** | The timeline interaction model (drag, trim, keyboard shortcuts) is desktop-first. Mobile is deferred. |
| **Undo/redo history** | Desirable but non-trivial to implement correctly. Can be added post-MVP once the state model is stable. |
| **Waveform visualisation on clips** | Requires decoding audio and rendering waveform data. Clips show solid colour blocks in MVP. |
| **Looping / beat-sync** | No beat detection or loop points in MVP. |

---

## Mocking Strategy

AI generation is mocked in MVP to unblock development of the full UI and data pipeline without depending on a live AI service.

### How mocking works

- A `GenerationService` interface is defined in the codebase:
  ```typescript
  interface GenerationService {
    generate(cue: Cue): Promise<AudioVersion>;
  }
  ```
- The MVP ships a `MockGenerationService` that:
  - Waits a configurable delay (e.g. 1–3 seconds) to simulate latency
  - Returns a pre-recorded audio file from `/public/mock-audio/` based on `cue.type`
  - Marks the clip as `ready` after the delay

- A `RealGenerationService` can be added later and injected at the app root — no UI component needs to change.

### Mock audio files (one per layer type)

| Layer | File |
|---|---|
| SFX | `/public/mock-audio/sfx-sample.mp3` |
| Music | `/public/mock-audio/music-sample.mp3` |
| Voice | `/public/mock-audio/voice-sample.mp3` |
| Ambience | `/public/mock-audio/ambience-sample.mp3` |

---

## Acceptance Criteria

The MVP is considered done when:

- [ ] A user can upload a video and see it play in the staging view
- [ ] A user can add, edit, and delete cue markers on the staging timeline
- [ ] Cue duration is adjustable by dragging bracket handles
- [ ] Each cue has a type tag and a prompt field
- [ ] Clicking "Generate Audio" triggers mock generation and transitions to the editor
- [ ] Generated clips appear on their correct layer tracks in the editor timeline
- [ ] Clips can be dragged and trimmed
- [ ] `M`, `D`, and `R` keyboard shortcuts work on a selected clip
- [ ] Volume and fade in/out are adjustable in the clip properties panel
- [ ] Version cycling steps between generated versions for a clip
- [ ] Editing a cue after generation marks its clip as Outdated
- [ ] Playback in the editor is synced between the video player and the timeline playhead
- [ ] Export produces at least one downloadable file (mixed audio)
- [ ] The codebase compiles cleanly with no TypeScript errors
- [ ] No critical console errors during a full staging → generation → edit → export flow
