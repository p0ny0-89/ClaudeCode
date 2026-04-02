// ─── Page Choreographer ──────────────────────────────────────────────────────
// The ONLY component you need. Drop one per section/group of elements.
// The first instance automatically sets up:
//   • The shared animation store
//   • Link click interception (exit animations before navigation)
//   • Enter animation playback on page load
//
// Each instance has its OWN animation settings (duration, easing, stagger, etc.)
// so different sections can have completely different effects.
//
// Presets provide quick common effects. Choose "Custom" for full control over
// opacity, offset X/Y, scale, rotate, and blur — matching Framer's native
// appear effect level of control.

import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

var STORE_KEY = "__pageChoreographerStore_v3"

// ─── Easing presets ──────────────────────────────────────────────────────────

var EASING_MAP: Record<string, number[]> = {
    smooth: [0.4, 0, 0.2, 1],
    snappy: [0.16, 1, 0.3, 1],
    dramatic: [0.76, 0, 0.24, 1],
    gentle: [0.25, 0.1, 0.25, 1],
    bounce: [0.34, 1.56, 0.64, 1],
    linear: [0, 0, 1, 1],
}

function easingToCss(e: number[]): string {
    return "cubic-bezier(" + e[0] + "," + e[1] + "," + e[2] + "," + e[3] + ")"
}

// ─── Helpers ────────────────────────────────────────────────────────────────

var maskDirectionPool = ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"]

// WAAPI keyframes use camelCase (clipPath, transformOrigin) but
// CSSStyleDeclaration.setProperty/removeProperty need kebab-case
// (clip-path, transform-origin).  Without this conversion, bake/unbake
// silently fails for hyphenated properties, leaving no inline clip-path
// after WAAPI cancel — which triggers CSS transitions on re-entry.
function camelToKebab(s: string): string {
    return s.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase() })
}

function resolveMaskDirection(dir: string): string {
    if (dir === "random") {
        return maskDirectionPool[Math.floor(Math.random() * maskDirectionPool.length)]
    }
    return dir
}

// ─── Keyframe builders ───────────────────────────────────────────────────────

function buildEnterKeyframes(t: TargetEntry) {
    if (t.enterPreset === "custom") {
        var from: any = { opacity: String(t.enterOpacity) }
        var to: any = { opacity: "1" }

        var has3D = t.enterRotateX !== 0 || t.enterRotateY !== 0
        var persp = has3D && t.enterPerspective > 0
            ? "perspective(" + t.enterPerspective + "px) " : ""

        from.transform = persp +
            "translateX(" + t.enterOffsetX + "px) " +
            "translateY(" + t.enterOffsetY + "px) " +
            "scale(" + t.enterScale + ") " +
            "rotateX(" + t.enterRotateX + "deg) " +
            "rotateY(" + t.enterRotateY + "deg) " +
            "rotateZ(" + t.enterRotateZ + "deg)"
        to.transform = persp +
            "translateX(0px) translateY(0px) scale(1) " +
            "rotateX(0deg) rotateY(0deg) rotateZ(0deg)"

        if (t.enterBlur > 0) {
            from.filter = "blur(" + t.enterBlur + "px)"
            to.filter = "blur(0px)"
        }

        return { from: from, to: to }
    }

    var d = t.distance
    switch (t.enterPreset) {
        case "fadeDown":
            return {
                from: { opacity: "0", transform: "translateY(" + -d + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
        case "fadeLeft":
            return {
                from: { opacity: "0", transform: "translateX(" + d + "px)" },
                to: { opacity: "1", transform: "translateX(0px)" },
            }
        case "fadeRight":
            return {
                from: { opacity: "0", transform: "translateX(" + -d + "px)" },
                to: { opacity: "1", transform: "translateX(0px)" },
            }
        case "scaleIn": {
            var sf = t.scaleFrom
            var so = t.scaleOpacity != null ? t.scaleOpacity : 0
            var sd = t.enterScaleDirection || "center"
            // transform-origin maps direction to the edge/corner the scale originates FROM
            var originMap: Record<string, string> = {
                center: "center center",
                left: "left center",
                right: "right center",
                up: "top center",
                down: "bottom center",
                topLeft: "top left",
                topRight: "top right",
                bottomLeft: "bottom left",
                bottomRight: "bottom right",
            }
            var origin = originMap[sd] || "center center"
            var scaleFrom: any = {
                opacity: String(so),
                transform: "scale(" + sf + ")",
                transformOrigin: origin,
            }
            var scaleTo: any = {
                opacity: "1",
                transform: "scale(1)",
                transformOrigin: origin,
            }
            // Optional mask: pair a clip-path reveal with the scale
            var sMaskDir = resolveMaskDirection(t.enterMaskDirection || "none")
            if (sMaskDir !== "none") {
                var sm = Math.max(0, Math.min(100, 100 - (t.maskStart || 0)))
                var sMask = "inset(0 " + sm + "% 0 0)" // default: left
                switch (sMaskDir) {
                    case "right":      sMask = "inset(0 0 0 " + sm + "%)"; break
                    case "up":         sMask = "inset(0 0 " + sm + "% 0)"; break
                    case "down":       sMask = "inset(" + sm + "% 0 0 0)"; break
                    case "topLeft":    sMask = "inset(0 " + sm + "% " + sm + "% 0)"; break
                    case "topRight":   sMask = "inset(0 0 " + sm + "% " + sm + "%)"; break
                    case "bottomLeft": sMask = "inset(" + sm + "% " + sm + "% 0 0)"; break
                    case "bottomRight":sMask = "inset(" + sm + "% 0 0 " + sm + "%)"; break
                }
                scaleFrom.clipPath = sMask
                scaleTo.clipPath = "inset(0 0 0 0)"
            }
            // Mask shift: offset the content behind the mask for an
            // asymmetric reveal.  Combines with the scale transform.
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                scaleFrom.transform = "scale(" + sf + ") translateX(" + t.maskShiftX + "px) translateY(" + t.maskShiftY + "px)"
                scaleTo.transform = "scale(1) translateX(0px) translateY(0px)"
            }
            return { from: scaleFrom, to: scaleTo }
        }
        case "blurIn":
            return {
                from: {
                    opacity: "0",
                    filter: "blur(" + t.blurAmount + "px)",
                },
                to: { opacity: "1", filter: "blur(0px)" },
            }
        case "maskReveal": {
            // inset(top right bottom left) — 100% = fully clipped on that edge
            var s = Math.max(0, Math.min(100, 100 - (t.maskStart || 0))) // remaining mask %
            var mFrom = "inset(0 " + s + "% 0 0)" // default: left to right
            var resolvedMaskDir = resolveMaskDirection(t.enterMaskDirection)
            switch (resolvedMaskDir) {
                case "right":      mFrom = "inset(0 0 0 " + s + "%)"; break
                case "up":         mFrom = "inset(0 0 " + s + "% 0)"; break
                case "down":       mFrom = "inset(" + s + "% 0 0 0)"; break
                case "topLeft":    mFrom = "inset(0 " + s + "% " + s + "% 0)"; break
                case "topRight":   mFrom = "inset(0 0 " + s + "% " + s + "%)"; break
                case "bottomLeft": mFrom = "inset(" + s + "% " + s + "% 0 0)"; break
                case "bottomRight":mFrom = "inset(" + s + "% 0 0 " + s + "%)"; break
            }
            var enterFrom: any = { clipPath: mFrom }
            var enterTo: any = { clipPath: "inset(0 0 0 0)" }
            if (t.maskOpacity < 1) {
                enterFrom.opacity = String(t.maskOpacity)
                enterTo.opacity = "1"
            }
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                enterFrom.transform = "translateX(" + t.maskShiftX + "px) translateY(" + t.maskShiftY + "px)"
                enterTo.transform = "translateX(0px) translateY(0px)"
            }
            return { from: enterFrom, to: enterTo }
        }
        case "fadeUp":
        default:
            return {
                from: { opacity: "0", transform: "translateY(" + d + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
    }
}

function buildExitKeyframes(t: TargetEntry) {
    if (t.exitPreset === "custom") {
        var from: any = { opacity: "1" }
        var to: any = { opacity: String(t.exitOpacity) }

        var has3D = t.exitRotateX !== 0 || t.exitRotateY !== 0
        var persp = has3D && t.exitPerspective > 0
            ? "perspective(" + t.exitPerspective + "px) " : ""

        from.transform = persp +
            "translateX(0px) translateY(0px) scale(1) " +
            "rotateX(0deg) rotateY(0deg) rotateZ(0deg)"
        to.transform = persp +
            "translateX(" + t.exitOffsetX + "px) " +
            "translateY(" + t.exitOffsetY + "px) " +
            "scale(" + t.exitScale + ") " +
            "rotateX(" + t.exitRotateX + "deg) " +
            "rotateY(" + t.exitRotateY + "deg) " +
            "rotateZ(" + t.exitRotateZ + "deg)"

        if (t.exitBlur > 0) {
            from.filter = "blur(0px)"
            to.filter = "blur(" + t.exitBlur + "px)"
        }

        return { from: from, to: to }
    }

    var d = t.distance
    switch (t.exitPreset) {
        case "blurLift":
            return {
                from: {
                    opacity: "1",
                    transform: "translateY(0px)",
                    filter: "blur(0px)",
                },
                to: {
                    opacity: "0",
                    transform: "translateY(" + -(d * 0.5) + "px)",
                    filter: "blur(" + t.blurAmount + "px)",
                },
            }
        case "scaleFadeGrid":
            return {
                from: { opacity: "1", transform: "scale(1)" },
                to: { opacity: "0", transform: "scale(" + t.scaleFrom + ")" },
            }
        case "fadeDown":
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + d + "px)" },
            }
        case "fadeLeft":
            return {
                from: { opacity: "1", transform: "translateX(0px)" },
                to: { opacity: "0", transform: "translateX(" + -d + "px)" },
            }
        case "fadeRight":
            return {
                from: { opacity: "1", transform: "translateX(0px)" },
                to: { opacity: "0", transform: "translateX(" + d + "px)" },
            }
        case "maskOut": {
            var mTo = "inset(0 0 0 100%)" // default: left to right
            var resolvedExitMaskDir = resolveMaskDirection(t.exitMaskDirection)
            switch (resolvedExitMaskDir) {
                case "right":      mTo = "inset(0 100% 0 0)"; break
                case "up":         mTo = "inset(100% 0 0 0)"; break
                case "down":       mTo = "inset(0 0 100% 0)"; break
                case "topLeft":    mTo = "inset(0 100% 100% 0)"; break
                case "topRight":   mTo = "inset(0 0 100% 100%)"; break
                case "bottomLeft": mTo = "inset(100% 100% 0 0)"; break
                case "bottomRight":mTo = "inset(100% 0 0 100%)"; break
            }
            var exitFrom: any = { clipPath: "inset(0 0 0 0)" }
            var exitTo: any = { clipPath: mTo }
            if (t.maskOpacity < 1) {
                exitFrom.opacity = "1"
                exitTo.opacity = String(t.maskOpacity)
            }
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                exitFrom.transform = "translateX(0px) translateY(0px)"
                exitTo.transform = "translateX(" + (-t.maskShiftX) + "px) translateY(" + (-t.maskShiftY) + "px)"
            }
            return { from: exitFrom, to: exitTo }
        }
        case "scaleOut": {
            var soSf = t.scaleFrom
            var soSo = t.scaleOpacity != null ? t.scaleOpacity : 0
            var soSd = t.enterScaleDirection || "center"
            var soOriginMap: Record<string, string> = {
                center: "center center",
                left: "left center",
                right: "right center",
                up: "top center",
                down: "bottom center",
                topLeft: "top left",
                topRight: "top right",
                bottomLeft: "bottom left",
                bottomRight: "bottom right",
            }
            var soOrigin = soOriginMap[soSd] || "center center"
            var soFrom: any = {
                opacity: "1",
                transform: "scale(1)",
                transformOrigin: soOrigin,
            }
            var soTo: any = {
                opacity: String(soSo),
                transform: "scale(" + soSf + ")",
                transformOrigin: soOrigin,
            }
            // Optional mask: reverse of scaleIn mask
            var soMaskDir = resolveMaskDirection(t.enterMaskDirection || "none")
            if (soMaskDir !== "none") {
                var soM = Math.max(0, Math.min(100, 100 - (t.maskStart || 0)))
                var soMask = "inset(0 " + soM + "% 0 0)"
                switch (soMaskDir) {
                    case "right":      soMask = "inset(0 0 0 " + soM + "%)"; break
                    case "up":         soMask = "inset(0 0 " + soM + "% 0)"; break
                    case "down":       soMask = "inset(" + soM + "% 0 0 0)"; break
                    case "topLeft":    soMask = "inset(0 " + soM + "% " + soM + "% 0)"; break
                    case "topRight":   soMask = "inset(0 0 " + soM + "% " + soM + "%)"; break
                    case "bottomLeft": soMask = "inset(" + soM + "% " + soM + "% 0 0)"; break
                    case "bottomRight":soMask = "inset(" + soM + "% 0 0 " + soM + "%)"; break
                }
                soFrom.clipPath = "inset(0 0 0 0)"
                soTo.clipPath = soMask
            }
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                soFrom.transform = "scale(1) translateX(0px) translateY(0px)"
                soTo.transform = "scale(" + soSf + ") translateX(" + (-t.maskShiftX) + "px) translateY(" + (-t.maskShiftY) + "px)"
            }
            return { from: soFrom, to: soTo }
        }
        case "riseWave":
        default:
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + -d + "px)" },
            }
    }
}

// ─── Store (singleton on window) ─────────────────────────────────────────────

interface TargetEntry {
    id: string
    ref: { current: HTMLElement | null }
    groupId: string
    enterPreset: string
    exitPreset: string
    enterEnabled: boolean
    exitEnabled: boolean
    sortPriority: number
    delayOffset: number
    mobileEnabled: boolean
    trigger: string
    duration: number
    stagger: number
    easing: number[]
    staggerDirection: string
    priorityGap: number
    distance: number
    enterMaskDirection: string
    exitMaskDirection: string
    maskStart: number
    maskShiftX: number
    maskShiftY: number
    maskOpacity: number
    blurAmount: number
    scaleFrom: number
    enterScaleDirection: string
    scaleOpacity: number
    // Custom enter
    enterOpacity: number
    enterOffsetX: number
    enterOffsetY: number
    enterScale: number
    enterRotateX: number
    enterRotateY: number
    enterRotateZ: number
    enterBlur: number
    enterPerspective: number
    // Custom exit
    exitOpacity: number
    exitOffsetX: number
    exitOffsetY: number
    exitScale: number
    exitRotateX: number
    exitRotateY: number
    exitRotateZ: number
    exitBlur: number
    exitPerspective: number
}

