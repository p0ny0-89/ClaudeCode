// ─── Page Choreographer — Animation Presets ──────────────────────────────────
// Presets return CSS keyframe pairs for the Web Animations API.
// All values are CSS strings (not framer-motion shorthand).

import type { PresetKeyframes, ChoreographerConfig } from "./choreographer_types"

// ─── Exit Presets ────────────────────────────────────────────────────────────

export function exitRiseWave(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: "1", transform: "translateY(0px)" },
        to: { opacity: "0", transform: `translateY(${-config.distance}px)` },
    }
}

export function exitBlurLift(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: "1", transform: "translateY(0px)", filter: "blur(0px)" },
        to: {
            opacity: "0",
            transform: `translateY(${-(config.distance * 0.5)}px)`,
            filter: `blur(${config.blurAmount}px)`,
        },
    }
}

export function exitScaleFadeGrid(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: "1", transform: "scale(1)" },
        to: { opacity: "0", transform: `scale(${config.scaleFrom})` },
    }
}

// ─── Enter Presets ───────────────────────────────────────────────────────────

export function enterFadeUp(config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { opacity: "0", transform: `translateY(${config.distance}px)` },
        to: { opacity: "1", transform: "translateY(0px)" },
    }
}

export function enterMaskRevealX(_config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { clipPath: "inset(0 100% 0 0)" },
        to: { clipPath: "inset(0 0% 0 0)" },
    }
}

export function enterMaskRevealY(_config: ChoreographerConfig): PresetKeyframes {
    return {
        from: { clipPath: "inset(100% 0 0 0)" },
        to: { clipPath: "inset(0% 0 0 0)" },
    }
}

// ─── Resolvers ───────────────────────────────────────────────────────────────

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

// ─── Reduced Motion ──────────────────────────────────────────────────────────

export function reducedMotionEnter(): PresetKeyframes {
    return {
        from: { opacity: "0" },
        to: { opacity: "1" },
    }
}

export function reducedMotionExit(): PresetKeyframes {
    return {
        from: { opacity: "1" },
        to: { opacity: "0" },
    }
}
