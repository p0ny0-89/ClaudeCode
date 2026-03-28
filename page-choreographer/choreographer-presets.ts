// ─── Page Choreographer — Animation Presets ──────────────────────────────────
// Each preset defines `from` and `to` keyframes for use with framer-motion's
// `animate()` function. Exit presets animate FROM visible TO hidden; enter
// presets animate FROM hidden TO visible.

import type { PresetKeyframes, ChoreographerConfig } from "./choreographer-types"

// ─── Exit Presets ────────────────────────────────────────────────────────────

/**
 * Rise Wave — elements translate upward and fade out.
 * Classic editorial exit that works well with left-to-right stagger.
 */
export function exitRiseWave(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: 1, y: 0 },
        to: { opacity: 0, y: -config.distance },
    }
}

/**
 * Blur Lift — elements drift upward with a gaussian blur and fade.
 * Premium, soft exit suitable for hero sections and feature cards.
 */
export function exitBlurLift(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: 1, y: 0, filter: "blur(0px)" },
        to: {
            opacity: 0,
            y: -(config.distance * 0.5),
            filter: `blur(${config.blurAmount}px)`,
        },
    }
}

/**
 * Scale Fade Grid — elements scale down slightly and fade out.
 * Works well for card grids and tiled layouts.
 */
export function exitScaleFadeGrid(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: 1, scale: 1 },
        to: { opacity: 0, scale: config.scaleFrom },
    }
}

// ─── Enter Presets ───────────────────────────────────────────────────────────

/**
 * Fade Up — elements fade in while moving upward into their final position.
 * The workhorse enter animation. Clean and versatile.
 */
export function enterFadeUp(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: 0, y: config.distance },
        to: { opacity: 1, y: 0 },
    }
}

/**
 * Mask Reveal X — horizontal clip-path reveal from left to right.
 * Sharp, editorial feel. Great for text blocks and images.
 */
export function enterMaskRevealX(_config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: 1, clipPath: "inset(0 100% 0 0)" },
        to: { opacity: 1, clipPath: "inset(0 0% 0 0)" },
    }
}

/**
 * Mask Reveal Y — vertical clip-path reveal from bottom to top.
 * Dramatic entrance for hero elements and headings.
 */
export function enterMaskRevealY(_config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: 1, clipPath: "inset(100% 0 0 0)" },
        to: { opacity: 1, clipPath: "inset(0% 0 0 0)" },
    }
}

// ─── Preset Resolvers ────────────────────────────────────────────────────────

const EXIT_PRESETS = {
    riseWave: exitRiseWave,
    blurLift: exitBlurLift,
    scaleFadeGrid: exitScaleFadeGrid,
} as const

const ENTER_PRESETS = {
    fadeUp: enterFadeUp,
    maskRevealX: enterMaskRevealX,
    maskRevealY: enterMaskRevealY,
} as const

export function resolveExitPreset(
    name: keyof typeof EXIT_PRESETS,
    config: ChoreographerConfig,
): PresetKeyframes {
    return EXIT_PRESETS[name](config)
}

export function resolveEnterPreset(
    name: keyof typeof ENTER_PRESETS,
    config: ChoreographerConfig,
): PresetKeyframes {
    return ENTER_PRESETS[name](config)
}

// ─── Reduced Motion Fallback ─────────────────────────────────────────────────

/** Instant fade with no spatial movement — safe for vestibular disorders. */
export function reducedMotionEnter(): PresetKeyframes {
    return {
        from: { opacity: 0 },
        to: { opacity: 1 },
    }
}

export function reducedMotionExit(): PresetKeyframes {
    return {
        from: { opacity: 1 },
        to: { opacity: 0 },
    }
}
