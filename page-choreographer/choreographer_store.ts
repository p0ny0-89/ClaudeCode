// ─── Page Choreographer — Singleton Store ────────────────────────────────────
// Uses the native Web Animations API (element.animate()) instead of
// framer-motion to avoid import issues inside Framer's bundler.

import type {
    TargetConfig,
    ChoreographerConfig,
    AnimationPhase,
    StoreListener,
    StaggerDirection,
    PresetKeyframes,
} from "./choreographer_types"
import {
    resolveEnterPreset,
    resolveExitPreset,
    reducedMotionEnter,
    reducedMotionExit,
} from "./choreographer_presets"
import { DEFAULT_CONFIG } from "./choreographer_types"

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

function rowMajorKey(r: Rect, rowHeight: number) {
    const row = Math.round(r.y / rowHeight)
    return row * 100000 + r.x
}

function columnMajorKey(r: Rect, colWidth: number) {
    const col = Math.round(r.x / colWidth)
    return col * 100000 + r.y
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function isMobile(): boolean {
    if (typeof window === "undefined") return false
    return window.innerWidth < 768
}

function easingToCss(easing: number[]): string {
    return "cubic-bezier(" + easing.join(", ") + ")"
}

// Apply a keyframe's CSS properties as inline styles on an element.
function applyStyles(el: HTMLElement, kf: Record<string, string>): void {
    for (var key in kf) {
        if (kf.hasOwnProperty(key)) {
            ;(el.style as any)[key] = kf[key]
        }
    }
}

// Remove inline styles that were set by a keyframe.
function clearStyles(el: HTMLElement, kf: Record<string, string>): void {
    for (var key in kf) {
        if (kf.hasOwnProperty(key)) {
            ;(el.style as any)[key] = ""
        }
    }
}

// ─── Store ───────────────────────────────────────────────────────────────────

class ChoreographerStore {
    private targets: Map<string, TargetConfig> = new Map()
    private config: ChoreographerConfig = Object.assign({}, DEFAULT_CONFIG)
    private phase: AnimationPhase = "idle"
    private listeners: Set<StoreListener> = new Set()
    private overlay: HTMLDivElement | null = null
    private activeAnimations: Animation[] = []

    // ── Registry ─────────────────────────────────────────────────────────

    registerTarget(target: TargetConfig): void {
        this.targets.set(target.id, target)
    }

    unregisterTarget(id: string): void {
        this.targets.delete(id)
    }

    getTargetCount(): number {
        return this.targets.size
    }

    // ── Config ───────────────────────────────────────────────────────────

    updateConfig(partial: Partial<ChoreographerConfig>): void {
        this.config = Object.assign({}, this.config, partial)
    }

    getConfig(): ChoreographerConfig {
        return Object.assign({}, this.config)
    }

    // ── Phase ────────────────────────────────────────────────────────────

    getPhase(): AnimationPhase {
        return this.phase
    }

    private setPhase(phase: AnimationPhase): void {
        this.phase = phase
        this.listeners.forEach(function (fn) {
            fn(phase)
        })
    }

    subscribe(fn: StoreListener): () => void {
        this.listeners.add(fn)
        var self = this
        return function () {
            self.listeners.delete(fn)
        }
    }

    // ── Visibility ───────────────────────────────────────────────────────

    getVisibleTargets(): TargetConfig[] {
        var vh = window.innerHeight
        var vw = window.innerWidth
        var result: TargetConfig[] = []

        this.targets.forEach(function (t) {
            var el = t.ref.current
            if (!el) return
            var r = el.getBoundingClientRect()
            var visH = Math.min(r.bottom, vh) - Math.max(r.top, 0)
            var visW = Math.min(r.right, vw) - Math.max(r.left, 0)
            if (visH <= 0 || visW <= 0) return
            var area = r.width * r.height
            if (area === 0) return
            if ((visH * visW) / area >= t.visibilityThreshold) {
                result.push(t)
            }
        })

        return result
    }

    // ── Sorting ──────────────────────────────────────────────────────────

    sortTargets(targets: TargetConfig[], direction: StaggerDirection): TargetConfig[] {
        var sorted = targets.slice()

        var rects: Record<string, Rect> = {}
        sorted.forEach(function (t) {
            if (t.ref.current) rects[t.id] = getRect(t.ref.current)
        })

        sorted.sort(function (a, b) {
            if (a.sortPriority !== b.sortPriority) {
                return a.sortPriority - b.sortPriority
            }
            var ra = rects[a.id]
            var rb = rects[b.id]
            if (!ra || !rb) return 0
            var ca = centerOf(ra)
            var cb = centerOf(rb)

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
                    var heights: number[] = []
                    for (var k in rects) heights.push(rects[k].height)
                    heights.sort(function (x, y) { return x - y })
                    var band = heights[Math.floor(heights.length / 2)] || 80
                    return rowMajorKey(ra, band) - rowMajorKey(rb, band)
                }
                case "columnMajor": {
                    var widths: number[] = []
                    for (var k2 in rects) widths.push(rects[k2].width)
                    widths.sort(function (x, y) { return x - y })
                    var colBand = widths[Math.floor(widths.length / 2)] || 200
                    return columnMajorKey(ra, colBand) - columnMajorKey(rb, colBand)
                }
                default:
                    return 0
            }
        })

        return sorted
    }

    // ── Animate a single element using Web Animations API ────────────────

    private animateElement(
        el: HTMLElement,
        preset: PresetKeyframes,
        duration: number,
        delay: number,
        easing: number[],
        fillForward: boolean,
    ): Animation {
        var anim = el.animate([preset.from, preset.to], {
            duration: duration * 1000,
            delay: delay * 1000,
            easing: easingToCss(easing),
            fill: fillForward ? "forwards" : "none",
        })
        return anim
    }

    // ── Play Enter ───────────────────────────────────────────────────────

    async playEnter(): Promise<void> {
        if (this.phase === "entering") return
        this.cancelActive()
        this.setPhase("entering")

        var useReduced = this.config.respectReducedMotion && prefersReducedMotion()
        var mobile = isMobile()

        var eligible = this.config.onlyAnimateInView
            ? this.getVisibleTargets()
            : Array.from(this.targets.values())

        eligible = eligible.filter(function (t) {
            if (!t.enterEnabled) return false
            if (mobile && !t.mobileEnabled) return false
            return !!t.ref.current
        })

        var sorted = this.sortTargets(eligible, this.config.staggerDirection)
        var duration = this.config.enterDuration != null ? this.config.enterDuration : this.config.duration
        var easing = this.config.enterEasing != null ? this.config.enterEasing : this.config.easing
        var stagger = useReduced ? 0 : this.config.stagger

        var promises: Promise<void>[] = []
        var self = this

        sorted.forEach(function (target, i) {
            var el = target.ref.current
            if (!el) return

            var preset = useReduced
                ? reducedMotionEnter()
                : resolveEnterPreset(target.enterPreset, self.config)

            var delay = stagger * i + target.delayOffset
            var dur = useReduced ? 0.01 : duration

            // Set initial hidden state
            applyStyles(el, preset.from)

            var anim = self.animateElement(el, preset, dur, delay, easing, false)
            self.activeAnimations.push(anim)

            promises.push(
                anim.finished.then(function () {
                    // Apply final state and clean up
                    applyStyles(el, preset.to)
                    // Then clear so Framer layout takes over
                    clearStyles(el, preset.to)
                })
            )
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

        var useReduced = this.config.respectReducedMotion && prefersReducedMotion()
        var mobile = isMobile()

        var eligible = this.config.onlyAnimateInView
            ? this.getVisibleTargets()
            : Array.from(this.targets.values())

        eligible = eligible.filter(function (t) {
            if (!t.exitEnabled) return false
            if (mobile && !t.mobileEnabled) return false
            return !!t.ref.current
        })

        var sorted = this.sortTargets(eligible, this.config.staggerDirection)
        var duration = this.config.exitDuration != null ? this.config.exitDuration : this.config.duration
        var easing = this.config.exitEasing != null ? this.config.exitEasing : this.config.easing
        var stagger = useReduced ? 0 : this.config.stagger

        var promises: Promise<Animation>[] = []
        var self = this

        sorted.forEach(function (target, i) {
            var el = target.ref.current
            if (!el) return

            var preset = useReduced
                ? reducedMotionExit()
                : resolveExitPreset(target.exitPreset, self.config)

            var delay = stagger * i + target.delayOffset

            // fill: forwards keeps the exit state visible until navigation
            var anim = self.animateElement(el, preset, useReduced ? 0.01 : duration, delay, easing, true)
            self.activeAnimations.push(anim)
            promises.push(anim.finished)
        })

        await Promise.all(promises)
        this.activeAnimations = []
        this.unlockInteractions()
        this.setPhase("done")
    }

    // ── Cancel ───────────────────────────────────────────────────────────

    cancelActive(): void {
        this.activeAnimations.forEach(function (a) {
            try { a.cancel() } catch (e) { /* already finished */ }
        })
        this.activeAnimations = []
    }

    // ── Interaction lock ─────────────────────────────────────────────────

    private lockInteractions(): void {
        if (this.overlay) return
        var div = document.createElement("div")
        div.style.position = "fixed"
        div.style.top = "0"
        div.style.left = "0"
        div.style.right = "0"
        div.style.bottom = "0"
        div.style.zIndex = "99999"
        div.style.cursor = "wait"
        document.body.appendChild(div)
        this.overlay = div
    }

    private unlockInteractions(): void {
        if (this.overlay) {
            this.overlay.remove()
            this.overlay = null
        }
    }

    // ── Reset ────────────────────────────────────────────────────────────

    reset(): void {
        this.cancelActive()
        this.unlockInteractions()
        this.targets.clear()
        this.setPhase("idle")
    }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const choreographerStore = new ChoreographerStore()
