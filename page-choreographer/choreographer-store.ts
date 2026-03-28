// ─── Page Choreographer — Singleton Store ────────────────────────────────────
// Module-level store that coordinates all transition targets.
// Uses a singleton pattern because Framer code components are rendered as
// siblings on the canvas — React Context can't bridge them. Instead, targets
// and the choreographer communicate through this shared store.

import { animate } from "framer-motion"
import type {
    TargetConfig,
    ChoreographerConfig,
    AnimationPhase,
    StoreListener,
    StaggerDirection,
} from "./choreographer-types"
import {
    resolveEnterPreset,
    resolveExitPreset,
    reducedMotionEnter,
    reducedMotionExit,
} from "./choreographer-presets"
import { DEFAULT_CONFIG } from "./choreographer-types"

// ─── Geometry helpers ────────────────────────────────────────────────────────

interface Rect {
    x: number
    y: number
    width: number
    height: number
}

function getRect(el: HTMLElement): Rect {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
}

function centerOf(r: Rect) {
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
}

/** Row-major sort: primary by row band, secondary by x. */
function rowMajorKey(r: Rect, rowHeight: number) {
    const row = Math.round(r.y / rowHeight)
    return row * 100_000 + r.x
}

function columnMajorKey(r: Rect, colWidth: number) {
    const col = Math.round(r.x / colWidth)
    return col * 100_000 + r.y
}

// ─── Reduced motion query ────────────────────────────────────────────────────

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function isMobile(): boolean {
    if (typeof window === "undefined") return false
    return window.innerWidth < 768
}

// ─── Store ───────────────────────────────────────────────────────────────────

class ChoreographerStore {
    private targets = new Map<string, TargetConfig>()
    private config: ChoreographerConfig = { ...DEFAULT_CONFIG }
    private phase: AnimationPhase = "idle"
    private listeners = new Set<StoreListener>()
    private overlay: HTMLDivElement | null = null
    private activeAnimations: Array<{ stop: () => void }> = []

    // ── Target registry ──────────────────────────────────────────────────

    registerTarget(target: TargetConfig): void {
        this.targets.set(target.id, target)
    }

    unregisterTarget(id: string): void {
        this.targets.delete(id)
    }

    getTargetCount(): number {
        return this.targets.size
    }

    // ── Configuration ────────────────────────────────────────────────────

    updateConfig(partial: Partial<ChoreographerConfig>): void {
        this.config = { ...this.config, ...partial }
    }

    getConfig(): ChoreographerConfig {
        return { ...this.config }
    }

    // ── Phase ────────────────────────────────────────────────────────────

    getPhase(): AnimationPhase {
        return this.phase
    }

    private setPhase(phase: AnimationPhase) {
        this.phase = phase
        this.listeners.forEach((fn) => fn(phase))
    }

    subscribe(fn: StoreListener): () => void {
        this.listeners.add(fn)
        return () => this.listeners.delete(fn)
    }

    // ── Visibility ───────────────────────────────────────────────────────

    getVisibleTargets(): TargetConfig[] {
        const vh = window.innerHeight
        const vw = window.innerWidth
        return Array.from(this.targets.values()).filter((t) => {
            const el = t.ref.current
            if (!el) return false
            const r = el.getBoundingClientRect()
            const threshold = t.visibilityThreshold
            // Element is "visible" if it overlaps the viewport by at least threshold %
            const visibleHeight =
                Math.min(r.bottom, vh) - Math.max(r.top, 0)
            const visibleWidth =
                Math.min(r.right, vw) - Math.max(r.left, 0)
            if (visibleHeight <= 0 || visibleWidth <= 0) return false
            const visibleArea = visibleHeight * visibleWidth
            const elementArea = r.width * r.height
            if (elementArea === 0) return false
            return visibleArea / elementArea >= threshold
        })
    }

    // ── Sorting ──────────────────────────────────────────────────────────

    sortTargets(
        targets: TargetConfig[],
        direction: StaggerDirection,
    ): TargetConfig[] {
        const sorted = [...targets]

        // Precompute rects
        const rects = new Map<string, Rect>()
        sorted.forEach((t) => {
            if (t.ref.current) rects.set(t.id, getRect(t.ref.current))
        })

        sorted.sort((a, b) => {
            // Sort priority takes precedence
            if (a.sortPriority !== b.sortPriority) {
                return a.sortPriority - b.sortPriority
            }

            const ra = rects.get(a.id)
            const rb = rects.get(b.id)
            if (!ra || !rb) return 0

            const ca = centerOf(ra)
            const cb = centerOf(rb)

            switch (direction) {
                case "leftToRight":
                    return ca.cx - cb.cx
                case "rightToLeft":
                    return cb.cx - ca.cx
                case "topToBottom":
                    return ca.cy - cb.cy
                case "bottomToTop":
                    return cb.cy - ca.cy
                case "rowMajor": {
                    // Use median height as row band
                    const heights = Array.from(rects.values()).map(
                        (r) => r.height,
                    )
                    heights.sort((x, y) => x - y)
                    const band = heights[Math.floor(heights.length / 2)] || 80
                    return rowMajorKey(ra, band) - rowMajorKey(rb, band)
                }
                case "columnMajor": {
                    const widths = Array.from(rects.values()).map(
                        (r) => r.width,
                    )
                    widths.sort((x, y) => x - y)
                    const band = widths[Math.floor(widths.length / 2)] || 200
                    return columnMajorKey(ra, band) - columnMajorKey(rb, band)
                }
                default:
                    return 0
            }
        })

        return sorted
    }

