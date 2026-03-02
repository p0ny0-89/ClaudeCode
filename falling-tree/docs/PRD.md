# PRD — Falling Tree

## Overview & Goal

Falling Tree is a web-based AI sound design tool that simulates a professional "sound director" workflow.

The goal is to give video creators and sound designers a streamlined pipeline for adding AI-generated audio to video: mark intent on a timeline, generate audio from those intentions, then mix and export.

The product is prototype-focused. The priority is clean architecture and a well-structured MVP — not feature completeness.

---

## Target Users

- Indie filmmakers and video creators who need quick, prompt-driven sound design
- Sound designers prototyping ideas without a full DAW setup
- Developers and teams evaluating AI audio generation in a real editing workflow

---

## Core Workflow

### Mode 1 — Staging (Spotting Mode)

The user plans audio before generation.

1. Upload a video file
2. Scrub through the video timeline
3. Place cue markers at desired timestamps
4. For each cue:
   - Assign a tag: `SFX`, `Music`, `Voice`, or `Ambience`
   - Write a prompt describing the desired audio
   - Adjust the cue's duration by dragging bracket handles
5. Optionally duplicate, edit, or delete cues
6. Click **Generate Audio** to trigger AI generation and transition to Editor mode

Cues are the user's intent layer — they exist independently of any generated audio.

### Mode 2 — Editor (Mix Mode)

The user refines and mixes generated audio.

After generation, AI-produced audio clips appear on a layered timeline, one track per layer type (SFX, Music, Voice, Ambience).

The user can:
- **Drag** clips to reposition them
- **Trim** clip duration from either end
- **Mute** a clip (`M` key)
- **Duplicate** a clip (`D` key)
- **Regenerate** a clip (`R` key), which runs generation again for that cue
- Adjust per-clip **volume**
- Add **fade in / fade out** envelopes
- **Cycle between versions** — each generation produces a versioned result; the user can step back to earlier outputs

Editing is non-destructive. If a cue's prompt or tag is changed after generation, the corresponding clip is marked **Outdated** but is not automatically deleted.

---

## Feature Requirements

### Staging Mode

| Feature | Behaviour |
|---|---|
| Video upload | Accepts common formats (mp4, mov, webm). Displays in a player with a scrubbing timeline beneath. |
| Cue placement | Click on the timeline to drop a new cue at that timestamp. |
| Cue type tag | Dropdown or tab selection: SFX, Music, Voice, Ambience. |
| Prompt input | Free-text field inside a cue modal. |
| Duration handles | Bracket markers on either end of the cue. Draggable to extend/shorten duration. |
| Cue CRUD | Duplicate, edit (re-open modal), delete. |
| Generate button | Visible and enabled once at least one cue exists. Triggers generation for all ungenerated cues. |

### Editor Mode

| Feature | Behaviour |
|---|---|
| Layered timeline | Four fixed tracks: SFX, Music, Voice, Ambience. Clips appear on their matching track. |
| Clip drag | Move clip left/right on its track. |
| Clip trim | Drag clip edges to shorten. |
| Mute | `M` key or clip context action. Clip appears dimmed. |
| Duplicate | `D` key or context action. |
| Regenerate | `R` key or context action. Reruns generation for the source cue; new result added as a new version. |
| Volume control | Per-clip slider in the properties panel. |
| Fade in/out | Per-clip controls in properties panel. Applied on export and during playback preview. |
| Version cycling | Clip properties panel shows version count and allows stepping forward/backward. |
| Outdated state | Clip displays an "Outdated" badge when its source cue has been edited since generation. |
| Transport controls | Play/pause, scrub, time display (current position / total duration). |
| Export | Exports mixed audio, individual stems per layer, or final video with audio. |

---

## Design Principles

- **Non-destructive editing** — source cues and all generated versions are always preserved
- **Layer-based audio workflow** — audio is organised by type, not arbitrarily stacked
- **Prompt-driven generation** — intent is expressed in natural language; the AI interprets
- **Clear object states** — every clip has an explicit state: `idle`, `generating`, `ready`, `outdated`, `muted`
- **Clean modular component system** — components have single responsibilities and clear prop interfaces
- **Scalable AI abstraction** — generation is behind a service interface; the real AI model can be swapped without touching UI components

---

## Technical Direction

- **Framework:** React with TypeScript
- **Architecture:** Modular component tree with a centralised state store (Zustand or Context)
- **Timeline rendering:** DOM-based (not canvas) for MVP; pixel-per-second scale
- **Audio playback:** Web Audio API in-browser, synced to video via `HTMLMediaElement`
- **AI generation:** Abstracted behind a `GenerationService` interface; mocked initially with pre-recorded audio files
- **Export:** Client-side mixing using Web Audio API offline rendering, or server-side via a worker

---

## Out of Scope

The following are explicitly excluded from this product:

- AI auto-suggestion of cue placements
- Audio marketplace or asset library
- Real-time collaboration / multiplayer
- Plugin integrations (VST, DAW bridge)
- Advanced audio mixing (EQ, compression, reverb)
- Real AI backend (generation is mocked in MVP)
- User accounts or cloud storage
- Mobile support