function createStore() {
    var targets: Record<string, TargetEntry> = {}
    var activeAnims: Animation[] = []
    var phase = "idle"
    var overlay: HTMLDivElement | null = null
    var linkInterceptionSetup = false
    var skipNextClick = false
    var exitTimeout = 3
    // WeakSet tracks DOM elements that have already been enter-animated.
    // React re-renders reuse the same DOM nodes → elements stay in set → skip.
    // Replay/reload/navigation creates fresh DOM nodes → not in set → animate.
    var animatedElements: WeakSet<Element> | null =
        typeof WeakSet !== "undefined" ? new WeakSet<Element>() : null

    // Map groupId → parent elements to dispatch choreo-done on
    var groupParents: { [gid: string]: HTMLElement[] } = {}

    function registerGroupParent(groupId: string, el: HTMLElement) {
        if (!groupParents[groupId]) groupParents[groupId] = []
        if (groupParents[groupId].indexOf(el) === -1) {
            groupParents[groupId].push(el)
        }
    }

    function unregisterGroupParent(groupId: string, el: HTMLElement) {
        if (!groupParents[groupId]) return
        var idx = groupParents[groupId].indexOf(el)
        if (idx !== -1) groupParents[groupId].splice(idx, 1)
    }

    function getGroupParents(groupId: string): HTMLElement[] | null {
        return groupParents[groupId] || null
    }

    function registerTarget(t: TargetEntry) {
        targets[t.id] = t
    }

    function unregisterTarget(id: string) {
        delete targets[id]
    }

    function getTargetCount() {
        return Object.keys(targets).length
    }

    function getAllTargets() {
        var result: TargetEntry[] = []
        for (var id in targets) {
            if (targets[id].ref.current) result.push(targets[id])
        }
        return result
    }

    function sortTargets(list: TargetEntry[], direction: string) {
        var sorted = list.slice()
        if (direction === "random") {
            // Fisher-Yates shuffle for uniform random order
            for (var si = sorted.length - 1; si > 0; si--) {
                var sj = Math.floor(Math.random() * (si + 1))
                var tmp = sorted[si]
                sorted[si] = sorted[sj]
                sorted[sj] = tmp
            }
            return sorted
        }
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
            try { activeAnims[i].cancel() } catch (e) {}
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

    function groupByGroupId(list: TargetEntry[]): Record<string, TargetEntry[]> {
        var groups: Record<string, TargetEntry[]> = {}
        for (var i = 0; i < list.length; i++) {
            var t = list[i]
            if (!groups[t.groupId]) groups[t.groupId] = []
            groups[t.groupId].push(t)
        }
        return groups
    }

    // Sort group IDs by their priority (ascending), so lower priority
    // numbers animate first. Groups with the same priority play together.
    function getSortedGroupIds(groups: Record<string, TargetEntry[]>): string[] {
        var gids = Object.keys(groups)
        gids.sort(function (a, b) {
            return groups[a][0].sortPriority - groups[b][0].sortPriority
        })
        return gids
    }

    function playEnter() {
        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        // Only auto-play "onLoad" targets — "inView" targets are
        // triggered independently by IntersectionObserver.
        // Skip elements already animated (WeakSet tracks DOM nodes).
        var eligible = getAllTargets().filter(function (t) {
            var el = t.ref.current
            return t.trigger === "onLoad" && t.enterEnabled &&
                (t.mobileEnabled || !mobile) && el &&
                !(animatedElements && animatedElements.has(el))
        })

        if (eligible.length === 0) return Promise.resolve()
        phase = "entering"

        var groups = groupByGroupId(eligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            // Same priority as previous group → no extra offset (play together)
            // Different priority → advance offset so this group starts after the last
            if (prevPriority !== null && currentPriority !== prevPriority) {
                // groupOffset was already accumulated from previous groups
            }

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "0" }, to: { opacity: "1" } }
                    : buildEnterKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset
                var dur = reduced ? 10 : target.duration * 1000

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

                // Mark element as animated BEFORE starting so re-renders
                // during the animation won't try to animate it again
                if (animatedElements) animatedElements.add(el)

                // Reveal pre-hidden element and block hover during animation
                el.style.removeProperty("visibility")
                el.style.pointerEvents = "none"

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
                            (function (a, e) {
                                return function () {
                                    // Restore pointer events so hover effects work
                                    e.style.pointerEvents = ""
                                    try { a.cancel() } catch (ex) {}
                                }
                            })(anim, el)
                        )
                    )
                } catch (e) {
                    el.style.pointerEvents = ""
                }
            }

            // If the NEXT group has a different priority, advance the offset
            // so it starts after this group's last element finishes animating
            // plus the priority gap
            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    var groupDur = sorted.length > 0 ? sorted[0].duration : 0.6
                    var gap = group[0].priorityGap || 0
                    groupOffset += maxDelayInGroup + groupDur + gap
                }
            }
            prevPriority = currentPriority
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            phase = "done"
        })
    }

    function playExit() {
        if (phase === "exiting") return Promise.resolve()
        cancelActive()
        phase = "exiting"
        // Clear animated tracking so enter animations replay on next page
        animatedElements = typeof WeakSet !== "undefined" ? new WeakSet() : null
        lockInteractions()

        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = getAllTargets().filter(function (t) {
            return t.exitEnabled && (t.mobileEnabled || !mobile) && t.ref.current
        })

        var groups = groupByGroupId(eligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "1" }, to: { opacity: "0" } }
                    : buildExitKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: reduced ? 10 : target.duration * 1000,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "forwards",
                    })
                    activeAnims.push(anim)
                    promises.push(anim.finished)
                } catch (e) {}
            }

            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    var groupDur = sorted.length > 0 ? sorted[0].duration : 0.6
                    var gap = group[0].priorityGap || 0
                    groupOffset += maxDelayInGroup + groupDur + gap
                }
            }
            prevPriority = currentPriority
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            unlockInteractions()
            phase = "done"
        })
    }

    // ─── Reset a group so it can be re-animated (used by viewRepeat) ────────

    function resetGroup(groupId: string) {
        if (!animatedElements) return
        var all = getAllTargets()
        for (var i = 0; i < all.length; i++) {
            if (all[i].groupId === groupId && all[i].ref.current) {
                animatedElements.delete(all[i].ref.current!)
            }
        }
        // Cancel any pending batch play for this group so a queued
        // playEnterGroupsBatch doesn't undo the reset's visibility:hidden.
        var pidx = pendingGroups.indexOf(groupId)
        if (pidx !== -1) pendingGroups.splice(pidx, 1)
    }

    // ─── Play enter for inView groups (batched by priority) ─────────────────

    var pendingGroups: string[] = []
    var groupBatchTimer: any = null

    function cancelPendingGroup(groupId: string) {
        var idx = pendingGroups.indexOf(groupId)
        if (idx !== -1) pendingGroups.splice(idx, 1)
    }

    function playEnterGroup(groupId: string) {
        // Collect group IDs that trigger within a short window,
        // then play them all together sorted by priority
        if (pendingGroups.indexOf(groupId) === -1) {
            pendingGroups.push(groupId)
        }
        if (groupBatchTimer) clearTimeout(groupBatchTimer)
        groupBatchTimer = setTimeout(function () {
            groupBatchTimer = null
            var batch = pendingGroups.slice()
            pendingGroups = []
            playEnterGroupsBatch(batch)
        }, 80)
    }

    function playEnterGroupsBatch(groupIds: string[]) {
        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        // Collect eligible targets for all requested groups
        var allEligible = getAllTargets().filter(function (t) {
            var el = t.ref.current
            return groupIds.indexOf(t.groupId) !== -1 && t.enterEnabled &&
                (t.mobileEnabled || !mobile) && el &&
                !(animatedElements && animatedElements.has(el))
        })

        if (allEligible.length === 0) return

        // Group by groupId, then sort groups by priority
        var groups = groupByGroupId(allEligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                if (animatedElements) animatedElements.add(el)
                el.style.removeProperty("visibility")
                el.style.pointerEvents = "none"

                var kf = reduced
                    ? { from: { opacity: "0" }, to: { opacity: "1" } }
                    : buildEnterKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset
                var dur = reduced ? 10 : target.duration * 1000

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

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
                            (function (a, e) {
                                return function () {
                                    e.style.pointerEvents = ""
                                    try { a.cancel() } catch (ex) {}
                                }
                            })(anim, el)
                        )
                    )
                } catch (e) {
                    el.style.pointerEvents = ""
                }
            }

            // Advance offset for next priority level
            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    var groupDur = sorted.length > 0 ? sorted[0].duration : 0.6
                    var gap = group[0].priorityGap || 0
                    groupOffset += maxDelayInGroup + groupDur + gap
                }
            }
            prevPriority = currentPriority
        }

        Promise.all(promises).then(function () {
            // Notify child PCs that these groups have finished animating.
            // Dispatch on each animated target element...
            for (var di = 0; di < sortedGids.length; di++) {
                var dGroup = groups[sortedGids[di]]
                for (var dj = 0; dj < dGroup.length; dj++) {
                    var dEl = dGroup[dj].ref.current
                    if (dEl) {
                        dEl.dispatchEvent(new CustomEvent("choreo-done", {
                            bubbles: true,
                            detail: { groupId: sortedGids[di] },
                        }))
                    }
                }
                // ...AND on each registered group parent container.
                // This ensures child PCs in sibling stacks receive the
                // event even when the animated targets are in a different
                // branch of the DOM tree.
                var gps = groupParents[sortedGids[di]]
                if (gps) {
                    for (var gpi = 0; gpi < gps.length; gpi++) {
                        gps[gpi].dispatchEvent(new CustomEvent("choreo-done", {
                            bubbles: true,
                            detail: { groupId: sortedGids[di] },
                        }))
                    }
                }
            }
        })
        return Promise.all(promises)
    }

    // ─── Link interception ───────────────────────────────────────────────────

    function setupLinkInterception(timeout: number) {
        exitTimeout = timeout
        if (linkInterceptionSetup) return
        linkInterceptionSetup = true

        function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
            var node = target as HTMLElement | null
            while (node && node !== document.body) {
                if (node.tagName === "A") return node as HTMLAnchorElement
                node = node.parentElement
            }
            return null
        }

        function shouldIntercept(anchor: HTMLAnchorElement): boolean {
            if (!anchor.href) return false
            if (anchor.hasAttribute("data-no-exit")) return false
            if (anchor.target === "_blank") return false
            try {
                var url = new URL(anchor.href, window.location.origin)
                if (url.origin !== window.location.origin) return false
                if (url.pathname === window.location.pathname && url.hash) return false
            } catch (e) {
                return false
            }
            return true
        }

        function navigateViaAnchor(anchor: HTMLAnchorElement) {
            skipNextClick = true
            anchor.click()
        }

        document.addEventListener("click", function (e: MouseEvent) {
            if (skipNextClick) { skipNextClick = false; return }
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
                .then(function () { navigateViaAnchor(anchor) })
                .catch(function () { navigateViaAnchor(anchor) })
        }, true)
    }

    // ─── Auto enter ──────────────────────────────────────────────────────────

    var scheduleTimer: any = null

    function scheduleEnter(delay: number) {
        // Debounce: each call resets the timer so we wait for all
        // components to finish registering before playing.
        // The WeakSet inside playEnter handles idempotency —
        // already-animated DOM elements are skipped automatically.
        if (scheduleTimer) clearTimeout(scheduleTimer)
        scheduleTimer = setTimeout(function () {
            scheduleTimer = null
            var delayMs = delay * 1000
            if (delayMs > 0) {
                setTimeout(function () { playEnter() }, delayMs)
            } else {
                playEnter()
            }
        }, 150)
    }

    return {
        registerTarget: registerTarget,
        unregisterTarget: unregisterTarget,
        registerGroupParent: registerGroupParent,
        unregisterGroupParent: unregisterGroupParent,
        getGroupParents: getGroupParents,
        getTargetCount: getTargetCount,
        getAllTargets: getAllTargets,
        sortTargets: sortTargets,
        playEnter: playEnter,
        playEnterGroup: playEnterGroup,
        resetGroup: resetGroup,
        cancelPendingGroup: cancelPendingGroup,
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
        var s = (window as any)[STORE_KEY]
        // Patch stores created by older code versions that lack group parent methods
        if (s && !s.cancelPendingGroup) {
            s.cancelPendingGroup = function () {}
        }
        if (s && !s.registerGroupParent) {
            var gp: { [gid: string]: HTMLElement[] } = {}
            s.registerGroupParent = function (groupId: string, el: HTMLElement) {
                if (!gp[groupId]) gp[groupId] = []
                if (gp[groupId].indexOf(el) === -1) gp[groupId].push(el)
            }
            s.unregisterGroupParent = function (groupId: string, el: HTMLElement) {
                if (!gp[groupId]) return
                var idx = gp[groupId].indexOf(el)
                if (idx !== -1) gp[groupId].splice(idx, 1)
            }
            s.getGroupParents = function (groupId: string) {
                return gp[groupId] || null
            }
        }
        return s
    }
    return null
}

// ─── DOM scanning ────────────────────────────────────────────────────────────

function findRealParent(marker: HTMLElement): HTMLElement | null {
    var node = marker.parentElement
    var maxDepth = 5
    while (node && maxDepth > 0) {
        var count = 0
        for (var i = 0; i < node.children.length; i++) count++
        if (count > 1) return node
        node = node.parentElement
        maxDepth--
    }
    return node
}

// Walk up from an element to find the section-level ancestor.
// Strategy:
//  1. Prefer an ancestor with data-framer-name (explicit Framer section)
//  2. Fall back to the "child of a parent with ≥3 siblings" heuristic
//  3. Reject candidates taller than 2× viewport (likely the page container)
//  4. Final fallback: return the starting element
function findSection(el: HTMLElement): HTMLElement {
    var vh = window.innerHeight
    var node = el
    var heuristicCandidate: HTMLElement | null = null
    var namedCandidate: HTMLElement | null = null

    while (node.parentElement) {
        // Framer sections have data-framer-name — good signal, but
        // reject page-level containers that are much taller than the
        // viewport (e.g. "main" wrapping the entire page).
        if (node.getAttribute("data-framer-name") != null && !namedCandidate) {
            if (node.offsetHeight <= vh * 2.5) {
                namedCandidate = node
            }
            // If too tall, skip — keep looking for a smaller named ancestor
        }

        var siblingCount = node.parentElement.children.length
        if (siblingCount >= 3 && !heuristicCandidate) {
            // Only accept if the candidate isn't the entire page
            if (node.offsetHeight < vh * 2) {
                heuristicCandidate = node
            }
        }

        node = node.parentElement
    }

    // Prefer named section, fall back to heuristic, then starting element
    return namedCandidate || heuristicCandidate || el
}

