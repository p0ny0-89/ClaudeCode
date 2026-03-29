import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// ─── Store (shared via window global) ────────────────────────────────────────

const STORE_KEY = "__pageChoreographerStore"

function isCanvasMode(): boolean {
    try {
        return RenderTarget.current() === RenderTarget.canvas
    } catch (e) {
        return false
    }
}

interface TargetEntry {
    id: string
    ref: { current: HTMLDivElement | null }
    group: string
    enterPreset: string
    exitPreset: string
    enterEnabled: boolean
    exitEnabled: boolean
    sortPriority: number
    delayOffset: number
    mobileEnabled: boolean
    visibilityThreshold: number
}

interface StoreConfig {
    duration: number
    stagger: number
    easing: number[]
    staggerDirection: string
    onlyAnimateInView: boolean
    lockInteractionsDuringExit: boolean
    distance: number
    blurAmount: number
    scaleFrom: number
    respectReducedMotion: boolean
}

function easingToCss(e: number[]): string {
    return "cubic-bezier(" + e[0] + "," + e[1] + "," + e[2] + "," + e[3] + ")"
}

function getEnterKeyframes(preset: string, cfg: StoreConfig) {
    var d = cfg.distance
    switch (preset) {
        case "maskRevealX":
            return {
                from: { clipPath: "inset(0 100% 0 0)" },
                to: { clipPath: "inset(0 0% 0 0)" },
            }
        case "maskRevealY":
            return {
                from: { clipPath: "inset(100% 0 0 0)" },
                to: { clipPath: "inset(0% 0 0 0)" },
            }
        case "fadeUp":
        default:
            return {
                from: { opacity: "0", transform: "translateY(" + d + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
    }
}

function getExitKeyframes(preset: string, cfg: StoreConfig) {
    switch (preset) {
        case "blurLift":
            return {
                from: { opacity: "1", transform: "translateY(0px)", filter: "blur(0px)" },
                to: {
                    opacity: "0",
                    transform: "translateY(" + -(cfg.distance * 0.5) + "px)",
                    filter: "blur(" + cfg.blurAmount + "px)",
                },
            }
        case "scaleFadeGrid":
            return {
                from: { opacity: "1", transform: "scale(1)" },
                to: { opacity: "0", transform: "scale(" + cfg.scaleFrom + ")" },
            }
        case "riseWave":
        default:
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + -cfg.distance + "px)" },
            }
    }
}

