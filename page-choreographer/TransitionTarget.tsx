// ─── Page Choreographer — Transition Target (All-in-One) ─────────────────────
// The ONLY component you need. Drop one per section/group of elements.
// The first instance automatically sets up:
//   • The shared animation store
//   • Link click interception (exit animations before navigation)
//   • Enter animation playback on page load
//
// Each instance has its OWN animation settings (duration, easing, stagger, etc.)
// so different sections can have completely different effects.
//
// How to use:
//   1. Drop this INTO any frame alongside your content
//   2. Configure enter/exit presets and timing in the property panel
//   3. That's it — enter plays on load, exit plays on any link click
//
// Scan Modes:
//   "Siblings"  — registers all children of the parent container
//   "CMS Items" — digs deeper to find CMS collection items

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

var STORE_KEY = "__pageChoreographerStore"

// ─── Easing presets ──────────────────────────────────────────────────────────

var EASING_MAP: Record<string, number[]> = {
    smooth: [0.4, 0, 0.2, 1],
    snappy: [0.16, 1, 0.3, 1],
    dramatic: [0.76, 0, 0.24, 1],
    gentle: [0.25, 0.1, 0.25, 1],
    linear: [0, 0, 1, 1],
}

function easingToCss(e: number[]): string {
    return "cubic-bezier(" + e[0] + "," + e[1] + "," + e[2] + "," + e[3] + ")"
}

// ─── Keyframe presets ────────────────────────────────────────────────────────

function getEnterKeyframes(preset: string, distance: number) {
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
                from: { opacity: "0", transform: "translateY(" + distance + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
    }
}

function getExitKeyframes(
    preset: string,
    distance: number,
    blurAmount: number,
    scaleFrom: number
) {
    switch (preset) {
        case "blurLift":
            return {
                from: {
                    opacity: "1",
                    transform: "translateY(0px)",
                    filter: "blur(0px)",
                },
                to: {
                    opacity: "0",
                    transform: "translateY(" + -(distance * 0.5) + "px)",
                    filter: "blur(" + blurAmount + "px)",
                },
            }
        case "scaleFadeGrid":
            return {
                from: { opacity: "1", transform: "scale(1)" },
                to: { opacity: "0", transform: "scale(" + scaleFrom + ")" },
            }
        case "riseWave":
        default:
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + -distance + "px)" },
            }
    }
}

// ─── Store (singleton on window) ─────────────────────────────────────────────

interface TargetEntry {
    id: string
    ref: { current: HTMLElement | null }
    group: string
    groupId: string
    enterPreset: string
    exitPreset: string
    enterEnabled: boolean
    exitEnabled: boolean
    sortPriority: number
    delayOffset: number
    mobileEnabled: boolean
    visibilityThreshold: number
    duration: number
    stagger: number
    easing: number[]
    staggerDirection: string
    distance: number
    blurAmount: number
    scaleFrom: number
}

