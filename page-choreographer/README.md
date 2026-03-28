# Page Choreographer

A premium page transition system for Framer. Choreograph selected page elements during enter and exit transitions with staggered, position-aware animations.

---

## 1. Architecture Overview

### Why opt-in registration instead of DOM scanning?

Approaches that auto-scan the DOM (querySelector, MutationObserver, TreeWalker) are fragile inside Framer:

| Problem | Impact |
|---------|--------|
| Framer re-renders and remounts components unpredictably | Scanned references go stale |
| No stable class names or data attributes on canvas layers | Selectors break across projects |
| CMS collection items are dynamic | Hard to distinguish "should animate" from "shouldn't" |
| Z-order and stacking contexts are complex | Incorrect animation layering |

**Page Choreographer uses explicit opt-in**: each element that should participate wraps itself in a `TransitionTarget`, which registers with a shared singleton store. This gives us:

- **Predictable membership** — only marked elements animate
- **Stable refs** — React refs survive re-renders
- **Per-element control** — each target configures its own preset, group, priority
- **No DOM coupling** — works regardless of Framer's internal DOM structure

### Communication model

```
┌──────────────────────────────────────────────┐
│                Framer Page                    │
│                                               │
│  ┌─────────────────────┐                      │
│  │  Page Choreographer  │◄── configures ──┐   │
│  │  (singleton store)   │                 │   │
│  └────────┬────────────┘                 │   │
│           │                               │   │
│    registers / unregisters               │   │
│           │                               │   │
│  ┌────────▼────────────┐                 │   │
│  │  Transition Target   │  (×N)          │   │
│  │  wraps: Card, Text,  │                │   │
│  │  Image, CMS item     │                │   │
│  └──────────────────────┘                │   │
│                                           │   │
│  ┌──────────────────────┐                │   │
│  │  Transition Link     │── playExit() ──┘   │
│  │  wraps: Button, Nav  │                     │
│  └──────────────────────┘                     │
└──────────────────────────────────────────────┘
```

Components are **siblings** on the Framer canvas (not nested). They communicate through a **module-level singleton store** (`choreographerStore`), which is the correct pattern for Framer code components that need shared state without a parent-child relationship.

### Animation flow

**Page enter:**
1. Page loads → all `TransitionTarget` components mount and register
2. `PageChoreographer` mounts, waits 2 animation frames + configurable delay
3. Store collects visible, enter-eligible targets
4. Targets are sorted by screen position using the configured stagger direction
5. Each target is animated using `framer-motion`'s `animate()` with staggered delays
6. Inline animation styles are cleaned up after animation completes

**Page exit (via Transition Link):**
1. User clicks a `TransitionLink`
2. Link calls `choreographerStore.playExit()`
3. Interaction overlay locks the page (optional)
4. Store collects visible, exit-eligible targets and sorts them
5. Each target animates to its exit state with staggered delays
6. When all animations complete (or timeout fires), navigation occurs

---

## 2. File Structure

```
page-choreographer/
  choreographer-types.ts    — Type definitions and default config
  choreographer-presets.ts  — Enter/exit animation preset definitions
  choreographer-store.ts    — Singleton store: registry, sorting, orchestration
  PageChoreographer.tsx     — Main orchestrator component (Framer canvas)
  TransitionTarget.tsx      — Target wrapper component (Framer canvas)
  TransitionLink.tsx        — Navigation trigger component (Framer canvas)
```

---

## 3. Framer Setup Instructions

### Step 1: Add code files to your Framer project

1. In your Framer project, go to **Assets → Code** (or press `Cmd+Shift+K`)
2. Create these files and paste the corresponding code:
   - `choreographer-types.ts`
   - `choreographer-presets.ts`
   - `choreographer-store.ts`
   - `PageChoreographer.tsx`
   - `TransitionTarget.tsx`
   - `TransitionLink.tsx`

### Step 2: Place Page Choreographer on each page

1. Drag **Page Choreographer** from the code components panel onto your page
2. Position it anywhere — it renders as an invisible badge (visible only on canvas)
3. Configure shared settings in the property panel:
   - **Duration**: 0.6s (default) — base animation length
   - **Stagger**: 0.06s (default) — delay between elements
   - **Stagger Order**: Left → Right, Top → Bottom, Row Major, etc.
   - **Easing**: Smooth, Snappy, Dramatic, Gentle, or Linear
   - **Distance**: pixel distance for translate-based presets
4. If using a shared layout (e.g., navigation + footer), place it on the layout so it's present on every page

### Step 3: Wrap elements with Transition Target

1. Drag **Transition Target** onto the canvas
2. Nest your content inside it (drag card, text, image, etc. into the target)
3. Configure per-target settings:
   - **Enter Preset**: Fade Up, Mask Reveal X, or Mask Reveal Y
   - **Exit Preset**: Rise Wave, Blur Lift, or Scale Fade Grid
   - **Enter / Exit**: Enable one or both
   - **Priority**: Lower numbers animate first in the stagger
   - **Delay Offset**: Add extra delay on top of the stagger position
   - **Mobile**: Disable transitions on narrow viewports

### Step 4: Add Transition Links for exit animations

1. Drag **Transition Link** onto the canvas
2. Nest your button or link content inside it
3. Set the **Link** property to the destination page
4. On click, it will:
   - Play all exit animations
   - Wait for completion (up to timeout)
   - Navigate to the destination

### CMS Collection Use Case

For CMS cards that should animate as a wave:

