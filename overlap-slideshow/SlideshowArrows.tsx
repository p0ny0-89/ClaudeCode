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
// What you get automatically:
//   • Clicking advances to the previous / next card.
//   • Buttons fade out + stop receiving clicks when their direction
//     isn't available — e.g. the left arrow is hidden on first load
//     (nothing to the left of card 1) and appears once you've moved
//     forward at least once OR wrapped around.
//   • With Infinite off: left hides at card 1, right hides at the last
//     card. With Infinite on: right always visible, left hides until
//     there's something to its left.
//
// NOTE: the import path assumes your slideshow's Code File is named
// "OverlapSlideshow". If you renamed it, update the path below.
// ────────────────────────────────────────────────────────────────────

import type { ComponentType } from "react"
import * as React from "react"
import { useSlideshowState } from "./OverlapSlideshow"

type OverrideProps = {
    onClick?: (e: React.MouseEvent) => void
    style?: React.CSSProperties
}

export function prevButton(
    Component: ComponentType<OverrideProps>
): ComponentType<OverrideProps> {
    return (props: OverrideProps) => {
        const { prev, canGoPrev } = useSlideshowState()
        return (
            <Component
                {...props}
                onClick={(e: React.MouseEvent) => {
                    if (canGoPrev) prev()
                    props.onClick?.(e)
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

export function nextButton(
    Component: ComponentType<OverrideProps>
): ComponentType<OverrideProps> {
    return (props: OverrideProps) => {
        const { next, canGoNext } = useSlideshowState()
        return (
            <Component
                {...props}
                onClick={(e: React.MouseEvent) => {
                    if (canGoNext) next()
                    props.onClick?.(e)
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
