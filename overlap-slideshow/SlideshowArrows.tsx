// ────────────────────────────────────────────────────────────────────
// SlideshowArrows — Code Overrides for prev / next buttons
//
// Pair these with the OverlapSlideshow component. Design your own
// arrow (any shape / icon / frame), then in Framer:
//   1. Copy this file into your project as a Code File.
//   2. Select your left arrow layer → right panel → Code Overrides →
//      pick this file → `prevButton`.
//   3. Select your right arrow layer → Code Overrides → `nextButton`.
//
// Behaviour:
//   • Clicking advances to the previous / next card.
//   • Buttons fade out + stop receiving clicks when their direction
//     isn't available — e.g. left is hidden on first load and appears
//     once you've moved forward or wrapped.
//
// NOTE: the import path below assumes your slideshow's Code File is
// named "OverlapSlideshow". If you renamed it, update the path.
// ────────────────────────────────────────────────────────────────────

import type { ComponentType } from "react"
import * as React from "react"
import { useSlideshowState } from "./OverlapSlideshow.tsx"

export function prevButton(Component): ComponentType {
    return (props: any) => {
        const { prev, canGoPrev } = useSlideshowState()
        return (
            <Component
                {...props}
                onClick={(e: React.MouseEvent) => {
                    if (canGoPrev) prev()
                    if (props.onClick) props.onClick(e)
                }}
                style={{
                    ...props.style,
                    opacity: canGoPrev ? 1 : 0,
                    pointerEvents: canGoPrev ? "auto" : "none",
                    transition: "opacity 0.25s ease",
                }}
            />
        )
    }
}

export function nextButton(Component): ComponentType {
    return (props: any) => {
        const { next, canGoNext } = useSlideshowState()
        return (
            <Component
                {...props}
                onClick={(e: React.MouseEvent) => {
                    if (canGoNext) next()
                    if (props.onClick) props.onClick(e)
                }}
                style={{
                    ...props.style,
                    opacity: canGoNext ? 1 : 0,
                    pointerEvents: canGoNext ? "auto" : "none",
                    transition: "opacity 0.25s ease",
                }}
            />
        )
    }
}