1. In your CMS Collection List, set each item to use a **Transition Target** wrapper
2. Set all targets to the same group (e.g., `"cards"`)
3. Set enter preset to **Fade Up**, exit preset to **Rise Wave**
4. On the **Page Choreographer**, set Stagger Order to **Left → Right**
5. When a user clicks a **Transition Link**, visible cards will animate out in a left-to-right wave

---

## 4. Property Controls Reference

### Page Choreographer

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Duration | Number | 0.6s | Base animation duration |
| Stagger | Number | 0.06s | Delay between staggered elements |
| Easing | Enum | Smooth | Cubic-bezier preset |
| Stagger Order | Enum | Left → Right | How elements are ordered for stagger |
| In-View Only | Boolean | true | Only animate viewport-visible elements |
| Distance | Number | 40px | Translate distance for movement presets |
| Blur Amount | Number | 8px | Blur intensity for Blur Lift |
| Scale From | Number | 0.92 | Scale value for Scale Fade Grid |
| Lock During Exit | Boolean | true | Block interactions during exit |
| Reduced Motion | Boolean | true | Respect `prefers-reduced-motion` |
| Auto Enter | Boolean | true | Play enter on page load |
| Enter Delay | Number | 0.05s | Delay before enter sequence starts |

### Transition Target

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Content | Component | — | Nested child content |
| Group | String | "default" | Group name for filtering |
| Enter Preset | Enum | Fade Up | Enter animation style |
| Exit Preset | Enum | Rise Wave | Exit animation style |
| Enter | Boolean | true | Participate in enter animations |
| Exit | Boolean | true | Participate in exit animations |
| Mobile | Boolean | true | Enable on mobile viewports |
| Priority | Number | 0 | Stagger order override (lower = earlier) |
| Delay Offset | Number | 0s | Extra delay on top of stagger |
| Visibility | Number | 0.1 | Fraction in-view required to animate |

### Transition Link

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Content | Component | — | Button/link child content |
| Link | Link | "/" | Destination URL or page |
| New Tab | Boolean | false | Open in new tab (skips exit) |
| Timeout | Number | 3s | Max wait for exit before navigating |

---

## 5. Known Limitations (V1)

### Framer platform constraints

- **No SPA routing API**: Framer doesn't expose a public router. `TransitionLink` uses `window.location.href`, which triggers a full page load. Enter animations work because `PageChoreographer` plays on mount. However, this means the browser makes a full HTTP request between pages — no true SPA transition.

- **Canvas vs. published behavior**: The canvas indicator badge on `PageChoreographer` will show during canvas preview. In published sites, it's invisible (no visual footprint since it has `pointerEvents: none`).

- **Module singleton scope**: The singleton store lives in a JS module. If Framer ever loads code components in separate module scopes (unlikely but possible), cross-component communication would break.

### Animation constraints

- **No shared element transitions**: V1 cannot track an element's position across two different pages and morph between them. This would require persistent state across full page navigations.

- **No route-aware presets**: The exit animation is the same regardless of which page you're going to. V1 doesn't know the navigation destination.

- **Stagger direction is global**: All targets on a page share the same stagger direction. You can't have cards stagger left-to-right while a header staggers top-to-bottom in the same choreography.

- **clipPath mask reveals**: `clipPath: inset()` doesn't animate in all browsers with hardware acceleration. Performance is good on modern browsers but may be choppy on older mobile devices.

### Practical constraints

- **Two-frame mount delay**: There's a small delay before enter animations start (two requestAnimationFrame cycles + enterDelay). This ensures targets have registered, but means the first frame may show the hidden initial state.

- **Scale transform origin**: Scale Fade Grid animates from the element's default transform origin (center). Custom transform origins require CSS on the child element.

- **Nested targets**: Placing a `TransitionTarget` inside another `TransitionTarget` is untested and not recommended in V1.

---

## 6. V2 Roadmap

### Center-out staggering
Sort elements by distance from viewport center or from the clicked element's position. Creates a radial expansion/collapse effect.

### Nearest-to-click sorting
On exit, stagger elements starting from the one closest to where the user clicked. Creates a satisfying "ripple from click" effect. `TransitionLink` would pass click coordinates to the store.

### Shared element transitions
The hardest upgrade. Would require:
- Each target to declare a `sharedId`
- The store to persist outgoing element positions in sessionStorage
- The incoming page to match shared IDs and morph from stored positions
- Likely needs FLIP animation technique

### Overlay wipes
Full-screen color/gradient overlays that wipe across the viewport during page transition. Could be a new component (`TransitionOverlay`) that animates a `clipPath` or `transform` independently of element targets.

### Route-aware presets
Different exit animations depending on the destination page. `TransitionLink` could accept an `exitPresetOverride` that tells the store to use a specific preset for that particular navigation.

### Group-based choreography
Allow stagger direction to vary per group. Cards could stagger left-to-right while the header fades top-to-bottom. Requires the store to sort and animate groups independently.

### Text splitting / line reveals
Split text blocks into lines or words and animate each independently. Would require a `TransitionText` component that uses `splitText`-style logic to wrap each segment.

### Scroll-triggered enter
Instead of playing enter on page load, play when elements scroll into view. Would integrate with `IntersectionObserver` for lazy entrance animations (similar to scroll-reveal libraries but using the choreographer's presets and timing).

### Performance mode
For pages with 50+ targets, batch DOM reads (getBoundingClientRect) into a single layout pass and use `requestAnimationFrame` scheduling to prevent layout thrashing.

---

## License

Proprietary — intended for Framer Marketplace distribution.