function createStore() {
    var targets: Record<string, TargetEntry> = {}
    var config: StoreConfig = {
        duration: 0.6,
        stagger: 0.06,
        easing: [0.4, 0, 0.2, 1],
        staggerDirection: "leftToRight",
        onlyAnimateInView: true,
        lockInteractionsDuringExit: true,
        distance: 40,
        blurAmount: 8,
        scaleFrom: 0.92,
        respectReducedMotion: true,
    }
    var activeAnims: Animation[] = []
    var phase = "idle"
    var overlay: HTMLDivElement | null = null

    function registerTarget(t: TargetEntry) {
        targets[t.id] = t
    }

    function unregisterTarget(id: string) {
        delete targets[id]
    }

    function getTargetCount() {
        return Object.keys(targets).length
    }

    function updateConfig(c: Partial<StoreConfig>) {
        for (var k in c) {
            if (c.hasOwnProperty(k)) {
                ;(config as any)[k] = (c as any)[k]
            }
        }
    }

    function getConfig() {
        var copy: any = {}
        for (var k in config) {
            if (config.hasOwnProperty(k)) copy[k] = (config as any)[k]
        }
        return copy as StoreConfig
    }

    function getVisibleTargets() {
        var vh = window.innerHeight
        var vw = window.innerWidth
        var result: TargetEntry[] = []
        for (var id in targets) {
            var t = targets[id]
            var el = t.ref.current
            if (!el) continue
            var r = el.getBoundingClientRect()
            var visH = Math.min(r.bottom, vh) - Math.max(r.top, 0)
            var visW = Math.min(r.right, vw) - Math.max(r.left, 0)
            if (visH <= 0 || visW <= 0) continue
            var area = r.width * r.height
            if (area === 0) continue
            if ((visH * visW) / area >= t.visibilityThreshold) {
                result.push(t)
            }
        }
        return result
    }

    function sortTargets(list: TargetEntry[], direction: string) {
        var sorted = list.slice()
        sorted.sort(function (a, b) {
            if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority
            var elA = a.ref.current
            var elB = b.ref.current
            if (!elA || !elB) return 0
            var rA = elA.getBoundingClientRect()
            var rB = elB.getBoundingClientRect()
            var cxA = rA.left + rA.width / 2
            var cyA = rA.top + rA.height / 2
            var cxB = rB.left + rB.width / 2
            var cyB = rB.top + rB.height / 2
            switch (direction) {
                case "rightToLeft": return cxB - cxA
                case "topToBottom": return cyA - cyB
                case "bottomToTop": return cyB - cyA
                case "rowMajor": {
                    var rowA = Math.round(rA.top / 80)
                    var rowB = Math.round(rB.top / 80)
                    if (rowA !== rowB) return rowA - rowB
                    return cxA - cxB
                }
                case "columnMajor": {
                    var colA = Math.round(rA.left / 200)
                    var colB = Math.round(rB.left / 200)
                    if (colA !== colB) return colA - colB
                    return cyA - cyB
                }
                case "leftToRight":
                default: return cxA - cxB
            }
        })
        return sorted
    }

    function cancelActive() {
        for (var i = 0; i < activeAnims.length; i++) {
            try { activeAnims[i].cancel() } catch (e) {}
        }
        activeAnims = []
    }

    function lockInteractions() {
        if (overlay) return
        overlay = document.createElement("div")
        overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;cursor:wait;"
        document.body.appendChild(overlay)
    }

    function unlockInteractions() {
        if (overlay) {
            overlay.remove()
            overlay = null
        }
    }

    function playEnter() {
        if (phase === "entering") return Promise.resolve()
        cancelActive()
        phase = "entering"

        var reduced = config.respectReducedMotion &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = config.onlyAnimateInView ? getVisibleTargets() : Object.values(targets)
        eligible = eligible.filter(function (t) {
            return t.enterEnabled && (t.mobileEnabled || !mobile) && t.ref.current
        })

        var sorted = sortTargets(eligible, config.staggerDirection)
        var stagger = reduced ? 0 : config.stagger
        var promises: Promise<any>[] = []

        sorted.forEach(function (target, i) {
            var el = target.ref.current
            if (!el) return

            var kf = reduced
                ? { from: { opacity: "0" }, to: { opacity: "1" } }
                : getEnterKeyframes(target.enterPreset, config)

            var delay = stagger * i + target.delayOffset
            var dur = reduced ? 10 : config.duration * 1000

            // Use fill:"both" so the animation layer handles the initial
            // hidden state — no inline styles needed. If WAAPI doesn't
            // run (e.g. Framer canvas static render), elements stay visible.
            try {
                var anim = el.animate([kf.from, kf.to], {
                    duration: dur,
                    delay: delay * 1000,
                    easing: easingToCss(config.easing),
                    fill: "both",
                })
                activeAnims.push(anim)

                promises.push(
                    anim.finished.then(function () {
                        // Cancel the WAAPI animation layer so CSS hover effects work
                        try { anim.cancel() } catch (e) {}
                    })
                )
            } catch (e) {
                // WAAPI not available — element stays visible as-is
            }
        })

        return Promise.all(promises).then(function () {
            activeAnims = []
            phase = "idle"
        })
    }

    function playExit() {
        if (phase === "exiting") return Promise.resolve()
        cancelActive()
        phase = "exiting"

        if (config.lockInteractionsDuringExit) lockInteractions()

        var reduced = config.respectReducedMotion &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = config.onlyAnimateInView ? getVisibleTargets() : Object.values(targets)
        eligible = eligible.filter(function (t) {
            return t.exitEnabled && (t.mobileEnabled || !mobile) && t.ref.current
        })

        var sorted = sortTargets(eligible, config.staggerDirection)
        var stagger = reduced ? 0 : config.stagger
        var promises: Promise<any>[] = []

        sorted.forEach(function (target, i) {
            var el = target.ref.current
            if (!el) return

            var kf = reduced
                ? { from: { opacity: "1" }, to: { opacity: "0" } }
                : getExitKeyframes(target.exitPreset, config)

            var delay = stagger * i + target.delayOffset

            var anim = el.animate([kf.from, kf.to], {
                duration: reduced ? 10 : config.duration * 1000,
                delay: delay * 1000,
                easing: easingToCss(config.easing),
                fill: "forwards",
            })
            activeAnims.push(anim)
            promises.push(anim.finished)
        })

        return Promise.all(promises).then(function () {
            activeAnims = []
            unlockInteractions()
            phase = "done"
        })
    }

    function reset() {
        cancelActive()
        unlockInteractions()
        targets = {}
        phase = "idle"
    }

    return {
        registerTarget: registerTarget,
        unregisterTarget: unregisterTarget,
        getTargetCount: getTargetCount,
        updateConfig: updateConfig,
        getConfig: getConfig,
        getVisibleTargets: getVisibleTargets,
        sortTargets: sortTargets,
        playEnter: playEnter,
        playExit: playExit,
        cancelActive: cancelActive,
        reset: reset,
        getEnterKeyframes: getEnterKeyframes,
        getExitKeyframes: getExitKeyframes,
    }
}