function createStore() {
    var targets: Record<string, TargetEntry> = {}
    var activeAnims: Animation[] = []
    var phase = "idle"
    var overlay: HTMLDivElement | null = null
    var linkInterceptionSetup = false
    var enterScheduled = false
    var skipNextClick = false
    var exitTimeout = 3

    function registerTarget(t: TargetEntry) {
        // If first target after all were unregistered (new page),
        // reset enter scheduling so enter plays on the new page
        if (Object.keys(targets).length === 0) {
            enterScheduled = false
            phase = "idle"
        }
        targets[t.id] = t
    }

    function unregisterTarget(id: string) {
        delete targets[id]
    }

    function getTargetCount() {
        return Object.keys(targets).length
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
            if (a.sortPriority !== b.sortPriority)
                return a.sortPriority - b.sortPriority
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
                case "rightToLeft":
                    return cxB - cxA
                case "topToBottom":
                    return cyA - cyB
                case "bottomToTop":
                    return cyB - cyA
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
                default:
                    return cxA - cxB
            }
        })
        return sorted
    }

    function cancelActive() {
        for (var i = 0; i < activeAnims.length; i++) {
            try {
                activeAnims[i].cancel()
            } catch (e) {}
        }
        activeAnims = []
    }

    function lockInteractions() {
        if (overlay) return
        overlay = document.createElement("div")
        overlay.style.cssText =
            "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;cursor:wait;"
        document.body.appendChild(overlay)
    }

    function unlockInteractions() {
        if (overlay) {
            overlay.remove()
            overlay = null
        }
    }

    // Group targets by their source TransitionTarget instance
    function groupByGroupId(
        list: TargetEntry[]
    ): Record<string, TargetEntry[]> {
        var groups: Record<string, TargetEntry[]> = {}
        for (var i = 0; i < list.length; i++) {
            var t = list[i]
            if (!groups[t.groupId]) groups[t.groupId] = []
            groups[t.groupId].push(t)
        }
        return groups
    }

    function playEnter() {
        if (phase === "entering") return Promise.resolve()
        cancelActive()
        phase = "entering"

        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = getVisibleTargets().filter(function (t) {
            return (
                t.enterEnabled &&
                (t.mobileEnabled || !mobile) &&
                t.ref.current
            )
        })

        var groups = groupByGroupId(eligible)
        var promises: Promise<any>[] = []

        for (var gid in groups) {
            var group = groups[gid]
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "0" }, to: { opacity: "1" } }
                    : getEnterKeyframes(target.enterPreset, target.distance)

                var stagger = reduced ? 0 : target.stagger
                var delay = stagger * i + target.delayOffset
                var dur = reduced ? 10 : target.duration * 1000

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: dur,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "both",
                    })
                    activeAnims.push(anim)

                    promises.push(
                        anim.finished.then(
                            (function (a) {
                                return function () {
                                    try {
                                        a.cancel()
                                    } catch (e) {}
                                }
                            })(anim)
                        )
                    )
                } catch (e) {
                    // WAAPI not available — element stays visible
                }
            }
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            phase = "idle"
        })
    }

    function playExit() {
        if (phase === "exiting") return Promise.resolve()
        cancelActive()
        phase = "exiting"
        lockInteractions()

        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = getVisibleTargets().filter(function (t) {
            return (
                t.exitEnabled &&
                (t.mobileEnabled || !mobile) &&
                t.ref.current
            )
        })

        var groups = groupByGroupId(eligible)
        var promises: Promise<any>[] = []

        for (var gid in groups) {
            var group = groups[gid]
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "1" }, to: { opacity: "0" } }
                    : getExitKeyframes(
                          target.exitPreset,
                          target.distance,
                          target.blurAmount,
                          target.scaleFrom
                      )

                var stagger = reduced ? 0 : target.stagger
                var delay = stagger * i + target.delayOffset

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: reduced ? 10 : target.duration * 1000,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "forwards",
                    })
                    activeAnims.push(anim)
                    promises.push(anim.finished)
                } catch (e) {
                    // WAAPI not available
                }
            }
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            unlockInteractions()
            phase = "done"
        })
    }

    // ─── Link interception (auto-setup, runs once) ───────────────────────────

    function setupLinkInterception(timeout: number) {
        exitTimeout = timeout // Always update timeout
        if (linkInterceptionSetup) return
        linkInterceptionSetup = true

        function findAnchor(
            target: EventTarget | null
        ): HTMLAnchorElement | null {
            var node = target as HTMLElement | null
            while (node && node !== document.body) {
                if (node.tagName === "A") return node as HTMLAnchorElement
                node = node.parentElement
            }
            return null
        }

        function shouldIntercept(anchor: HTMLAnchorElement): boolean {
            var href = anchor.href
            if (!href) return false
            if (anchor.hasAttribute("data-no-exit")) return false
            if (anchor.target === "_blank") return false
            try {
                var url = new URL(href, window.location.origin)
                if (url.origin !== window.location.origin) return false
                if (url.pathname === window.location.pathname && url.hash)
                    return false
            } catch (e) {
                return false
            }
            return true
        }

        function navigateViaAnchor(anchor: HTMLAnchorElement) {
            skipNextClick = true
            anchor.click()
        }

        document.addEventListener(
            "click",
            function (e: MouseEvent) {
                if (skipNextClick) {
                    skipNextClick = false
                    return
                }
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

                var anchor = findAnchor(e.target)
                if (!anchor) return
                if (!shouldIntercept(anchor)) return
                if (getTargetCount() === 0) return

                e.preventDefault()
                e.stopPropagation()

                Promise.race([
                    playExit(),
                    new Promise(function (resolve) {
                        setTimeout(resolve, exitTimeout * 1000)
                    }),
                ])
                    .then(function () {
                        navigateViaAnchor(anchor)
                    })
                    .catch(function () {
                        navigateViaAnchor(anchor)
                    })
            },
            true
        )
    }

    // ─── Auto enter (runs once per page) ─────────────────────────────────────

    function scheduleEnter(delay: number) {
        if (enterScheduled) return
        enterScheduled = true

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var delayMs = delay * 1000
                if (delayMs > 0) {
                    setTimeout(function () {
                        playEnter()
                    }, delayMs)
                } else {
                    playEnter()
                }
            })
        })
    }

    return {
        registerTarget: registerTarget,
        unregisterTarget: unregisterTarget,
        getTargetCount: getTargetCount,
        playEnter: playEnter,
        playExit: playExit,
        cancelActive: cancelActive,
        setupLinkInterception: setupLinkInterception,
        scheduleEnter: scheduleEnter,
    }
}