// Find the best element to use as the pin container's target.
// This is separate from findSection because the pin needs to wrap
// the SHARED visual section (the viewport-height block that contains
// all PC instances), even if it's unnamed.  findSection returns the
// local named ancestor (good for wrapper creation), but pin needs
// the page-level section that siblings other sections.
function findPinSection(el: HTMLElement): HTMLElement {
    var vh = window.innerHeight
    var node = el
    var best: HTMLElement | null = null

    while (node.parentElement) {
        // Skip over pin containers and spacers injected by previous
        // PC instances — these are NOT real page sections and must
        // never be returned as a pin section.
        if (node.hasAttribute("data-choreo-pin-container") ||
            node.hasAttribute("data-choreo-spacer")) {
            node = node.parentElement
            continue
        }
        var h = node.offsetHeight
        // Good pin candidate: a non-collapsed element whose parent
        // has at least 2 children (meaning it's a page-level section
        // that sits alongside other sections).  No strict height
        // range — sections can be any height (100vh, fill, fixed).
        // The sibling check + tree walk (preferring higher ancestors)
        // is the real section identifier.
        if (h >= 10) {
            var parentKids = node.parentElement.children.length
            if (parentKids >= 2) {
                best = node
                // Don't break — keep going up in case there's a
                // better (higher) candidate.  But stop if the next
                // ancestor is way too tall.
            }
        }
        // Stop climbing if we've gone past 3x viewport
        if (h > vh * 3) break
        node = node.parentElement
    }

    // Fall back to findSection if no page-level section found
    return best || findSection(el)
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
        if (contentCount >= 1 && contentCount > bestCount) {
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

function nodeMatchesNames(node: HTMLElement, names: string[]): boolean {
    var attrs = ["data-framer-name", "data-framer-component", "aria-label"]
    for (var a = 0; a < attrs.length; a++) {
        var val = (node.getAttribute(attrs[a]) || "").toLowerCase()
        if (!val) continue
        for (var n = 0; n < names.length; n++) {
            if (val === names[n] || val.indexOf(names[n]) !== -1) return true
        }
    }
    // Check trimmed text content (only if short — avoids matching paragraphs)
    var text = (node.textContent || "").trim().toLowerCase()
    if (text.length > 0 && text.length < 60) {
        for (var n = 0; n < names.length; n++) {
            if (text === names[n]) return true
        }
    }
    return false
}

function elementMatchesNames(el: HTMLElement, names: string[]): boolean {
    // Check element itself
    if (nodeMatchesNames(el, names)) return true
    // Check all descendants
    try {
        var all = el.querySelectorAll("*")
        for (var i = 0; i < all.length; i++) {
            if (nodeMatchesNames(all[i] as HTMLElement, names)) return true
        }
    } catch (e) {}
    return false
}

// Split text elements into individual words for per-word animation.
// Walks into text containers and wraps each whitespace-delimited word
// in an inline-block span so it can be animated independently.
function splitTextWords(targets: HTMLElement[]): HTMLElement[] {
    var result: HTMLElement[] = []
    for (var i = 0; i < targets.length; i++) {
        var el = targets[i]

        // Already split? Just collect existing word spans (avoids infinite re-split)
        var existing = el.querySelectorAll("[data-choreo-word]")
        if (existing.length > 0) {
            for (var ex = 0; ex < existing.length; ex++) {
                result.push(existing[ex] as HTMLElement)
            }
            continue
        }

        // Collect all text-bearing leaf nodes inside the element
        var textLeaves: HTMLElement[] = []
        var paragraphs = el.querySelectorAll("p, span, a, em, strong, b, i, u, h1, h2, h3, h4, h5, h6")
        if (paragraphs.length > 0) {
            for (var p = 0; p < paragraphs.length; p++) {
                var pEl = paragraphs[p] as HTMLElement
                // Only take leaf-level text containers
                if (pEl.children.length === 0 ||
                    (pEl.children.length > 0 && pEl.querySelector("br") != null)) {
                    textLeaves.push(pEl)
                }
            }
        }
        if (textLeaves.length === 0) textLeaves.push(el)

        var wordCount = 0
        for (var tl = 0; tl < textLeaves.length; tl++) {
            var leaf = textLeaves[tl]
            var nodes = leaf.childNodes
            var fragments: Node[] = []
            for (var cn = 0; cn < nodes.length; cn++) {
                var nd = nodes[cn]
                if (nd.nodeType === 3) { // Text node
                    var text = nd.textContent || ""
                    var parts = text.match(/\S+|\s+/g) || []
                    for (var wp = 0; wp < parts.length; wp++) {
                        if (/^\s+$/.test(parts[wp])) {
                            fragments.push(document.createTextNode(parts[wp]))
                        } else {
                            var wordSpan = document.createElement("span")
                            wordSpan.style.display = "inline-block"
                            wordSpan.style.whiteSpace = "nowrap"
                            wordSpan.setAttribute("data-choreo-word", "1")
                            wordSpan.textContent = parts[wp]
                            fragments.push(wordSpan)
                            wordCount++
                        }
                    }
                } else if (nd.nodeType === 1 && (nd as HTMLElement).tagName === "BR") {
                    fragments.push(nd.cloneNode(true))
                } else {
                    var inlineSpan = document.createElement("span")
                    inlineSpan.style.display = "inline-block"
                    inlineSpan.setAttribute("data-choreo-word", "1")
                    inlineSpan.appendChild(nd.cloneNode(true))
                    fragments.push(inlineSpan)
                    wordCount++
                }
            }
            while (leaf.firstChild) leaf.removeChild(leaf.firstChild)
            for (var fi = 0; fi < fragments.length; fi++) {
                leaf.appendChild(fragments[fi])
            }
        }

        if (wordCount > 0) {
            var wordSpans = el.querySelectorAll("[data-choreo-word]")
            for (var ws = 0; ws < wordSpans.length; ws++) {
                result.push(wordSpans[ws] as HTMLElement)
            }
            el.style.overflow = "visible"
        } else {
            result.push(el)
        }
    }
    return result
}

function splitTextChars(targets: HTMLElement[]): HTMLElement[] {
    var result: HTMLElement[] = []
    for (var i = 0; i < targets.length; i++) {
        var el = targets[i]

        // Already split? Collect existing char spans
        var existing = el.querySelectorAll("[data-choreo-char]")
        if (existing.length > 0) {
            for (var ex = 0; ex < existing.length; ex++) {
                result.push(existing[ex] as HTMLElement)
            }
            continue
        }

        // Collect all text-bearing leaf nodes inside the element
        var textLeaves: HTMLElement[] = []
        var paragraphs = el.querySelectorAll("p, span, a, em, strong, b, i, u, h1, h2, h3, h4, h5, h6")
        if (paragraphs.length > 0) {
            for (var p = 0; p < paragraphs.length; p++) {
                var pEl = paragraphs[p] as HTMLElement
                if (pEl.children.length === 0 ||
                    (pEl.children.length > 0 && pEl.querySelector("br") != null)) {
                    textLeaves.push(pEl)
                }
            }
        }
        if (textLeaves.length === 0) textLeaves.push(el)

        var charCount = 0
        for (var tl = 0; tl < textLeaves.length; tl++) {
            var leaf = textLeaves[tl]
            var nodes = leaf.childNodes
            var fragments: Node[] = []
            for (var cn = 0; cn < nodes.length; cn++) {
                var nd = nodes[cn]
                if (nd.nodeType === 3) { // Text node
                    var text = nd.textContent || ""
                    for (var ci = 0; ci < text.length; ci++) {
                        var ch = text[ci]
                        if (ch === " " || ch === "\t") {
                            // Wrap spaces in a non-animated span to
                            // preserve word spacing in inline-block flow
                            var spaceSpan = document.createElement("span")
                            spaceSpan.style.display = "inline-block"
                            spaceSpan.style.width = "0.3em"
                            spaceSpan.innerHTML = "&nbsp;"
                            fragments.push(spaceSpan)
                        } else if (ch === "\n" || ch === "\r") {
                            fragments.push(document.createElement("br"))
                        } else {
                            var charSpan = document.createElement("span")
                            charSpan.style.display = "inline-block"
                            charSpan.setAttribute("data-choreo-char", "1")
                            charSpan.textContent = ch
                            fragments.push(charSpan)
                            charCount++
                        }
                    }
                } else if (nd.nodeType === 1 && (nd as HTMLElement).tagName === "BR") {
                    fragments.push(nd.cloneNode(true))
                } else {
                    // Non-text inline element (e.g. <em>, <strong>)
                    // Recurse into its text content for char splitting
                    var inlineEl = nd as HTMLElement
                    var inlineText = inlineEl.textContent || ""
                    for (var ic = 0; ic < inlineText.length; ic++) {
                        var ich = inlineText[ic]
                        if (ich === " " || ich === "\t") {
                            var iSpaceSpan = document.createElement("span")
                            iSpaceSpan.style.display = "inline-block"
                            iSpaceSpan.style.width = "0.3em"
                            iSpaceSpan.innerHTML = "&nbsp;"
                            fragments.push(iSpaceSpan)
                        } else {
                            var iCharSpan = document.createElement("span")
                            iCharSpan.style.display = "inline-block"
                            iCharSpan.setAttribute("data-choreo-char", "1")
                            // Inherit the inline element's styling
                            iCharSpan.style.fontWeight = window.getComputedStyle(inlineEl).fontWeight
                            iCharSpan.style.fontStyle = window.getComputedStyle(inlineEl).fontStyle
                            iCharSpan.style.textDecoration = window.getComputedStyle(inlineEl).textDecoration
                            iCharSpan.textContent = ich
                            fragments.push(iCharSpan)
                            charCount++
                        }
                    }
                }
            }
            while (leaf.firstChild) leaf.removeChild(leaf.firstChild)
            for (var fi = 0; fi < fragments.length; fi++) {
                leaf.appendChild(fragments[fi])
            }
        }

        if (charCount > 0) {
            var charSpans = el.querySelectorAll("[data-choreo-char]")
            for (var cs = 0; cs < charSpans.length; cs++) {
                result.push(charSpans[cs] as HTMLElement)
            }
            el.style.overflow = "visible"
        } else {
            result.push(el)
        }
    }
    return result
}

// Split text elements into individual lines for per-line animation.
// Framer rich text renders each line as <p> inside a container.
// Plain text may use <br> tags — we wrap text runs between <br>s in spans.
function splitTextTargets(targets: HTMLElement[]): HTMLElement[] {
    var result: HTMLElement[] = []
    for (var i = 0; i < targets.length; i++) {
        var el = targets[i]

        // Look for <p> children (Framer rich text)
        var paragraphs = el.querySelectorAll(":scope > p, :scope > div > p")
        if (paragraphs.length > 1) {
            for (var j = 0; j < paragraphs.length; j++) {
                result.push(paragraphs[j] as HTMLElement)
            }
            // Set overflow visible on parent so animated lines aren't clipped
            el.style.overflow = "visible"
            continue
        }

        // Look for <br> tags (simple text)
        var brs = el.querySelectorAll("br")
        if (brs.length > 0) {
            // Walk child nodes, grouping text/inline nodes between <br>s
            var wrapper = el.firstElementChild || el
            var lineNodes: Node[][] = [[]]
            for (var c = 0; c < wrapper.childNodes.length; c++) {
                var node = wrapper.childNodes[c]
                if (node.nodeName === "BR") {
                    lineNodes.push([])
                } else {
                    lineNodes[lineNodes.length - 1].push(node)
                }
            }
            // Only split if we got multiple non-empty lines
            var nonEmpty = lineNodes.filter(function (ln) {
                return ln.some(function (n) {
                    return (n.textContent || "").trim().length > 0
                })
            })
            if (nonEmpty.length > 1) {
                // Clear the container and rebuild with wrapped lines
                while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild)
                for (var li = 0; li < lineNodes.length; li++) {
                    var span = document.createElement("span")
                    span.style.display = "block"
                    for (var ni = 0; ni < lineNodes[li].length; ni++) {
                        span.appendChild(lineNodes[li][ni])
                    }
                    wrapper.appendChild(span)
                    result.push(span)
                }
                el.style.overflow = "visible"
                continue
            }
        }

        // Not a multi-line text element — keep as-is
        result.push(el)
    }
    return result
}

function collectTargets(
    parent: HTMLElement,
    marker: HTMLElement,
    scanMode: string,
    excludeSelector?: string,
    splitText?: string
): HTMLElement[] {
    var result: HTMLElement[] = []

    // ── Auto CMS / collection detection ──
    // Walk up from the marker looking for a collection pattern:
    //  1. Children share the same data-framer-name (named CMS items)
    //  2. Children's first named descendant shares the same name (grid wrappers)
    //  3. Children are structurally identical: same tag + same child count
    //     (handles masonry/grid where no data-framer-name is set)
    // Picks the ancestor with the MOST homogeneous children.
    var cmsAncestor: HTMLElement | null = null
    var cmsAncestorCount = 0
    if (scanMode === "siblings" || scanMode === "cmsItems" || scanMode === "cmsNested") {
        var walkNode: HTMLElement | null = marker.parentElement
        var maxWalk = 15
        var walkDepth = 0
        while (walkNode && maxWalk > 0) {
            walkDepth++
            var wChildren: HTMLElement[] = []
            for (var wc = 0; wc < walkNode.children.length; wc++) {
                var wChild = walkNode.children[wc] as HTMLElement
                if (!isMarkerBranch(wChild, marker)) wChildren.push(wChild)
            }

            if (wChildren.length >= 2) {
                var detected = false

                // Strategy 1: direct children share data-framer-name
                var directName = wChildren[0].getAttribute("data-framer-name")
                if (directName) {
                    var allDirect = true
                    for (var wn = 1; wn < wChildren.length; wn++) {
                        if (wChildren[wn].getAttribute("data-framer-name") !== directName) {
                            allDirect = false
                            break
                        }
                    }
                    if (allDirect) detected = true
                }

                // Strategy 2: wrapper children's first named descendant matches
                if (!detected) {
                    var innerName: string | null = null
                    var allInner = true
                    for (var wi = 0; wi < wChildren.length; wi++) {
                        var named = wChildren[wi].querySelector("[data-framer-name]") as HTMLElement | null
                        var nm = named ? named.getAttribute("data-framer-name") : null
                        if (!nm) { allInner = false; break }
                        if (innerName === null) innerName = nm
                        else if (nm !== innerName) { allInner = false; break }
                    }
                    if (allInner && innerName) detected = true
                }

                // Strategy 3: structural homogeneity — all children are
                // the same tag with the same number of children.
                // Catches masonry/grid CMS where items have no names.
                if (!detected) {
                    var firstTag = wChildren[0].tagName
                    var firstCh = wChildren[0].children.length
                    var allStruct = firstCh > 0 // require at least 1 grandchild
                    for (var ws = 1; ws < wChildren.length; ws++) {
                        if (wChildren[ws].tagName !== firstTag ||
                            wChildren[ws].children.length !== firstCh) {
                            allStruct = false
                            break
                        }
                    }
                    if (allStruct) detected = true
                }

                // Prefer the ancestor with the most children (collection level)
                if (detected && wChildren.length > cmsAncestorCount) {
                    cmsAncestor = walkNode
                    cmsAncestorCount = wChildren.length
                }

                // Strategy 4: relaxed "most children" fallback.
                // In masonry layouts, items are split into columns. Each
                // column has ≥2 items that aren't structurally identical
                // (e.g. different child counts). Since each CMS item has
                // its own Page Choreographer instance, finding just the
                // column siblings is enough — all instances together cover
                // every item. Only use this if no strict match was found.
                // Require depth ≥ 2 to skip the card's own content level
                // (Image, Title, etc.) and only match at the column level.
                // Also require that this node's parent has ≥2 children —
                // a parent with 1 child means we're inside a card wrapper,
                // not at a real collection level.
                if (!detected && wChildren.length >= 2 && !cmsAncestor && walkDepth >= 2) {
                    // Only allow Strategy 4 at or BELOW the parent level.
                    // Walking above parent means grouping parent's siblings
                    // as a collection — those are structural containers,
                    // not CMS items.  parent.contains(walkNode) is true
                    // when walkNode is parent itself or inside parent.
                    var s4InScope = parent.contains(walkNode)
                    var s4ParentOk = s4InScope && walkNode.parentElement &&
                        walkNode.parentElement.children.length >= 2
                    if (s4ParentOk) {
                        // Require children to at least share the same tag
                        var fallbackTag = wChildren[0].tagName
                        var sameTag = true
                        for (var wf = 1; wf < wChildren.length; wf++) {
                            if (wChildren[wf].tagName !== fallbackTag) {
                                sameTag = false
                                break
                            }
                        }
                        if (sameTag) {
                            cmsAncestor = walkNode
                            cmsAncestorCount = wChildren.length
                        }
                    }
                }
            }
            walkNode = walkNode.parentElement
            maxWalk--
        }
    }

    // ── Reject CMS ancestor above the parent level ──
    // If the detected cmsAncestor is ABOVE parent in the DOM tree,
    // it means we'd be grouping parent's siblings as a collection.
    // Those are structural containers, not CMS items.  Drop the
    // match and let the fallback (direct siblings) handle it.
    if (cmsAncestor && !parent.contains(cmsAncestor)) {
        cmsAncestor = null
        cmsAncestorCount = 0
    }

    if (cmsAncestor) {
        // Check if the CMS ancestor is a masonry column — i.e., its parent
        // has multiple same-tag children. In masonry layouts, Framer splits
        // items into column wrappers. We need to collect from ALL columns
        // so every item is targeted regardless of column distribution.
        var colParent = cmsAncestor.parentElement
        var isMasonryColumn = false
        if (colParent && colParent.children.length >= 2) {
            var myTag = cmsAncestor.tagName
            var allColsSameTag = true
            for (var cs = 0; cs < colParent.children.length; cs++) {
                if ((colParent.children[cs] as HTMLElement).tagName !== myTag) {
                    allColsSameTag = false
                    break
                }
            }
            isMasonryColumn = allColsSameTag
        }

        if (isMasonryColumn) {
            // Masonry: collect items from ALL sibling columns.
            // Include ALL items (even the one containing this marker)
            // so every item is targeted regardless of which instance
            // finds it.  Identical animations from multiple instances
            // compose harmlessly for scroll-driven animations.
            for (var mc = 0; mc < colParent!.children.length; mc++) {
                var column = colParent!.children[mc] as HTMLElement
                for (var mi = 0; mi < column.children.length; mi++) {
                    result.push(column.children[mi] as HTMLElement)
                }
            }
        } else {
            // Single collection — use its children as targets
            for (var cj = 0; cj < cmsAncestor.children.length; cj++) {
                result.push(cmsAncestor.children[cj] as HTMLElement)
            }
        }
    } else {
        // No CMS collection found — try masonry grid detection:
        // walk up looking for a grid container whose children are columns
        // (same-tag siblings each containing multiple same-tag items).
        var masonryGrid: HTMLElement | null = null
        var mWalk: HTMLElement | null = marker.parentElement
        var mMaxWalk = 15
        while (mWalk && mMaxWalk > 0 && parent.contains(mWalk)) {
            if (mWalk.children.length >= 2) {
                var mColTag = (mWalk.children[0] as HTMLElement).tagName
                var mAllSame = true
                var mTotalItems = 0
                var mMaxColItems = 0
                for (var mg = 0; mg < mWalk.children.length; mg++) {
                    var mCol = mWalk.children[mg] as HTMLElement
                    if (mCol.tagName !== mColTag) { mAllSame = false; break }
                    mTotalItems += mCol.children.length
                    if (mCol.children.length > mMaxColItems) mMaxColItems = mCol.children.length
                }
                // Columns must share same tag, collectively have ≥3 items,
                // and at least one column must have ≥2 children (to
                // distinguish real masonry columns from card-internal
                // wrappers which typically have 1 child each).
                if (mAllSame && mTotalItems >= 3 && mMaxColItems >= 2) {
                    masonryGrid = mWalk
                    break
                }
            }
            mWalk = mWalk.parentElement
            mMaxWalk--
        }

        if (masonryGrid) {
            // Collect items from all columns (include all, even marker branch)
            for (var gc = 0; gc < masonryGrid.children.length; gc++) {
                var gCol = masonryGrid.children[gc] as HTMLElement
                for (var gi = 0; gi < gCol.children.length; gi++) {
                    result.push(gCol.children[gi] as HTMLElement)
                }
            }
        } else {
            // Final fallback — direct siblings.
            // Skip siblings that contain OTHER PC markers — those are
            // structural containers with their own instances, not targets.
            for (var k = 0; k < parent.children.length; k++) {
                var el = parent.children[k] as HTMLElement
                if (isMarkerBranch(el, marker)) continue
                if (el.querySelector("[data-choreo-marker]")) continue
                result.push(el)
            }
        }
    }
    // Filter out elements whose layer name matches any excluded name.
    // User types comma-separated layer names like "Load More, Footer".
    // Checks data-framer-name, data-framer-component, aria-label, and
    // trimmed text content — on the element itself and its descendants.
    if (excludeSelector && excludeSelector.trim()) {
        var names = excludeSelector.split(",").map(function (n) {
            return n.trim().toLowerCase()
        }).filter(function (n) { return n.length > 0 })

        if (names.length > 0) {
            result = result.filter(function (el) {
                return !elementMatchesNames(el, names)
            })
        }
    }
    // Expand text elements into individual lines or words
    if (splitText === "lines") {
        result = splitTextTargets(result)
    } else if (splitText === "words") {
        result = splitTextWords(result)
    } else if (splitText === "chars") {
        result = splitTextChars(result)
    }
    return result
}

// ─── Component ───────────────────────────────────────────────────────────────

var groupCounter = 0
// Global flag: suppresses ALL MutationObservers across PC instances
// during structural DOM changes (pin container, wrapper creation).
// Prevents cross-instance infinite re-render loops.
var choreoMutGlobalSuppress = false
function useStableGroupId() {
    var ref = React.useRef("")
    if (ref.current === "") {
        groupCounter += 1
        ref.current = "scan-" + groupCounter
    }
    return ref.current
}

export default function PageChoreographer(props: any) {
    var {
        scanMode = "siblings",
        excludeSelector = "",
        splitText: splitTextRaw = "none",
        enterPreset = "fadeUp",
        exitPreset = "riseWave",
        enterEnabled = true,
        exitEnabled = true,
        mobileEnabled = true,
        trigger = "onLoad",
        viewOffset = 100,
        viewRepeat = false,
        waitForParent = false,
        scrollLength = 500,
        scrollStart = "bottom",
        scrollStartOffset = 0,
        scrollPin = true,
        pinPriority = false,
        scrollOnce = false,
        sortPriority = 0,
        priorityGap = 0,
        delayOffset = 0,
        duration = 0.6,
        stagger = 0.06,
        easingPreset = "smooth",
        staggerDirection = "leftToRight",
        distance = 40,
        enterMaskDirection = "left",
        exitMaskDirection = "left",
        maskStart = 0,
        maskPreview = false,
        maskViewportClip = false,
        maskViewportPadding = 0,
        maskShiftX = 0,
        maskShiftY = 0,
        maskOpacity = 1,
        blurAmount = 8,
        scaleFrom = 0.92,
        enterScaleDirection = "center",
        scaleOpacity = 0,
        exitTimeout = 3,
        enterDelay = 0.05,
        // Custom enter
        enterOpacity = 0,
        enterOffsetX = 0,
        enterOffsetY = 40,
        enterScale = 1,
        enterRotateX = 0,
        enterRotateY = 0,
        enterRotateZ = 0,
        enterBlur = 0,
        enterPerspective = 1000,
        // Custom exit
        exitOpacity = 0,
        exitOffsetX = 0,
        exitOffsetY = -40,
        exitScale = 1,
        exitRotateX = 0,
        exitRotateY = 0,
        exitRotateZ = 0,
        exitBlur = 0,
        exitPerspective = 1000,
        style,
    } = props

    // Backward compat: old boolean splitText (true → "lines", false → "none")
    var splitText = splitTextRaw === true ? "lines" : splitTextRaw === false ? "none" : splitTextRaw

    var markerRef = React.useRef(null) as React.MutableRefObject<HTMLDivElement | null>
    var baseId = useStableGroupId()
    var registeredIds = React.useRef<string[]>([])
    var initialTargetCount = React.useRef(0)
    var rescanState = React.useState(0)
    var rescanGeneration = rescanState[0]
    var setRescanGeneration = rescanState[1]

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
                groupId: baseId,
                enterPreset: enterPreset,
                exitPreset: exitPreset,
                enterEnabled: enterEnabled,
                exitEnabled: exitEnabled,
                sortPriority: sortPriority,
                priorityGap: priorityGap,
                delayOffset: delayOffset,
                mobileEnabled: mobileEnabled,
                trigger: trigger,
                duration: duration,
                stagger: stagger,
                easing: easing,
                staggerDirection: staggerDirection,
                distance: distance,
                enterMaskDirection: enterMaskDirection,
                exitMaskDirection: exitMaskDirection,
                maskStart: maskStart,
                maskShiftX: maskShiftX,
                maskShiftY: maskShiftY,
                maskOpacity: maskOpacity,
                blurAmount: blurAmount,
                scaleFrom: scaleFrom,
                enterScaleDirection: enterScaleDirection,
                scaleOpacity: scaleOpacity,
                enterOpacity: enterOpacity,
                enterOffsetX: enterOffsetX,
                enterOffsetY: enterOffsetY,
                enterScale: enterScale,
                enterRotateX: enterRotateX,
                enterRotateY: enterRotateY,
                enterRotateZ: enterRotateZ,
                enterBlur: enterBlur,
                enterPerspective: enterPerspective,
                exitOpacity: exitOpacity,
                exitOffsetX: exitOffsetX,
                exitOffsetY: exitOffsetY,
                exitScale: exitScale,
                exitRotateX: exitRotateX,
                exitRotateY: exitRotateY,
                exitRotateZ: exitRotateZ,
                exitBlur: exitBlur,
                exitPerspective: exitPerspective,
            })

            registeredIds.current.push(targetId)
        }
    }

    React.useEffect(function () {
        var store = getStore()
        var marker = markerRef.current
        if (!store || !marker) return

        store.setupLinkInterception(exitTimeout)

        // Only schedule global enter for "onLoad" groups
        if (trigger === "onLoad") {
            store.scheduleEnter(enterDelay)
        }

        var parent = findRealParent(marker)
        if (!parent) return

        unregisterAll(store)

        var targets = collectTargets(parent, marker, scanMode, excludeSelector, splitText)
        registerElements(targets, store)
        // Register parent as a group parent so choreo-done is dispatched
        // on the container element, not just on individual targets.
        // This ensures child PCs in sibling stacks receive the event.
        store.registerGroupParent(baseId, parent)
        // Delayed re-scan: masonry/grid layouts restructure the DOM
        // after initial render.  If re-scan finds MORE targets, force
        // the entire useEffect to re-run (via state update) so the full
        // pipeline (pre-hiding, triggers, animations) is rebuilt.
        initialTargetCount.current = targets.length
        var rescanTimer = setTimeout(function () {
            if (!marker || !marker.parentElement) return
            var p2 = findRealParent(marker)
            if (!p2) return
            var t2 = collectTargets(p2, marker, scanMode, excludeSelector, splitText)
            if (t2.length > initialTargetCount.current) {
                // Force full useEffect re-run — cleanup runs first,
                // then new setup with correct targets
                setRescanGeneration(function (g: number) { return g + 1 })
            }
        }, 400)

        // Pre-hide elements that will animate in (inView / onLoad) so they
        // don't flash visible before the animation starts. Only in preview —
        // on canvas elements should stay visible for editing.
        // Uses visibility:hidden which doesn't interfere with WAAPI animations
        // and is cleanly removed when the animation starts.
        //
        // IMPORTANT: For onScroll trigger, pre-hiding is deferred to the
        // scroll setup rAF (after the section ownership check).  This
        // prevents follower instances from hiding targets they'll never
        // reveal (because they bail out when another instance owns the
        // section).
        var preHiddenEls: HTMLElement[] = []
        var preHideStyleTag: HTMLStyleElement | null = null
        if ((trigger === "inView" || trigger === "onLoad") && enterEnabled &&
            RenderTarget.current() !== RenderTarget.canvas) {

            for (var phi = 0; phi < targets.length; phi++) {
                var phEl = targets[phi]
                if (!phEl) continue
                phEl.style.setProperty("visibility", "hidden")
                preHiddenEls.push(phEl)
            }
        }

        // MutationObserver for dynamic CMS content
        // Observe a few levels up to catch CMS collection changes
        var observeTarget: HTMLElement = parent
        var obsWalk: HTMLElement | null = parent
        for (var obsUp = 0; obsUp < 4 && obsWalk; obsUp++) {
            if (obsWalk.parentElement) obsWalk = obsWalk.parentElement
        }
        if (obsWalk) observeTarget = obsWalk

        var mutObs: MutationObserver | null = null
        var mutSuppressed = false // suppress during our own DOM mutations (e.g. word split)
        try {
            if (typeof MutationObserver !== "undefined") {
                mutObs = new MutationObserver(function (mutations) {
                    if (mutSuppressed || choreoMutGlobalSuppress) return
                    // Ignore mutations caused by Page Choreographer's own
                    // structural DOM changes (pin containers, spacers,
                    // wrappers, word splits). These would otherwise trigger
                    // infinite re-render loops between multiple PC instances.
                    var dominated = true
                    for (var mi = 0; mi < mutations.length; mi++) {
                        var m = mutations[mi]
                        for (var ai = 0; ai < m.addedNodes.length; ai++) {
                            var an = m.addedNodes[ai] as HTMLElement
                            if (an.nodeType === 3) continue // text nodes
                            if (an.nodeType === 1 && an.getAttribute) {
                                // Skip our own structural elements
                                if (an.getAttribute("data-choreo-word")) continue
                                if (an.getAttribute("data-choreo-pin-container")) continue
                                if (an.getAttribute("data-choreo-spacer")) continue
                                if (an.getAttribute("data-choreo-marker")) continue
                            }
                            dominated = false
                            break
                        }
                        if (!dominated) break
                        for (var ri = 0; ri < m.removedNodes.length; ri++) {
                            var rn = m.removedNodes[ri] as HTMLElement
                            if (rn.nodeType === 3) continue // text nodes
                            if (rn.nodeType === 1 && rn.getAttribute) {
                                if (rn.getAttribute("data-choreo-pin-container")) continue
                                if (rn.getAttribute("data-choreo-spacer")) continue
                                if (rn.getAttribute("data-choreo-marker")) continue
                            }
                            dominated = false
                            break
                        }
                        if (!dominated) break
                    }
                    if (dominated && mutations.length > 0) return

                    var s = getStore()
                    if (!s || !marker) return
                    var p = findRealParent(marker)
                    if (!p) return
                    unregisterAll(s)
                    mutSuppressed = true
                    var t = collectTargets(p, marker, scanMode, excludeSelector, splitText)
                    mutSuppressed = false
                    registerElements(t, s)
                })
                mutObs.observe(observeTarget, { childList: true, subtree: true })
            }
        } catch (e) {}

        // IntersectionObserver for "inView" trigger
        var intObs: IntersectionObserver | null = null
        var parentDoneHandler: ((e: Event) => void) | null = null
        var parentResetHandler: ((e: Event) => void) | null = null
        if (trigger === "inView" && waitForParent && parent) {
            // Wait for an ancestor PC to finish its animation before playing.
            // Listen on document (events bubble up from the parent PC's targets).
            var hasPlayed = false
            parentDoneHandler = function (e: Event) {
                var src = e.target as HTMLElement | null
                if (!src || !parent) return
                if (!src.contains(parent) && !parent.contains(src)) return
                var s = getStore()
                if (s && !hasPlayed) {
                    hasPlayed = true
                    s.playEnterGroup(baseId)
                }
            }
            parentResetHandler = function (e: Event) {
                var src = e.target as HTMLElement | null
                if (!src || !parent) return
                if (!src.contains(parent) && !parent.contains(src)) return
                if (hasPlayed && viewRepeat) {
                    hasPlayed = false
                    var s2 = getStore()
                    if (s2) {
                        s2.cancelPendingGroup(baseId)
                        s2.resetGroup(baseId)
                    }
                    // Immediately re-hide targets for replay
                    for (var rh = 0; rh < preHiddenEls.length; rh++) {
                        preHiddenEls[rh].style.setProperty("visibility", "hidden")
                    }
                }
            }
            document.addEventListener("choreo-done", parentDoneHandler)
            document.addEventListener("choreo-reset", parentResetHandler)
        } else if (trigger === "inView" && typeof IntersectionObserver !== "undefined") {
            var isVisible = false
            try {
                intObs = new IntersectionObserver(
                    function (entries) {
                        for (var e = 0; e < entries.length; e++) {
                            if (entries[e].isIntersecting && !isVisible) {
                                isVisible = true
                                var s = getStore()
                                if (s) s.playEnterGroup(baseId)
                                // If not repeating, stop observing
                                if (!viewRepeat && intObs) intObs.disconnect()
                            } else if (!entries[e].isIntersecting && isVisible && viewRepeat) {
                                // Element left viewport — clear from WeakSet so it replays
                                isVisible = false
                                var s2 = getStore()
                                if (s2) {
                                    s2.cancelPendingGroup(baseId)
                                    s2.resetGroup(baseId)
                                }
                                // Notify child PCs to reset for replay
                                if (parent) {
                                    parent.dispatchEvent(new CustomEvent("choreo-reset", {
                                        bubbles: true,
                                        detail: { groupId: baseId },
                                    }))
                                }
                                // Also dispatch on group parents for sibling-subtree children
                                if (s2) {
                                    var resetGps = s2.getGroupParents(baseId)
                                    if (resetGps) {
                                        for (var rgp = 0; rgp < resetGps.length; rgp++) {
                                            resetGps[rgp].dispatchEvent(new CustomEvent("choreo-reset", {
                                                bubbles: true,
                                                detail: { groupId: baseId },
                                            }))
                                        }
                                    }
                                }
                            }
                        }
                    },
                    { rootMargin: "0px 0px " + viewOffset + "px 0px" }
                )
                intObs.observe(parent)
            } catch (e) {}
        }

        // ─── Scroll-scrub trigger ────────────────────────────────────────────
        // All DOM manipulation (wrapper creation) is deferred to the first
        // scroll event. On Framer canvas, scroll never fires, so the DOM is
        // never modified and elements render naturally.
        var scrollAnims: Animation[] = []
        var scrollAnimFinalStyles: Array<{ el: HTMLElement; to: Record<string, string> }> = []
        var scrubStyleTag: HTMLStyleElement | null = null
        var scrollHandler: (() => void) | null = null
        var scrollSafetyTimer = 0
        var scrollResizeHandler: (() => void) | null = null
        var scrollWrapper: HTMLElement | null = null
        var parentOrigOverflow = ""
        var scrollSectionEl: HTMLElement | null = null
        var scrollSpacer: HTMLElement | null = null
        var scrollOverflowAncestors: Array<{ el: HTMLElement; orig: string }> = []
        var scrollPinEl: HTMLElement | null = null
        var scrollSetupRaf = 0
        var scrollResizeTimer = 0
        var pinParentEl: HTMLElement | null = null
        var pinParentOrigMinHeight = ""
        var pinParentOrigHeight = ""
        var scrollPinState = { pinned: false, afterPin: false, completed: false, origStyles: "" }
        var isFollower = false

        var isPreview = RenderTarget.current() !== RenderTarget.canvas

        if (trigger === "onScroll" && parent && isPreview && targets.length > 0) {

            // Defer setup to next frame so CMS/async content has laid out
            scrollSetupRaf = requestAnimationFrame(function () {
            scrollSetupRaf = requestAnimationFrame(function () {
            scrollSetupRaf = 0

            var timelineDuration = 0

            // ── Measure after layout has settled ──
            var parentHeight = parent.offsetHeight
            var parentWidth = parent.offsetWidth
            var parentGP = parent.parentElement

            // ── DIAGNOSTIC LOGGING (remove after debugging) ──

            // ── Early section ownership check ──
            // In CMS layouts, multiple instances share the same section.
            // Only the FIRST instance (pin owner) should create scroll
            // infrastructure (wrapper, spacer, animations).  Follower
            // instances bail out entirely — their items are already
            // targeted by the owner via inclusive collection (no
            // isMarkerBranch filtering).  This prevents followers from
            // creating wrappers with overflow:hidden that clip content.
            // Start section detection from `parent` (the PC's container),
            // not `parentGP`.  Starting one level too high causes
            // findSection to return a page-level container (e.g. "main")
            // which pins the entire page instead of just the target section.
            var earlySection = findSection(parent)
            var earlyPinSection = findPinSection(parent)
            if (scrollPin && earlyPinSection && earlyPinSection.hasAttribute("data-choreo-pin-owner") && !pinPriority) {
                // Another instance already owns this section's pin.
                // Bail out ONLY if it's a CMS case (owner's marker is
                // inside the same parent — they target the same elements).
                // If the markers are in DIFFERENT parents, this is a
                // multi-PC setup (e.g. image + text) — don't bail,
                // fall through to follow-pin logic instead.
                // NOTE: pinPriority PCs skip this check entirely — they
                // MUST continue to take over the pin, never bail out.
                var otherMarkers = parent.querySelectorAll("[data-choreo-marker]")
                var isCmsDuplicate = false
                for (var om = 0; om < otherMarkers.length; om++) {
                    // If we find a marker in our parent that isn't ours,
                    // another PC shares this parent = CMS duplicate.
                    // Ignore markers with data-choreo-wait — those are
                    // child PCs waiting for THIS PC to finish, not duplicates.
                    if (otherMarkers[om] !== marker && !otherMarkers[om].hasAttribute("data-choreo-wait")) {
                        isCmsDuplicate = true
                        break
                    }
                }
                if (isCmsDuplicate) {
                    return
                }
                // Different parents = separate PC → continue to follow-pin
            }


            // ── onScroll pre-hiding ──
            // Now that we know this instance owns the section (not bailing
            // out), pre-hide targets so they don't flash before the scroll
            // animation starts.
            // Persistent style tag that suppresses CSS transitions on
            // elements being scroll-scrubbed.  Uses a data attribute
            // selector instead of inline styles because Framer's live
            // preview re-renders can strip inline transition:none via
            // React reconciliation — the attribute + stylesheet approach
            // survives those re-renders.
            // Singleton style tags: reuse if already in DOM from
            // another PC instance (or a stale soft-refresh orphan).
            // This prevents duplicates and ensures cleanup works.
            var existingScrub = document.querySelector("style[data-choreo-style='scrub']") as HTMLStyleElement
            if (existingScrub) {
                scrubStyleTag = existingScrub
            } else {
                scrubStyleTag = document.createElement("style")
                scrubStyleTag.setAttribute("data-choreo-style", "scrub")
                scrubStyleTag.textContent = "[data-choreo-scrubbing] { transition: none !important; pointer-events: none !important; }"
                document.head.appendChild(scrubStyleTag)
            }

            if (enterEnabled) {
                var existingHide = document.querySelector("style[data-choreo-style='hide']") as HTMLStyleElement
                if (existingHide) {
                    preHideStyleTag = existingHide
                } else {
                    var styleTag = document.createElement("style")
                    styleTag.setAttribute("data-choreo-style", "hide")
                    styleTag.textContent = "[data-choreo-hide] { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }"
                    document.head.appendChild(styleTag)
                    preHideStyleTag = styleTag
                }

                // Compute initial clip-path for maskPreview mode
                var previewClip = ""
                var hasMaskPreset = enterPreset === "maskReveal" || (enterPreset === "scaleIn" && enterMaskDirection && enterMaskDirection !== "none")
                if (maskPreview && hasMaskPreset) {
                    var ms = Math.max(0, Math.min(100, 100 - (maskStart || 0)))
                    var previewMaskDir = resolveMaskDirection(enterMaskDirection)
                    switch (previewMaskDir) {
                        case "left":  default: previewClip = "inset(0 " + ms + "% 0 0)"; break
                        case "right":      previewClip = "inset(0 0 0 " + ms + "%)"; break
                        case "up":         previewClip = "inset(0 0 " + ms + "% 0)"; break
                        case "down":       previewClip = "inset(" + ms + "% 0 0 0)"; break
                        case "topLeft":    previewClip = "inset(0 " + ms + "% " + ms + "% 0)"; break
                        case "topRight":   previewClip = "inset(0 0 " + ms + "% " + ms + "%)"; break
                        case "bottomLeft": previewClip = "inset(" + ms + "% " + ms + "% 0 0)"; break
                        case "bottomRight":previewClip = "inset(" + ms + "% 0 0 " + ms + "%)"; break
                    }
                }

                for (var phi = 0; phi < targets.length; phi++) {
                    var phEl = targets[phi]
                    if (!phEl) continue
                    if (maskPreview && previewClip) {
                        phEl.style.setProperty("clip-path", previewClip)
                    } else {
                        phEl.setAttribute("data-choreo-hide", "1")
                    }
                    preHiddenEls.push(phEl)
                }
            }

            // ── Check if targets span outside the parent ──
            // In CMS grid/masonry layouts, targets are in multiple columns
            // or grid cells — outside this instance's parent.  Creating a
            // wrapper would disrupt the grid layout and cause clipping.
            // In that case, skip wrapper creation and use parent directly.
            var allTargetsInside = true
            for (var oti = 0; oti < targets.length; oti++) {
                if (!parent.contains(targets[oti])) {
                    allTargetsInside = false
                    break
                }
            }

            var wrapper: HTMLElement

            // Suppress all MutationObservers during structural DOM changes
            // (wrapper creation, pin container, spacer) to prevent cross-instance
            // infinite re-render loops.
            choreoMutGlobalSuppress = true

            // Use parent directly as the "wrapper" — never reparent
            // React-managed DOM nodes.  Moving elements via
            // insertBefore/appendChild breaks React's internal DOM
            // tracking, causing "classList of null" crashes in Framer's
            // preview on re-render/reload.
            wrapper = parent
            wrapper.setAttribute("data-choreo-wrapper", baseId)
            // Save and optionally override overflow for viewport clipping
            parentOrigOverflow = parent.style.overflow
            if (maskViewportClip) {
                parent.style.setProperty("overflow", "hidden")
            }
            // scrollWrapper stays null — no unwrapping needed on cleanup

            // sectionEl = the LOCAL section (for wrapper, overflow walk)
            // pinSectionEl = the PAGE-LEVEL section (for pin container,
            //   follow-pin detection).  This is the viewport-height block
            //   that contains all PCs in the same visual section — may be
            //   unnamed in Framer (just a plain DIV).
            var sectionEl = earlySection
            var pinSectionEl = earlyPinSection
            scrollSectionEl = pinSectionEl

            // ── Determine pin mode ──
            // Follow-pin detection uses pinSectionEl (the shared section)
            // so that PCs in different branches of the same section can
            // detect each other's pin containers.
            //
            // Pin Priority: when set, this PC claims ownership even if
            // another non-priority PC already claimed.  This gives the
            // user explicit control over which scroll length drives the
            // pin duration.  Each PC still uses its OWN scroll length
            // for animation progress.
            isFollower = false
            var isOwner = scrollPin
            var ownerScrollLength = scrollLength

            if (pinSectionEl) {
                var pinSearchNode: HTMLElement | null = pinSectionEl
                while (pinSearchNode && pinSearchNode !== document.documentElement) {
                    if (pinSearchNode.hasAttribute("data-choreo-pin-container")) {
                        var pinCtrOwner = pinSearchNode.getAttribute("data-choreo-pin-container")
                        if (pinCtrOwner !== baseId) {
                            // Another PC already owns the pin.
                            // If WE have pinPriority and THEY don't,
                            // we take over.  If BOTH have priority,
                            // the longer scrollLength wins (provides
                            // more scroll room for all animations).
                            var existingHasPriority = pinSearchNode.getAttribute("data-choreo-pin-priority") === "true"
                            var existingSpacer = pinSearchNode.querySelector("[data-choreo-spacer]") as HTMLElement
                            var existingLength = existingSpacer ? (parseInt(existingSpacer.style.height) || 0) : 0
                            var shouldTakeOver = false
                            if (pinPriority && !existingHasPriority) {
                                shouldTakeOver = true
                            } else if (pinPriority && existingHasPriority && scrollLength > existingLength) {
                                shouldTakeOver = true
                            }
                            if (shouldTakeOver) {
                                // We'll take over — don't become follower.
                                // The existing pin container will be reused
                                // (our pin creation code will handle it).
                                break
                            }
                            isFollower = true
                            isOwner = false
                            var pinSectionChild = pinSearchNode.querySelector("[data-choreo-pin-owner]") as HTMLElement
                            if (pinSectionChild) {
                                pinSectionEl = pinSectionChild
                                scrollSectionEl = pinSectionEl
                            }
                            var ownerSpacer = pinSearchNode.querySelector("[data-choreo-spacer]") as HTMLElement
                            if (ownerSpacer) {
                                ownerScrollLength = parseInt(ownerSpacer.style.height) || scrollLength
                            }
                            break
                        }
                    }
                    if (pinSearchNode.hasAttribute("data-choreo-pin-owner")) {
                        var existingOwner = pinSearchNode.getAttribute("data-choreo-pin-owner")
                        if (existingOwner !== baseId) {
                            var ownerHasPri = pinSearchNode.getAttribute("data-choreo-pin-priority") === "true"
                            // Take over if we have priority and they don't,
                            // or both have priority but we have longer scroll
                            var ownerSpEl = pinSearchNode.parentElement
                            var ownerSpLen = 0
                            if (ownerSpEl && ownerSpEl.hasAttribute("data-choreo-pin-container")) {
                                var ownerSpSpacer = ownerSpEl.querySelector("[data-choreo-spacer]") as HTMLElement
                                if (ownerSpSpacer) ownerSpLen = parseInt(ownerSpSpacer.style.height) || 0
                            }
                            if ((pinPriority && !ownerHasPri) || (pinPriority && ownerHasPri && scrollLength > ownerSpLen)) {
                                break // take over
                            }
                            isFollower = true
                            isOwner = false
                            pinSectionEl = pinSearchNode
                            scrollSectionEl = pinSectionEl
                            break
                        }
                    }
                    pinSearchNode = pinSearchNode.parentElement
                }
            }


            // ── Clean up stale spacers and pin attributes ──
            // When a PC re-renders, stale spacers from previous cycles
            // may persist.  Remove them before creating new ones.
            if (isOwner && pinSectionEl && pinSectionEl.parentElement) {
                var staleSpacers = pinSectionEl.parentElement.querySelectorAll("[data-choreo-spacer]")
                for (var ssi = 0; ssi < staleSpacers.length; ssi++) {
                    var ss = staleSpacers[ssi] as HTMLElement
                    if (ss.getAttribute("data-choreo-spacer") !== baseId) {
                        ss.parentElement!.removeChild(ss)
                    }
                }
            }

            if (isOwner && pinSectionEl) {
                pinSectionEl.setAttribute("data-choreo-pin-owner", baseId)
                if (pinPriority) {
                    pinSectionEl.setAttribute("data-choreo-pin-priority", "true")
                }

                // Disable browser scroll anchoring
                pinSectionEl.style.setProperty("overflow-anchor", "none")

                // Total spacer height must accommodate the animation offset
                // so the pin stays active until the animation finishes.
                var ownerAnimOffset = Math.max(0, (scrollStartOffset / 100) * scrollLength)
                var totalSpacerHeight = scrollLength + ownerAnimOffset

                // ── Spacer (no pin container — avoid reparenting) ──
                // Instead of creating a wrapper container and moving the
                // section into it (which breaks React's DOM tracking),
                // insert the spacer as a sibling right after the section.
                // The section gets position:sticky directly.  The spacer
                // creates the scroll distance needed for the pin.
                var existingSpacer = pinSectionEl.parentElement
                    ? pinSectionEl.parentElement.querySelector("[data-choreo-spacer='" + baseId + "']") as HTMLElement
                    : null
                if (existingSpacer) {
                    existingSpacer.style.setProperty("height", totalSpacerHeight + "px")
                    scrollSpacer = existingSpacer
                } else {
                    var spacer = document.createElement("div")
                    spacer.style.setProperty("height", totalSpacerHeight + "px")
                    spacer.style.setProperty("width", "100%")
                    spacer.style.setProperty("pointer-events", "none")
                    spacer.style.setProperty("flex-shrink", "0")
                    spacer.setAttribute("data-choreo-spacer", baseId)
                    // Insert spacer right after the section
                    if (pinSectionEl.nextSibling) {
                        pinSectionEl.parentElement!.insertBefore(spacer, pinSectionEl.nextSibling)
                    } else {
                        pinSectionEl.parentElement!.appendChild(spacer)
                    }
                    scrollSpacer = spacer
                }

                // ── Expand parent height so the spacer creates scroll room ──
                // The spacer is a flex child of pinSectionEl's parent.
                // Framer Stacks set explicit height via inline styles, so
                // the spacer may not contribute to the parent's size.
                // Override height to (section + spacer) to guarantee the
                // page is tall enough for the scroll-scrub range.
                if (pinSectionEl.parentElement) {
                    pinParentEl = pinSectionEl.parentElement
                    pinParentOrigMinHeight = pinParentEl.style.minHeight || ""
                    pinParentOrigHeight = pinParentEl.style.height || ""
                    var sectionNaturalH = pinSectionEl.offsetHeight
                    var neededHeight = sectionNaturalH + totalSpacerHeight
                    pinParentEl.style.setProperty("min-height", neededHeight + "px", "important")
                    pinParentEl.style.setProperty("height", neededHeight + "px", "important")
                }

                // ── Transform-based pinning ──
                // position:sticky is fragile in Framer's flex Stacks
                // (overflow:hidden on ancestors, explicit heights, etc.).
                // Instead, the scroll handler applies translateY to
                // counteract natural scroll, keeping the section visually
                // pinned.  No position change needed — just transform.
                // Ensure the section has position:relative so transform
                // works reliably and it paints above the spacer.
                pinSectionEl.style.setProperty("position", "relative", "important")
                pinSectionEl.style.setProperty("z-index", "1", "important")

                // ── Background fix for pinned sections ──
                // The section's background is often on a parent frame.
                // Only the STICKY element stays at the viewport top —
                // everything else scrolls.  So the bg MUST go on
                // pinSectionEl.  Use the `background` shorthand with
                // !important to override Framer's own inline styles
                // (which may set `background: transparent`).
                var pinSectionBg = window.getComputedStyle(pinSectionEl).backgroundColor
                var pinSectionHasBg = pinSectionBg && pinSectionBg !== "rgba(0, 0, 0, 0)" && pinSectionBg !== "transparent"
                if (!pinSectionHasBg) {
                    var bgWalk: HTMLElement | null = pinSectionEl.parentElement
                    while (bgWalk && bgWalk !== document.documentElement) {
                        var ancestorBg = window.getComputedStyle(bgWalk).backgroundColor
                        if (ancestorBg && ancestorBg !== "rgba(0, 0, 0, 0)" && ancestorBg !== "transparent") {
                            pinSectionEl.style.setProperty("background", ancestorBg, "important")
                            break
                        }
                        bgWalk = bgWalk.parentElement
                    }
                }

                console.log("[Choreo] PIN SETUP:", {
                    pinSectionEl: pinSectionEl.tagName + "#" + pinSectionEl.id + "." + (pinSectionEl.getAttribute("data-framer-name") || "") + " cls:" + pinSectionEl.className.slice(0, 40),
                    pinSectionH: pinSectionEl.offsetHeight,
                    pinParent: pinParentEl ? pinParentEl.tagName + "#" + pinParentEl.id + "." + (pinParentEl.getAttribute("data-framer-name") || "") : "null",
                    pinParentH: pinParentEl ? pinParentEl.offsetHeight : "n/a",
                    spacerH: totalSpacerHeight,
                    parentIsWrapper: pinParentEl === wrapper,
                })
            }

            // Structural DOM changes complete — re-enable MutationObservers
            choreoMutGlobalSuppress = false

            // ── Bidirectional overflow walk ──
            // Fix any ancestor/intermediate containers that clip animating
            // elements. This runs for ALL onScroll setups (pinned AND
            // non-pinned) because Framer containers often have
            // overflow:hidden/clip or contain:paint that clips transforms.
            var overflowRoot: HTMLElement | null = sectionEl || parent
            // Walk UP from the section/parent to the document root
            var overflowNode: HTMLElement | null = overflowRoot
            while (overflowNode && overflowNode !== document.documentElement) {
                // Skip our own wrapper and pin containers — their
                // overflow settings are intentional
                if (overflowNode.hasAttribute("data-choreo-wrapper") ||
                    overflowNode.hasAttribute("data-choreo-pin-container")) {
                    overflowNode = overflowNode.parentElement
                    continue
                }
                var ovCS = window.getComputedStyle(overflowNode)
                var ov = ovCS.overflow
                var ovX = ovCS.overflowX
                var ovY = ovCS.overflowY
                var ovContain = ovCS.contain || ""
                var needsFix = ov === "clip" || ov === "hidden" ||
                    ovX === "clip" || ovX === "hidden" ||
                    ovY === "clip" || ovY === "hidden" ||
                    /paint|strict|content/.test(ovContain)
                if (needsFix) {
                    scrollOverflowAncestors.push({
                        el: overflowNode,
                        orig: ov,
                    })
                    overflowNode.style.setProperty("overflow", "visible", "important")
                    if (/paint|strict|content/.test(ovContain)) {
                        overflowNode.style.setProperty("contain", "none", "important")
                    }
                }
                overflowNode = overflowNode.parentElement
            }
            // Walk from each target UP to the section/parent, fixing any
            // intermediate containers (grid wrappers, column divs, etc.)
            for (var tfi = 0; tfi < targets.length; tfi++) {
                var tFixNode: HTMLElement | null = targets[tfi].parentElement
                while (tFixNode && tFixNode !== overflowRoot && tFixNode !== document.documentElement) {
                    // Skip our own wrapper and pin containers
                    if (tFixNode.hasAttribute("data-choreo-wrapper") ||
                        tFixNode.hasAttribute("data-choreo-pin-container")) {
                        tFixNode = tFixNode.parentElement
                        continue
                    }
                    var tfCS = window.getComputedStyle(tFixNode)
                    var tfOv = tfCS.overflow
                    var tfOvX = tfCS.overflowX
                    var tfOvY = tfCS.overflowY
                    var tfContain = tfCS.contain || ""
                    var tfNeedsFix = tfOv === "clip" || tfOv === "hidden" ||
                        tfOvX === "clip" || tfOvX === "hidden" ||
                        tfOvY === "clip" || tfOvY === "hidden" ||
                        /paint|strict|content/.test(tfContain)
                    if (tfNeedsFix) {
                        var alreadyTracked = false
                        for (var at = 0; at < scrollOverflowAncestors.length; at++) {
                            if (scrollOverflowAncestors[at].el === tFixNode) {
                                alreadyTracked = true
                                break
                            }
                        }
                        if (!alreadyTracked) {
                            scrollOverflowAncestors.push({ el: tFixNode, orig: tfOv })
                            tFixNode.style.setProperty("overflow", "visible", "important")
                            if (/paint|strict|content/.test(tfContain)) {
                                tFixNode.style.setProperty("contain", "none", "important")
                            }
                        }
                    }
                    tFixNode = tFixNode.parentElement
                }
            }

            var pinEl: HTMLElement = parent
            var pinElWidth: number = parentWidth
            var pinElHeight: number = parentHeight
            scrollPinState.origStyles = parent.style.cssText
            scrollPinEl = pinEl

            // Measure pin/scroll range
            // Two separate ranges:
            //   pinStart/pinEnd — when the section is sticky (owner's range)
            //   animStart/animLength — when THIS PC's animation plays
            //
            // The pin range is determined by the owner's spacer height.
            // Each PC's animation range uses its OWN scrollLength and
            // scrollStartOffset, allowing staggered reveals within a
            // shared pin duration.
            var pinScrollLength = isFollower ? ownerScrollLength : scrollLength
            // Total pin duration includes the owner's animation offset
            // so the pin stays active until the animation finishes.
            var pinAnimOffset = isFollower ? 0 : Math.max(0, (scrollStartOffset / 100) * scrollLength)
            var measureEl = ((scrollPin || isFollower) && pinSectionEl) ? pinSectionEl : wrapper
            var measureRect = measureEl.getBoundingClientRect()
            var measureDocTop = measureRect.top + window.scrollY
            var vh = window.innerHeight
            var startOffset = 0
            if (!isFollower) {
                if (scrollStart === "top") {
                    startOffset = -vh
                } else if (scrollStart === "center") {
                    startOffset = -(vh / 2) + (measureRect.height / 2)
                }
            }

            var pinStart = Math.max(0, measureDocTop + startOffset)
            var totalPinLength = pinScrollLength + pinAnimOffset
            var pinEnd = pinStart + totalPinLength

            // Each PC's animation offset within the pin range.
            // scrollStartOffset is a percentage of the pin's scroll length,
            // allowing each PC to start its animation at a different point.
            // Positive = delay (start later), negative = start earlier.
            var animOffset = (scrollStartOffset / 100) * pinScrollLength
            var animStart = pinStart + animOffset
            // Clamp animation length so it can complete within the pin range.
            // Without this, followers (or PCs with large offsets) whose
            // animStart + scrollLength > pinEnd would never reach progress=1
            // inside the pinned zone — breaking choreo-done dispatch.
            var availableRange = Math.max(1, pinEnd - animStart)
            var animLength = Math.min(scrollLength, availableRange)
            var wrapRectLeft = pinEl.getBoundingClientRect().left


            // ── Animation creation/destruction ──
            var reduced =
                window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
            var mobile = window.innerWidth < 768

            scrollAnimFinalStyles = []

            var createScrollAnims = function () {
                for (var ca = 0; ca < scrollAnims.length; ca++) {
                    try { scrollAnims[ca].cancel() } catch (e) {}
                }
                scrollAnims = []
                scrollAnimFinalStyles = []
                timelineDuration = 0

                var allTargets = store.getAllTargets().filter(function (t: any) {
                    return t.groupId === baseId && t.enterEnabled &&
                        (t.mobileEnabled || !mobile) && t.ref.current
                })

                var direction = allTargets.length > 0 ? allTargets[0].staggerDirection : "leftToRight"
                var sorted = store.sortTargets(allTargets, direction)

                for (var si = 0; si < sorted.length; si++) {
                    var target = sorted[si]
                    var el = target.ref.current
                    if (!el) continue

                    // Cancel ALL existing WAAPI animations on this element
                    // before creating new ones.  Stale animations from
                    // previous bake/unbake cycles or Framer's own system
                    // can compete with our scroll-scrubbed animation,
                    // causing reversed mask direction on re-entry.
                    try {
                        var existing = el.getAnimations()
                        for (var ex = 0; ex < existing.length; ex++) {
                            existing[ex].cancel()
                        }
                    } catch (e) {}

                    var kf = reduced
                        ? { from: { opacity: "0" }, to: { opacity: "1" } }
                        : buildEnterKeyframes(target)

                    scrollAnimFinalStyles.push({ el: el, to: kf.to })

                    var staggerVal = reduced ? 0 : target.stagger
                    var itemDelay = staggerVal * si
                    var dur = reduced ? 10 : target.duration * 1000

                    try {
                        var scrollAnim = el.animate([kf.from, kf.to], {
                            duration: dur,
                            delay: itemDelay * 1000,
                            easing: easingToCss(target.easing),
                            fill: "both",
                        })
                        scrollAnim.pause()
                        scrollAnims.push(scrollAnim)
                    } catch (e) {}
                }

                if (sorted.length > 0) {
                    var lastStagger = (sorted.length - 1) * (reduced ? 0 : sorted[0].stagger)
                    var lastDur = reduced ? 10 : sorted[0].duration * 1000
                    timelineDuration = lastStagger * 1000 + lastDur
                }
            }

            // Animations are kept alive (never cancelled except on
            // cleanup/resize) to avoid bake/unbake CSS transition bugs.

            // Block pointer-events on all animated elements to prevent
            // Framer hover effects from conflicting with active animations.
            // Unblocked per-element when its animation is released (98%).
            var blockAnimatedPointerEvents = function () {
                for (var bp = 0; bp < scrollAnimFinalStyles.length; bp++) {
                    // Use data attribute for transition/pointer-events
                    // suppression — survives React re-renders (unlike
                    // inline styles which Framer's live preview strips).
                    scrollAnimFinalStyles[bp].el.setAttribute("data-choreo-scrubbing", "1")
                }
            }

            // Re-engage scroll animation after after-pin.
            // Animations are kept alive (never cancelled in after-pin),
            // so just re-block interactions and scrub to the right
            // progress.  No bake/unbake cycle needed.
            var reengageAnims = function (progress?: number) {
                ensureScrollAnims()
                blockAnimatedPointerEvents()
                if (progress !== undefined) {
                    updateAnimProgress(progress)
                }
            }

            var updateAnimProgress = function (progress: number) {
                for (var a = 0; a < scrollAnims.length; a++) {
                    try {
                        var anim = scrollAnims[a]
                        var timing = anim.effect && anim.effect.getComputedTiming
                            ? anim.effect.getComputedTiming()
                            : null
                        var animDelay = timing ? (timing.delay || 0) : 0
                        var animDur = timing ? (timing.duration || 600) : 600
                        var time = progress * timelineDuration
                        anim.currentTime = Math.max(0, Math.min(time, animDelay + (animDur as number)))
                    } catch (e) {}
                }
            }

            var scrollAnimsCreated = false
            var visibilityRevealed = false

            var ensureScrollAnims = function () {
                if (scrollAnimsCreated && scrollAnims.length > 0) return
                scrollAnimsCreated = true
                createScrollAnims()
                // Don't remove visibility:hidden here — keep elements
                // hidden until scroll progress > 0 to prevent flash
            }

            // interactivity is now per-element (see updateInteractivity)

            var revealIfNeeded = function (progress: number) {
                // For maskPreview, elements are already visible — skip the
                // progress gate since there's nothing to "reveal"
                if (visibilityRevealed) return
                // With WAAPI animations kept alive, the first keyframe
                // handles visual hiding at progress=0 (clip-path, opacity).
                // Safe to remove data-choreo-hide as soon as we're in the
                // pinned zone.  The old scrollY<=0 guard blocked hero
                // sections (pinStart=0) from ever revealing on reload.
                if (!maskPreview && progress < 0) return
                visibilityRevealed = true
                for (var ph = 0; ph < preHiddenEls.length; ph++) {
                    preHiddenEls[ph].removeAttribute("data-choreo-hide")
                    preHiddenEls[ph].style.removeProperty("visibility")
                    preHiddenEls[ph].style.removeProperty("opacity")
                    preHiddenEls[ph].style.removeProperty("pointer-events")
                    // Remove inline clip-path so the animation takes over
                    preHiddenEls[ph].style.removeProperty("clip-path")
                }
                // Remove the style tag — no longer needed
                if (preHideStyleTag && preHideStyleTag.parentNode) {
                    preHideStyleTag.parentNode.removeChild(preHideStyleTag)
                    preHideStyleTag = null
                }
            }

            // Per-element animation release: when an individual element's
            // animation reaches 100%, cancel it WITHOUT setting any inline
            // styles. The element reverts to its natural CSS state (which IS
            // the animation's final frame: full opacity, no transform, no clip).
            // With no active animation AND no conflicting inline styles,
            // Framer's hover system (whileHover / inline style manipulation)
            // can freely control the element.
            // Pointer-events are blocked on animated elements during scroll.
            // They're unblocked when animations are done (after-pin zone).
            // No mid-scroll animation canceling — that causes visual jumps.
            var updateInteractivity = function (progress: number) {
                // no-op during scroll — pointer-events managed by
                // blockAnimatedPointerEvents and releaseAnimatedElements
            }

            // Release animated elements — cancel animations and restore
            // pointer-events.  When bake=true, persist each animation's
            // final-frame values as inline styles BEFORE canceling so the
            // visual state is preserved during the sticky→relative
            // transition (prevents the "jump to top" flash).
            // When bake=false, cancel without inline styles so Framer's
            // hover system can freely control the element.
            // Release: unblock pointer-events/transitions but keep
            // WAAPI animations alive at their current progress.
            // Keeping animations alive avoids the entire bake/unbake
            // cycle — no inline styles to manage, no CSS transitions
            // to suppress, immune to React re-renders in Framer's
            // live preview.  Animations are only truly cancelled
            // on cleanup or resize (via cancelScrollAnims).
            var releaseAnimatedElements = function () {
                for (var ra = 0; ra < scrollAnimFinalStyles.length; ra++) {
                    scrollAnimFinalStyles[ra].el.removeAttribute("data-choreo-scrubbing")
                }
            }

            // Hard-cancel all WAAPI scroll animations (cleanup/resize)
            var cancelScrollAnims = function () {
                for (var rc = 0; rc < scrollAnims.length; rc++) {
                    try { scrollAnims[rc].cancel() } catch (e) {}
                }
                scrollAnims = []
                scrollAnimsCreated = false
            }

            // Create animations eagerly so they're ready for scroll
            ensureScrollAnims()
            blockAnimatedPointerEvents()
            updateAnimProgress(0)

            // ── Viewport clip helper ──
            // Clips the wrapper to viewport bounds so the mask reveal
            // aligns with the viewport edge as the element scrolls in.
            var vpClipPad = maskViewportPadding || 0
            var animDone = false // true once animation reaches 100%
            var choreoDoneDispatched = false // dispatch choreo-done only once per cycle

            var updateViewportClip = function () {
                if (!maskViewportClip || !wrapper) return

                // Once animation completes, transition clip-path to none
                // smoothly instead of a hard snap.
                if (animDone) {
                    // Add a CSS transition for the removal so the padding
                    // clip eases out rather than jumping
                    wrapper.style.setProperty("transition", "clip-path 0.35s ease-out")
                    wrapper.style.removeProperty("clip-path")
                    return
                }

                // Clear transition during scroll scrub so it's instant
                wrapper.style.removeProperty("transition")

                var wRect = wrapper.getBoundingClientRect()
                var vpH = window.innerHeight
                var vpW = window.innerWidth
                // Overflow-based clips (content extending past viewport)
                var overflowTop = Math.max(0, -wRect.top)
                var overflowRight = Math.max(0, wRect.right - vpW)
                var overflowBottom = Math.max(0, wRect.bottom - vpH)
                var overflowLeft = Math.max(0, -wRect.left)
                // Padding-based clip — bottom only, so the mask reveal
                // doesn't get cut off abruptly at the viewport bottom edge
                var padTop = 0, padRight = 0, padLeft = 0
                var padBottom = (wRect.bottom >= vpH - vpClipPad) ? Math.max(0, vpClipPad - (vpH - wRect.bottom)) : 0
                // Use whichever is larger: overflow clip or padding clip
                var clipTop = Math.round(Math.max(overflowTop, padTop))
                var clipRight = Math.round(Math.max(overflowRight, padRight))
                var clipBottom = Math.round(Math.max(overflowBottom, padBottom))
                var clipLeft = Math.round(Math.max(overflowLeft, padLeft))
                if (clipTop === 0 && clipRight === 0 && clipBottom === 0 && clipLeft === 0) {
                    wrapper.style.removeProperty("clip-path")
                } else {
                    wrapper.style.setProperty("clip-path",
                        "inset(" + clipTop + "px " + clipRight + "px " + clipBottom + "px " + clipLeft + "px)", "important")
                }
            }

            // ── Scroll handler ──
            // Sticky handles the visual pinning (zero jitter). The scroll
            // handler only scrubs animation progress and manages the
            // sticky → relative transition at pinEnd.
            var handleScroll = function () {
                if (!parent || !wrapper) return

                var scrollY = window.scrollY

                // scrollOnce: once the animation is done, freeze
                // everything — don't recreate, unbake, or reverse.
                if (scrollPinState.completed) {
                    return
                }

                if (scrollY >= pinStart && scrollY <= pinEnd) {
                    // ── PINNED ZONE ──
                    // Compute progress early so unbake can scrub to the
                    // correct frame before removing baked inline styles.
                    var progress = (scrollY - animStart) / animLength
                    var clampedProgress = Math.max(0, Math.min(1, progress))

                    // Sticky keeps the section in place — just scrub animations
                    if (scrollPinState.afterPin) {
                        scrollPinState.afterPin = false
                        // Also clear the wrapper's clip-path transition
                        // that was set in the after-pin zone
                        if (wrapper) wrapper.style.removeProperty("transition")
                        reengageAnims(clampedProgress)
                    } else {
                        ensureScrollAnims()
                    }

                    scrollPinState.pinned = true

                    // ── Transform-based pin ──
                    // Counteract scroll by translating the section down
                    // by the same amount it has scrolled up.
                    if (pinSectionEl) {
                        var pinTranslateY = scrollY - pinStart
                        pinSectionEl.style.setProperty("transform", "translateY(" + pinTranslateY + "px)", "important")
                    }

                    // DEBUG: log zone transitions, progress, and pin verification
                    if (!scrollPinState._dbgPrevZone || scrollPinState._dbgPrevZone !== "pinned") {
                        var pinRect = pinSectionEl ? pinSectionEl.getBoundingClientRect() : null
                        console.log("[ZONE] → pinned | baseId:", baseId, "scrollY:", Math.round(scrollY), "pinStart:", Math.round(pinStart), "pinEnd:", Math.round(pinEnd), "progress:", clampedProgress.toFixed(3), "pinSectionTag:", pinSectionEl ? pinSectionEl.tagName + "." + (pinSectionEl.getAttribute("data-framer-name") || pinSectionEl.className.slice(0, 30)) : "null", "rectTop:", pinRect ? Math.round(pinRect.top) : "n/a", "translateY:", pinTranslateY)
                    }
                    scrollPinState._dbgPrevZone = "pinned"

                    revealIfNeeded(clampedProgress)
                    // No re-hide in the pinned zone — the WAAPI animation's
                    // first keyframe handles visual hiding at progress=0
                    // (opacity=0, clip-path, etc.).  The before-pin zone
                    // below handles re-hiding when scrolling completely
                    // before the section.
                    updateAnimProgress(clampedProgress)
                    // DEBUG: log first target's clip-path on early scrub frames
                    if (clampedProgress < 0.15 && preHiddenEls.length > 0) {
                        var dbgEl = preHiddenEls[0]
                        var dbgClip = window.getComputedStyle(dbgEl).clipPath
                        var dbgVis = window.getComputedStyle(dbgEl).visibility
                        var dbgOp = window.getComputedStyle(dbgEl).opacity
                        console.log("[SCRUB] baseId:", baseId, "progress:", clampedProgress.toFixed(3), "clip:", dbgClip, "vis:", dbgVis, "op:", dbgOp, "hasHideAttr:", dbgEl.hasAttribute("data-choreo-hide"))
                    }
                    updateInteractivity(clampedProgress)
                    animDone = clampedProgress >= 1
                    // Notify child PCs when scroll animation completes
                    if (animDone && !choreoDoneDispatched && parent) {
                        choreoDoneDispatched = true
                        parent.dispatchEvent(new CustomEvent("choreo-done", {
                            bubbles: true,
                            detail: { groupId: baseId },
                        }))
                        // Also dispatch on group parents for sibling-subtree children
                        var scrollDoneStore = getStore()
                        if (scrollDoneStore) {
                            var scrollDoneGps = scrollDoneStore.getGroupParents(baseId)
                            if (scrollDoneGps) {
                                for (var sdgp = 0; sdgp < scrollDoneGps.length; sdgp++) {
                                    scrollDoneGps[sdgp].dispatchEvent(new CustomEvent("choreo-done", {
                                        bubbles: true,
                                        detail: { groupId: baseId },
                                    }))
                                }
                            }
                        }
                    }
                    updateViewportClip()

                    if (scrollOnce && clampedProgress >= 1) {
                        scrollPinState.completed = true
                        releaseAnimatedElements()
                    }

                } else if (scrollY < pinStart) {
                    // ── BEFORE PIN ──
                    if (scrollPinState.afterPin) {
                        scrollPinState.afterPin = false
                        if (wrapper) wrapper.style.removeProperty("transition")
                        reengageAnims(0)
                    }
                    scrollPinState.pinned = false
                    animDone = false
                    // Clear transform so the section sits at its natural position
                    if (pinSectionEl) {
                        pinSectionEl.style.removeProperty("transform")
                    }
                    if (!scrollPinState._dbgPrevZone || scrollPinState._dbgPrevZone !== "before") {
                        console.log("[ZONE] → before-pin | baseId:", baseId, "scrollY:", Math.round(scrollY), "pinStart:", Math.round(pinStart), "wasAfterPin:", scrollPinState.afterPin, "animsCreated:", scrollAnimsCreated, "animCount:", scrollAnims.length)
                    }
                    scrollPinState._dbgPrevZone = "before"
                    // Reset choreo-done flag and notify child PCs to reset
                    if (choreoDoneDispatched && parent) {
                        choreoDoneDispatched = false
                        parent.dispatchEvent(new CustomEvent("choreo-reset", {
                            bubbles: true,
                            detail: { groupId: baseId },
                        }))
                        // Also dispatch on group parents for sibling-subtree children
                        var scrollResetStore = getStore()
                        if (scrollResetStore) {
                            var scrollResetGps = scrollResetStore.getGroupParents(baseId)
                            if (scrollResetGps) {
                                for (var srgp = 0; srgp < scrollResetGps.length; srgp++) {
                                    scrollResetGps[srgp].dispatchEvent(new CustomEvent("choreo-reset", {
                                        bubbles: true,
                                        detail: { groupId: baseId },
                                    }))
                                }
                            }
                        }
                    }
                    updateAnimProgress(0)
                    updateInteractivity(0)
                    updateViewportClip()
                    // Re-hide elements so they match the initial-load
                    // state.  Without this, elements at progress=0
                    // are at their animation start keyframe (partially
                    // visible), and with overflow:visible they can
                    // leak out of the section on reverse scroll.
                    if (visibilityRevealed && preHiddenEls.length > 0) {
                        visibilityRevealed = false
                        // Re-add the hide style tag if it was removed
                        if (!preHideStyleTag) {
                            var existRehide = document.querySelector("style[data-choreo-style='hide']") as HTMLStyleElement
                            if (existRehide) {
                                preHideStyleTag = existRehide
                            } else {
                                var rehideTag = document.createElement("style")
                                rehideTag.setAttribute("data-choreo-style", "hide")
                                rehideTag.textContent = "[data-choreo-hide] { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }"
                                document.head.appendChild(rehideTag)
                                preHideStyleTag = rehideTag
                            }
                        }
                        for (var rh = 0; rh < preHiddenEls.length; rh++) {
                            preHiddenEls[rh].setAttribute("data-choreo-hide", "1")
                        }
                    }

                } else {
                    // ── AFTER PIN ──
                    // Hold the final transform so the section resumes its
                    // natural scroll position after the pin range.
                    if (pinSectionEl) {
                        pinSectionEl.style.setProperty("transform", "translateY(" + totalPinLength + "px)", "important")
                    }
                    if (!scrollPinState._dbgPrevZone || scrollPinState._dbgPrevZone !== "after") {
                        console.log("[ZONE] → after-pin | baseId:", baseId, "scrollY:", Math.round(scrollY), "pinEnd:", Math.round(pinEnd), "wasAfterPin:", scrollPinState.afterPin)
                    }
                    scrollPinState._dbgPrevZone = "after"
                    if (!scrollPinState.afterPin) {
                        scrollPinState.afterPin = true
                        scrollPinState.pinned = false
                        animDone = true
                        updateAnimProgress(1)
                        releaseAnimatedElements()
                        // Notify child PCs when scroll animation completes via after-pin
                        if (!choreoDoneDispatched && parent) {
                            choreoDoneDispatched = true
                            parent.dispatchEvent(new CustomEvent("choreo-done", {
                                bubbles: true,
                                detail: { groupId: baseId },
                            }))
                            var afterPinStore = getStore()
                            if (afterPinStore) {
                                var afterPinGps = afterPinStore.getGroupParents(baseId)
                                if (afterPinGps) {
                                    for (var apgp = 0; apgp < afterPinGps.length; apgp++) {
                                        afterPinGps[apgp].dispatchEvent(new CustomEvent("choreo-done", {
                                            bubbles: true,
                                            detail: { groupId: baseId },
                                        }))
                                    }
                                }
                            }
                        }
                        if (scrollOnce) {
                            scrollPinState.completed = true
                        }
                    }
                    updateViewportClip()
                }
            }

            scrollHandler = handleScroll
            window.addEventListener("scroll", handleScroll, { passive: true })

            // ── Deferred follow-pin re-check ──
            // Run for any non-follower: another PC may create a pin
            // container in a later rAF. Walk UP the tree from the
            // wrapper to find any ancestor pin container.  This handles:
            //   - scrollPin=false instances that should follow
            //   - scrollPin=true instances that ran before the real owner
            if (!isFollower && pinSectionEl) {
                requestAnimationFrame(function () {
                    if (!wrapper) return
                    var lateNode: HTMLElement | null = wrapper
                    while (lateNode && lateNode !== document.documentElement) {
                        if (lateNode.hasAttribute("data-choreo-pin-container")) {
                            var lateOwner = lateNode.getAttribute("data-choreo-pin-container")
                            if (lateOwner !== baseId) {
                                isFollower = true
                                isOwner = false
                                // If we created our own pin infrastructure,
                                // clean it up — we're now a follower
                                if (scrollSpacer && scrollSpacer.parentElement) {
                                    scrollSpacer.parentElement.removeChild(scrollSpacer)
                                    scrollSpacer = null
                                }
                                // Adopt the owner's section for measurement
                                var lateOwnerSection = lateNode.querySelector("[data-choreo-pin-owner]") as HTMLElement
                                if (lateOwnerSection) {
                                    pinSectionEl = lateOwnerSection
                                    scrollSectionEl = pinSectionEl
                                }
                                var lateSpacer = lateNode.querySelector("[data-choreo-spacer]") as HTMLElement
                                if (lateSpacer) {
                                    ownerScrollLength = parseInt(lateSpacer.style.height) || scrollLength
                                    pinScrollLength = ownerScrollLength
                                }
                                // Recalculate pin range with owner's values
                                var lateRect = pinSectionEl.getBoundingClientRect()
                                pinStart = Math.max(0, lateRect.top + window.scrollY)
                                totalPinLength = pinScrollLength
                                pinEnd = pinStart + totalPinLength
                                // Recalculate own animation range
                                animOffset = (scrollStartOffset / 100) * pinScrollLength
                                animStart = pinStart + animOffset
                                availableRange = Math.max(1, pinEnd - animStart)
                                animLength = Math.min(scrollLength, availableRange)
                                handleScroll()
                                break
                            }
                        }
                        lateNode = lateNode.parentElement
                    }
                })
            }

            // ── Resize handler ──
            var handleResize = function () {
                clearTimeout(scrollResizeTimer)
                scrollResizeTimer = window.setTimeout(function () {
                    if (!wrapper || !parent) return

                    // Clear slide-away transform for accurate measurement
                    if (isOwner && pinSectionEl && scrollPinState.afterPin) {
                        pinSectionEl.style.removeProperty("transform")
                    }

                    // Re-measure all dimensions
                    parentHeight = parent.offsetHeight
                    parentWidth = parent.offsetWidth

                    var wp = wrapper.parentElement
                    if (wp) {
                        parentWidth = wp.clientWidth
                    }
                    // Update wrapper width to match new layout —
                    // only override if the wrapper has a fixed pixel width.
                    // Fill wrappers (100% or flex-only) resize automatically.
                    if (scrollWrapper) {
                        var curWrapW = scrollWrapper.style.width
                        if (curWrapW && /^\d/.test(curWrapW) && !/^100%/.test(curWrapW)) {
                            scrollWrapper.style.setProperty("width", parentWidth + "px")
                        }
                    }
                    // wrapper height is auto — content sizes it
                    pinElWidth = parentWidth
                    pinElHeight = parentHeight

                    // Update spacer height (owner only — followers don't have spacers)
                    // Include animation offset so pin lasts until animation finishes
                    if (scrollSpacer && !isFollower) {
                        var resizeAnimOffset = Math.max(0, (scrollStartOffset / 100) * scrollLength)
                        var newSpacerH = scrollLength + resizeAnimOffset
                        scrollSpacer.style.setProperty("height", newSpacerH + "px")
                        // Update parent height to match
                        if (pinParentEl && pinSectionEl) {
                            var resizeSectionH = pinSectionEl.offsetHeight
                            var resizeNeeded = resizeSectionH + newSpacerH
                            pinParentEl.style.setProperty("min-height", resizeNeeded + "px", "important")
                            pinParentEl.style.setProperty("height", resizeNeeded + "px", "important")
                        }
                    }

                    // Followers: re-read owner's spacer in case it resized
                    if (isFollower && pinSectionEl) {
                        var rPinCtr = pinSectionEl.parentElement
                        if (rPinCtr && rPinCtr.hasAttribute("data-choreo-pin-container")) {
                            var rSpacer = rPinCtr.querySelector("[data-choreo-spacer]") as HTMLElement
                            if (rSpacer) {
                                ownerScrollLength = parseInt(rSpacer.style.height) || ownerScrollLength
                                pinScrollLength = ownerScrollLength
                            }
                        }
                    }

                    // Recalculate pin range (include owner's anim offset)
                    totalPinLength = pinScrollLength + (isFollower ? 0 : Math.max(0, (scrollStartOffset / 100) * scrollLength))
                    var resizeMeasureEl = ((scrollPin || isFollower) && pinSectionEl) ? pinSectionEl : wrapper
                    var resizeRect = resizeMeasureEl.getBoundingClientRect()
                    var resizeVh = window.innerHeight
                    var resizeOffset = 0
                    if (!isFollower) {
                        if (scrollStart === "top") {
                            resizeOffset = -resizeVh
                        } else if (scrollStart === "center") {
                            resizeOffset = -(resizeVh / 2) + (resizeRect.height / 2)
                        }
                    }
                    pinStart = Math.max(0, resizeRect.top + window.scrollY + resizeOffset)
                    pinEnd = pinStart + totalPinLength
                    // Recalculate own animation range
                    animOffset = (scrollStartOffset / 100) * pinScrollLength
                    animStart = pinStart + animOffset

                    // Force animation recreation — resize invalidates
                    // measurements that animations depend on.
                    cancelScrollAnims()

                    // Reset afterPin so handleScroll re-evaluates state
                    scrollPinState.afterPin = false

                    // Re-run scroll handler
                    handleScroll()
                }, 150) as unknown as number
            }
            scrollResizeHandler = handleResize
            window.addEventListener("resize", handleResize)

            // Always run the initial scroll check.  The before-pin zone
            // handles itself harmlessly when animations don't exist yet.
            // Previously gated on scrollY >= pinStart, but that blocked
            // sections whose pinStart was miscalculated (layout not yet
            // settled) from ever revealing.
            handleScroll()

            // Safety fallback: if elements are still hidden after 500ms
            // (e.g. due to layout timing, scroll position edge cases, or
            // Framer preview quirks), force-reveal them.  The WAAPI first
            // keyframe keeps them visually hidden even without the
            // data-choreo-hide attribute.
            scrollSafetyTimer = setTimeout(function () {
                if (!visibilityRevealed && preHiddenEls.length > 0) {
                    revealIfNeeded(0)
                }
            }, 500) as unknown as number

            }) // end inner rAF
            }) // end outer rAF
        }

        return function () {
            clearTimeout(rescanTimer)
            if (scrollSafetyTimer) {
                clearTimeout(scrollSafetyTimer)
            }
            // Remove pre-hide attributes from elements this instance hid
            for (var rph = 0; rph < preHiddenEls.length; rph++) {
                try { preHiddenEls[rph].removeAttribute("data-choreo-hide") } catch (e) {}
            }
            // Remove hide tag only if no other elements still need it
            if (preHideStyleTag && preHideStyleTag.parentNode &&
                !document.querySelector("[data-choreo-hide]")) {
                preHideStyleTag.parentNode.removeChild(preHideStyleTag)
                preHideStyleTag = null
            }
            if (mutObs) {
                try { mutObs.disconnect() } catch (e) {}
            }
            if (intObs) {
                try { intObs.disconnect() } catch (e) {}
            }
            if (parentDoneHandler) {
                document.removeEventListener("choreo-done", parentDoneHandler)
            }
            if (parentResetHandler) {
                document.removeEventListener("choreo-reset", parentResetHandler)
            }
            // Cancel any pending batch play and unregister group parent
            var cleanupStore = getStore()
            if (cleanupStore) cleanupStore.cancelPendingGroup(baseId)
            if (cleanupStore && parent) {
                cleanupStore.unregisterGroupParent(baseId, parent)
            }
            // Clean up scroll-scrub
            if (scrollSetupRaf) {
                cancelAnimationFrame(scrollSetupRaf)
            }
            if (scrollResizeHandler) {
                window.removeEventListener("resize", scrollResizeHandler)
                clearTimeout(scrollResizeTimer)
            }
            if (scrollHandler) {
                window.removeEventListener("scroll", scrollHandler)
            }
            for (var sa = 0; sa < scrollAnims.length; sa++) {
                try { scrollAnims[sa].cancel() } catch (e) {}
            }
            // Remove scrubbing attributes from this PC's elements
            for (var pe = 0; pe < scrollAnimFinalStyles.length; pe++) {
                try { scrollAnimFinalStyles[pe].el.removeAttribute("data-choreo-scrubbing") } catch (e) {}
            }
            // Remove scrub style tag only if no elements still reference it
            if (scrubStyleTag && scrubStyleTag.parentNode &&
                !document.querySelector("[data-choreo-scrubbing]")) {
                scrubStyleTag.parentNode.removeChild(scrubStyleTag)
            }
            // Restore overflow on ancestors
            for (var oc = 0; oc < scrollOverflowAncestors.length; oc++) {
                scrollOverflowAncestors[oc].el.style.setProperty("overflow", scrollOverflowAncestors[oc].orig)
            }
            scrollOverflowAncestors = []
            // Remove spacer
            if (scrollSpacer && scrollSpacer.parentElement) {
                scrollSpacer.parentElement.removeChild(scrollSpacer)
            }
            scrollSpacer = null
            // Restore parent min-height and height
            if (pinParentEl) {
                if (pinParentOrigMinHeight) {
                    pinParentEl.style.setProperty("min-height", pinParentOrigMinHeight)
                } else {
                    pinParentEl.style.removeProperty("min-height")
                }
                if (pinParentOrigHeight) {
                    pinParentEl.style.setProperty("height", pinParentOrigHeight)
                } else {
                    pinParentEl.style.removeProperty("height")
                }
                pinParentEl = null
            }
            // Clean section styles and release claim (owner only —
            // followers don't own sticky positioning)
            if (scrollSectionEl && !isFollower) {
                scrollSectionEl.style.removeProperty("position")
                scrollSectionEl.style.removeProperty("top")
                scrollSectionEl.style.removeProperty("transform")
                scrollSectionEl.style.removeProperty("z-index")
                scrollSectionEl.style.removeProperty("overflow-anchor")
                scrollSectionEl.style.removeProperty("background")
                if (scrollSectionEl.parentElement) {
                    scrollSectionEl.parentElement.style.removeProperty("overflow-anchor")
                }
                if (scrollSectionEl.getAttribute("data-choreo-pin-owner") === baseId) {
                    scrollSectionEl.removeAttribute("data-choreo-pin-owner")
                    scrollSectionEl.removeAttribute("data-choreo-pin-priority")
                }
            }
            // Restore parent's overflow and remove wrapper attribute
            if (parent) {
                parent.removeAttribute("data-choreo-wrapper")
                if (parentOrigOverflow) { parent.style.setProperty("overflow", parentOrigOverflow) } else { parent.style.removeProperty("overflow") }
                parent.style.removeProperty("clip-path")
                parent.style.removeProperty("transition")
            }
            scrollPinEl = null
            unregisterAll(getStore())
        }
    }, [
        rescanGeneration,
        baseId, scanMode, excludeSelector, splitText, trigger, viewOffset, viewRepeat, waitForParent, scrollLength, scrollStart, scrollStartOffset, scrollPin, pinPriority, scrollOnce,
        enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority, priorityGap, delayOffset,
        mobileEnabled, duration, stagger,
        easingPreset, staggerDirection, distance,
        enterMaskDirection, exitMaskDirection, maskStart, maskPreview, maskViewportClip, maskViewportPadding, maskShiftX, maskShiftY, maskOpacity, blurAmount,
        scaleFrom, enterScaleDirection, scaleOpacity, exitTimeout, enterDelay,
        enterOpacity, enterOffsetX, enterOffsetY,
        enterScale, enterRotateX, enterRotateY, enterRotateZ,
        enterBlur, enterPerspective,
        exitOpacity, exitOffsetX, exitOffsetY,
        exitScale, exitRotateX, exitRotateY, exitRotateZ,
        exitBlur, exitPerspective,
    ])

    return (
        <div
            ref={(node) => {
                (markerRef as any).current = node
                if (node) {
                    node.style.setProperty("position", "absolute", "important")
                    // Framer wraps every component in a container div that
                    // participates in Stack/flex layout.  Collapse it so the
                    // marker takes zero space in Stacks and tickers.
                    var framerWrapper = node.parentElement
                    if (framerWrapper) {
                        framerWrapper.style.setProperty("position", "absolute", "important")
                        framerWrapper.style.setProperty("width", "0", "important")
                        framerWrapper.style.setProperty("height", "0", "important")
                        framerWrapper.style.setProperty("min-width", "0", "important")
                        framerWrapper.style.setProperty("min-height", "0", "important")
                        framerWrapper.style.setProperty("overflow", "hidden", "important")
                        framerWrapper.style.setProperty("pointer-events", "none", "important")
                        framerWrapper.style.setProperty("padding", "0", "important")
                        framerWrapper.style.setProperty("margin", "0", "important")
                        framerWrapper.style.setProperty("flex", "0 0 0px", "important")
                    }
                }
            }}
            data-choreo-marker="1"
            data-choreo-wait={waitForParent ? "1" : undefined}
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

PageChoreographer.displayName = "Page Choreographer"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(PageChoreographer, {
    scanMode: {
        type: ControlType.Enum,
        title: "Scan Mode",
        defaultValue: "siblings",
        options: ["siblings", "children"],
        optionTitles: ["Auto", "Children"],
        description: "Auto: detects siblings and CMS collections automatically. Children: animates direct children of a specific element.",
    },
    excludeSelector: {
        type: ControlType.String,
        title: "Exclude",
        defaultValue: "",
        placeholder: "Layer Name",
        description:
            "Layer names to skip (comma-separated). e.g. Load More, Button",
    },
    splitText: {
        type: ControlType.Enum,
        title: "Split Text",
        defaultValue: "none",
        options: ["none", "lines", "words", "chars"],
        optionTitles: ["None", "Lines", "Words", "Characters"],
        description: "Split text for individual animation. Characters works best with short text (hero headings, titles) — avoid on long paragraphs (50+ chars) for performance.",
    },
    trigger: {
        type: ControlType.Enum,
        title: "Trigger",
        defaultValue: "onLoad",
        options: ["onLoad", "inView", "onScroll"],
        optionTitles: ["On Load", "In View", "On Scroll"],
    },
    scrollLength: {
        type: ControlType.Number,
        title: "Scroll Length",
        defaultValue: 500,
        min: 100,
        max: 5000,
        step: 50,
        unit: "px",
        description: "How many pixels of scrolling to complete the animation. Section stays pinned during this distance.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    scrollStart: {
        type: ControlType.Enum,
        title: "Start",
        defaultValue: "bottom",
        options: ["top", "center", "bottom"],
        optionTitles: ["Top", "Center", "Bottom"],
        optionIcons: ["align-top", "align-middle", "align-bottom"],
        description: "When the animation starts: Top = element enters viewport, Center = element at viewport center, Bottom = element reaches viewport top.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    scrollStartOffset: {
        type: ControlType.Number,
        title: "Start Offset",
        defaultValue: 0,
        min: -100,
        max: 100,
        step: 5,
        unit: "%",
        description: "Shift the animation start within the scroll range. When multiple PCs share a pinned section, use this to stagger reveals (e.g. 0% for image, 30% for text).",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    scrollPin: {
        type: ControlType.Boolean,
        title: "Pin Section",
        defaultValue: true,
        description: "When enabled, the section stays pinned (sticky) while the scroll animation plays. When disabled, the section scrolls naturally while the animation scrubs.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    pinPriority: {
        type: ControlType.Boolean,
        title: "Pin Priority",
        defaultValue: false,
        description: "Designate this instance as the pin owner. Its scroll length controls how long the section stays pinned. Other instances in the same section animate independently within that pin duration.",
        hidden: function (props: any) { return props.trigger !== "onScroll" || !props.scrollPin },
    },
    scrollOnce: {
        type: ControlType.Boolean,
        title: "Play Once",
        defaultValue: false,
        description: "When enabled, the scroll animation plays once and won't reverse when scrolling back up.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    viewOffset: {
        type: ControlType.Number,
        title: "View Offset",
        defaultValue: 100,
        min: -200,
        max: 500,
        step: 10,
        unit: "px",
        hidden: function (props: any) { return props.trigger !== "inView" },
    },
    viewRepeat: {
        type: ControlType.Boolean,
        title: "Repeat",
        defaultValue: false,
        hidden: function (props: any) { return props.trigger !== "inView" },
    },
    waitForParent: {
        type: ControlType.Boolean,
        title: "Wait for Parent",
        defaultValue: false,
        description: "Delay this animation until a parent Page Choreographer finishes its enter animation. Useful for chained reveals (e.g. text animates after its container unmasks).",
        hidden: function (props: any) { return props.trigger !== "inView" },
    },

    // ── Enter ────────────────────────────────────────────────────────────────

    enterEnabled: {
        type: ControlType.Boolean,
        title: "Enter",
        defaultValue: true,
    },
    enterPreset: {
        type: ControlType.Enum,
        title: "Enter Effect",
        defaultValue: "fadeUp",
        options: [
            "fadeUp", "fadeDown", "fadeLeft", "fadeRight",
            "maskReveal", "scaleIn", "blurIn", "custom",
        ],
        optionTitles: [
            "Fade Up", "Fade Down", "Fade Left", "Fade Right",
            "Mask Reveal", "Scale In", "Blur In", "Custom",
        ],
        hidden: function (props: any) { return props.enterEnabled === false },
    },
    enterMaskDirection: {
        type: ControlType.Enum,
        title: "↳ Mask Direction",
        defaultValue: "left",
        options: ["none", "left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight", "random"],
        optionTitles: ["None", "Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right", "Random"],
        hidden: function (props: any) {
            if (props.enterEnabled === false) return true
            return props.enterPreset !== "maskReveal" && props.enterPreset !== "scaleIn"
        },
    },
    enterOpacity: {
        type: ControlType.Number,
        title: "↳ Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterOffsetX: {
        type: ControlType.Number,
        title: "↳ Offset X",
        defaultValue: 0,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterOffsetY: {
        type: ControlType.Number,
        title: "↳ Offset Y",
        defaultValue: 40,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterScale: {
        type: ControlType.Number,
        title: "↳ Scale",
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateX: {
        type: ControlType.Number,
        title: "↳ Rotate X",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateY: {
        type: ControlType.Number,
        title: "↳ Rotate Y",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateZ: {
        type: ControlType.Number,
        title: "↳ Rotate Z",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterPerspective: {
        type: ControlType.Number,
        title: "↳ Perspective",
        defaultValue: 1000,
        min: 100,
        max: 3000,
        step: 50,
        unit: "px",
        hidden: function (props: any) {
            if (props.enterEnabled === false || props.enterPreset !== "custom") return true
            return props.enterRotateX === 0 && props.enterRotateY === 0
        },
    },
    enterBlur: {
        type: ControlType.Number,
        title: "↳ Blur",
        defaultValue: 0,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },

    // ── Exit ─────────────────────────────────────────────────────────────────

    exitEnabled: {
        type: ControlType.Boolean,
        title: "Exit",
        defaultValue: true,
    },
    exitPreset: {
        type: ControlType.Enum,
        title: "Exit Effect",
        defaultValue: "riseWave",
        options: [
            "riseWave", "fadeDown", "fadeLeft", "fadeRight",
            "maskOut", "blurLift", "scaleFadeGrid", "scaleOut", "custom",
        ],
        optionTitles: [
            "Rise Wave", "Fade Down", "Fade Left", "Fade Right",
            "Mask Out", "Blur Lift", "Scale Fade", "Scale Out", "Custom",
        ],
        hidden: function (props: any) { return props.exitEnabled === false },
    },
    exitMaskDirection: {
        type: ControlType.Enum,
        title: "↳ Direction",
        defaultValue: "left",
        options: ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight", "random"],
        optionTitles: ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right", "Random"],
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "maskOut"
        },
    },
    exitOpacity: {
        type: ControlType.Number,
        title: "↳ Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitOffsetX: {
        type: ControlType.Number,
        title: "↳ Offset X",
        defaultValue: 0,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitOffsetY: {
        type: ControlType.Number,
        title: "↳ Offset Y",
        defaultValue: -40,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitScale: {
        type: ControlType.Number,
        title: "↳ Scale",
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateX: {
        type: ControlType.Number,
        title: "↳ Rotate X",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateY: {
        type: ControlType.Number,
        title: "↳ Rotate Y",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateZ: {
        type: ControlType.Number,
        title: "↳ Rotate Z",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitPerspective: {
        type: ControlType.Number,
        title: "↳ Perspective",
        defaultValue: 1000,
        min: 100,
        max: 3000,
        step: 50,
        unit: "px",
        hidden: function (props: any) {
            if (props.exitEnabled === false || props.exitPreset !== "custom") return true
            return props.exitRotateX === 0 && props.exitRotateY === 0
        },
    },
    exitBlur: {
        type: ControlType.Number,
        title: "↳ Blur",
        defaultValue: 0,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },

    // ── Timing ───────────────────────────────────────────────────────────────

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
        options: ["smooth", "snappy", "dramatic", "gentle", "bounce", "linear"],
        optionTitles: ["Smooth", "Snappy", "Dramatic", "Gentle", "Bounce", "Linear"],
    },
    staggerDirection: {
        type: ControlType.Enum,
        title: "Stagger Order",
        defaultValue: "leftToRight",
        options: [
            "leftToRight", "rightToLeft", "topToBottom",
            "bottomToTop", "rowMajor", "columnMajor", "random",
        ],
        optionTitles: [
            "Left → Right", "Right → Left", "Top → Bottom",
            "Bottom → Top", "Row Major", "Column Major", "Random",
        ],
    },

    // ── Preset parameters ────────────────────────────────────────────────────

    distance: {
        type: ControlType.Number,
        title: "Distance",
        defaultValue: 40,
        min: 0,
        max: 2000,
        step: 5,
        unit: "px",
        description: "How far elements travel during directional animations.",
        hidden: function (props: any) {
            var directionalEnter = ["fadeUp", "fadeDown", "fadeLeft", "fadeRight"]
            var directionalExit = ["riseWave", "fadeDown", "fadeLeft", "fadeRight", "blurLift"]
            var enterUsesDistance = directionalEnter.indexOf(props.enterPreset) !== -1
            var exitUsesDistance = directionalExit.indexOf(props.exitPreset) !== -1
            return !enterUsesDistance && !exitUsesDistance
        },
    },
    maskShiftX: {
        type: ControlType.Number,
        title: "Mask Shift X",
        defaultValue: 0,
        min: -200,
        max: 200,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            var enterMatch = props.enterEnabled !== false && (props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none"))
            var exitMatch = props.exitEnabled !== false && props.exitPreset === "maskOut"
            return !enterMatch && !exitMatch
        },
    },
    maskShiftY: {
        type: ControlType.Number,
        title: "Mask Shift Y",
        defaultValue: 0,
        min: -200,
        max: 200,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            var enterMatch = props.enterEnabled !== false && (props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none"))
            var exitMatch = props.exitEnabled !== false && props.exitPreset === "maskOut"
            return !enterMatch && !exitMatch
        },
    },
    maskStart: {
        type: ControlType.Number,
        title: "Mask Start",
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 5,
        unit: "%",
        description: "How much of the element is visible before the mask animation begins. 0% = fully masked, 50% = half visible.",
        hidden: function (props: any) {
            if (props.enterPreset === "maskReveal") return false
            if (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none") return false
            return true
        },
    },
    maskPreview: {
        type: ControlType.Boolean,
        title: "↳ Show Preview",
        defaultValue: false,
        description: "When enabled, shows the element at its Mask Start percentage on mount instead of hiding it until the scroll animation begins.",
        hidden: function (props: any) {
            var hasMask = props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none")
            return !hasMask || (props.maskStart || 0) <= 0 || props.trigger !== "onScroll"
        },
    },
    maskViewportClip: {
        type: ControlType.Boolean,
        title: "↳ Viewport Clip",
        defaultValue: false,
        description: "Clips the reveal to the viewport edge so the mask never extends past the screen boundary. Use Viewport Padding to add consistent inset from the edges.",
        hidden: function (props: any) {
            var hasMask = props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none")
            return !hasMask || props.trigger !== "onScroll"
        },
    },
    maskViewportPadding: {
        type: ControlType.Number,
        title: "  ↳ Padding",
        defaultValue: 0,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
        description: "Inset padding from the viewport edges. The mask reveal will stay this many pixels away from the screen boundary.",
        hidden: function (props: any) {
            var hasMask = props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none")
            return !hasMask || props.trigger !== "onScroll" || !props.maskViewportClip
        },
    },
    maskOpacity: {
        type: ControlType.Number,
        title: "Mask Opacity",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            var enterMatch = props.enterEnabled !== false && (props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none"))
            var exitMatch = props.exitEnabled !== false && props.exitPreset === "maskOut"
            return !enterMatch && !exitMatch
        },
    },
    blurAmount: {
        type: ControlType.Number,
        title: "Blur Amount",
        defaultValue: 8,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.enterPreset !== "blurIn" && props.exitPreset !== "blurLift"
        },
    },
    scaleFrom: {
        type: ControlType.Number,
        title: "Scale From",
        defaultValue: 0.92,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return (
                props.enterPreset !== "scaleIn" &&
                props.exitPreset !== "scaleFadeGrid" &&
                props.exitPreset !== "scaleOut"
            )
        },
    },
    enterScaleDirection: {
        type: ControlType.Enum,
        title: "↳ Direction",
        defaultValue: "center",
        options: ["center", "left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"],
        optionTitles: ["Center", "← Left", "→ Right", "↑ Top", "↓ Bottom", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right"],
        hidden: function (props: any) {
            return props.enterPreset !== "scaleIn"
        },
    },
    scaleOpacity: {
        type: ControlType.Number,
        title: "↳ Start Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        description: "Opacity at the start of the scale animation. Set to 1 for a pure scale effect without fade.",
        hidden: function (props: any) {
            return props.enterPreset !== "scaleIn"
        },
    },

    // ── Advanced ─────────────────────────────────────────────────────────────

    sortPriority: {
        type: ControlType.Number,
        title: "Priority",
        defaultValue: 0,
        min: -10,
        max: 10,
        step: 1,
        description: "Controls animation order across groups. Lower numbers animate first.",
        hidden: function (props: any) { return props.trigger === "onScroll" },
    },
    priorityGap: {
        type: ControlType.Number,
        title: "Priority Gap",
        defaultValue: 0,
        min: -3,
        max: 5,
        step: 0.05,
        unit: "s",
        description: "Pause between priority groups. Negative values create overlap.",
        hidden: function (props: any) { return props.trigger === "onScroll" },
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
})