function getStore() {
    if (typeof window !== "undefined") {
        if (!(window as any)[STORE_KEY]) {
            ;(window as any)[STORE_KEY] = createStore()
        }
        return (window as any)[STORE_KEY]
    }
    return createStore()
}

// ─── Easing presets ──────────────────────────────────────────────────────────

const EASING_MAP: Record<string, number[]> = {
    smooth: [0.4, 0, 0.2, 1],
    snappy: [0.16, 1, 0.3, 1],
    dramatic: [0.76, 0, 0.24, 1],
    gentle: [0.25, 0.1, 0.25, 1],
    linear: [0, 0, 1, 1],
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PageChoreographer(props: any) {
    var {
        duration = 0.6,
        stagger = 0.06,
        easingPreset = "smooth",
        staggerDirection = "leftToRight",
        onlyAnimateInView = true,
        distance = 40,
        blurAmount = 8,
        scaleFrom = 0.92,
        lockInteractionsDuringExit = true,
        respectReducedMotion = true,
        autoPlayEnter = true,
        enterDelay = 0.05,
        style,
    } = props

    var hasPlayed = React.useRef(false)

    React.useEffect(function () {
        var store = getStore()
        store.updateConfig({
            duration: duration,
            stagger: stagger,
            easing: EASING_MAP[easingPreset] || EASING_MAP.smooth,
            staggerDirection: staggerDirection,
            onlyAnimateInView: onlyAnimateInView,
            distance: distance,
            blurAmount: blurAmount,
            scaleFrom: scaleFrom,
            lockInteractionsDuringExit: lockInteractionsDuringExit,
            respectReducedMotion: respectReducedMotion,
        })
    }, [
        duration, stagger, easingPreset, staggerDirection,
        onlyAnimateInView, distance, blurAmount, scaleFrom,
        lockInteractionsDuringExit, respectReducedMotion,
    ])

    React.useEffect(function () {
        if (!autoPlayEnter || hasPlayed.current) return
        hasPlayed.current = true

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var delayMs = enterDelay * 1000
                if (delayMs > 0) {
                    setTimeout(function () { getStore().playEnter() }, delayMs)
                } else {
                    getStore().playEnter()
                }
            })
        })

        return function () { getStore().cancelActive() }
    }, [])

    React.useEffect(function () {
        return function () { getStore().reset() }
    }, [])

    // Invisible in preview/published — zero size, no pointer events
    return (
        <div
            style={{
                ...style,
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
                position: "absolute",
            }}
        />
    )
}

PageChoreographer.displayName = "Page Choreographer"

addPropertyControls(PageChoreographer, {
    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0.6,
        min: 0.1,
        max: 3,
        step: 0.05,
        unit: "s",
    },
    stagger: {
        type: ControlType.Number,
        title: "Stagger",
        defaultValue: 0.06,
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "s",
    },
    easingPreset: {
        type: ControlType.Enum,
        title: "Easing",
        defaultValue: "smooth",
        options: ["smooth", "snappy", "dramatic", "gentle", "linear"],
        optionTitles: ["Smooth", "Snappy", "Dramatic", "Gentle", "Linear"],
    },
    staggerDirection: {
        type: ControlType.Enum,
        title: "Stagger Order",
        defaultValue: "leftToRight",
        options: [
            "leftToRight", "rightToLeft", "topToBottom",
            "bottomToTop", "rowMajor", "columnMajor",
        ],
        optionTitles: [
            "Left → Right", "Right → Left", "Top → Bottom",
            "Bottom → Top", "Row Major", "Column Major",
        ],
    },
    onlyAnimateInView: {
        type: ControlType.Boolean,
        title: "In-View Only",
        defaultValue: true,
    },
    distance: {
        type: ControlType.Number,
        title: "Distance",
        defaultValue: 40,
        min: 0,
        max: 200,
        step: 5,
        unit: "px",
    },
    blurAmount: {
        type: ControlType.Number,
        title: "Blur Amount",
        defaultValue: 8,
        min: 0,
        max: 30,
        step: 1,
        unit: "px",
    },
    scaleFrom: {
        type: ControlType.Number,
        title: "Scale From",
        defaultValue: 0.92,
        min: 0.5,
        max: 1.5,
        step: 0.01,
    },
    lockInteractionsDuringExit: {
        type: ControlType.Boolean,
        title: "Lock During Exit",
        defaultValue: true,
    },
    respectReducedMotion: {
        type: ControlType.Boolean,
        title: "Reduced Motion",
        defaultValue: true,
    },
    autoPlayEnter: {
        type: ControlType.Boolean,
        title: "Auto Enter",
        defaultValue: true,
    },
    enterDelay: {
        type: ControlType.Number,
        title: "Enter Delay",
        defaultValue: 0.05,
        min: 0,
        max: 2,
        step: 0.05,
        unit: "s",
    },
})