function getStore() {
    if (typeof window !== "undefined") {
        if (!(window as any)[STORE_KEY]) {
            ;(window as any)[STORE_KEY] = createStore()
        }
        return (window as any)[STORE_KEY]
    }
    return null
}

// ─── DOM scanning helpers ────────────────────────────────────────────────────

function findRealParent(marker: HTMLElement): HTMLElement | null {
    var node = marker.parentElement
    var maxDepth = 5
    while (node && maxDepth > 0) {
        var count = 0
        for (var i = 0; i < node.children.length; i++) {
            count++
        }
        if (count > 1) return node
        node = node.parentElement
        maxDepth--
    }
    return node
}

function isMarkerBranch(el: HTMLElement, marker: HTMLElement): boolean {
    return el === marker || el.contains(marker)
}

function findNodeWithMostChildren(
    root: HTMLElement,
    marker: HTMLElement
): HTMLElement | null {
    var best: HTMLElement | null = null
    var bestCount = 0
    function walk(node: HTMLElement) {
        var contentCount = 0
        for (var i = 0; i < node.children.length; i++) {
            if (!isMarkerBranch(node.children[i] as HTMLElement, marker))
                contentCount++
        }
        if (contentCount >= 2 && contentCount > bestCount) {
            bestCount = contentCount
            best = node
        }
        for (var j = 0; j < node.children.length; j++) {
            var child = node.children[j] as HTMLElement
            if (!isMarkerBranch(child, marker)) walk(child)
        }
    }
    walk(root)
    return best
}

function collectTargets(
    parent: HTMLElement,
    marker: HTMLElement,
    scanMode: string
): HTMLElement[] {
    var result: HTMLElement[] = []
    if (scanMode === "cmsItems") {
        var listNode = findNodeWithMostChildren(parent, marker)
        if (listNode) {
            for (var j = 0; j < listNode.children.length; j++) {
                var child = listNode.children[j] as HTMLElement
                if (!isMarkerBranch(child, marker)) result.push(child)
            }
        }
    } else {
        for (var k = 0; k < parent.children.length; k++) {
            var el = parent.children[k] as HTMLElement
            if (isMarkerBranch(el, marker)) continue
            result.push(el)
        }
    }
    return result
}

// ─── Component ───────────────────────────────────────────────────────────────

var groupCounter = 0
function useStableGroupId() {
    var ref = React.useRef("")
    if (ref.current === "") {
        groupCounter += 1
        ref.current = "scan-" + groupCounter
    }
    return ref.current
}

export default function TransitionTarget(props: any) {
    var {
        scanMode = "cmsItems",
        group = "default",
        enterPreset = "fadeUp",
        exitPreset = "riseWave",
        enterEnabled = true,
        exitEnabled = true,
        mobileEnabled = true,
        sortPriority = 0,
        delayOffset = 0,
        visibilityThreshold = 0.1,
        duration = 0.6,
        stagger = 0.06,
        easingPreset = "smooth",
        staggerDirection = "leftToRight",
        distance = 40,
        blurAmount = 8,
        scaleFrom = 0.92,
        exitTimeout = 3,
        enterDelay = 0.05,
        style,
    } = props

    var markerRef = React.useRef(null) as React.MutableRefObject<HTMLDivElement | null>
    var baseId = useStableGroupId()
    var registeredIds = React.useRef<string[]>([])

    function unregisterAll(store: any) {
        if (!store) return
        var ids = registeredIds.current
        for (var i = 0; i < ids.length; i++) {
            store.unregisterTarget(ids[i])
        }
        registeredIds.current = []
    }

    function registerElements(elements: HTMLElement[], store: any) {
        var easing = EASING_MAP[easingPreset] || EASING_MAP.smooth

        for (var i = 0; i < elements.length; i++) {
            var el = elements[i]
            var targetId = baseId + "-" + i

            store.registerTarget({
                id: targetId,
                ref: { current: el },
                group: group,
                groupId: baseId,
                enterPreset: enterPreset,
                exitPreset: exitPreset,
                enterEnabled: enterEnabled,
                exitEnabled: exitEnabled,
                sortPriority: sortPriority,
                delayOffset: delayOffset,
                mobileEnabled: mobileEnabled,
                visibilityThreshold: visibilityThreshold,
                duration: duration,
                stagger: stagger,
                easing: easing,
                staggerDirection: staggerDirection,
                distance: distance,
                blurAmount: blurAmount,
                scaleFrom: scaleFrom,
            })

            registeredIds.current.push(targetId)
        }
    }

    React.useEffect(function () {
        var store = getStore()
        var marker = markerRef.current
        if (!store || !marker) return

        // First instance sets up link interception and schedules enter
        store.setupLinkInterception(exitTimeout)
        store.scheduleEnter(enterDelay)

        // Walk up past Framer's wrappers to find the real container
        var parent = findRealParent(marker)
        if (!parent) return

        unregisterAll(store)

        var targets = collectTargets(parent, marker, scanMode)
        registerElements(targets, store)

        // Watch for dynamic changes (CMS load-more, etc.)
        var observeTarget = parent
        if (scanMode === "cmsItems") {
            for (var i = 0; i < parent.children.length; i++) {
                var ch = parent.children[i] as HTMLElement
                if (isMarkerBranch(ch, marker)) continue
                if (ch.children.length > 1) {
                    observeTarget = ch
                    break
                }
            }
        }

        var observer: MutationObserver | null = null
        try {
            if (typeof MutationObserver !== "undefined") {
                observer = new MutationObserver(function () {
                    var s = getStore()
                    if (!s || !marker) return
                    var p = findRealParent(marker)
                    if (!p) return
                    unregisterAll(s)
                    var t = collectTargets(p, marker, scanMode)
                    registerElements(t, s)
                })
                observer.observe(observeTarget, { childList: true })
            }
        } catch (e) {}

        return function () {
            if (observer) {
                try {
                    observer.disconnect()
                } catch (e) {}
            }
            unregisterAll(getStore())
        }
    }, [
        baseId, scanMode, group, enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority, delayOffset,
        mobileEnabled, visibilityThreshold, duration, stagger,
        easingPreset, staggerDirection, distance, blurAmount,
        scaleFrom, exitTimeout, enterDelay,
    ])

    // Invisible — no layout impact
    return (
        <div
            ref={markerRef}
            style={{
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
                opacity: 0,
            }}
        />
    )
}