    // ── Play Enter ───────────────────────────────────────────────────────

    async playEnter(): Promise<void> {
        if (this.phase === "entering") return
        this.cancelActive()
        this.setPhase("entering")

        const useReduced =
            this.config.respectReducedMotion && prefersReducedMotion()
        const mobile = isMobile()

        // Collect eligible targets
        let eligible = this.config.onlyAnimateInView
            ? this.getVisibleTargets()
            : Array.from(this.targets.values())

        eligible = eligible.filter((t) => {
            if (!t.enterEnabled) return false
            if (mobile && !t.mobileEnabled) return false
            return !!t.ref.current
        })

        const sorted = this.sortTargets(eligible, this.config.staggerDirection)
        const duration = this.config.enterDuration ?? this.config.duration
        const easing = this.config.enterEasing ?? this.config.easing
        const stagger = useReduced ? 0 : this.config.stagger

        const promises = sorted.map((target, i) => {
            const el = target.ref.current!
            const preset = useReduced
                ? reducedMotionEnter()
                : resolveEnterPreset(target.enterPreset, this.config)

            const delay = stagger * i + target.delayOffset
            const dur = useReduced ? 0.01 : duration

            // Set initial state immediately (prevents flash of final state)
            Object.assign(el.style, styleFromKeyframes(preset.from))

            const ctrl = animate(el, preset.to, {
                duration: dur,
                delay,
                ease: easing as any,
            })
            this.activeAnimations.push(ctrl)
            return ctrl.then(() => {
                // Clean up inline styles so Framer layout isn't disrupted
                clearInlineAnimation(el, preset.to)
            })
        })

        await Promise.all(promises)
        this.activeAnimations = []
        this.setPhase("idle")
    }

    // ── Play Exit ────────────────────────────────────────────────────────

    async playExit(): Promise<void> {
        if (this.phase === "exiting") return
        this.cancelActive()
        this.setPhase("exiting")

        if (this.config.lockInteractionsDuringExit) {
            this.lockInteractions()
        }

        const useReduced =
            this.config.respectReducedMotion && prefersReducedMotion()
        const mobile = isMobile()

        let eligible = this.config.onlyAnimateInView
            ? this.getVisibleTargets()
            : Array.from(this.targets.values())

        eligible = eligible.filter((t) => {
            if (!t.exitEnabled) return false
            if (mobile && !t.mobileEnabled) return false
            return !!t.ref.current
        })

        const sorted = this.sortTargets(eligible, this.config.staggerDirection)
        const duration = this.config.exitDuration ?? this.config.duration
        const easing = this.config.exitEasing ?? this.config.easing
        const stagger = useReduced ? 0 : this.config.stagger

        const promises = sorted.map((target, i) => {
            const el = target.ref.current!
            const preset = useReduced
                ? reducedMotionExit()
                : resolveExitPreset(target.exitPreset, this.config)

            const delay = stagger * i + target.delayOffset

            const ctrl = animate(el, preset.to, {
                duration: useReduced ? 0.01 : duration,
                delay,
                ease: easing as any,
            })
            this.activeAnimations.push(ctrl)
            return ctrl
        })

        await Promise.all(promises)
        this.activeAnimations = []
        this.unlockInteractions()
        this.setPhase("done")
    }

    // ── Cancel ───────────────────────────────────────────────────────────

    cancelActive(): void {
        this.activeAnimations.forEach((a) => a.stop())
        this.activeAnimations = []
    }

    // ── Interaction lock ─────────────────────────────────────────────────

    private lockInteractions(): void {
        if (this.overlay) return
        const div = document.createElement("div")
        Object.assign(div.style, {
            position: "fixed",
            inset: "0",
            zIndex: "99999",
            cursor: "wait",
            // Transparent — blocks clicks without visual noise
        } as CSSStyleDeclaration)
        document.body.appendChild(div)
        this.overlay = div
    }

    private unlockInteractions(): void {
        if (this.overlay) {
            this.overlay.remove()
            this.overlay = null
        }
    }

    // ── Reset (useful when navigating away) ──────────────────────────────

    reset(): void {
        this.cancelActive()
        this.unlockInteractions()
        this.targets.clear()
        this.setPhase("idle")
    }
}

// ─── Style helpers ───────────────────────────────────────────────────────────

/** Convert animation keyframe values to inline CSS properties. */
function styleFromKeyframes(kf: Record<string, string | number>): Record<string, string> {
    const style: Record<string, string> = {}
    for (const [key, value] of Object.entries(kf)) {
        if (key === "y") {
            style.transform = `translateY(${value}px)`
        } else if (key === "x") {
            style.transform = `translateX(${value}px)`
        } else if (key === "scale") {
            style.transform = `scale(${value})`
        } else if (key === "opacity") {
            style.opacity = String(value)
        } else if (key === "filter") {
            style.filter = String(value)
        } else if (key === "clipPath") {
            style.clipPath = String(value)
        }
    }
    return style
}

/** Remove inline animation styles so Framer's layout engine takes over. */
function clearInlineAnimation(
    el: HTMLElement,
    kf: Record<string, string | number>,
): void {
    for (const key of Object.keys(kf)) {
        if (key === "y" || key === "x" || key === "scale") {
            el.style.transform = ""
        } else if (key === "opacity") {
            el.style.opacity = ""
        } else if (key === "filter") {
            el.style.filter = ""
        } else if (key === "clipPath") {
            el.style.clipPath = ""
        }
    }
}

// ─── Singleton export ────────────────────────────────────────────────────────

export const choreographerStore = new ChoreographerStore()