TransitionTarget.displayName = "Transition Target"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(TransitionTarget, {
    scanMode: {
        type: ControlType.Enum,
        title: "Scan Mode",
        defaultValue: "cmsItems",
        options: ["siblings", "cmsItems"],
        optionTitles: ["Siblings", "CMS Items"],
    },
    enterPreset: {
        type: ControlType.Enum,
        title: "Enter Preset",
        defaultValue: "fadeUp",
        options: ["fadeUp", "maskRevealX", "maskRevealY"],
        optionTitles: ["Fade Up", "Mask Reveal X", "Mask Reveal Y"],
    },
    exitPreset: {
        type: ControlType.Enum,
        title: "Exit Preset",
        defaultValue: "riseWave",
        options: ["riseWave", "blurLift", "scaleFadeGrid"],
        optionTitles: ["Rise Wave", "Blur Lift", "Scale Fade Grid"],
    },
    enterEnabled: {
        type: ControlType.Boolean,
        title: "Enter",
        defaultValue: true,
    },
    exitEnabled: {
        type: ControlType.Boolean,
        title: "Exit",
        defaultValue: true,
    },
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
            "leftToRight",
            "rightToLeft",
            "topToBottom",
            "bottomToTop",
            "rowMajor",
            "columnMajor",
        ],
        optionTitles: [
            "Left → Right",
            "Right → Left",
            "Top → Bottom",
            "Bottom → Top",
            "Row Major",
            "Column Major",
        ],
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
        hidden: function (props: any) {
            return props.exitPreset !== "blurLift"
        },
    },
    scaleFrom: {
        type: ControlType.Number,
        title: "Scale From",
        defaultValue: 0.92,
        min: 0.5,
        max: 1.5,
        step: 0.01,
        hidden: function (props: any) {
            return props.exitPreset !== "scaleFadeGrid"
        },
    },
    sortPriority: {
        type: ControlType.Number,
        title: "Priority",
        defaultValue: 0,
        min: -10,
        max: 10,
        step: 1,
    },
    delayOffset: {
        type: ControlType.Number,
        title: "Delay Offset",
        defaultValue: 0,
        min: -1,
        max: 2,
        step: 0.01,
        unit: "s",
    },
    mobileEnabled: {
        type: ControlType.Boolean,
        title: "Mobile",
        defaultValue: true,
    },
    exitTimeout: {
        type: ControlType.Number,
        title: "Exit Timeout",
        defaultValue: 3,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: "s",
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
    group: {
        type: ControlType.String,
        title: "Group",
        defaultValue: "default",
    },
    visibilityThreshold: {
        type: ControlType.Number,
        title: "Visibility",
        defaultValue: 0.1,
        min: 0,
        max: 1,
        step: 0.05,
    },
})
